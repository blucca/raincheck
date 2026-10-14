const proposed = new Set(['ready', 'capacity_conflict']);
const inFlight = new Set(['executing', 'payment_pending', 'reconciling']);
const labels = {
  affected: 'Analyze reply', awaiting_payment: 'Capture payment', ready: 'Review plan',
  capacity_conflict: 'Resolve seats', needs_reply: 'Ask the guest', completed: 'Settled',
  executing: 'Payment in progress', payment_pending: 'Check refund',
  reconciling: 'Recover refund', payment_failed: 'Review failed refund',
};

/** Read-only preflight. Proposed demand, held places, and settled outcomes stay separate. */
export function batchSnapshot(workspace) {
  const cases = new Map(workspace.cases.map(item => [item.booking_id, item]));
  const sessions = workspace.sessions.map(session => ({
    id: session.id, title: session.title, date: session.date, time: session.time,
    capacity: session.capacity, booked: session.booked, held: session.held || 0,
    available: Math.max(0, session.capacity - session.booked - (session.held || 0)),
    requested: 0, shortfall: 0, families: [],
  }));
  const bySession = new Map(sessions.map(session => [session.id, session]));
  const rows = workspace.bookings.map(booking => {
    const item = cases.get(booking.id);
    const plan = item?.plan;
    const status = item?.status || booking.status || 'affected';
    const candidate = proposed.has(status);
    const target = bySession.get(plan?.target_session_id);
    const requested = candidate ? plan.transfer_quantity : 0;
    if (requested && target) {
      target.requested += requested;
      target.families.push(booking.id);
    }
    return {
      booking_id: booking.id, family: booking.name, tickets: booking.quantity,
      session_id: target?.id || null,
      session: target ? `${target.date} ${target.time} · ${target.title}`
        : plan?.action === 'refund' ? 'Refund only' : 'Awaiting choice',
      case_status: status, next_step: labels[status] || 'Review booking',
      requested_seats: requested,
      held_seats: item?.reserved ? plan.transfer_quantity : 0,
      moved_seats: status === 'completed' ? plan.transfer_quantity : 0,
      planned_refund_cents: candidate ? plan.refund_amount : 0,
      pending_refund_cents: inFlight.has(status) ? item.operation?.amount || 0 : 0,
      settled_refund_cents: status === 'completed' ? plan.refund_amount : 0,
      needs_reply: status === 'needs_reply', capacity_review: false,
      evidence: plan?.evidence || '',
      question: plan?.question || '',
      source: plan?.source || 'Awaiting analysis',
      desk_url: `/?booking=${encodeURIComponent(booking.id)}`,
    };
  });
  for (const session of sessions) session.shortfall = Math.max(0, session.requested - session.available);
  for (const row of rows) {
    const target = bySession.get(row.session_id);
    if (row.requested_seats && target?.shortfall) {
      row.capacity_review = true;
      row.next_step = 'Resolve seats';
      row.question = `${target.requested} requested places share ${target.available} available. Agree the allocation or another class with these families.`;
    }
  }
  const total = field => rows.reduce((sum, row) => sum + row[field], 0);
  return {
    cancellation: workspace.cancellation, mode: workspace.mode,
    captured_at: new Date().toISOString(), currency: 'USD', sessions, rows,
    totals: {
      families: rows.length, requested_seats: total('requested_seats'), held_seats: total('held_seats'),
      moved_seats: total('moved_seats'), planned_refund_cents: total('planned_refund_cents'),
      pending_refund_cents: total('pending_refund_cents'), settled_refund_cents: total('settled_refund_cents'),
      capacity_review_families: rows.filter(row => row.capacity_review).length,
      needs_reply_families: rows.filter(row => row.needs_reply).length,
      unanalyzed_families: workspace.bookings.filter(booking => !cases.has(booking.id)).length,
    },
  };
}
