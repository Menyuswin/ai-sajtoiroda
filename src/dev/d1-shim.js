// D1-kompatibilis helyettesítő a teszteléshez és a helyi kipróbáláshoz: ugyanazt az API-t adja (prepare/bind/run/all/first/batch),
// de node:sqlite fölött fut, így a migrations/*.sql séma és az SQL valóban lefut.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function createD1Shim() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  const norm = (a) => a.map(x => (x === undefined ? null : x));
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, norm(a)),
    async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
    async all() { return { results: sqlite.prepare(sql).all(...args).map(r => ({ ...r })) }; },
    async first() { const r = sqlite.prepare(sql).get(...args); return r ? { ...r } : null; },
  });
  return {
    prepare: (sql) => wrap(sql),
    async batch(stmts) { sqlite.exec('BEGIN'); try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
    raw: sqlite,
  };
}
