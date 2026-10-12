import { DomainError } from './policy.mjs';

const replayWindow = 6 * 60 * 60 * 1000;
const active = new WeakMap();
const now = () => new Date().toISOString();
const orderId = value => typeof value === 'string' && /^[A-Z0-9]{1,36}$/.test(value);
const captureId = value => typeof value === 'string' && /^[A-Za-z0-9]{10,32}$/.test(value);

function review(code, message, state = 'review_required') {
  const error = new Error(message); error.code = code; error.checkoutState = state; return error;
}

function cents(amount, expected, code) {
  const value = amount?.value;
  const parts = typeof value === 'string' && value.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  const total = parts ? Number(parts[1]) * 100 + Number((parts[2] || '').padEnd(2, '0')) : NaN;
  if (amount?.currency_code !== expected.currency || !Number.isSafeInteger(total) || total !== expected.amount) {
    throw review(code, `The sandbox receipt must match this booking's ${expected.currency} ${(expected.amount / 100).toFixed(2)} total.`);
  }
}

function callbackUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new DomainError('checkout_url', 'Configure the Raincheck return and cancel URLs.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new DomainError('checkout_url', 'Use an HTTP or HTTPS Raincheck return URL.');
  }
  return url.href;
}

function approvalLink(order) {
  for (const link of Array.isArray(order?.links) ? order.links : []) {
    if (!['payer-action', 'approve'].includes(link?.rel)) continue;
    try {
      const url = new URL(link.href);
      if (url.protocol === 'https:' && ['www.sandbox.paypal.com', 'sandbox.paypal.com'].includes(url.hostname)
          && !url.username && !url.password && !url.port) return url.href;
    } catch { /* The next sandbox approval link can provide the buyer action. */ }
  }
  return null;
}

/** One persisted sandbox order funds one existing booking. Amounts are integer USD cents. */
export class SandboxCheckout {
  constructor({ store, payments, bookingId, returnUrl, cancelUrl }) {
    if (payments?.mode !== 'sandbox') throw new DomainError('checkout_mode', 'Use the PayPal sandbox adapter for booking checkout.');
    this.store = store; this.payments = payments; this.bookingId = bookingId;
    this.returnUrl = returnUrl; this.cancelUrl = cancelUrl;
  }

  booking() {
    const booking = this.store.get('booking', this.bookingId);
    if (!booking) throw new DomainError('booking_missing', 'Choose an existing Raincheck booking.', 404);
    const amount = booking.quantity * booking.unit_amount;
    if (booking.currency !== 'USD' || ![booking.quantity, booking.unit_amount, amount].every(n => Number.isSafeInteger(n) && n > 0)) {
      throw new DomainError('checkout_amount', 'Sandbox checkout uses positive whole-seat quantities and integer USD-cent prices.');
    }
    return booking;
  }

  blank() {
    const booking = this.booking();
    return { booking_id: this.bookingId, quantity: booking.quantity, unit_amount: booking.unit_amount,
      amount: booking.quantity * booking.unit_amount, currency: booking.currency,
      state: 'new', order_id: null, approval_url: null, capture_id: null, error: null, events: [] };
  }

  snapshot() {
    const doc = this.store.get('checkout', this.bookingId) || this.blank();
    return Object.fromEntries(['booking_id', 'quantity', 'amount', 'currency', 'state', 'order_id',
      'approval_url', 'capture_id', 'error', 'events'].map(key => [key, structuredClone(doc[key])]));
  }

  patch(fields, type, message) {
    return this.store.transaction(() => {
      const doc = this.store.get('checkout', this.bookingId);
      const events = type ? [...doc.events, { at: now(), type, message }].slice(-100) : doc.events;
      return this.store.put('checkout', this.bookingId, { ...doc, ...fields, events });
    });
  }

