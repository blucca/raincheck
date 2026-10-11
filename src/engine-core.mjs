const randomUUID = () => globalThis.crypto.randomUUID();
import { seed } from './seed.mjs';
import { planFromIntent, DomainError } from './policy.mjs';
import { RecordedInterpreter } from './interpreter.mjs';
import { SimulatedPayments } from './payments.mjs';

const protectedStates = new Set(['executing', 'payment_pending', 'reconciling', 'completed', 'payment_failed']);
const event = (item, name, detail) => { item.events.push({ at: new Date().toISOString(), event: name, detail }); };

export class Raincheck {
  constructor({ store, interpreter = new RecordedInterpreter(), payments, scenario = seed } = {}) {
    if (!store) throw new Error('Configure a persistent workspace store.');
    this.store = store; this.scenario = scenario;
    if (!this.store.get('meta', 'workspace')) this.store.reset(scenario);
    this.interpreter = interpreter; this.payments = payments || new SimulatedPayments(this.store);
    this.active = new Set();
    this.store.transaction(() => {
      for (const item of this.store.all('case')) {
        if (item.status !== 'executing') continue;
        item.status = 'reconciling';
        event(item, 'PROCESS_RESUMED', 'The prior process ended with a saved operation. Reconcile that same refund before finishing the booking.');
        this.store.put('case', item.booking_id, item);
      }
    });
  }
  booking(id) {
    const booking = this.store.get('booking', id);
    if (!booking) throw new DomainError('booking_missing', 'Choose a booking from this cancelled workshop.', 404);
    return booking;
  }
  workspace() {
    const cases = this.store.all('case');
    const bookings = this.store.all('booking');
    const finished = cases.filter(c => c.status === 'completed');
    return { ...this.store.get('meta', 'workspace'),
      sessions: this.store.all('session').map(s => ({ ...s, available: s.capacity - s.booked - s.held })),
      bookings, cases, mode: { payments: this.payments.mode, ai: this.interpreter.mode },
      metrics: { affected: bookings.reduce((n,b) => n + b.quantity, 0),
        transferred: finished.reduce((n,c) => n + c.plan.transfer_quantity, 0),
        refunded_amount: finished.reduce((n,c) => n + c.plan.refund_amount, 0),
        needs_reply: cases.filter(c => ['needs_reply', 'capacity_conflict'].includes(c.status)).length } };
  }
  async analyze(id, message) {
    if (typeof message !== 'string' || !message.trim() || message.length > 4000) {
      throw new DomainError('reply_required', 'Enter a customer reply between 1 and 4,000 characters.', 400);
    }
    if (this.active.has(id)) throw new DomainError('case_busy', 'This booking is already being processed.');
    this.active.add(id);
    try {
      const booking = this.booking(id);
      const current = this.store.get('case', id);
      if (current && protectedStates.has(current.status)) throw new DomainError('case_locked', 'Keep the confirmed plan while its outcome is being resolved.');
      const workspace = this.workspace();
      const intent = await this.interpreter.interpret({ booking, sessions: workspace.sessions, cancellation: workspace.cancellation, message });
      return this.store.transaction(() => {
        const result = planFromIntent({ booking: this.booking(id), sessions: this.store.all('session'), message, intent, source: this.interpreter.mode });
        const item = { id: randomUUID(), booking_id: id, ...result, customer_message: message, events: [], operation: null, reserved: false };
        event(item, 'PLAN_CREATED', 'Customer choice interpreted; ticket prices and availability checked.');
        this.store.put('booking', id, { ...booking, message });
        this.store.put('case', id, item);
        return item;
      });
    } finally { this.active.delete(id); }
  }
  reserve(item) {
    if (!item.plan.transfer_quantity || item.reserved) return;
    const target = this.store.get('session', item.plan.target_session_id);
    if (!target || target.capacity - target.booked - target.held < item.plan.transfer_quantity) {
      item.status = 'capacity_conflict';
      item.plan.question = 'This class filled while the plan was open. Please choose another class or a refund.';
      event(item, 'CAPACITY_CHANGED', 'Availability checked again before changing any seats or money.');
      return;
    }
    target.held += item.plan.transfer_quantity; this.store.put('session', target.id, target);
    item.reserved = true; event(item, 'SEATS_HELD', `${item.plan.transfer_quantity} replacement places held during payment reconciliation.`);
  }
  release(item, commit) {
    if (!item.reserved) return;
    const target = this.store.get('session', item.plan.target_session_id);
    target.held -= item.plan.transfer_quantity;
    if (commit) target.booked += item.plan.transfer_quantity;
    this.store.put('session', target.id, target); item.reserved = false;
  }
  finish(item) {
    this.release(item, true); item.status = 'completed';
    const booking = this.booking(item.booking_id);
    this.store.put('booking', booking.id, { ...booking, status: 'resolved', outcome: {
      transferred: item.plan.transfer_quantity, refunded: item.plan.refund_quantity,
      session_id: item.plan.target_session_id, refund_id: item.refund?.id || null } });
    event(item, 'OUTCOME_COMPLETED', `${item.plan.transfer_quantity} places rebooked; ${item.plan.refund_quantity} tickets refunded.`);
    return item;
  }
  async execute(id, options = {}) {
    if (this.active.has(id)) throw new DomainError('case_busy', 'This booking is already being processed.');
    this.active.add(id);
    try {
      let item = this.store.transaction(() => {
        const c = this.store.get('case', id); const booking = this.booking(id);
        if (!c) throw new DomainError('plan_required', 'Interpret the customer reply before confirming an outcome.');
        if (c.status === 'completed') return c;
        if (!['ready', 'executing', 'payment_pending', 'reconciling'].includes(c.status)) {
          throw new DomainError('choice_required', 'Resolve this customer choice before confirming an outcome.');
        }
        this.reserve(c);
        if (c.status === 'capacity_conflict') { this.store.put('case', id, c); return c; }
        if (c.plan.refund_amount === 0) { this.finish(c); this.store.put('case', id, c); return c; }
        c.operation ||= { request_id: randomUUID(), capture_id: booking.capture_id, amount: c.plan.refund_amount,
          currency: c.plan.currency, created_at: new Date().toISOString() };
        c.status = 'executing';
        event(c, 'REFUND_REQUESTED', 'Saved refund ID, capture, amount, and seat reservation before contacting the payment provider.');
        this.store.put('case', id, c); return c;
      });
      if (['completed', 'capacity_conflict'].includes(item.status)) return item;
      let receipt;
      try {
        // Known refunds are read by ID. Unknown short interruptions reuse the exact saved operation.
        if (item.refund?.id) receipt = await this.payments.getRefund(item.refund.id);
        else {
          if (this.payments.mode === 'sandbox' && Date.now() - Date.parse(item.operation.created_at) > 10 * 60 * 1000) {
            throw new DomainError('manual_reconciliation', 'Review the original sandbox order and refund history before retrying this older interrupted request.');
          }
          receipt = await this.payments.refund(item.operation, options);
        }
        if (!receipt?.id || receipt.amount !== item.operation.amount || receipt.currency !== item.operation.currency ||
            receipt.capture_id !== item.operation.capture_id ||
            (this.payments.mode === 'sandbox' && receipt.custom_id !== item.operation.request_id)) {
          throw new DomainError('receipt_mismatch', 'Review the payment receipt: its capture, currency, and amount must match the saved operation.');
        }
      } catch (error) {
        return this.store.transaction(() => {
          item = this.store.get('case', id);
          item.status = error.definitive ? 'payment_failed' : 'reconciling';
          if (error.definitive) this.release(item, false);
          item.error = { code: error.code || 'payment_connection', message: error.message };
          event(item, 'PAYMENT_REVIEW', item.error.message); this.store.put('case', id, item); return item;
        });
      }
      return this.store.transaction(() => {
        item = this.store.get('case', id); item.refund = receipt; delete item.error;
        if (receipt.status === 'COMPLETED') this.finish(item);
        else if (['FAILED', 'CANCELLED'].includes(receipt.status)) {
          item.status = 'payment_failed'; this.release(item, false);
          event(item, 'REFUND_FAILED', `Provider status ${receipt.status}; reserved places released.`);
        } else {
          item.status = receipt.status === 'PENDING' ? 'payment_pending' : 'reconciling';
          event(item, 'REFUND_PENDING', `Provider status ${receipt.status}; replacement places remain held.`);
        }
        this.store.put('case', id, item); return item;
      });
    } finally { this.active.delete(id); }
  }
  reset() {
    if (this.payments.mode !== 'simulated') throw new DomainError('reset_demo_only', 'Reset is available for the simulated ledger.');
    if (this.active.size) throw new DomainError('case_busy', 'Let the active operation finish before resetting this demo.');
    this.store.reset(this.scenario); return this.workspace();
  }
  close() { this.store.close(); }
}
