import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Raincheck } from '../src/engine.mjs';
import { seed, recordedIntents } from '../src/seed.mjs';
import { planFromIntent } from '../src/policy.mjs';

const analyze = (app, id) => app.analyze(id, seed.bookings.find(b => b.id === id).message);

test('one cancelled class resolves split, full refund, transfer, and open choice', async () => {
  const app = new Raincheck();
  try {
    for (const id of ['mina', 'noah', 'jules']) {
      assert.equal((await analyze(app, id)).status, 'ready');
      assert.equal((await app.execute(id)).status, 'completed');
    }
    assert.equal((await analyze(app, 'priya')).status, 'needs_reply');
    assert.deepEqual(app.workspace().metrics, { affected: 6, transferred: 3, refunded_amount: 13600, needs_reply: 1 });
    assert.equal(app.workspace().sessions[0].available, 0);
    assert.equal(app.store.all('provider_refund').length, 2);
    await app.execute('mina');
    assert.equal(app.store.all('provider_refund').length, 2);
    assert.equal(app.workspace().sessions[0].booked, 8);
  } finally { app.close(); }
});

test('lost response survives process reconstruction; refund and replacement seat settle once', async () => {
  const parent = path.resolve(process.env.RAINCHECK_TEST_DIR || '../../temp/raincheck-tests');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'recovery-')); const filename = path.join(dir, 'test.sqlite');
  let app = new Raincheck({ filename });
  try {
    await analyze(app, 'mina');
    const lost = await app.execute('mina', { simulate_lost_response: true });
    assert.equal(lost.status, 'reconciling');
    assert.equal(app.store.all('provider_refund').length, 1);
    assert.equal(app.workspace().sessions[0].held, 1);
    assert.equal(app.workspace().metrics.refunded_amount, 0);
    const requestId = lost.operation.request_id;
    // A hard exit can leave the pre-dispatch state instead of the caught network-error state.
    app.store.put('case', 'mina', { ...lost, status: 'executing' });
    app.close(); app = new Raincheck({ filename });
    assert.equal(app.store.get('case', 'mina').status, 'reconciling');
    const recovered = await app.execute('mina');
    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.operation.request_id, requestId);
    assert.equal(app.store.all('provider_refund').length, 1);
    assert.equal(app.workspace().sessions[0].held, 0);
    assert.equal(app.workspace().sessions[0].booked, 8);
    assert.equal(app.workspace().metrics.refunded_amount, 6800);
  } finally { app.close(); }
});

test('capacity is checked when executing a previously valid plan', async () => {
  const scenario = structuredClone(seed);
  scenario.bookings.push({ ...scenario.bookings[0], id: 'second-party', capture_id: 'sim_capture_second-party' });
  const interpreter = { mode: 'recorded', interpret: async () => structuredClone(recordedIntents.mina) };
  const app = new Raincheck({ scenario, interpreter });
  try {
    await analyze(app, 'mina');
    await app.analyze('second-party', seed.bookings[0].message);
    await app.execute('mina');
    const conflict = await app.execute('second-party');
    assert.equal(conflict.status, 'capacity_conflict');
    assert.equal(app.store.all('provider_refund').length, 1);
    assert.equal(app.workspace().sessions[0].booked, 8);
  } finally { app.close(); }
});

test('ticket math and evidence are independent of model prose', () => {
  const base = { booking: seed.bookings[0], sessions: seed.sessions, message: seed.bookings[0].message };
  assert.throws(() => planFromIntent({ ...base, intent: { ...recordedIntents.mina, refund_quantity: 2 } }), /every ticket/);
  assert.throws(() => planFromIntent({ ...base, intent: { ...recordedIntents.mina, evidence: 'invented consent' } }), /exact quote/);
  assert.equal(planFromIntent({ ...base, intent: { ...recordedIntents.mina, refund_amount: 1 } }).plan.refund_amount, 6800);
  assert.equal(planFromIntent({ ...base, intent: { ...recordedIntents.priya, evidence: '' } }).status, 'needs_reply');
});

test('sandbox booking requires capture before a cancellation reserves seats', async () => {
  const scenario = structuredClone(seed);
  scenario.bookings = [{ ...scenario.bookings[0], capture_id: null, status: 'awaiting_payment' }];
  const payments = { mode: 'sandbox', refund() { assert.fail('Capture comes before refund.'); } };
  const app = new Raincheck({ scenario, payments });
  try {
    await analyze(app, 'mina');
    await assert.rejects(app.execute('mina'), { code: 'capture_required' });
    assert.equal(app.workspace().sessions[0].held, 0);
    assert.equal(app.store.get('case', 'mina').status, 'ready');
    assert.equal(app.store.get('case', 'mina').operation, null);
    assert.throws(() => app.reset(), { code: 'reset_demo_only' });
  } finally { app.close(); }
});

test('returned refund ID survives receipt mismatch; recovery reads the same resource', async () => {
  const scenario = structuredClone(seed);
  scenario.bookings = [{ ...scenario.bookings[0], capture_id: 'CAPTURE12345678901', paypal_order_id: 'ORDER1234567890123' }];
  let writes = 0, reads = 0, operation;
  const receipt = amount => ({ id: 'REFUND123456789012', status: 'COMPLETED', amount, currency: 'USD',
    capture_id: scenario.bookings[0].capture_id, custom_id: operation.request_id });
  const payments = {
    mode: 'sandbox',
    refundBody(op) { return { amount: op.amount, reference: op.request_id }; },
    async refund(op) { writes++; operation = structuredClone(op); return receipt(null); },
    async getRefund(id) { reads++; assert.equal(id, 'REFUND123456789012'); return receipt(6800); }
  };
  const app = new Raincheck({ scenario, payments });
  try {
    await analyze(app, 'mina');
    const first = await app.execute('mina');
    assert.equal(first.status, 'reconciling');
    assert.equal(first.refund.id, 'REFUND123456789012');
    assert.equal(first.operation.order_id, scenario.bookings[0].paypal_order_id);
    assert.deepEqual(first.operation.body, { amount: 6800, reference: operation.request_id });
    assert.equal(app.workspace().metrics.refunded_amount, 0);
    assert.equal(app.workspace().sessions[0].held, 1);
    assert.equal((await app.execute('mina')).status, 'completed');
    assert.equal(writes, 1);
    assert.equal(reads, 1);
    assert.equal(app.workspace().metrics.refunded_amount, 6800);
    assert.equal(app.workspace().sessions[0].held, 0);
  } finally { app.close(); }
});
