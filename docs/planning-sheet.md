# A practical plan for one cancelled class

[**Download the editable planning sheet (.xlsx)**](https://blucca.github.io/raincheck/public/raincheck-planning-sheet.xlsx)

Use it to sort a cancelled workshop into guest choices, replacement seats, open questions and planned refunds. It works as a spreadsheet, alongside your existing booking and payment tools.

## Prepare your own plan

1. **Start here:** enter your cancelled class and original USD ticket price. Each ticket in this batch has the same price.
2. **Sessions:** add up to eight equal-price replacement classes and the places available before this batch. Give each a short ID such as `SUN18`.
3. **Bookings:** add up to 30 booking IDs and whole ticket counts. Choose a replacement session and the number of seats to move or refund. Keep the move/refund cells empty for a guest who still needs to reply.
4. Read **Row check** and **Capacity check**. The sheet flags unallocated tickets and competing requests for the same places. Resolve the questions and refresh availability from your booking system.
5. Confirm each guest's choice. Carry out messages, ticket moves and refunds in your original tools. Add the provider's refund receipt reference after success.

Gold cells accept your entries. Green cells contain formulas. Preserve the formulas in **Bookings F–H** and **Sessions D–F**. Keep a fresh copy for each cancellation. Use simple alphanumeric booking and session IDs; customer identities stay in your original records.

### One split booking

| Booking | Tickets bought | Move to | Move seats | Refund seats | Planned refund |
|---|---:|---|---:|---:|---:|
| B001 | 2 | SUN18 | 1 | 1 | $68.00 |

With a $68 ticket price and one place in `SUN18`, this plan uses that last place. If another booking requests the same session, the sheet flags the capacity conflict on both bookings. The host can agree another session with one of the guests before executing either plan.

**Ready for review** records a complete seat allocation within the worksheet's available capacity. Actual availability, guest consent and payment outcomes come from the operator's original systems. The worksheet records proposed actions and manually entered receipt references.

## Have the plan prepared for you

**US$29 for one cancellation batch, up to 30 bookings.**

You receive:

- A filled guest-by-guest planning sheet with seat and refund totals.
- A short list of unanswered questions and capacity conflicts.
- Copy-ready guest-message drafts for your review.
- One revision to the agreed batch.

Delivery is **within two business days after we agree the scope and receive the inputs**. The agreed US$29 is invoiced on delivery. The starting scope is fixed-price USD tickets, equal-price replacement classes and whole-ticket refunds, with one replacement session per booking.

[Email your booking count, booking tool and target date](mailto:belgialucca@gmail.com?subject=Raincheck%20planning%20service). We confirm scope, delivery date, invoice terms and data handling before you share the batch. Use booking aliases, ticket counts, available replacement sessions and redacted guest replies. Keep customer names, email addresses and payment access in your own systems.

The service uses AI-assisted planning. The operator approves the guest choices and performs the messages, rebookings and payments in their own tools. The interactive Raincheck preview separately demonstrates simulated payments and recorded AI; its PayPal integration uses sandbox funds.

## Build and verification

The workbook is generated from [`build-planning-sheet.py`](build-planning-sheet.py) using Python's standard library and LibreOffice. It contains ordinary spreadsheet formulas and editable cells.

```sh
python docs/build-planning-sheet.py --work-dir /path/to/workspace/temp/sheet --check
```

The focused check recalculates real workbooks in LibreOffice: a split booking, a full refund, a two-seat transfer, an unanswered guest with empty move/refund fields, and two bookings requesting the last place. The download is an empty template with a worked example in its instructions. The builder keeps the populated check workbooks in the chosen temporary directory.

MIT. Research and engineering by AI agents; [workflow sources](research.md).
