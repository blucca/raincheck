# Verified: two paid seats → one new class + one refund

[Watch the 105-second real sandbox film](https://youtu.be/Tj6nW_1W3TU) · [Player and transcript](https://blucca.github.io/raincheck/public/demo.html)


**Passed October 12, 2026, 16:04 UTC** — October 13, 00:04 in Beijing.
Raincheck **0.2.0**, source [`0e24c37`](https://github.com/blucca/raincheck/commit/0e24c37bc9219b7fbf25000455678cceb4ba191a).

## Run conditions

- **App:** the running Node application, its `/sandbox.html` checkout, and cancellation desk.
- **Payments:** account-connected requests to PayPal Sandbox, with virtual Business/Personal accounts and virtual USD funds.
- **Booking:** fictional Mina, two $68 tickets for the cancelled workshop.
- **AI:** a live Nebius request using NVIDIA Nemotron 3 Super 120B A12B.
- **Public preview:** browser-local simulated payments and recorded AI outputs.

## Steps and observations

1. Start the app with sandbox credentials and a fresh private data directory, following the [setup guide](sandbox-guide.md).
2. Create the **$136 USD, two-seat order** from the checkout desk. Sandbox OAuth succeeded.
3. Open PayPal checkout and approve with the virtual Personal buyer.
4. Capture the approved order. **GET order and GET capture** verified the completed original payment and booking binding.
5. Enter this newly worded reply on the cancellation desk and choose **Analyze reply**:

   > Please move my sister's seat to Sunday, October 18 at 2 pm, and refund my seat. Just one of us can attend.

   The live interpretation returned **ready**, **1 transfer**, **1 refund**, **$68 USD**, and **Sunday, October 18 at 14:00**. The application’s amount and capacity checks passed.
6. Confirm and run the plan. The PayPal sandbox refund returned **COMPLETED** for **$68 USD**; one seat moved to the replacement class.
7. Independently call **GET refund**. Its refund ID, original capture binding, operation reference, amount, and currency matched the saved case.
8. Restart the server with the same data directory and reload the workspace. The case remained **completed**; the replacement session showed **8 booked seats and 0 held seats**.

## Outcome

| Observation | Result |
|---|---|
| Original payment | COMPLETED · $136.00 USD · 2 seats |
| Refund | COMPLETED · $68.00 USD · 1 seat |
| Rebooking | 1 seat · October 18, 2026 at 14:00 |
| Independent receipt matching | Passed |
| Restart persistence | Passed |
| Replacement session after restart | 8 booked · 0 held |

[Machine-readable public summary](sandbox-verification.json) · [Run it yourself](sandbox-guide.md) · [Recovery design](architecture.md)
