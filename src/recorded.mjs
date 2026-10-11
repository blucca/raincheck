/** Real model outputs for the four fictional demo replies. See docs/model-observations.md. */
export const recordedIntents = {
  "mina": {
    "needs_clarification": false,
    "transfer_quantity": 1,
    "refund_quantity": 1,
    "target_session_id": "s-sun18",
    "evidence": "My sister can make Sunday the 18th at 2 pm. Please move her ticket and refund mine.",
    "explanation": "Proposal: Transfer 1 ticket to 'Sunday at the wheel' (s-sun18) on 2026-10-18 at 14:00; refund the other ticket.",
    "question": ""
  },
  "noah": {
    "needs_clarification": false,
    "transfer_quantity": 0,
    "refund_quantity": 1,
    "target_session_id": null,
    "evidence": "Please refund my whole booking.",
    "explanation": "Proposal: Refund the entire booking (1 ticket) as requested; no transfer needed.",
    "question": ""
  },
  "jules": {
    "needs_clarification": false,
    "transfer_quantity": 2,
    "refund_quantity": 0,
    "target_session_id": "s-sat24",
    "evidence": "Please move both of us to Saturday the 24th at 10 am.",
    "explanation": "Proposal: Transfer both tickets to the Saturday clay club on 2026-10-24 at 10:00.",
    "question": ""
  },
  "priya": {
    "needs_clarification": true,
    "transfer_quantity": 0,
    "refund_quantity": 0,
    "target_session_id": null,
    "evidence": "",
    "explanation": "Customer asks what times are available; we need more detail before deciding.",
    "question": "Could you let me know which specific date and time you'd prefer among the available classes?"
  }
};
