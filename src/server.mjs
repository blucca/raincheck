import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Raincheck } from './engine.mjs';
import { LiveInterpreter, RecordedInterpreter } from './interpreter.mjs';
import { PayPalSandboxPayments } from './payments.mjs';
import { reserveRaincheckBudget } from './budget.mjs';
import { seed, sandboxSeed } from './seed.mjs';
import { SandboxCheckout } from './sandbox-checkout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 4326);
const sandboxConfigured = Boolean(process.env.PAYPAL_SANDBOX_CLIENT_ID && process.env.PAYPAL_SANDBOX_CLIENT_SECRET);
const baseUrl = new URL(process.env.RAINCHECK_BASE_URL || `http://127.0.0.1:${port}`);
const dataDir = path.resolve(process.env.RAINCHECK_DATA_DIR || path.join(root, sandboxConfigured ? 'temp/sandbox-runtime' : 'temp/runtime'));
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

let interpreter = new RecordedInterpreter();
if (process.env.NEBIUS_API_KEY && process.env.NEBIUS_BUDGET_FILE) {
  interpreter = new LiveInterpreter({
    apiKey: process.env.NEBIUS_API_KEY,
    baseUrl: process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.us-central1.nebius.com/v1',
    model: process.env.NEBIUS_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
    reserve: reserveRaincheckBudget,
    onResponse: process.env.RAINCHECK_MODEL_LOG_DIR ? response => {
      const dir = path.resolve(process.env.RAINCHECK_MODEL_LOG_DIR);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(response, null, 2), { mode: 0o600 });
    } : undefined
  });
}
const payments = sandboxConfigured
  ? new PayPalSandboxPayments({ clientId: process.env.PAYPAL_SANDBOX_CLIENT_ID, clientSecret: process.env.PAYPAL_SANDBOX_CLIENT_SECRET }) : undefined;
const scenario = process.env.RAINCHECK_SCENARIO_FILE ? JSON.parse(fs.readFileSync(process.env.RAINCHECK_SCENARIO_FILE, 'utf8')) : sandboxConfigured ? sandboxSeed() : seed;
const app = new Raincheck({ filename: path.join(dataDir, 'raincheck.sqlite'), interpreter, payments, scenario });
const checkouts = new Map();
function checkoutFor(id = app.workspace().bookings[0]?.id) {
  if (!sandboxConfigured) return null;
  app.booking(id);
  if (!checkouts.has(id)) checkouts.set(id, new SandboxCheckout({
    store: app.store, payments, bookingId: id,
    returnUrl: new URL(`/sandbox.html?booking=${encodeURIComponent(id)}&returned=1`, baseUrl).href,
    cancelUrl: new URL(`/sandbox.html?booking=${encodeURIComponent(id)}&cancelled=1`, baseUrl).href
  }));
  return checkouts.get(id);
}
const workspace = () => ({ ...app.workspace(), sandbox_checkout: sandboxConfigured ? '/sandbox.html' : null });

const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value));
};
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 16000) { const error = new Error('Use a shorter customer reply.'); error.status = 413; throw error; }
  }
  try { return text ? JSON.parse(text) : {}; }
  catch { const error = new Error('Send a JSON request body.'); error.status = 400; throw error; }
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      // Same-origin JSON writes keep browser pages outside this app from triggering local actions.
      if (req.method === 'POST') {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'content_type', message: 'Send application/json.' });
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'origin', message: 'Use the Raincheck application origin.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/workspace') return json(res, 200, workspace());
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { version: '0.2.0', mode: app.workspace().mode });
      if (url.pathname === '/api/sandbox' && req.method === 'GET') {
        const checkout = checkoutFor(url.searchParams.get('booking') || undefined);
        return json(res, 200, checkout ? { configured: true, ...checkout.snapshot() } : { configured: false, state: 'configuration_required' });
      }
      if (['/api/sandbox/create', '/api/sandbox/complete'].includes(url.pathname) && req.method === 'POST') {
        const input = await body(req);
        const checkout = checkoutFor(input.booking_id);
        if (!checkout) return json(res, 409, { error: 'sandbox_configuration', message: 'Configure the sandbox application credentials and restart Raincheck.' });
        const snapshot = url.pathname.endsWith('/create') ? await checkout.create() : await checkout.complete();
        return json(res, 200, { configured: true, ...snapshot });
      }
      if (req.method === 'POST' && url.pathname === '/api/reset') return json(res, 200, app.reset());
      const match = url.pathname.match(/^\/api\/cases\/([a-zA-Z0-9_-]+)\/(analyze|execute|export)$/);
      if (match) {
        const [, id, action] = match;
        if (req.method === 'GET' && action === 'export') {
          const item = app.store.get('case', id);
          if (!item) return json(res, 404, { error: 'case_missing', message: 'Interpret this reply to create an outcome record.' });
          res.setHeader('Content-Disposition', `attachment; filename="raincheck-${id}.json"`);
          return json(res, 200, { product: 'Raincheck', mode: app.workspace().mode, booking: app.booking(id), case: item });
        }
        if (req.method === 'POST' && ['analyze', 'execute'].includes(action)) {
          const input = await body(req);
          const item = action === 'analyze' ? await app.analyze(id, input.message) : await app.execute(id, { simulate_lost_response: input.simulate_lost_response === true });
          return json(res, 200, { case: item, workspace: workspace() });
        }
      }
      return json(res, 404, { error: 'route_missing', message: 'Choose a Raincheck workspace action.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const shared = /^\/src\/(browser-api|engine-core|seed|recorded|policy|payments|interpreter)\.mjs$/.test(url.pathname);
    const baseDir = shared ? root : publicDir;
    const filename = path.resolve(baseDir, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!filename.startsWith(baseDir + path.sep)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); return res.end('Page unavailable'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filename).pipe(res);
  } catch (error) {
    if (res.headersSent) return res.end();
    json(res, error.status || 500, { error: error.code || 'request_failed', message: error.message, workspace: workspace() });
  }
});
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Raincheck http://${process.env.HOST || '127.0.0.1'}:${port} · ${app.payments.mode} payments · ${app.interpreter.mode} AI`));
const shutdown = () => server.close(() => { app.close(); process.exit(0); });
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
