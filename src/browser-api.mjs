import { Raincheck } from './engine-core.mjs';

/** Browser persistence for a private, fictional demo workspace. The domain engine is shared with Node/SQLite. */
class BrowserStore {
  constructor() {
    this.key = 'raincheck.preview.v1'; this.inTransaction = false;
    try { this.data = JSON.parse(localStorage.getItem(this.key)) || {}; }
    catch { this.data = {}; }
  }
  get(kind, id) { return structuredClone(this.data[kind]?.[id] ?? null); }
  all(kind) { return structuredClone(Object.values(this.data[kind] || {})); }
  persist() { localStorage.setItem(this.key, JSON.stringify(this.data)); }
  put(kind, id, body) {
    this.data[kind] ||= {}; this.data[kind][id] = structuredClone(body);
    if (!this.inTransaction) this.persist();
    return body;
  }
  transaction(fn) {
    const previous = structuredClone(this.data); this.inTransaction = true;
    try { const result = fn(); this.persist(); return result; }
    catch (error) { this.data = previous; throw error; }
    finally { this.inTransaction = false; }
  }
  reset(seed) {
    this.transaction(() => {
      this.data = {};
      this.put('meta', 'workspace', { title: seed.title, cancellation: seed.cancellation });
      seed.sessions.forEach(s => this.put('session', s.id, { ...s, held: s.held || 0 }));
      seed.bookings.forEach(b => this.put('booking', b.id, b));
    });
  }
  close() {}
}

let app;
export async function previewRequest(path, options = {}) {
  app ||= new Raincheck({ store: new BrowserStore() });
  const input = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
  if (path === '/api/workspace') return app.workspace();
  if (path === '/api/status') return { version: '0.1.0', mode: app.workspace().mode };
  if (path === '/api/reset') return app.reset();
  const match = path.match(/^\/api\/cases\/([a-zA-Z0-9_-]+)\/(analyze|execute|export)$/);
  if (match) {
    const [, id, action] = match;
    if (action === 'export') return { product: 'Raincheck', mode: app.workspace().mode, booking: app.booking(id), case: app.store.get('case', id) };
    const item = action === 'analyze' ? await app.analyze(id, input.message) : await app.execute(id, input);
    return { case: item, workspace: app.workspace() };
  }
  throw new Error('Choose a Raincheck preview action.');
}
