export class DomainError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}

/** The model selects a customer's intent; ticket counts, prices, and seats are computed here. */
export function planFromIntent({ booking, sessions, message, intent, source = 'live' }) {
  const invalid = message => { throw new DomainError('invalid_intent', message, 422); };
  if (!intent || typeof intent.needs_clarification !== 'boolean') invalid('State whether the customer has made a definite choice.');
  const evidence = intent.needs_clarification && !intent.evidence?.trim() ? message : intent.evidence;
  if (typeof evidence !== 'string' || !evidence.trim() || !message.includes(evidence)) {
    invalid('The interpretation needs an exact quote from this customer reply.');
  }
  if (typeof intent.explanation !== 'string' || intent.explanation.length > 1200) invalid('Supply a short explanation.');
  const action = intent.needs_clarification ? 'clarify' : (intent.transfer_quantity > 0 ? (intent.refund_quantity > 0 ? 'split' : 'transfer') : 'refund');
  const plan = { action, evidence, explanation: intent.explanation,
    question: typeof intent.question === 'string' ? intent.question.slice(0, 1000) : '',
    currency: booking.currency, source };
  if (action === 'clarify') {
    return { status: 'needs_reply', plan: { ...plan, transfer_quantity: 0, refund_quantity: 0,
      target_session_id: null, refund_amount: 0, question: plan.question || 'Which class or refund option would you prefer?' } };
  }
  const t = intent.transfer_quantity, r = intent.refund_quantity;
  if (![t, r].every(n => Number.isSafeInteger(n) && n >= 0) || t + r !== booking.quantity) {
    invalid('Account for every ticket exactly once.');
  }
  if (!Number.isSafeInteger(booking.unit_amount) || booking.unit_amount < 1 || booking.currency !== 'USD') {
    invalid('This prototype uses captured USD tickets with a positive integer-cent price.');
  }
  Object.assign(plan, { transfer_quantity: t, refund_quantity: r, target_session_id: t ? intent.target_session_id : null,
    refund_amount: r * booking.unit_amount, original_quantity: booking.quantity, unit_amount: booking.unit_amount });
  if (t) {
    const target = sessions.find(s => s.id === intent.target_session_id && s.id !== booking.original_session_id);
    if (!target) invalid('Select one of the available replacement classes.');
    if (target.capacity - target.booked - (target.held || 0) < t) {
      plan.question = `The requested class has ${Math.max(0, target.capacity - target.booked - (target.held || 0))} places left. Which other class or refund option would work for your party?`;
      return { status: 'capacity_conflict', plan };
    }
  }
  return { status: 'ready', plan };
}
