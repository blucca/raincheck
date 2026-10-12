# A seat and a refund belong to the same outcome

## Shared execution core

`engine-core.mjs` runs in both environments:

| Environment | State | Payments | AI |
|---|---|---|---|
| Public browser preview | Local browser storage | Durable simulated provider ledger | Recorded real outputs |
| Local Node application | SQLite WAL, full synchronization | Simulated provider or PayPal sandbox | Recorded or live structured inference |

The public preview and Node app use the same intent policy, seat reservation, outcome, and recovery code. A browser preview's data stays in that browser. Each Node workspace is single-process and local by default.

## Bind the original payment

A sandbox workspace begins with one fictional two-seat booking awaiting payment. `sandbox-checkout.mjs` saves separate create-order and capture-order UUIDs and exact bodies before the first provider call. A returning browser supplies navigation context; the saved order and PayPal GET response supply the payment state.

After virtual-buyer approval, checkout reads the order, captures it, and reads the resulting capture. One purchase unit and one completed capture must match the booking reference, USD value, and order ID. The verified payment binding and booking capture ID are committed together. Interruption recovery reads the saved order before considering a retry with the original key. The checkout page and cancellation desk use the same SQLite workspace.

Workspaces keep their original payment mode. The application uses separate default data directories for simulated and sandbox ledgers. A pending booking requires capture before cancellation execution reserves a replacement seat or requests a refund.

## From words to a checked plan

The model returns a clarification flag, transfer count, refund count, target class ID, an exact quote, and a short explanation. The application derives the action from the counts and uses the booking's currency and price.

For a definite choice:

```
transferred tickets + refunded tickets = original tickets
refund cents = refunded tickets × original per-ticket cents
```

An open question becomes `needs_reply`. A definite choice with insufficient remaining capacity becomes `capacity_conflict`. Availability is checked again at execution time.

## Execution boundary

1. Begin a database transaction.
2. Recheck and hold replacement seats.
3. Save a UUID refund operation, original capture ID, exact amount, and currency.
4. Commit local state before issuing the PayPal request.
5. Issue the refund with the saved `PayPal-Request-Id`.
6. Match the receipt's operation reference, amount, currency, and capture link to the saved operation.
7. On `COMPLETED`, convert held seats into confirmed bookings and close the outcome.

`PENDING` keeps the places held. `FAILED` and `CANCELLED` release them. An interrupted response remains `reconciling`. Once a refund ID is known, recovery queries that ID. A short unknown-response interruption reuses the saved request and body. An older unknown sandbox request reads its bound order’s refund list, then reads a candidate refund whose operation metadata matches. The unresolved operation stays on hold while its receipt is reviewed. Returned refund IDs are saved before receipt matching, so recovery can query the existing resource.

The demo's interruption switch records a completed simulated provider refund and deliberately loses the response. Reloading the workspace and recovering resolves the same refund operation once.

## PayPal API surface

- `POST /v1/oauth2/token`
- `POST /v2/checkout/orders`
- `GET /v2/checkout/orders/{order_id}`
- `POST /v2/checkout/orders/{order_id}/capture`
- `GET /v2/payments/captures/{capture_id}`
- `POST /v2/payments/captures/{capture_id}/refund`
- `GET /v2/payments/refunds/{refund_id}`

All requests use `https://api-m.sandbox.paypal.com`. `Prefer: return=representation` obtains the refund record and links. An explicit amount is sent for every operation. The exact refund body is saved with its operation. The saved UUID is also sent as `custom_id`, with a stable `RC-` invoice reference for reconciliation. Prices use integer cents in the application and two-decimal strings at the API boundary.

References: [Orders v2](https://developer.paypal.com/api/orders/v2/) · [Payments v2](https://developer.paypal.com/api/payments/v2/) · [Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/).