  ensureDocument() {
    return this.store.transaction(() => {
      const existing = this.store.get('checkout', this.bookingId);
      if (existing) { this.checkBooking(existing); return existing; }
      const booking = this.booking();
      if (booking.payment_binding || booking.paypal_order_id || (booking.capture_id && !booking.capture_id.startsWith('sim_capture_'))) {
        throw review('booking_bound', 'This booking already has a payment reference. Reconcile that saved payment before starting checkout.');
      }
      const doc = this.blank();
      const amount = { currency_code: doc.currency, value: (doc.amount / 100).toFixed(2) };
      return this.store.put('checkout', this.bookingId, { ...doc, original_capture_id: booking.capture_id || null,
        create_request: { request_id: globalThis.crypto.randomUUID(), first_attempt_at: null, attempts: 0, body: {
          intent: 'CAPTURE', purchase_units: [{ reference_id: this.bookingId, custom_id: this.bookingId,
            description: `Raincheck workshop: ${doc.quantity} seats for ${booking.name} at USD ${(booking.unit_amount / 100).toFixed(2)} each`.slice(0, 127), amount }],
          payment_source: { paypal: { experience_context: { brand_name: 'Raincheck Sandbox', shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW', return_url: callbackUrl(this.returnUrl), cancel_url: callbackUrl(this.cancelUrl) } } }
        } },
        capture_request: { request_id: globalThis.crypto.randomUUID(), body: {}, first_attempt_at: null, attempts: 0 },
        events: [{ at: now(), type: 'prepared', message: 'Saved this booking and its separate create/capture request IDs.' }]
      });
    });
  }

  checkBooking(doc) {
    const booking = this.booking();
    if (booking.quantity !== doc.quantity || booking.unit_amount !== doc.unit_amount || booking.currency !== doc.currency) {
      throw review('booking_changed', 'Reconcile the saved order using its original ticket quantity, price and currency.');
    }
    const binding = booking.payment_binding;
    if ((booking.capture_id || null) !== doc.original_capture_id && booking.capture_id !== doc.capture_id) {
      throw review('booking_capture_changed', 'The booking has another capture reference. Review its saved payment binding.');
    }
    if (binding && (binding.provider !== 'sandbox' || binding.order_id !== doc.order_id || binding.capture_id !== doc.capture_id
        || binding.amount !== doc.amount || binding.currency !== doc.currency)) {
      throw review('booking_binding_changed', 'The booking has another payment binding. Review the saved sandbox receipts.');
    }
    if (doc.state === 'captured' && (!binding || booking.paypal_order_id !== doc.order_id || booking.capture_id !== doc.capture_id)) {
      throw review('booking_binding_missing', 'Restore the verified booking binding from its saved sandbox receipts.');
    }
    return booking;
  }

  attempt(kind) {
    const doc = this.store.get('checkout', this.bookingId);
    const request = doc[`${kind}_request`];
    if (request.first_attempt_at) {
      const age = Date.now() - Date.parse(request.first_attempt_at);
      if (!Number.isFinite(age) || age < 0 || age >= replayWindow) {
        throw review('replay_window_elapsed', `The saved ${kind} request has reached PayPal's six-hour replay window. Review the existing sandbox payment before a further write.`);
      }
    }
    const stamp = now();
    const saved = { ...request, first_attempt_at: request.first_attempt_at || stamp, last_attempt_at: stamp, attempts: request.attempts + 1 };
    this.patch({ [`${kind}_request`]: saved, state: kind === 'create' ? 'creating' : 'capturing', error: null },
      `${kind}_sent`, `Sending the saved sandbox ${kind} request with its original body and request ID.`);
    return saved;
  }

  observe(order, source) {
    const doc = this.store.get('checkout', this.bookingId);
    const fields = { [source]: order };
    if (!doc.order_id && orderId(order?.id)) fields.order_id = order.id;
    const sameOrder = order?.id === (doc.order_id || fields.order_id);
    const captures = Array.isArray(order?.purchase_units) && order.purchase_units.length === 1 ? order.purchase_units[0]?.payments?.captures : null;
    if (sameOrder && !doc.capture_id && Array.isArray(captures) && captures.length === 1 && captureId(captures[0]?.id)) fields.capture_id = captures[0].id;
    const approval = sameOrder && approvalLink(order);
    if (approval) fields.approval_url = approval;
    this.patch(fields, source, `Stored the sandbox order response (${order?.status || 'pending reconciliation'}).`);
  }

  orderUnit(order, doc) {
    if (!orderId(order?.id) || order.id !== doc.order_id || (order.intent && order.intent !== 'CAPTURE')) {
      throw review('order_binding', 'The sandbox order must match the saved order ID and CAPTURE intent.');
    }
    if (!Array.isArray(order.purchase_units) || order.purchase_units.length !== 1) {
      throw review('order_units', 'This booking requires exactly one sandbox purchase unit.');
    }
    const unit = order.purchase_units[0];
    if (unit?.reference_id !== doc.booking_id || unit.custom_id !== doc.booking_id) {
      throw review('order_booking', 'The sandbox purchase unit must carry this booking in reference_id and custom_id.');
    }
    cents(unit.amount, doc, 'order_amount');
    return unit;
  }

  async reconcile(mayCapture) {
    const doc = this.store.get('checkout', this.bookingId);
    this.checkBooking(doc);
    const order = await this.payments.getOrder(doc.order_id);
    this.observe(order, 'last_order_response');
    return this.consumeOrder(order, mayCapture);
  }

  async consumeOrder(order, mayCapture) {
    const doc = this.store.get('checkout', this.bookingId);
    const unit = this.orderUnit(order, doc);
    const captures = unit.payments?.captures || [];
    if (!Array.isArray(captures) || captures.length > 1) throw review('capture_count', 'Review the order: this booking expects a single capture.');
    if (captures.length) {
      const receipt = captures[0];
      if (!captureId(receipt?.id) || (doc.capture_id && doc.capture_id !== receipt.id)) throw review('capture_binding', 'Reconcile the single capture ID saved for this order.');
      cents(receipt.amount, doc, 'capture_amount');
      if (receipt.custom_id && receipt.custom_id !== doc.booking_id) throw review('capture_booking', 'The capture must refer to this booking.');
      this.patch({ capture_id: receipt.id });
      if (receipt.status !== 'COMPLETED' || order.status !== 'COMPLETED') {
        throw review('capture_pending', `The sandbox capture is ${receipt.status || 'pending'}; the order is ${order.status || 'pending'}. Recover to read their updated status.`, 'reconciling');
      }
      return this.verifyCapture(receipt.id);
    }
    if (doc.capture_id || order.status === 'COMPLETED') throw review('capture_missing', 'Reconcile the saved order and capture history before another payment write.');
    if (['CREATED', 'SAVED', 'PAYER_ACTION_REQUIRED'].includes(order.status)) {
      if (!doc.approval_url) throw review('approval_link_missing', 'Recover this existing order to retrieve its sandbox buyer approval link.', 'reconciling');
      this.patch({ state: 'awaiting_approval', error: null }, 'awaiting_approval', 'Approve this order with the PayPal sandbox buyer, then complete checkout.');
      return this.snapshot();
    }
    if (order.status !== 'APPROVED') throw review('order_status', `The sandbox order is ${order.status || 'pending reconciliation'}. Review this existing order.`);
    if (!mayCapture) {
      this.patch({ state: doc.capture_request.attempts ? 'reconciling' : 'approved', error: null },
        'approved', 'The buyer has approved this saved sandbox order. Complete checkout to reconcile its capture.');
      return this.snapshot();
    }
    const request = this.attempt('capture');
    const response = await this.payments.captureOrder(doc.order_id, request);
    this.observe(response, 'capture_response');
    if (response?.id && response.id !== doc.order_id) throw review('order_binding', 'The capture response must identify this saved sandbox order.');
    // Capture representations can be sparse. GET supplies the full order/booking contract.
    return this.reconcile(false);
  }

  async verifyCapture(id) {
    const doc = this.store.get('checkout', this.bookingId);
    const capture = await this.payments.getCapture(id);
    this.patch({ last_capture_response: capture }, 'capture_checked', 'Stored the GET capture receipt for booking verification.');
    if (capture?.id !== id) throw review('capture_binding', 'The GET capture receipt must match the saved capture ID.');
    cents(capture.amount, doc, 'capture_amount');
    const relatedOrder = capture.supplementary_data?.related_ids?.order_id;
    const orderLinks = (Array.isArray(capture.links) ? capture.links : []).filter(link => link?.rel === 'up')
      .map(link => typeof link.href === 'string' && link.href.match(/^https:\/\/api(?:-m)?\.sandbox\.paypal\.com\/v2\/checkout\/orders\/([A-Z0-9]+)$/)?.[1]).filter(Boolean);
    if ((relatedOrder && relatedOrder !== doc.order_id) || orderLinks.some(value => value !== doc.order_id)
        || (relatedOrder !== doc.order_id && !orderLinks.includes(doc.order_id))) {
      throw review('capture_order', 'The GET capture receipt must identify this saved sandbox order.');
    }
    if (capture.custom_id && capture.custom_id !== doc.booking_id) throw review('capture_booking', 'The GET capture receipt must refer to this booking.');
    if (capture.status !== 'COMPLETED') throw review('capture_pending', `The GET capture status is ${capture.status || 'pending'}. Recover to read the updated receipt.`, 'reconciling');
    this.store.transaction(() => {
      const current = this.store.get('checkout', this.bookingId);
      const booking = this.checkBooking(current);
      if (current.order_id !== doc.order_id || current.capture_id !== id) throw review('checkout_changed', 'Reconcile the checkout using its saved order and capture IDs.');
      const stamp = now();
      const binding = { provider: 'sandbox', order_id: doc.order_id, capture_id: id, amount: doc.amount, currency: doc.currency, verified_at: stamp };
      this.store.put('booking', this.bookingId, { ...booking, capture_id: id, paypal_order_id: doc.order_id, payment_binding: binding,
        status: booking.status === 'awaiting_payment' ? 'affected' : booking.status });
      this.store.put('checkout', this.bookingId, { ...current, state: 'captured', error: null, verified_at: stamp,
        events: [...current.events, { at: stamp, type: 'captured', message: 'Verified order and GET capture; attached this sandbox payment to the booking.' }].slice(-100) });
    });
    return this.snapshot();
  }

  async start() {
    const doc = this.ensureDocument();
    if (doc.state === 'captured') return this.snapshot();
    if (doc.order_id) return this.reconcile(false);
    const request = this.attempt('create');
    const response = await this.payments.createOrder(request);
    this.observe(response, 'create_response');
    const saved = this.store.get('checkout', this.bookingId);
    if (!saved.order_id) throw review('order_missing', 'The create response needs reconciliation with its saved request ID.', 'reconciling');
    return this.reconcile(false);
  }

  async finish() {
    let doc = this.store.get('checkout', this.bookingId);
    if (!doc) throw review('order_required', 'Create this booking\'s sandbox order and approve it with the sandbox buyer.', 'new');
    this.checkBooking(doc);
    if (doc.state === 'captured') return this.snapshot();
    if (!doc.order_id) { await this.start(); doc = this.store.get('checkout', this.bookingId); }
    return this.reconcile(true);
  }

  async singleFlight(action) {
    let running = active.get(this.store);
    if (!running) { running = new Map(); active.set(this.store, running); }
    if (running.has(this.bookingId)) return running.get(this.bookingId);
    const pending = Promise.resolve().then(action).catch(error => {
      const fields = { state: error.checkoutState || (error.definitive ? 'review_required' : 'reconciling'),
        error: { code: error.code || 'checkout_response', message: error.message || 'Recover the saved sandbox checkout.' } };
      if (!this.store.get('checkout', this.bookingId)) return { ...this.snapshot(), ...fields };
      this.patch(fields, 'reconciliation', fields.error.message);
      return this.snapshot();
    });
    running.set(this.bookingId, pending);
    try { return await pending; } finally { if (running.get(this.bookingId) === pending) running.delete(this.bookingId); }
  }

  async create() { return this.singleFlight(() => this.start()); }
  async complete() { return this.singleFlight(() => this.finish()); }
}
