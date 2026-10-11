# The cancelled-class coordination problem

Research date: October 12, 2026. Sources below are first-party operating policies and product instructions. They establish workflows and commitments; interviews and product adoption are the next validation stage.

## Where the work sits today

[Bookwhen — Cancelling an event](https://support.bookwhen.com/en/articles/3790128-cancelling-an-event) describes preserving bookings after a cancellation, contacting attendees separately, and handling tickets individually. Customer ticket transfers close when an event is cancelled; the guide gives a separate unavailable/unpublished workflow when transfers are desired.

[Bookwhen — Refunds](https://support.bookwhen.com/en/articles/753627-refunds), updated July 6, 2026, sends the organizer to the payment gateway, including PayPal, to issue the refund. The organizer then returns to Bookwhen and records the amount, date, and note.

[Checkfront — PayPal Checkout](https://support.checkfront.com/hc/en-us/articles/19868405472924-Setting-up-PayPal-Checkout-as-your-Checkfront-payment-provider) already supports integrated refunds. This sets the product baseline. Raincheck focuses on understanding different guests' choices and coordinating an entire cancelled event across limited replacement capacity.

## Real operators

- **[Mark H Rooney Taiko](https://www.markhrooney.com/registration-and-cancellation-policies/):** PayPal registration, full payment to reserve places, limited capacity, and full refunds when weather or a teacher emergency cancels a workshop. Its [workshops](https://www.markhrooney.com/workshops/) provide concrete small-class examples.
- **[The Native Choice](https://www.thenativechoice.com/terms-conditions):** PayPal payments, availability-dependent changes, alternative tours after disruption, and a refund choice. Some deposits remain authorized before capture, which identifies a separate future void-payment workflow.
- **[Mosaic Art Studio](https://support.mosaicartstudio.us/portal/en/kb/articles/cancellation-and-rescheduling-policy-for):** self-service changes and cancellations already exist; organizer cancellations offer a refund or another date. The coordination problem remains event-wide when many guests choose different outcomes.

These businesses are research references. The demo's Little Kiln Studio, participants, payment IDs, and circumstances are fictional.

## The first workflow

A teacher cancels one fully paid class. A two-person booking replies: one person can attend the available Sunday class; the other wants a refund. Raincheck:

1. Extracts that explicit split and the chosen date.
2. Assigns every original ticket once.
3. Computes the refund from the saved ticket price.
4. Holds the replacement place before contacting the payment provider.
5. Confirms the new seat after a completed refund receipt, or preserves a reconcilable operation if the response is interrupted.

Every refunded person receives their full ticket value. A transaction-level partial refund arises from the split between different guests on that booking.

## Commercial question

Would a teacher pay **$29 for one cancellation batch, up to 30 bookings**, to finish the guest choices and payment reconciliation? This is a proposed pilot price. The first useful measurements are handling time, accepted alternative places, settled refunds, repeated customer questions, and an organizer's willingness to pay.
