const root = document.querySelector('#checkout');
const params = new URLSearchParams(location.search);
const isPreview = location.hostname.endsWith('github.io');
let snapshot = null;
let workspace = null;
let busy = false;
let error = '';
const escapeHTML = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (cents = 13600) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const button = (action, text, secondary = false) => `<button type="button" class="button ${secondary ? 'button-outline' : 'button-primary'}" data-action="${action}" ${busy ? 'disabled' : ''}>${busy ? 'Checking saved state…' : text}</button>`;
const pair = (label, value) => `<div class="checkout-pair"><dt>${label}</dt><dd class="checkout-value">${escapeHTML(value)}</dd></div>`;

function approvalUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['www.sandbox.paypal.com', 'sandbox.paypal.com'].includes(url.hostname) ? url.href : null; }
  catch { return null; }
}

function config() {
  return `<section class="checkout-panel checkout-config">
    <h2>Connect your sandbox application.</h2>
    <p>The local Node app creates the order, checks the captured payment, and hands its receipt to the cancellation desk.</p>
    <ol><li>Open <a href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank" rel="noopener">PayPal Developer → Apps &amp; Credentials → Sandbox</a>.</li><li>Create a sandbox application and a virtual Personal buyer. Keep the application secret in your private environment file.</li><li>Set the two credentials below, then restart the local app.</li></ol>
    <pre>PAYPAL_SANDBOX_CLIENT_ID=your-sandbox-client-id\nPAYPAL_SANDBOX_CLIENT_SECRET=your-sandbox-secret\nRAINCHECK_DATA_DIR=/path/to/private/sandbox-workspace</pre>
    <p>Open <code>http://127.0.0.1:4326/sandbox.html</code>. The app prepares one fictional two-seat booking. PayPal supplies the payment IDs through its free sandbox.</p>
    <a class="button button-primary" href="https://github.com/blucca/raincheck/blob/main/docs/sandbox-guide.md" target="_blank" rel="noopener">Open the setup guide →</a>
    ${isPreview ? '<a class="button button-outline" href="./" style="margin-left:8px">Try the browser preview</a>' : button('refresh', 'Check configuration', true)}
  </section>`;
}

function desk() {
  const current = snapshot;
  const captured = current.state === 'captured';
  const hasOrder = Boolean(current.order_id);
  const approved = captured || current.state === 'approved';
  const approval = approvalUrl(current.approval_url);
  const recovering = ['reconciling', 'creating', 'capturing', 'review_required'].includes(current.state);
  const savedCase = workspace?.cases?.find(c => c.booking_id === current.booking_id);
  const refund = savedCase?.refund;
  const booking = workspace?.bookings?.find(b => b.id === current.booking_id);
  const receiptState = captured ? 'Capture matched' : hasOrder ? 'Order saved' : 'Ready to start';
  const steps = [
    { done: hasOrder, current: !hasOrder, title: 'Create the original booking',
      description: `${current.quantity} tickets at ${money(current.amount / current.quantity)} each. Raincheck saves the request ID and exact amount before contacting PayPal.`,
      action: !hasOrder ? button('create', recovering ? 'Recover saved order' : `Create ${money(current.amount)} test order`) : `<p><code>${escapeHTML(current.order_id)}</code></p>` },
    { done: approved, current: hasOrder && !approved, title: 'Approve as the virtual buyer',
      description: 'Open PayPal and sign in with your Personal sandbox account. Approve the test payment, then return here.',
      action: hasOrder && !approved && approval ? `<a class="button button-outline" href="${escapeHTML(approval)}" target="_blank" rel="noopener">Approve with sandbox buyer ↗</a>` : '' },
    { done: captured, current: approved && !captured, title: 'Capture and match the receipt',
      description: 'Raincheck checks the approved order, captures it, then reads the capture to match its booking, USD amount, and order ID.',
      action: hasOrder && !captured ? button('complete', recovering ? 'Reconcile saved payment' : 'Capture approved order') : '' }
  ];
  return `<div class="checkout-grid">
    <section class="checkout-panel" aria-label="Sandbox checkout steps">
      <header class="checkout-panel-head"><h2>The original payment</h2><span class="checkout-status">${receiptState}</span></header>
      <div class="checkout-body"><ol class="checkout-steps">${steps.map((s, i) => `<li class="checkout-step ${s.done ? 'done' : s.current ? 'current' : ''}"><span class="step-number">${s.done ? '✓' : `0${i + 1}`}</span><div><h3>${s.title}</h3><p>${s.description}</p>${s.action}</div></li>`).join('')}</ol></div>
      ${captured ? `<div class="checkout-success"><p><strong>${money(current.amount)} captured and linked.</strong> ${savedCase?.status === 'completed' ? `The cancellation is settled: ${savedCase.plan.transfer_quantity} seat rebooked and ${money(savedCase.plan.refund_amount)} refunded.` : 'Mina’s booking is ready for its one-seat transfer and one-seat refund.'}</p><a class="button button-primary" href="./">Open cancellation desk →</a></div>` : ''}
      ${current.events?.length ? `<details class="checkout-events"><summary>Payment trail · ${current.events.length} events</summary><ol>${current.events.map(e => `<li>${escapeHTML(e.message || e.detail || e.type)}</li>`).join('')}</ol></details>` : ''}
    </section>
    <aside>
      <section class="checkout-panel" aria-label="Payment receipt chain">
        <header class="checkout-panel-head"><h2>A traceable next plan.</h2></header>
        <div class="checkout-body"><dl class="checkout-values">
          ${pair('Guest', booking?.name || 'Mina Patel')}
          ${pair('Original value', `${money(current.amount)} · ${current.quantity} seats`)}
          ${pair('PayPal order', current.order_id || 'Created in step 01')}
          ${pair('PayPal capture', current.capture_id || 'Matched in step 03')}
          ${pair('Payment status', captured ? 'COMPLETED · verified capture' : current.state.replaceAll('_', ' '))}
          ${pair('Refund', refund ? `${Number.isSafeInteger(refund.amount) ? money(refund.amount) : 'Amount under review'} · ${savedCase.status === 'reconciling' ? 'Receipt under review' : refund.status}` : 'Created from the cancellation plan')}
          ${refund?.id ? pair('Refund ID', refund.id) : ''}
          ${savedCase?.status === 'completed' ? pair('Replacement seats', `${savedCase.plan.transfer_quantity} confirmed`) : ''}
        </dl></div>
        <p class="checkout-receipt-note">${captured ? 'The booking and capture are saved together. Every cancellation refund stays attached to this original payment.' : 'Payment references appear here as each step completes. Your workspace keeps them across process restarts.'}</p>
      </section>
      <p class="checkout-note">PayPal’s free sandbox uses virtual funds. The guest and workshop are fictional. The original booking, captured amount, and eventual refund share one local workspace.</p>
      ${button('refresh', 'Refresh receipt chain', true)}
    </aside>
  </div>`;
}

