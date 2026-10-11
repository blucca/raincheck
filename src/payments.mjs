const randomUUID = () => globalThis.crypto.randomUUID();
import { DomainError } from './policy.mjs';

export class PaymentError extends Error {
  constructor(code, message, { definitive = false } = {}) { super(message); this.code = code; this.definitive = definitive; }
}

export class SimulatedPayments {
  mode = 'simulated';
  constructor(store) { this.store = store; }
  async refund(operation, { simulate_lost_response = false } = {}) {
    const response = this.store.transaction(() => {
      const prior = this.store.get('provider_refund', operation.request_id);
      if (prior) {
        if (prior.capture_id !== operation.capture_id || prior.amount !== operation.amount || prior.currency !== operation.currency) {
          throw new PaymentError('request_changed', 'The original refund request needs its original amount and capture.', { definitive: true });
        }
        return prior;
      }
      const booking = this.store.all('booking').find(b => b.capture_id === operation.capture_id);
      const previous = this.store.all('provider_refund').filter(r => r.capture_id === operation.capture_id)
        .reduce((total, r) => total + r.amount, 0);
      if (!booking || operation.amount + previous > booking.quantity * booking.unit_amount) {
        throw new PaymentError('refund_limit', 'The refund exceeds the remaining captured ticket total.', { definitive: true });
      }
      return this.store.put('provider_refund', operation.request_id, {
        id: `SIM-${randomUUID().slice(0, 12)}`, status: 'COMPLETED', amount: operation.amount,
        currency: operation.currency, capture_id: operation.capture_id, request_id: operation.request_id, created_at: new Date().toISOString()
      });
    });
    if (simulate_lost_response) throw new PaymentError('response_lost', 'The demo payment completed, then its response was interrupted. Recover with the saved request ID.');
    return response;
  }
  async getRefund(id) {
    const response = this.store.all('provider_refund').find(r => r.id === id);
    if (!response) throw new PaymentError('refund_lookup', 'The refund receipt is still being reconciled.');
    return response;
  }
}

function money(value) {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value)) throw new PaymentError('receipt_amount', 'The refund receipt requires an exact USD amount.');
  return Number(value.replace('.', ''));
}

/** Every network call is fixed to PayPal's free sandbox. */
export class PayPalSandboxPayments {
  mode = 'sandbox';
  constructor({ clientId, clientSecret, fetchImpl = fetch }) {
    if (!clientId || !clientSecret) throw new Error('Configure a sandbox application client ID and secret.');
    this.clientId = clientId; this.clientSecret = clientSecret; this.fetch = fetchImpl; this.token = null;
  }
  async accessToken() {
    if (this.token && Date.now() < this.token.expires) return this.token.value;
    const response = await this.fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
      method: 'POST', redirect: 'error', headers: { Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(20000)
    });
    const body = await response.json();
    if (!response.ok || !body.access_token) throw new PaymentError('sandbox_auth', `Sandbox authentication returned HTTP ${response.status}.`);
    this.token = { value: body.access_token, expires: Date.now() + Math.max(1, Number(body.expires_in) - 60) * 1000 };
    return this.token.value;
  }
  async request(path, { method = 'GET', body, requestId } = {}) {
    const token = await this.accessToken();
    let response;
    try {
      response = await this.fetch(`https://api-m.sandbox.paypal.com${path}`, {
        method, redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
          Prefer: 'return=representation', ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000)
      });
    } catch { throw new PaymentError('response_unknown', 'The sandbox response was interrupted. The saved request is ready for reconciliation.'); }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const issue = payload?.details?.[0]?.issue || payload?.name || `HTTP_${response.status}`;
      // Explicit business validation errors finish this attempt; timeouts, throttles, conflicts and server errors remain reconcilable.
      const definitive = [400, 403, 422].includes(response.status);
      throw new PaymentError(issue, `PayPal sandbox returned ${issue}.`, { definitive });
    }
    return payload;
  }
  normalize(body) {
    const up = body?.links?.find(l => l.rel === 'up')?.href || '';
    const match = up.match(/^https:\/\/api(?:-m)?\.(?:sandbox\.)?paypal\.com\/v2\/payments\/captures\/([A-Za-z0-9]+)$/);
    return { id: body.id, status: body.status, amount: money(body.amount?.value), currency: body.amount?.currency_code,
      capture_id: match?.[1] || null, created_at: body.create_time || null };
  }
  async refund(operation) {
    if (!/^[A-Za-z0-9]{10,32}$/.test(operation.capture_id)) {
      throw new PaymentError('capture_setup', 'Attach a real captured sandbox payment to this booking.', { definitive: true });
    }
    const payload = await this.request(`/v2/payments/captures/${operation.capture_id}/refund`, {
      method: 'POST', requestId: operation.request_id,
      body: { amount: { value: (operation.amount / 100).toFixed(2), currency_code: operation.currency },
        note_to_payer: 'Workshop cancelled. Full ticket value refunded for the selected guests.' }
    });
    return this.normalize(payload);
  }
  async getRefund(id) {
    if (!/^[A-Za-z0-9]{10,32}$/.test(id)) throw new DomainError('refund_id', 'Use a valid sandbox refund ID.');
    return this.normalize(await this.request(`/v2/payments/refunds/${id}`));
  }
}
