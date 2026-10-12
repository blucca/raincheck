const isPreview = location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('preview');
let previewModule;

const app = document.querySelector('#workspace');
const dialog = document.querySelector('#workspace-dialog');
const dialogContent = document.querySelector('#dialog-content');
const announcer = document.querySelector('#announcer');

const state = {
  workspace: null,
  selectedId: null,
  drafts: new Map(),
  analyzedMessages: new Map(),
  pending: null,
  error: '',
  interruptRefund: false,
  recoveryOpen: false,
  toastTimer: null,
};

const paths = {
  arrow: '<path d="M4 10h12m-5-5 5 5-5 5"/>',
  chevron: '<path d="m8 5 5 5-5 5"/>',
  check: '<path d="m4.5 10 3.5 3.5L15.5 6"/>',
  checkCircle: '<circle cx="10" cy="10" r="7.5"/><path d="m6.5 10 2.2 2.2 4.8-4.8"/>',
  clock: '<circle cx="10" cy="10" r="7.3"/><path d="M10 5.7v4.6l3 1.8"/>',
  spark: '<path d="m10 2 1.8 5.8L17.5 10l-5.7 2.1L10 18l-1.9-5.9L2.5 10l5.6-2.2L10 2Z"/><path d="m16.5 2.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z"/>',
  copy: '<rect x="7" y="6.5" width="9" height="10.5" rx="1.5"/><path d="M12.5 6.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v7A1.5 1.5 0 0 0 4 12.5h3"/>',
  download: '<path d="M10 2.5v10m-3.5-3.5 3.5 3.5 3.5-3.5M3 13.5v3h14v-3"/>',
  reset: '<path d="M3 8a7 7 0 1 1 .8 6M3 3v5h5"/>',
  warning: '<path d="m10 2.5 8 14H2l8-14Z"/><path d="M10 7v4m0 2.3v.2"/>',
  close: '<path d="m5 5 10 10M15 5 5 15"/>',
  ticket: '<path d="M3 4.5h14v4a1.5 1.5 0 0 0 0 3v4H3v-4a1.5 1.5 0 0 0 0-3v-4Z"/><path d="M12 5v2m0 2v2m0 2v2"/>',
  seat: '<path d="M5 9V4.5A1.5 1.5 0 0 1 6.5 3h7A1.5 1.5 0 0 1 15 4.5V9M3 8.5v5h14v-5M5 13.5V17m10-3.5V17M5 9.5h10"/>',
  refund: '<path d="M5 7H2.5V4.5M3 7a7 7 0 1 1-.2 6"/><path d="M12.2 6.5H9.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3H7.8M10 5v1.5m0 6V14"/>',
  message: '<path d="M16 3.5H4A1.5 1.5 0 0 0 2.5 5v8A1.5 1.5 0 0 0 4 14.5h3L10 18l3-3.5h3a1.5 1.5 0 0 0 1.5-1.5V5A1.5 1.5 0 0 0 16 3.5Z"/><path d="M6 7.5h8m-8 3h5"/>',
  shield: '<path d="m10 2 6.5 3v4.5c0 4-3 6.8-6.5 8.5-3.5-1.7-6.5-4.5-6.5-8.5V5L10 2Z"/><path d="m6.5 9.5 2.3 2.3 4.7-4.7"/>',
  leaf: '<path d="M16.5 3.5C9 2 3 5.5 4 11c.7 3.5 6.5 5 10 1 2.5-3 2.5-8.5 2.5-8.5Z"/><path d="M3 18c2.5-5 5-8.5 9-11"/>',
  ledger: '<path d="M5 3.5h10a1 1 0 0 1 1 1V17l-3-1.5L10 17l-3-1.5L4 17V4.5a1 1 0 0 1 1-1Z"/><path d="M7 7h6M7 10h6"/>',
};

function icon(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
}