function render() {
  root.setAttribute('aria-busy', String(busy));
  if (!snapshot && !error) return;
  const amount = snapshot?.amount || 13600;
  const quantity = snapshot?.quantity || 2;
  root.innerHTML = `<section class="checkout-intro">
    <div><p class="eyebrow">PayPal sandbox · Original booking</p><h1>Start with two<br><em>paid seats.</em></h1><p class="description">Give Mina’s fictional booking a genuine sandbox payment. Then carry one seat into the next class and refund the other.</p></div>
    <div class="checkout-ticket"><p class="eyebrow">Little Kiln Studio</p><strong>${money(amount)}</strong><span>${quantity} seats × ${money(amount / quantity)}</span><hr><p>Wheel-throwing Saturday</p><span>Virtual funds · USD</span></div>
  </section>
  ${params.has('returned') && snapshot?.state !== 'captured' ? '<p class="checkout-alert" role="status">You returned from PayPal. Choose <strong>Capture approved order</strong> to check the saved order and finish its payment.</p>' : ''}
  ${params.has('cancelled') && snapshot?.state !== 'captured' ? '<p class="checkout-alert" role="status">Checkout is paused. The saved order stays here for your next visit.</p>' : ''}
  ${error || snapshot?.error ? `<p class="checkout-alert error" role="alert">${escapeHTML(error || snapshot.error.message)}</p>` : ''}
  ${snapshot?.configured ? desk() : config()}`;
}

async function request(path, input) {
  const response = await fetch(path, {
    method: input ? 'POST' : 'GET', headers: { Accept: 'application/json', ...(input ? { 'Content-Type': 'application/json' } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(120000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Refresh the checkout to read the saved payment state.');
  return result;
}

async function run(action = 'refresh') {
  if (busy) return;
  busy = true; error = ''; render();
  try {
    if (isPreview) snapshot = { configured: false, state: 'configuration_required' };
    else {
      const bookingId = snapshot?.booking_id || params.get('booking') || undefined;
      snapshot = action === 'refresh'
        ? await request(`/api/sandbox${bookingId ? `?booking=${encodeURIComponent(bookingId)}` : ''}`)
        : await request(`/api/sandbox/${action}`, { booking_id: bookingId });
      if (snapshot.configured) workspace = await request('/api/workspace');
    }
  } catch (failure) {
    error = failure.name === 'TimeoutError' ? 'This request is still being reconciled. Refresh to read the saved payment state.' : failure.message;
  } finally { busy = false; render(); }
}
root.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (target && !target.disabled) run(target.dataset.action);
});
run();
