/** Fictional workshop, people, and captured payments for the interactive demo. */
export const seed = {
  title: 'Raincheck · Little Kiln Studio',
  cancellation: {
    id: 'kiln-oct17', title: 'Wheel-throwing Saturday', date: '2026-10-17', time: '10:00',
    reason: 'Our kiln needs an emergency repair. Saturday’s workshop is cancelled. Every guest can choose another class or a full refund for each ticket.'
  },
  sessions: [
    { id: 's-sun18', title: 'Sunday at the wheel', date: '2026-10-18', time: '14:00', capacity: 8, booked: 7, held: 0 },
    { id: 's-sat24', title: 'Saturday clay club', date: '2026-10-24', time: '10:00', capacity: 10, booked: 6, held: 0 },
    { id: 's-sun25', title: 'Slow Sunday studio', date: '2026-10-25', time: '10:00', capacity: 8, booked: 6, held: 0 }
  ],
  bookings: [
    { id: 'mina', name: 'Mina Patel', email: 'mina@example.com', quantity: 2,
      message: 'My sister can make Sunday the 18th at 2 pm. Please move her ticket and refund mine.' },
    { id: 'noah', name: 'Noah Reed', email: 'noah@example.com', quantity: 1,
      message: 'Please refund my whole booking. I cannot make either weekend.' },
    { id: 'jules', name: 'Jules Ortega', email: 'jules@example.com', quantity: 2,
      message: 'Please move both of us to Saturday the 24th at 10 am.' },
    { id: 'priya', name: 'Priya Shah', email: 'priya@example.com', quantity: 1,
      message: 'Next weekend might work. What times do you have?' }
  ].map(b => ({ ...b, unit_amount: 6800, currency: 'USD', original_session_id: 'kiln-oct17',
    capture_id: `sim_capture_${b.id}`, status: 'affected' }))
};

export { recordedIntents } from './recorded.mjs';
