import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(filename = ':memory:') {
    if (filename !== ':memory:') mkdirSync(path.dirname(path.resolve(filename)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS documents (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id));`);
  }
  get(kind, id) {
    const row = this.db.prepare('SELECT body FROM documents WHERE kind=? AND id=?').get(kind, id);
    return row ? JSON.parse(row.body) : null;
  }
  all(kind) { return this.db.prepare('SELECT body FROM documents WHERE kind=? ORDER BY rowid').all(kind).map(r => JSON.parse(r.body)); }
  put(kind, id, body) {
    this.db.prepare('INSERT INTO documents(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body')
      .run(kind, id, JSON.stringify(body));
    return body;
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  reset(seed) {
    this.transaction(() => {
      this.db.exec('DELETE FROM documents');
      this.put('meta', 'workspace', { title: seed.title, cancellation: seed.cancellation });
      seed.sessions.forEach(s => this.put('session', s.id, { ...s, held: s.held || 0 }));
      seed.bookings.forEach(b => this.put('booking', b.id, b));
    });
  }
  close() { this.db.close(); }
}
