# One original payment. One last place.

[Watch the 143-second film (2:23)](https://blucca.github.io/raincheck/public/demo.html) · [YouTube](https://youtu.be/wsQ2SLqudw0) · [Try the browser preview](https://blucca.github.io/raincheck/) · [PayPal sandbox setup](sandbox-guide.md) · [AG Studio setup](batch-preflight.md)

The film pairs two recorded workspaces: a real PayPal sandbox payment and refund, then a separate five-household rehearsal in **AG Studio 3.0.0**. Both use live AI. The sandbox uses virtual PayPal funds; the Studio rehearsal uses scripted household plans and Raincheck's simulated payment ledger.

## 0:00–1:33 — The original payment and refund

1. Raincheck creates a **$136 PayPal sandbox order** for Mina's two $68 tickets. A virtual buyer approves the order in a separate tab.
2. The app captures the payment and reads both the order and capture to match the booking reference, amount and currency.
3. A newly worded reply goes to the live **NVIDIA Nemotron 3 Super 120B A12B model on Nebius**. It proposes one Sunday seat for Mina's sister and a full $68 ticket refund for Mina.
4. The teacher reviews and executes the plan. Raincheck saves the request ID, holds Sunday's last seat, and calls the PayPal refund API. A **COMPLETED** receipt confirms the refund and replacement seat.
5. Reloading restores the outcome. An independent GET of the refund matches the original capture, saved operation, amount and currency.

[Public sandbox verification, exact input and results](sandbox-verification.md)

## 1:33–2:23 — The whole class and the last place

1. A fresh, independent workspace contains **five fictional households**, three replacement classes, scripted plans and simulated payments. Sunday has seven booked places and one place available.
2. The live Studio analyst uses the native Agent Framework to call `read_batch_snapshot`, then `filter_makeup_session`. The actual family grid filters to **Mina and Elliot**, each requesting Sunday's final place. A custom capacity widget displays the whole batch's seat pressure.
3. The operator opens Mina's prepared plan in Raincheck's existing confirmation desk and selects the simulated interrupted-response scenario. After execution, refreshing the batch shows **7 booked, 1 held**, and **$68 in progress**.
4. The desk resumes the **same saved refund operation**. Refresh reads Sunday at **8 booked, 0 held** and Mina's **$68 settled**. The remaining proposed refunds total **$136 across the batch**; Elliot still needs an agreed alternative.

The Studio analyst reads and filters the saved batch. The household confirmation desk handles seat reservations, payment execution and recovery. The [local setup guide](batch-preflight.md) includes the repeatable five-family seed and requires your own valid Studio licence.

## Recording and editing

The final film is **143 seconds (2:23)**, 1920 × 1080, with synthesized English narration, open captions and a [WebVTT track](../public/media/raincheck-demo.vtt).

- **Sandbox source:** recorded October 12, 2026 (UTC), with actual browser actions, live model inference and real PayPal sandbox API calls. The first **92.96 seconds** of that recording are reused through the independent refund lookup. Buyer approval takes place in a separate, unpublished tab; transaction references are redacted.
- **Studio source:** recorded October 14, 2026 (UTC), using the actual AG Studio 3.0.0 workspace, native filtering, a custom capacity widget and live analyst tool calls. The five-household workspace has its own database and simulated payment history. The response interruption is an explicitly selected rehearsal scenario.
- **Edit:** recorded interactions retain their sequence within each workspace. Captured stills hold the batch overview, analyst result, pending operation and settled result on screen while the narration explains them. The transition at 1:33 identifies the Studio rehearsal and its simulated payments.
- **Presentation:** all guests and bookings are fictional. English narration is synthesized with Amazon Polly. The public browser preview uses a local simulated payment ledger and recorded AI outputs; the setup guides connect your own sandbox, model credentials and licensed Studio installation.

Earlier recordings remain available: the complete **105-second sandbox film** ([MP4](../public/media/raincheck-sandbox-demo.mp4), [YouTube](https://youtu.be/Tj6nW_1W3TU)) and the **88-second simulated recovery film** ([MP4](../public/media/raincheck-workshop-demo.mp4), [YouTube](https://youtu.be/YuRDifk8XN8), [notes](workshop-demo.md)).

## Transcript

A broken kiln cancels Saturday's workshop. Mina bought two seats. Her sister can join Sunday; Mina needs her ticket refunded. Raincheck gives the studio one place to carry both choices through.

Start with the original payment. Raincheck creates a one-hundred-and-thirty-six-dollar PayPal sandbox order for two sixty-eight-dollar tickets. A separate virtual buyer approves it in PayPal. The approval happens in another tab; account details stay private.

Capture the approved order. Raincheck reads the order and the capture, checks the booking reference, currency and exact amount, then attaches that verified payment to Mina's booking. Every refund starts with this original payment.

Here is a newly worded reply. A live open-weight model on Nebius extracts one Sunday seat and one ticket refund. Raincheck checks the last available place and computes sixty-eight dollars from the saved ticket price. The teacher reviews the proposal.

Run the plan. Raincheck saves one request identifier, holds Sunday's seat, and asks PayPal to refund sixty-eight dollars against the original capture. PayPal returns completed. The new seat is confirmed and the outcome includes the refund receipt and a message ready to send.

Reload the workspace. The captured payment, the refund and the seat stay together. An independent refund lookup matches the stored operation and amount.

For a whole cancelled class, start with the batch. This five-household rehearsal uses simulated payments inside the real AG Studio workspace.

Ask the Studio analyst to find the seat conflict. It reads the saved plans and filters Sunday: Mina and Elliot want the same final place. The custom capacity widget shows the shortfall.

Open Mina's agreed plan in the confirmation desk. Interrupt the refund response, then return to the batch: one seat is held and sixty-eight dollars is in progress.

Resume the saved operation and refresh. Mina is settled; Elliot still needs a new choice. The seat and money columns read the same saved outcome. Try Raincheck, or run both modules from the setup guides.
