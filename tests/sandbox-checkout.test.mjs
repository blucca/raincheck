import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { seed } from '../src/seed.mjs';
import { PayPalSandboxPayments } from '../src/payments.mjs';
import { SandboxCheckout } from '../src/sandbox-checkout.mjs';

// Mock PayPal contract fixtures exercise the sandbox adapter through injected fetch.
// These fixtures use synthetic identities and carry no account or payment credentials.
const ORDER = '5O190127TN364715T';
const CAPTURE = '74L756601X447022Y';
const callback = 'http://localhost:4326/sandbox.html?booking=mina';

function mockPayPal(store, { loseCaptureResponse = false, receiptAmount = '136.00' } = {}) {
  let db = store, purchaseUnit, approved = false, captured = false, staleReads = 0;
  const calls = [], captureKeys = new Set();
  const capture = () => ({ id: CAPTURE, status: 'COMPLETED', custom_id: 'mina',
    amount: { currency_code: 'USD', value: '136.00' }, final_capture: true });
  const order = (showCapture = captured) => ({ id: ORDER, intent: 'CAPTURE',
    status: showCapture ? 'COMPLETED' : (approved ? 'APPROVED' : 'PAYER_ACTION_REQUIRED'),
    purchase_units: [{ ...structuredClone(purchaseUnit), ...(showCapture ? { payments: { captures: [capture()] } } : {}) }],
    links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${ORDER}`, method: 'GET' }] });
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url), method = options.method || 'GET';
    assert.equal(parsed.origin, 'https://api-m.sandbox.paypal.com');
    calls.push({ method, path: parsed.pathname, key: options.headers?.['PayPal-Request-Id'], body: options.body });
    const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (parsed.pathname === '/v1/oauth2/token') return json({ access_token: 'mock-sandbox-token', expires_in: 3600 });
    if (parsed.pathname === '/v2/checkout/orders' && method === 'POST') {
      const saved = db.get('checkout', 'mina').create_request;
      assert.equal(options.headers['PayPal-Request-Id'], saved.request_id);
      assert.equal(options.body, JSON.stringify(saved.body));
      assert.ok(saved.first_attempt_at);
      purchaseUnit = JSON.parse(options.body).purchase_units[0];
      const created = order();
      return json({ id: created.id, status: created.status, links: created.links });
    }
    if (parsed.pathname === `/v2/checkout/orders/${ORDER}` && method === 'GET') {
      return json(order(staleReads-- > 0 ? false : captured));
    }
    if (parsed.pathname === `/v2/checkout/orders/${ORDER}/capture` && method === 'POST') {
      const saved = db.get('checkout', 'mina').capture_request;
      assert.equal(options.headers['PayPal-Request-Id'], saved.request_id);
      assert.equal(options.body, JSON.stringify(saved.body));
      assert.ok(saved.first_attempt_at); assert.equal(approved, true);
      captureKeys.add(options.headers['PayPal-Request-Id']); captured = true;
      if (loseCaptureResponse) {
        loseCaptureResponse = false; staleReads = 1;
        throw new TypeError('Mock connection dropped after capture committed.');
      }
      return json({ id: ORDER, status: 'COMPLETED',
        purchase_units: [{ reference_id: 'mina', payments: { captures: [capture()] } }] });
    }
    if (parsed.pathname === `/v2/payments/captures/${CAPTURE}` && method === 'GET') {
      return json({ ...capture(), amount: { currency_code: 'USD', value: receiptAmount },
        supplementary_data: { related_ids: { order_id: ORDER } },
        links: [{ rel: 'self', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${CAPTURE}` }] });
    }
    assert.fail(`Unexpected mock API request: ${method} ${url}`);
  };
  return { calls, captureKeys, approve() { approved = true; }, useStore(next) { db = next; },
    payments: new PayPalSandboxPayments({ clientId: 'mock-client', clientSecret: 'mock-secret', fetchImpl }) };
}

function checkout(store, fixture) {
  return new SandboxCheckout({ store, payments: fixture.payments, bookingId: 'mina',
    returnUrl: `${callback}&returned=1`, cancelUrl: `${callback}&cancelled=1` });
}

