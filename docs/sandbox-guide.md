# Two paid seats → one new class + one refund

This guide creates a **$136 USD PayPal sandbox payment** for the fictional Mina booking, then uses that captured payment in Raincheck’s cancellation desk. All payment calls use PayPal’s free sandbox and virtual funds.

## 1. Prepare your sandbox

In [PayPal Developer](https://developer.paypal.com/dashboard/applications/sandbox):

- **Apps & Credentials → Sandbox:** create or select a sandbox application. Keep its client ID and secret.
- **Testing Tools → Sandbox Accounts:** select a Business seller and a Personal buyer. The application belongs to the seller; the checkout approval uses the separate buyer account.
- Choose virtual accounts and balances appropriate for USD test payments.

Put the application credentials in a private environment file, outside the source repository:

```ini
PAYPAL_SANDBOX_CLIENT_ID=your-sandbox-client-id
PAYPAL_SANDBOX_CLIENT_SECRET=your-sandbox-client-secret
RAINCHECK_DATA_DIR=/absolute/path/to/private/raincheck-sandbox
PORT=4326
HOST=127.0.0.1
RAINCHECK_BASE_URL=http://127.0.0.1:4326
```

Use a **fresh data directory** for the first sandbox run. With credentials configured, the application initializes one fictional booking with two $68 tickets and an original payment awaiting capture. Simulated workspaces keep their original payment mode.

For remote browser access, set `RAINCHECK_BASE_URL` to the URL that reaches this Node application. The sandbox buyer’s return and cancellation links use this explicit base URL. Local operation is the default; hosted operation requires access controls appropriate to its users.

## 2. Create, approve, and capture

```sh
node --use-env-proxy --env-file=/path/to/private/raincheck.env src/server.mjs
```

Open **http://127.0.0.1:4326/sandbox.html**.

1. **Create $136 test order.** Raincheck saves its operation UUIDs and request bodies, then requests an order from PayPal. The order ID appears on the receipt chain.
2. **Approve with sandbox buyer.** The link opens PayPal in another tab. Use the virtual Personal buyer and approve the payment.
3. **Capture approved order.** Raincheck reads the saved order, captures the approved payment, and reads the capture. Its completed status, booking reference, amount, currency, and order association must match.
4. **Open cancellation desk.** The verified capture ID and order ID now belong to Mina’s original booking in the same workspace.

The return URL opens the checkout desk. Capture begins when the operator chooses **Capture approved order**. The server reads the order ID from its durable workspace.

## 3. Carry one seat forward

On the cancellation desk:

1. Analyze Mina’s reply: “My sister can make Sunday the 18th at 2 pm. Please move her ticket and refund mine.”
2. Review **one seat on Sunday, October 18 + a $68 refund**.
3. Run the plan. Raincheck holds the Sunday seat and saves the original capture, exact refund body, and request UUID before the API call.
4. A matching `COMPLETED` refund confirms the new seat and closes the case. A `PENDING` refund keeps the case and seat hold open.
5. Export the outcome. Its booking contains the original payment binding; its case contains the refund operation and provider receipt.

With the default recorded interpreter, Mina’s recorded AI result supplies the intent. Configure live AI as described in the [README](../README.md#live-ai) to analyze new wording.

For an independent receipt check, read the resulting refund resource with `GET /v2/payments/refunds/{refund_id}` and compare its refund ID, capture, amount, currency, and operation reference to the saved case. Preserve the private API receipts and record the observed result.

## Resume an interrupted step

| Last visible step | Next action | Saved state used |
|---|---|---|
| Creating an order | **Recover saved order** | Original create UUID and body |
| Buyer approval | Reopen the saved approval link | Original PayPal order |
| Capture response interrupted | **Reconcile saved payment** | GET original order, then original capture UUID/body when needed |
| Capture completed | Open cancellation desk | Verified booking–order–capture binding |
| Refund response interrupted | **Recover refund** on the cancellation desk | Saved refund ID, or original operation |
| Older refund with an unknown ID | Recover on the cancellation desk | Bound order’s refund list and exact operation metadata |

Orders create/capture replay is bounded by the documented six-hour request-key window. Once an unknown write crosses that window, the saved operation stays in review until its provider history is resolved. Restarting Raincheck preserves the operation and its payment references.

A returned refund ID is saved before matching the receipt. Further recovery reads that same resource. Failed or cancelled refunds release held replacement seats and keep the outcome available for review.

## Current verification

**The first account-connected run passed on October 12, 2026 (UTC).** PayPal sandbox OAuth, a $136 two-seat order, virtual buyer approval, capture, and a $68 refund all completed. Independent GET reads matched the order, capture, and refund. Live Nebius AI interpreted a newly worded split-booking request; after a server restart, the completed case and replacement seat persisted, with zero holds. [Read the exact input and verification record](sandbox-verification.md).

Concentrated fixture-based checks also cover checkout, response-loss recovery, and rejected payment mismatches. The public browser preview uses simulated payments and recorded AI; the account-connected run used PayPal sandbox virtual funds.

Official references: [Orders v2](https://developer.paypal.com/api/orders/v2/) · [Payments v2](https://developer.paypal.com/api/payments/v2/) · [Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/).