function escapeHTML(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function money(amount = 0, currency = 'USD') {
  const cents = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function dateObject(value) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value, style = 'short') {
  const date = dateObject(value);
  if (!date) return String(value || 'Date to be confirmed');
  const options = style === 'long'
    ? { weekday: 'long', month: 'long', day: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function timeLabel(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return String(value);
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'pm' : 'am'}`;
}

function seatLabel(quantity) { return `${quantity} ${Number(quantity) === 1 ? 'seat' : 'seats'}`; }
function bookingById(id) { return state.workspace?.bookings?.find((booking) => booking.id === id); }
function caseFor(id) { return state.workspace?.cases?.find((entry) => entry.booking_id === id) || null; }
function sessionById(id) { return state.workspace?.sessions?.find((session) => session.id === id); }
function activeBooking() { return bookingById(state.selectedId); }
function activeCase() { return caseFor(state.selectedId); }
function initials(name = '') { return String(name).trim().split(/\s+/).slice(0, 2).map((word) => word[0] || '').join('').toUpperCase(); }
function isSimulated() { return state.workspace?.mode?.payments !== 'sandbox'; }
function isLocked(entry) { return ['completed', 'executing', 'payment_pending', 'reconciling', 'payment_failed'].includes(entry?.status); }
function isDirty(id) {
  return Boolean(caseFor(id)?.plan) && state.drafts.get(id) !== state.analyzedMessages.get(id);
}

function statusInfo(entry, booking) {
  const status = entry?.status || booking?.status || 'unreviewed';
  return {
    ready: ['Ready to run', 'ready'],
    needs_reply: ['Needs a reply', 'attention'],
    capacity_conflict: ['Seat conflict', 'attention'],
    completed: ['All settled', 'completed'],
    payment_pending: ['Refund pending', 'attention'],
    reconciling: ['Check refund', 'attention'],
    executing: ['In progress', 'ready'],
    payment_failed: ['Refund failed', 'failed'],
  }[status] || ['To review', ''];
}

function statusTag(entry, booking) {
  const [label, style] = statusInfo(entry, booking);
  return `<span class="status-tag ${style}">${escapeHTML(label)}</span>`;
}

function modeTags() {
  const live = state.workspace?.mode?.ai === 'live';
  return `
    <span class="mode-tag demo">${icon('ledger')}${isSimulated() ? 'Demo ledger' : 'PayPal sandbox ledger'}</span>
    <span class="mode-tag ${isSimulated() ? 'pending' : 'live'}">${icon(isSimulated() ? 'clock' : 'checkCircle')}${isPreview ? 'Private browser preview' : (isSimulated() ? 'Sandbox credentials pending' : 'Sandbox configured')}</span>
    <span class="mode-tag ${live ? 'live' : ''}"><span class="tag-dot"></span>${live ? 'Live AI' : 'Recorded AI examples'}</span>`;
}

function renderCancellation() {
  const cancellation = state.workspace.cancellation || {};
  const date = dateObject(cancellation.date);
  return `<div class="cancellation-slip" aria-label="Cancelled class">
    <div class="ticket-date" aria-hidden="true">
      <span class="ticket-month">${date ? date.toLocaleDateString('en-US', { month: 'short' }) : 'Class'}</span>
      <span class="ticket-day">${date ? date.getDate() : '↻'}</span>
      <span class="ticket-weekday">${date ? date.toLocaleDateString('en-US', { weekday: 'long' }) : 'Replan'}</span>
    </div>
    <div class="ticket-body">
      <div class="ticket-status">Class cancelled · ${escapeHTML(dateLabel(cancellation.date))}</div>
      <h2>${escapeHTML(cancellation.title || state.workspace.title || 'Studio workshop')}</h2>
      <p>${escapeHTML(cancellation.reason || 'Let’s find everyone a good next step.')}</p>
    </div>
  </div>`;
}

function renderMetrics() {
  const metrics = state.workspace.metrics || {};
  const currency = state.workspace.bookings?.[0]?.currency || 'USD';
  return `<section class="metrics-strip" aria-label="Cancellation outcomes">
    <div class="metric"><span class="metric-number">${state.workspace.bookings.length}</span><span class="metric-label">Bookings</span></div>
    <div class="metric"><span class="metric-number">${escapeHTML(metrics.transferred || 0)}</span><span class="metric-label">Seats rebooked</span></div>
    <div class="metric"><span class="metric-number">${escapeHTML(money(metrics.refunded_amount || 0, currency))}</span><span class="metric-label">Refunded</span></div>
    <div class="metric"><span class="metric-number">${escapeHTML(metrics.needs_reply || 0)}</span><span class="metric-label">Need a reply</span></div>
  </section>`;
}

function renderBookingList() {
  const bookings = state.workspace.bookings || [];
  const completed = bookings.filter((booking) => caseFor(booking.id)?.status === 'completed').length;
  return `<div class="sidebar-heading"><h2>Bookings to look after</h2><span class="sidebar-count">${completed} / ${bookings.length} settled</span></div>
    <div class="bookings-list" aria-label="Choose a booking">${bookings.map((booking, index) => {
      const selected = booking.id === state.selectedId;
      return `<button type="button" class="booking-button ${selected ? 'active' : ''}" data-action="select-booking" data-id="${escapeHTML(booking.id)}" aria-pressed="${selected}" ${state.pending ? 'disabled' : ''}>
        <span class="booking-first-line">
          <span class="avatar avatar-${index % 4}">${escapeHTML(initials(booking.name))}</span>
          <span><span class="booking-name">${escapeHTML(booking.name)}</span><span class="booking-sub">${escapeHTML(seatLabel(booking.quantity))} · original booking</span></span>
          ${icon('chevron', 'booking-chevron')}
        </span>
        <span class="booking-excerpt">“${escapeHTML(booking.message || 'Waiting for their reply.')}”</span>
        <span class="booking-bottom">${statusTag(caseFor(booking.id), booking)}<span class="booking-price">${escapeHTML(money(booking.quantity * booking.unit_amount, booking.currency))}</span></span>
      </button>`;
    }).join('')}</div>`;
}

function renderSessions() {
  const originalIds = new Set((state.workspace.bookings || []).map((booking) => booking.original_session_id));
  const sessions = (state.workspace.sessions || []).filter((session) => !originalIds.has(session.id));
  return `<section class="sessions-section" aria-labelledby="sessions-title">
    <div class="sidebar-heading"><h3 id="sessions-title">A little room to rebook</h3><span class="sidebar-count">Seat ledger</span></div>
    <div class="session-list">${sessions.map((session) => {
      const available = Math.max(0, Number(session.available) || 0);
      const capacity = Math.max(1, Number(session.capacity) || available);
      const segments = Math.min(capacity, 14);
      const openSegments = Math.round((available / capacity) * segments);
      return `<div class="session-row">
        <div class="session-line">
          <div><div class="session-date">${escapeHTML(dateLabel(session.date))}</div><div class="session-time">${escapeHTML(timeLabel(session.time))}</div></div>
          <span class="session-seats ${available === 0 ? 'full' : available === 1 ? 'low' : ''}">${available ? `${available} ${available === 1 ? 'seat' : 'seats'} open` : 'Fully booked'}</span>
        </div>
        <div class="seat-meter" role="img" aria-label="${available} of ${capacity} seats available">${Array.from({ length: segments }, (_, index) => `<span class="${index >= segments - openSegments ? 'open' : ''}"></span>`).join('')}</div>
      </div>`;
    }).join('')}</div>
    <p class="session-note">Seat availability is checked again when a plan runs.</p>
  </section>`;
}

function renderComposer(booking, entry) {
  const locked = isLocked(entry);
  const busy = Boolean(state.pending);
  const draft = state.drafts.get(booking.id) ?? booking.message ?? '';
  return `<section class="case-section composer-section" aria-labelledby="reply-title">
    <div class="section-heading">
      <h3 id="reply-title" class="step-label"><span class="step-number">01</span>The customer’s words</h3>
      <label class="sample-picker"><span>Try a sample</span><select id="reply-sample" aria-label="Load a sample customer reply" ${busy ? 'disabled' : ''}>${state.workspace.bookings.map((sample) => `<option value="${escapeHTML(sample.id)}" ${sample.id === booking.id ? 'selected' : ''}>${escapeHTML(sample.name.split(' ')[0])}’s reply</option>`).join('')}</select></label>
    </div>
    <div class="reply-composer">
      <label class="sr-only" for="customer-reply">Customer reply for ${escapeHTML(booking.name)}</label>
      <textarea id="customer-reply" class="reply-input" rows="3" maxlength="4000" placeholder="Paste or write the customer’s reply…" ${busy || locked ? 'disabled' : ''}>${escapeHTML(draft)}</textarea>
    </div>
    <div class="composer-footer">
      <p class="composer-hint">${locked ? 'This reply belongs to the plan below. Follow its next step to finish the booking.' : state.workspace.mode?.ai === 'live' ? 'AI reads the request. The seat and payment ledgers check the plan.' : 'Recorded customer replies are ready to try. Free-form replies use live AI when connected.'}</p>
      <button type="button" class="button button-primary" data-action="analyze" ${busy || locked || !draft.trim() ? 'disabled' : ''}>${state.pending === 'analyze' ? '<span class="spinner" aria-hidden="true"></span>Reading reply…' : locked ? `${icon('check')}Reply analyzed` : `${icon('spark')}Analyze reply`}</button>
    </div>
    <p class="stale-plan ${isDirty(booking.id) ? 'visible' : ''}" id="stale-plan">The reply has changed. Analyze it again to update the plan.</p>
  </section>`;
}

function renderEmptyAnalysis() {
  return `<section class="analysis-empty" aria-label="Plan preview">
    <div class="empty-flow" aria-hidden="true"><span class="flow-icon">${icon('message')}</span><span class="flow-dots">···</span><span class="flow-icon">${icon('spark')}</span><span class="flow-dots">···</span><span class="flow-icon">${icon('ticket')}</span></div>
    <h3>A clear next step, in their own words.</h3>
    <p>Read the reply, check the seats, work out the exact refund. Then put a considered plan into motion.</p>
  </section>`;
}

function evidenceText(evidence) {
  if (Array.isArray(evidence)) return evidence.map(evidenceText).filter(Boolean).join(' · ');
  if (evidence && typeof evidence === 'object') return evidence.quote || evidence.text || evidence.excerpt || '';
  return String(evidence || '');
}

function sessionDescription(session, style = 'short') {
  return session ? `${dateLabel(session.date, style)}${session.time ? ` at ${timeLabel(session.time)}` : ''}` : 'the chosen class';
}

function renderSeatCheck(entry, session) {
  const quantity = Number(entry.plan.transfer_quantity) || 0;
  if (!quantity || !session) return '';
  if (entry.status === 'completed') {
    return `<div class="seat-check">${icon('checkCircle')}<span><strong>${escapeHTML(seatLabel(quantity))} rebooked.</strong> ${escapeHTML(sessionDescription(session))}.</span></div>`;
  }
  if (['payment_pending', 'reconciling', 'executing'].includes(entry.status)) {
    return `<div class="seat-check">${icon('shield')}<span><strong>${escapeHTML(seatLabel(quantity))} held for this booking.</strong> The booking finishes when the refund is confirmed.</span></div>`;
  }
  const available = Number(session.available) || 0;
  const conflict = quantity > available;
  return `<div class="seat-check ${conflict ? 'attention' : ''}">${icon(conflict ? 'warning' : 'checkCircle')}<span><strong>${quantity} requested · ${available} currently open.</strong> ${conflict ? 'Choose a session with room for this group.' : 'The execution step reserves these seats.'}</span></div>`;
}

function renderPlan(booking, entry) {
  const plan = entry.plan;
  const session = sessionById(plan.target_session_id);
  const transfer = Number(plan.transfer_quantity) || 0;
  const refund = Number(plan.refund_quantity) || 0;
  const evidence = evidenceText(plan.evidence);
  const total = transfer + refund;
  return `<section class="case-section plan-section" aria-labelledby="plan-title">
    <div class="section-heading">
      <h3 id="plan-title" class="step-label"><span class="step-number">02</span>The checked plan</h3>
      <span class="source-label">${icon('spark')}${plan.source === 'live' ? 'Live AI understanding' : 'Recorded AI understanding'}</span>
    </div>
    <p class="plan-explanation">${escapeHTML(plan.explanation || 'The customer’s request is ready for review.')}</p>
    ${evidence ? `<blockquote class="evidence"><span class="evidence-label">Their words</span>“${escapeHTML(evidence)}”</blockquote>` : ''}
    <div class="plan-facts">
      <div class="plan-fact"><span class="fact-label">${entry.status === 'completed' ? 'Rebooked' : 'Rebook'}</span><span class="fact-value">${transfer} <small>${transfer === 1 ? 'seat' : 'seats'}</small></span><span class="fact-detail">${transfer && session ? `${escapeHTML(dateLabel(session.date))}<br>${escapeHTML(timeLabel(session.time))}` : transfer ? 'Destination to confirm' : 'Original class released'}</span></div>
      <div class="plan-fact refund"><span class="fact-label">${entry.status === 'completed' ? 'Refunded' : 'Refund'}</span><span class="fact-value">${escapeHTML(money(plan.refund_amount, plan.currency || booking.currency))}</span><span class="fact-detail">${refund ? `${escapeHTML(seatLabel(refund))} × ${escapeHTML(money(booking.unit_amount, booking.currency))}` : 'Full value stays with booking'}</span></div>
      <div class="plan-fact"><span class="fact-label">Accounted for</span><span class="fact-value">${total} <small>of ${booking.quantity}</small></span><span class="fact-detail">${total === Number(booking.quantity) ? 'Every original ticket' : 'Awaiting a clear preference'}</span></div>
    </div>
    ${renderSeatCheck(entry, session)}
  </section>${renderNextStep(booking, entry)}`;
}

function nextMove(booking, entry) {
  const plan = entry.plan;
  const amount = money(plan.refund_amount, plan.currency || booking.currency);
  const session = sessionById(plan.target_session_id);
  const date = session ? dateLabel(session.date) : 'the chosen class';
  if (plan.transfer_quantity > 0 && plan.refund_quantity > 0) return `Return ${amount}. Rebook ${seatLabel(plan.transfer_quantity)} for ${date}.`;
  if (plan.refund_quantity > 0) return `Return ${amount} to the original payment.`;
  if (plan.transfer_quantity > 0) return `Rebook ${seatLabel(plan.transfer_quantity)} for ${date}.`;
  return 'Ask one good question, then make a plan.';
}

function executeLabel(booking, entry) {
  if (state.pending === 'execute') return '<span class="spinner" aria-hidden="true"></span>Working on it…';
  if (entry.status === 'reconciling') return `${icon('reset')}Recover refund`;
  if (entry.status === 'payment_pending') return `${icon('reset')}Check refund status`;
  if (entry.plan.refund_quantity > 0 && entry.plan.transfer_quantity > 0) return `${icon('arrow')}Run refund & rebooking`;
  if (entry.plan.refund_quantity > 0) return `${icon('refund')}Refund ${escapeHTML(money(entry.plan.refund_amount, entry.plan.currency || booking.currency))}`;
  return `${icon('arrow')}Rebook ${escapeHTML(seatLabel(entry.plan.transfer_quantity))}`;
}

function renderNextStep(booking, entry) {
  const plan = entry.plan;
  const status = entry.status;
  const busy = Boolean(state.pending);
  let content = '';
  if (status === 'completed') {
    content = `<div class="completed-receipt">
      <div class="completed-top"><span class="completed-check">${icon('check')}</span><div><h3>All settled.</h3><p>${escapeHTML(completedSummary(booking, entry))}</p></div></div>
      ${entry.refund?.id ? `<div class="receipt-id">${isSimulated() ? 'Demo refund' : 'PayPal sandbox refund'} · <code>${escapeHTML(entry.refund.id)}</code> · ${escapeHTML(entry.refund.status || 'COMPLETED')}</div>` : '<div class="receipt-id">The booking and seat ledger have been updated.</div>'}
    </div>`;
  } else if (status === 'capacity_conflict' || status === 'needs_reply' || plan.action === 'clarify') {
    content = `<div class="attention-panel">
      <h3 class="attention-heading">${icon(status === 'capacity_conflict' ? 'seat' : 'message')}${status === 'capacity_conflict' ? 'This group needs another option.' : 'One reply will clear this up.'}</h3>
      <p>${status === 'capacity_conflict' ? 'The requested class has fewer open seats than this plan needs. Ask about another class, then analyze the updated reply.' : 'The next step is a clear customer preference. Keep their booking open while you ask.'}</p>
      <div class="question-draft">${escapeHTML(questionFor(booking, entry))}</div>
      <button type="button" class="button button-quiet button-small" data-action="copy-question">${icon('copy')}Copy question</button>
    </div>`;
  } else if (!isSimulated() && !booking.capture_id) {
    content = `<div class="attention-panel"><h3 class="attention-heading">${icon('ticket')}Start with the original payment.</h3><p>Create and capture this ${escapeHTML(money(booking.quantity * booking.unit_amount, booking.currency))} booking in the PayPal sandbox. This plan will use its verified capture.</p><a class="button button-primary" href="/sandbox.html?booking=${encodeURIComponent(booking.id)}">Open Sandbox checkout ${icon('arrow')}</a></div>`;
  } else if (status === 'payment_failed') {
    content = `<div class="attention-panel"><h3 class="attention-heading">${icon('warning')}Review this payment.</h3><p>${escapeHTML(entry.error?.message || 'The payment provider closed this refund attempt. Review its receipt and the original payment history before arranging a new outcome.')}</p><p>The original operation stays in the outcome record. Reserved replacement seats have been released.</p></div>`;
  } else if (status === 'executing') {
    content = `<div class="execution-bar"><div class="execution-copy"><h3>The plan is in progress.</h3><p>The seat hold and refund stay linked to this booking.</p></div><button class="button button-light" type="button" data-action="refresh" ${busy ? 'disabled' : ''}>${icon('reset')}Refresh status</button></div>`;
  } else {
    const recovering = ['reconciling', 'payment_pending'].includes(status);
    const failed = status === 'payment_failed';
    content = `${recovering || failed ? `<div class="attention-panel recovery-notice"><h3 class="attention-heading">${icon(failed ? 'warning' : 'reset')}${failed ? 'The refund failed.' : 'The refund needs a status check.'}</h3><p>${failed ? 'Review the payment result in the outcome trail, then retry this plan.' : `Raincheck checks the existing refund before finishing the booking.${plan.transfer_quantity > 0 ? ' The new seat reservation stays held.' : ''}`}</p></div>` : ''}
      <div class="execution-bar">
        <div class="execution-copy"><h3>${escapeHTML(recovering ? 'Pick up exactly where this left off.' : nextMove(booking, entry))}</h3><p>${isSimulated() ? 'Simulated PayPal payment · demo booking ledger.' : 'PayPal sandbox test payment · demo booking ledger.'}${recovering ? ' The same refund stays attached to this case.' : ''}</p></div>
        <button type="button" class="button button-light" data-action="execute" ${busy || isDirty(booking.id) ? 'disabled' : ''}>${executeLabel(booking, entry)}</button>
      </div>
      ${isSimulated() && plan.refund_quantity > 0 && !recovering && !failed ? `<details class="recovery-demo" id="recovery-demo" ${state.recoveryOpen ? 'open' : ''}><summary>Try a recovery scenario</summary><label><input type="checkbox" id="interrupt-refund" ${state.interruptRefund ? 'checked' : ''} ${busy ? 'disabled' : ''}>Interrupt the response after the refund</label><p>The payment can succeed before its reply arrives. See Raincheck recover the existing refund and finish the same plan.</p></details>` : ''}`;
  }
  return `<section class="case-section next-section" aria-labelledby="next-title">
    <div class="section-heading"><h3 id="next-title" class="step-label"><span class="step-number">03</span>${status === 'completed' ? 'The outcome' : 'The next move'}</h3>${statusTag(entry, booking)}</div>
    ${content}
    <div class="delivery-actions">
      <button type="button" class="text-button" data-action="copy-reply">${icon('copy')}Copy customer reply</button>
      <button type="button" class="text-button" data-action="export" ${busy ? 'disabled' : ''}>${icon('download')}Export outcome</button>
      <span class="receipt-status">${status === 'completed' ? 'Ready to send with care.' : status === 'ready' ? 'Review the plan, then run it.' : 'Every step stays with this booking.'}</span>
    </div>
    ${renderEvents(entry.events)}
  </section>`;
}

function completedSummary(booking, entry) {
  const plan = entry.plan;
  const parts = [];
  if (plan.transfer_quantity > 0) parts.push(`${seatLabel(plan.transfer_quantity)} rebooked for ${sessionDescription(sessionById(plan.target_session_id))}`);
  if (plan.refund_quantity > 0) parts.push(`${money(plan.refund_amount, plan.currency || booking.currency)} refunded to the original payment`);
  return `${parts.join('. ')}.`;
}

function questionFor(booking, entry) {
  const quantity = Number(entry.plan?.transfer_quantity) || Number(booking.quantity);
  const options = (state.workspace.sessions || []).filter((session) => Number(session.available) >= quantity);
  const dates = options.map((session) => sessionDescription(session)).join(' or ');
  if (entry.plan?.question) return `${entry.plan.question}${dates ? ` Available: ${dates}.` : ''} A full refund is also available.`;
  return dates
    ? `Hi ${booking.name.split(' ')[0]}, we have room for your ${seatLabel(booking.quantity)} on ${dates}. Which would you prefer? A full refund is also available.`
    : `Hi ${booking.name.split(' ')[0]}, would you prefer a full refund, or shall we find another class with room for your group?`;
}

function customerReply(booking, entry) {
  if (!entry?.plan) return '';
  if (entry.status === 'needs_reply' || entry.status === 'capacity_conflict' || entry.plan.action === 'clarify') return questionFor(booking, entry);
  const plan = entry.plan;
  const complete = entry.status === 'completed';
  const name = booking.name.split(' ')[0];
  const parts = [`Hi ${name}, thanks for getting back to us, and for understanding the change of plans.`];
  if (entry.status === 'payment_failed') {
    parts.push('We’re reviewing your original payment and will confirm the next steps for your booking once that review is complete.');
  } else if (['reconciling', 'payment_pending', 'executing'].includes(entry.status)) {
    if (plan.transfer_quantity > 0) parts.push(`We’re holding ${seatLabel(plan.transfer_quantity)} for you on ${sessionDescription(sessionById(plan.target_session_id))}.`);
    if (plan.refund_quantity > 0) parts.push(`We’re checking the status of your ${money(plan.refund_amount, plan.currency || booking.currency)} refund and will send the outcome as soon as it is confirmed.`);
  } else {
    if (plan.transfer_quantity > 0) parts.push(`${complete ? 'We’ve moved' : 'We’ll move'} ${seatLabel(plan.transfer_quantity)} to ${sessionDescription(sessionById(plan.target_session_id))}.`);
    if (plan.refund_quantity > 0) parts.push(`${complete ? 'We’ve refunded' : 'We’ll refund'} ${money(plan.refund_amount, plan.currency || booking.currency)} for ${seatLabel(plan.refund_quantity)} to your original payment method.`);
    if (complete && entry.refund?.id) parts.push(`Your ${isSimulated() ? 'demo ' : 'sandbox '}refund reference is ${entry.refund.id}.`);
  }
  parts.push('Thanks for being part of our studio.');
  return parts.join('\n\n');
}

function renderEvents(events) {
  if (!Array.isArray(events) || !events.length) return '';
  const content = events.map((event) => {
    if (typeof event === 'string') return `<li>${escapeHTML(event)}</li>`;
    const time = dateObject(event.at || event.timestamp || event.created_at);
    const label = event.message || event.description || event.detail || event.title || String(event.type || event.action || 'Ledger updated').replace(/[_-]/g, ' ');
    const detail = typeof label === 'object' ? JSON.stringify(label) : label;
    return `<li>${time ? `<time class="event-time" datetime="${escapeHTML(time.toISOString())}">${time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</time>` : ''}${escapeHTML(detail)}</li>`;
  }).join('');
  return `<details class="outcome-trail"><summary>Outcome trail · ${events.length} ${events.length === 1 ? 'event' : 'events'}</summary><ol class="event-list">${content}</ol></details>`;
}

function renderCase() {
  const booking = activeBooking();
  if (!booking) return '<section class="case-sheet analysis-empty"><h2>Every booking is ready to review.</h2><p>Choose a customer’s reply to get started.</p></section>';
  const entry = activeCase();
  const index = state.workspace.bookings.findIndex((row) => row.id === booking.id);
  return `<article class="case-sheet" aria-labelledby="case-person-name">
    <header class="case-header">
      <div class="case-header-top">
        <div class="case-person"><span class="avatar avatar-${index % 4}">${escapeHTML(initials(booking.name))}</span><div><h2 id="case-person-name">${escapeHTML(booking.name)}</h2><p class="case-email">${escapeHTML(booking.email)}</p></div></div>
        <div class="payment-total"><strong>${escapeHTML(money(booking.quantity * booking.unit_amount, booking.currency))}</strong><span>${booking.quantity} × ${escapeHTML(money(booking.unit_amount, booking.currency))} · ${isSimulated() || booking.capture_id ? 'originally paid' : 'awaiting sandbox payment'}</span></div>
      </div>
      <div class="case-meta"><span class="case-meta-note">${icon('ticket')}${escapeHTML(seatLabel(booking.quantity))} · ${escapeHTML(state.workspace.cancellation?.title || 'Cancelled class')}</span><span class="case-meta-note">${icon('shield')}Capture <code>${escapeHTML(booking.capture_id || 'awaiting checkout')}</code></span></div>
    </header>
    ${renderComposer(booking, entry)}
    ${entry?.plan ? renderPlan(booking, entry) : renderEmptyAnalysis()}
  </article>`;
}

function render() {
  app.setAttribute('aria-busy', String(Boolean(state.pending)));
  if (!state.workspace) {
    if (state.error) app.innerHTML = `<section class="offline-state"><span class="loading-umbrella" aria-hidden="true">☂</span><h1>The studio desk needs a moment.</h1><p>${escapeHTML(state.error)}</p><button class="button button-primary" type="button" data-action="refresh">${icon('reset')}Try the connection again</button></section>`;
    return;
  }
  app.innerHTML = `
    <section class="scene-heading" aria-label="Studio cancellation desk">
      <div><p class="eyebrow">The studio reschedule desk</p><h1>Keep the care.<br><em>Change the plan.</em></h1></div>
      ${renderCancellation()}
    </section>
    <div class="mode-line" aria-label="Connected services">${modeTags()}${isSimulated() ? `<button class="text-button reset-button" type="button" data-action="reset" ${state.pending ? 'disabled' : ''}>${icon('reset')}${state.pending === 'reset' ? 'Resetting…' : 'Reset demo'}</button>` : '<a class="text-button reset-button" href="/sandbox.html">Sandbox checkout & receipts →</a>'}</div>
    ${renderMetrics()}
    ${state.error ? `<div class="error-banner" role="alert">${icon('warning')}<span>${escapeHTML(state.error)}</span><button class="text-button" type="button" data-action="dismiss-error" aria-label="Dismiss error">×</button></div>` : ''}
    <div class="desk-grid">
      <aside class="desk-sidebar">${renderBookingList()}${renderSessions()}<div class="sidebar-note">${icon('leaf')}<p>A changed plan can still<br>feel like being looked after.</p></div></aside>
      ${renderCase()}
    </div>`;
}

function adoptWorkspace(workspace, reset = false) {
  if (!workspace || !Array.isArray(workspace.bookings)) throw new Error('The workspace response needs a booking list.');
  state.workspace = workspace;
  if (!Array.isArray(workspace.cases)) workspace.cases = [];
  if (!Array.isArray(workspace.sessions)) workspace.sessions = [];
  if (reset) {
    state.drafts.clear();
    state.analyzedMessages.clear();
    state.selectedId = null;
    state.interruptRefund = false;
    state.recoveryOpen = false;
  }
  if (!bookingById(state.selectedId)) state.selectedId = workspace.bookings[0]?.id || null;
  for (const booking of workspace.bookings) {
    const entry = caseFor(booking.id);
    if (!state.drafts.has(booking.id)) state.drafts.set(booking.id, entry?.message || entry?.customer_message || booking.message || '');
    if (entry?.plan && !state.analyzedMessages.has(booking.id)) state.analyzedMessages.set(booking.id, entry.message || entry.customer_message || booking.message || '');
  }
}

async function request(path, options = {}) {
  if (isPreview) {
    previewModule ||= await import('../src/browser-api.mjs');
    return previewModule.previewRequest(path, options);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(path, {
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      signal: controller.signal,
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error('The studio API returned an unexpected response. Please try again.'); }
    if (!response.ok) {
      if (result.workspace) adoptWorkspace(result.workspace);
      throw new Error(result.message || result.error || `The request failed (${response.status}).`);
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('This request is taking longer than expected. Refresh the workspace to check the latest state.');
    throw error;
  } finally { clearTimeout(timeout); }
}

async function loadWorkspace() {
  if (state.pending) return;
  state.pending = 'load';
  state.error = '';
  render();
  try {
    const response = await request('/api/workspace');
    adoptWorkspace(response.workspace || response);
  } catch (error) {
    state.error = error.message || 'The studio connection needs a refresh.';
  } finally {
    state.pending = null;
    render();
  }
}

async function analyzeReply() {
  const booking = activeBooking();
  if (!booking || state.pending || isLocked(activeCase())) return;
  const message = state.drafts.get(booking.id)?.trim();
  if (!message) return;
  state.pending = 'analyze';
  state.error = '';
  render();
  try {
    const response = await request(`/api/cases/${encodeURIComponent(booking.id)}/analyze`, { method: 'POST', body: JSON.stringify({ message }) });
    adoptWorkspace(response.workspace);
    if (response.case && !caseFor(booking.id)) state.workspace.cases.push(response.case);
    state.drafts.set(booking.id, message);
    state.analyzedMessages.set(booking.id, message);
    announcer.textContent = `${booking.name}’s reply analyzed. ${statusInfo(response.case || caseFor(booking.id), booking)[0]}.`;
  } catch (error) {
    state.error = error.message;
    announcer.textContent = error.message;
  } finally {
    state.pending = null;
    render();
    if (state.error) revealError();
    else revealPlan();
  }
}

async function executePlan() {
  const booking = activeBooking();
  const entry = activeCase();
  if (!booking || !entry?.plan || state.pending || isDirty(booking.id)) return;
  const allowed = ['ready', 'reconciling', 'payment_pending'];
  if (!allowed.includes(entry.status)) return;
  state.pending = 'execute';
  state.error = '';
  const body = isSimulated() && state.interruptRefund && entry.status === 'ready' ? { simulate_lost_response: true } : {};
  render();
  try {
    const response = await request(`/api/cases/${encodeURIComponent(booking.id)}/execute`, { method: 'POST', body: JSON.stringify(body) });
    adoptWorkspace(response.workspace);
    const result = response.case || caseFor(booking.id);
    toast(result?.status === 'completed' ? `${booking.name.split(' ')[0]}’s booking is all settled.` : `Booking updated: ${statusInfo(result, booking)[0].toLowerCase()}.`);
  } catch (error) {
    state.error = error.message;
    announcer.textContent = error.message;
  } finally {
    state.pending = null;
    state.interruptRefund = false;
    render();
    if (state.error) revealError();
    else revealPlan(true);
  }
}

async function resetDemo() {
  if (state.pending || !state.workspace) return;
  state.pending = 'reset';
  state.error = '';
  render();
  try {
    const response = await request('/api/reset', { method: 'POST', body: '{}' });
    adoptWorkspace(response.workspace || response, true);
    toast('A fresh class ledger. Four replies to look after.');
  } catch (error) { state.error = error.message; }
  finally { state.pending = null; render(); }
}

function selectBooking(id, loadSample = false) {
  if (state.pending) return;
  const booking = bookingById(id);
  if (!booking) return;
  state.selectedId = id;
  state.error = '';
  state.interruptRefund = false;
  state.recoveryOpen = false;
  if (loadSample && !isLocked(caseFor(id))) state.drafts.set(id, booking.message || '');
  render();
  if (window.matchMedia('(max-width: 690px)').matches) {
    document.querySelector('.booking-button.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

function revealPlan(outcome = false) {
  const target = document.querySelector(outcome ? '.next-section' : '.plan-section');
  if (target && target.getBoundingClientRect().top > window.innerHeight - 150) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function revealError() {
  document.querySelector('.error-banner')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function exportOutcome() {
  const booking = activeBooking();
  if (!booking || !activeCase()?.plan || state.pending) return;
  try {
    const result = await request(`/api/cases/${encodeURIComponent(booking.id)}/export`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `raincheck-${booking.id}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Outcome exported with the booking and event trail.');
  } catch (error) {
    state.error = error.message;
    render();
    revealError();
  }
}

function toast(message) {
  const element = document.querySelector('#toast');
  clearTimeout(state.toastTimer);
  element.textContent = message;
  element.classList.add('visible');
  state.toastTimer = setTimeout(() => element.classList.remove('visible'), 4200);
}

async function copyText(value, label) {
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.className = 'sr-only';
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('Clipboard needs a manual copy.');
    }
    toast(label);
  } catch {
    openDialog('Your customer reply', 'Select and copy the draft below.', `<label class="sr-only" for="manual-copy">Customer reply to copy</label><textarea id="manual-copy" class="reply-input" rows="8" readonly>${escapeHTML(value)}</textarea>`);
    document.querySelector('#manual-copy')?.select();
  }
}

