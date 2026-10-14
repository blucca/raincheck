import test from 'node:test';
import assert from 'node:assert/strict';
import { Raincheck } from '../src/engine.mjs';
import { seed, recordedIntents } from '../src/seed.mjs';
import { batchSnapshot } from '../src/batch.mjs';

test('batch flags both families before either takes the last seat; holds and refunds settle once', async () => {
  const scenario = structuredClone(seed);
  scenario.bookings.push({ ...scenario.bookings[0], id: 'elliot', name: 'Elliot Lane', capture_id: 'sim_elliot' });
  const interpreter = { mode: 'test fixture', interpret: async ({ booking }) =>
    structuredClone(recordedIntents[booking.id === 'elliot' ? 'mina' : booking.id]) };
  const app = new Raincheck({ scenario, interpreter });
  try {
    assert.equal(batchSnapshot(app.workspace()).totals.unanalyzed_families, 5);
    for (const booking of scenario.bookings) await app.analyze(booking.id, booking.message);
    const workspace = app.workspace();
    const before = structuredClone(workspace);
    let batch = batchSnapshot(workspace);
    assert.deepEqual(workspace, before);
    assert.deepEqual(batch.sessions[0].families, ['mina', 'elliot']);
    assert.equal(batch.sessions[0].requested, 2);
    assert.equal(batch.sessions[0].available, 1);
    assert.equal(batch.sessions[0].shortfall, 1);
    assert.equal(batch.totals.capacity_review_families, 2);
    assert.equal(batch.totals.needs_reply_families, 1);
    assert.equal(batch.totals.planned_refund_cents, 20400);
    assert.equal(batch.rows.find(row => row.booking_id === 'elliot').desk_url, '/?booking=elliot');
    assert.equal(app.store.all('provider_refund').length, 0);

    await app.execute('mina', { simulate_lost_response: true });
    batch = batchSnapshot(app.workspace());
    assert.equal(batch.sessions[0].held, 1);
    assert.equal(batch.sessions[0].available, 0);
    assert.equal(batch.sessions[0].requested, 1);
    assert.equal(batch.totals.capacity_review_families, 1);
    assert.equal(batch.totals.planned_refund_cents, 13600);
    assert.equal(batch.totals.pending_refund_cents, 6800);
    assert.equal(batch.totals.settled_refund_cents, 0);

    await app.execute('mina');
    batch = batchSnapshot(app.workspace());
    assert.equal(batch.sessions[0].held, 0);
    assert.equal(batch.sessions[0].booked, 8);
    assert.equal(batch.sessions[0].requested, 1);
    assert.equal(batch.totals.pending_refund_cents, 0);
    assert.equal(batch.totals.settled_refund_cents, 6800);
    assert.equal(batch.rows.find(row => row.booking_id === 'mina').next_step, 'Settled');
    assert.equal((await app.execute('elliot')).status, 'capacity_conflict');
    assert.equal(app.store.all('provider_refund').length, 1);
  } finally { app.close(); }
});
