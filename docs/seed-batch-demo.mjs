import fs from 'node:fs';
import path from 'node:path';
import { Raincheck } from '../src/engine.mjs';
import { seed, recordedIntents } from '../src/seed.mjs';
import { batchSnapshot } from '../src/batch.mjs';

// Fictional, prepared choices make the two-family / last-seat conflict repeatable.
// Use a new directory for each run; the main app keeps its saved payment history.
const directory = process.argv[2];
if (!directory) throw new Error('Usage: node docs/seed-batch-demo.mjs /absolute/path/to/fresh/demo');
const dataDir = path.resolve(directory);
const filename = path.join(dataDir, 'raincheck.sqlite');
if (fs.existsSync(filename)) throw new Error('Choose a fresh demo directory. The existing workspace is saved.');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const scenario = structuredClone(seed);
scenario.title = 'Raincheck · Fictional batch preflight';
scenario.bookings.push({ ...scenario.bookings[0], id: 'elliot', name: 'Elliot Lane',
  email: 'elliot@example.com', capture_id: 'sim_capture_elliot' });
const scenarioFile = path.join(dataDir, 'scenario.json');
fs.writeFileSync(scenarioFile, `${JSON.stringify(scenario, null, 2)}\n`, { mode: 0o600 });
const interpreter = { mode: 'scripted batch fixture', interpret: async ({ booking }) =>
  structuredClone(recordedIntents[booking.id === 'elliot' ? 'mina' : booking.id]) };
const app = new Raincheck({ filename, scenario, interpreter });
try {
  for (const booking of scenario.bookings) await app.analyze(booking.id, booking.message);
  console.log(JSON.stringify({ data_directory: dataDir, scenario_file: scenarioFile,
    payments: app.payments.mode, plans: interpreter.mode, totals: batchSnapshot(app.workspace()).totals }, null, 2));
} finally { app.close(); }