function openDialog(title, description, content) {
  dialogContent.innerHTML = `<div class="dialog-header"><div><h2 id="dialog-title">${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p></div><button type="button" class="button-icon" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body">${content}</div>`;
  if (!dialog.open) dialog.showModal();
}

function showLedger() {
  if (!state.workspace) return toast('The workspace is still opening.');
  const currency = state.workspace.bookings[0]?.currency || 'USD';
  const rows = state.workspace.bookings.map((booking) => {
    const entry = caseFor(booking.id);
    const complete = entry?.status === 'completed';
    return `<tr><td><button type="button" class="text-button" data-action="ledger-booking" data-id="${escapeHTML(booking.id)}">${escapeHTML(booking.name)}</button></td><td>${booking.quantity}</td><td>${entry?.plan ? `${entry.plan.transfer_quantity || 0}${complete ? '' : '<small>planned</small>'}` : '—'}</td><td>${entry?.plan ? `${escapeHTML(money(entry.plan.refund_amount, entry.plan.currency || booking.currency))}${complete ? '' : '<small>planned</small>'}` : '—'}</td><td>${statusTag(entry, booking)}</td></tr>`;
  }).join('');
  openDialog(isSimulated() ? 'The demo ledger.' : 'The sandbox ledger.', isSimulated() ? 'Every amount here belongs to the sample studio.' : 'PayPal test payments and the sample studio’s class seats.', `
    <div class="mode-line">${modeTags()}</div>
    <div class="ledger-wrap"><table class="ledger-table"><thead><tr><th scope="col">Booking</th><th scope="col">Seats</th><th scope="col">Rebooked</th><th scope="col">Refund</th><th scope="col">Status</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="ledger-summary"><span>Completed refunds <strong>${escapeHTML(money(state.workspace.metrics?.refunded_amount || 0, currency))}</strong></span><span>${escapeHTML(seatLabel(state.workspace.metrics?.transferred || 0))} rebooked</span></div>
    <p class="ledger-footnote">Planned amounts become completed outcomes after the payment and booking steps settle. Open a booking to download its outcome and event trail.</p>`);
}