test('mock sandbox: one approved USD 136 order binds Mina through GET capture', async () => {
  const store = new Store(); store.reset(seed);
  store.put('booking', 'mina', { ...store.get('booking', 'mina'), capture_id: null, status: 'awaiting_payment' });
  const fixture = mockPayPal(store), flow = checkout(store, fixture);
  try {
    assert.equal(flow.snapshot().state, 'new');
    const [created, concurrent] = await Promise.all([flow.create(), checkout(store, fixture).create()]);
    assert.deepEqual(concurrent, created);
    assert.equal(created.state, 'awaiting_approval'); assert.equal(created.amount, 13600); assert.equal(created.quantity, 2);
    assert.match(created.approval_url, /^https:\/\/www\.sandbox\.paypal\.com\//);
    const doc = store.get('checkout', 'mina');
    assert.notEqual(doc.create_request.request_id, doc.capture_request.request_id);
    assert.equal(doc.create_request.body.purchase_units[0].reference_id, 'mina');
    assert.equal(doc.create_request.body.purchase_units[0].custom_id, 'mina');
    assert.deepEqual(doc.create_request.body.purchase_units[0].amount, { currency_code: 'USD', value: '136.00' });
    assert.equal((await flow.create()).order_id, ORDER);
    fixture.approve();
    const completed = await flow.complete();
    assert.equal(completed.state, 'captured'); assert.equal(completed.capture_id, CAPTURE);
    const booking = store.get('booking', 'mina');
    assert.equal(booking.capture_id, CAPTURE); assert.equal(booking.paypal_order_id, ORDER);
    assert.equal(booking.status, 'affected');
    assert.deepEqual(booking.payment_binding, { provider: 'sandbox', order_id: ORDER, capture_id: CAPTURE,
      amount: 13600, currency: 'USD', verified_at: booking.payment_binding.verified_at });
    assert.ok(Date.parse(booking.payment_binding.verified_at));
    const callsAfterBinding = fixture.calls.length;
    assert.deepEqual(await flow.create(), completed); assert.deepEqual(await flow.complete(), completed);
    assert.equal(fixture.calls.length, callsAfterBinding);
    assert.equal(fixture.calls.filter(call => call.path === '/v2/checkout/orders' && call.method === 'POST').length, 1);
    assert.equal(fixture.captureKeys.size, 1);
  } finally { store.close(); }
});

test('mock sandbox: lost capture response survives reconstruction and replays its exact request', async () => {
  const parent = path.resolve(process.env.RAINCHECK_TEST_DIR || '../../temp/raincheck-tests');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'checkout-')), filename = path.join(dir, 'checkout.sqlite');
  let store = new Store(filename); store.reset(seed);
  const fixture = mockPayPal(store, { loseCaptureResponse: true });
  let flow = checkout(store, fixture);
  try {
    await flow.create(); fixture.approve();
    assert.equal((await flow.complete()).state, 'reconciling');
    assert.equal(store.get('booking', 'mina').capture_id, 'sim_capture_mina');
    const request = store.get('checkout', 'mina').capture_request;
    store.close(); store = new Store(filename); fixture.useStore(store); flow = checkout(store, fixture);
    assert.equal((await flow.complete()).state, 'captured');
    const posts = fixture.calls.filter(call => call.path.endsWith('/capture') && call.method === 'POST');
    assert.equal(posts.length, 2); assert.deepEqual(posts[0], posts[1]);
    assert.equal(posts[0].key, request.request_id); assert.equal(posts[0].body, JSON.stringify(request.body));
    assert.equal(fixture.captureKeys.size, 1);
    assert.equal(store.get('booking', 'mina').payment_binding.capture_id, CAPTURE);
  } finally { store.close(); }
});

test('mock sandbox: a mismatched GET capture amount stays in review with its original order', async () => {
  const store = new Store(); store.reset(seed);
  const fixture = mockPayPal(store, { receiptAmount: '135.00' }), flow = checkout(store, fixture);
  try {
    await flow.create(); fixture.approve();
    const result = await flow.complete();
    assert.equal(result.state, 'review_required'); assert.equal(result.error.code, 'capture_amount');
    assert.equal(result.order_id, ORDER); assert.equal(result.capture_id, CAPTURE);
    assert.equal(store.get('booking', 'mina').capture_id, 'sim_capture_mina');
    assert.equal(store.get('booking', 'mina').payment_binding, undefined);
    assert.equal((await flow.complete()).state, 'review_required');
    assert.equal(fixture.calls.filter(call => call.path.endsWith('/capture') && call.method === 'POST').length, 1);
    assert.equal(store.get('checkout', 'mina').last_capture_response.amount.value, '135.00');
  } finally { store.close(); }
});
