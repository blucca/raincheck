# Live model observations

On October 12, 2026, the four fictional customer replies were interpreted through Nebius Token Factory using NVIDIA Nemotron 3 Super 120B A12B. The accepted structured outputs are included in [model-recordings.json](model-recordings.json) and power the browser preview.

| Reply | Application result |
|---|---|
| Mina: one sister can attend; refund the other | 1 replacement place + $68 refund |
| Noah: refund the whole booking | 1 ticket refunded, $68 |
| Jules: move both to Saturday 24 October | 2 replacement places, $0 refund |
| Priya: asks what times are available | Needs a reply; seats and money unchanged |

## What changed during the real run

The first output described Mina's **one transfer plus one refund** correctly in its counts, while returning a redundant `action: transfer` field. The policy rejected that inconsistent object. The schema now carries the counts and a clarification flag; the application derives `split`, `transfer`, or `refund` from the counts.

An initial Priya output identified an open question correctly and supplied an empty evidence quote. For clarification outcomes, the application now shows the original customer message as context. Definite payment choices continue to require an exact source quote.

These changes produced all four accepted outcomes through the running Node API. The tests separately exercise seat contention and a response lost after the simulated payment provider finishes a refund.

**Observation scope:** four synthetic customer replies, one model endpoint, and the selected cancellation scenario. The subsequent [account-connected sandbox verification](sandbox-verification.md) completed order, capture and refund with a newly worded live-model reply. Operator-led use and a broader customer-language sample are the next milestones.
