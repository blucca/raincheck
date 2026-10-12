# One original payment. Two clear outcomes.

[Watch the 105-second film](https://blucca.github.io/raincheck/public/demo.html) · [Try the browser preview](https://blucca.github.io/raincheck/) · [Run your own sandbox](sandbox-guide.md)

## What happens

1. Raincheck creates a **$136 PayPal sandbox order** for Mina’s two $68 tickets. A virtual buyer approves the order in a separate tab.
2. The app captures the payment and reads both the order and capture to match the booking reference, amount and currency.
3. A newly worded reply goes to the live **NVIDIA Nemotron 3 Super 120B A12B model on Nebius**. It proposes one Sunday seat for Mina’s sister and a full $68 ticket refund for Mina.
4. The teacher reviews and executes the plan. Raincheck saves the request ID, holds Sunday’s last seat, and calls the PayPal refund API. A **COMPLETED** receipt confirms the refund and replacement seat.
5. Reloading restores the outcome. An independent GET of the refund matches the original capture, saved operation, amount and currency.

[Public verification, exact input and results](sandbox-verification.md)

## Recording

Recorded October 12, 2026 (UTC) with actual browser actions, live model inference and real PayPal sandbox API calls. The final film is **105 seconds**, 1920 × 1080, with synthesized English narration, open captions and a WebVTT track.

The edit follows the recorded actions in order and uses captured stills between interactions. The buyer approves in a separate, unpublished tab. Guests and bookings are fictional, funds are virtual, and transaction references are redacted in the recording. The public interactive preview uses a local simulated payment ledger and recorded AI outputs; the setup guide connects your own sandbox and model credentials.

The [earlier 88-second film](workshop-demo.md) demonstrates an interrupted payment response and recovery with the simulated ledger. Both recordings remain available.

## Transcript

A broken kiln cancels Saturday's workshop. Mina bought two seats. Her sister can join Sunday; Mina needs her ticket refunded. Raincheck gives the studio one place to carry both choices through.

Start with the original payment. Raincheck creates a one-hundred-and-thirty-six-dollar PayPal sandbox order for two sixty-eight-dollar tickets. A separate virtual buyer approves it in PayPal. The approval happens in another tab; account details stay private.

Capture the approved order. Raincheck reads the order and the capture, checks the booking reference, currency and exact amount, then attaches that verified payment to Mina's booking. Every refund starts with this original payment.

Here is a newly worded reply. A live open-weight model on Nebius extracts one Sunday seat and one ticket refund. Raincheck checks the last available place and computes sixty-eight dollars from the saved ticket price. The teacher reviews the proposal.

Run the plan. Raincheck saves one request identifier, holds Sunday's seat, and asks PayPal to refund sixty-eight dollars against the original capture. PayPal returns completed. The new seat is confirmed and the outcome includes the refund receipt and a message ready to send.

Reload the workspace. The captured payment, the refund and the seat stay together. An independent refund lookup matches the stored operation and amount. This recording uses real sandbox APIs, virtual funds and fictional guests. Explore the browser preview, or follow the setup guide with your own sandbox.