function showAbout() {
  openDialog('A little care, carried through.', 'Raincheck is a cancellation desk for small class-based businesses.', `
    <div class="about-steps">
      <section class="about-step"><span class="step-number">01</span><h3>Listen to the reply.</h3><p>A customer can move a ticket, request a refund, or do a little of both. AI turns their words into a structured request.</p></section>
      <section class="about-step"><span class="step-number">02</span><h3>Make the sums work.</h3><p>The ledger checks the original paid seats, calculates the exact amount, and checks space in the new class.</p></section>
      <section class="about-step"><span class="step-number">03</span><h3>Follow it through.</h3><p>Run the plan, track the refund, finish the booking, and send a thoughtful reply. An interrupted payment response has its own recovery path.</p></section>
    </div>
    <div class="about-mode"><h3>This workspace</h3><div class="mode-line">${modeTags()}</div><p>${isSimulated() ? 'Demo ledger: synthetic original captures, simulated refunds, and sample bookings. Connecting PayPal sandbox credentials enables test-account payments.' : 'Sandbox ledger: PayPal test-account captures and refunds, paired with sample bookings.'} ${state.workspace?.mode?.ai === 'live' ? 'Live AI analyzes submitted customer replies.' : 'Recorded AI supplies saved interpretations for the example replies. Live AI handles new wording when configured.'}</p><p style="margin-top:10px"><a href="./sandbox.html">Set up a PayPal sandbox payment →</a></p></div>`);
}

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  const action = control.dataset.action;
  if (action === 'select-booking') selectBooking(control.dataset.id);
  else if (action === 'analyze') void analyzeReply();
  else if (action === 'execute') void executePlan();
  else if (action === 'reset') void resetDemo();
  else if (action === 'refresh') void loadWorkspace();
  else if (action === 'dismiss-error') { state.error = ''; render(); }
  else if (action === 'ledger') showLedger();
  else if (action === 'about') showAbout();
  else if (action === 'close-dialog') dialog.close();
  else if (action === 'ledger-booking') { dialog.close(); selectBooking(control.dataset.id); }
  else if (action === 'copy-question') void copyText(questionFor(activeBooking(), activeCase()), 'Question copied. Ready for the customer.');
  else if (action === 'copy-reply') void copyText(customerReply(activeBooking(), activeCase()), 'Customer reply copied.');
  else if (action === 'export') void exportOutcome();
});

document.addEventListener('input', (event) => {
  if (event.target.id !== 'customer-reply') return;
  state.drafts.set(state.selectedId, event.target.value);
  document.querySelector('#stale-plan')?.classList.toggle('visible', isDirty(state.selectedId));
  const executeButton = document.querySelector('[data-action="execute"]');
  if (executeButton) executeButton.disabled = Boolean(state.pending) || isDirty(state.selectedId);
  const analyzeButton = document.querySelector('[data-action="analyze"]');
  if (analyzeButton) analyzeButton.disabled = !event.target.value.trim() || Boolean(state.pending) || isLocked(activeCase());
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'reply-sample') selectBooking(event.target.value, true);
  if (event.target.id === 'interrupt-refund') state.interruptRefund = event.target.checked;
});

document.addEventListener('toggle', (event) => {
  if (event.target.id === 'recovery-demo') state.recoveryOpen = event.target.open;
}, true);

dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});

void loadWorkspace();
