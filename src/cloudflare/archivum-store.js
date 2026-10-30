// Az Archívum tára (D1): kiadott közlések és keresés. Minden lekérdezés a tenant_id-vel szűr; a közlés nem módosítható.
import { ftsQuery } from '../docs/store.js';
import { norm } from '../core/text.js';

let seq = 0;
const newId = (now) => `${now().toISOString()}-${String(++seq % 1000000).padStart(6, '0')}-${crypto.randomUUID().slice(0, 6)}`;

export const ARCHIVE_KINDS = { valasz: 'Válasz levélre', meghivo: 'Meghívó', nyilatkozat: 'Nyilatkozat', interju: 'Interjú', sajtokozlemeny: 'Sajtóközlemény', poszt: 'Közösségi poszt', egyeb: 'Egyéb' };
export const ARCHIVE_LIMIT = 5000;
export const MAX_STATEMENT = 20000;
export class ArchiveError extends Error { constructor(status, message) { super(message); this.status = status; } }

const map = (r, full) => ({ id: r.id, fajta: r.fajta, cim: r.cim, cimzett_medium: r.cimzett_medium, cimzett_domain: r.cimzett_domain, jovahagyta: r.jovahagyta, kiment: !!r.kiment, kiadva: r.kiadva, forras_tipus: r.forras_tipus, forras_id: r.forras_id, ...(full ? { szoveg: r.szoveg } : { kivonat: String(r.szoveg).replace(/\s+/g, ' ').slice(0, 240) }) });
const domainOf = (email) => { const m = String(email || '').toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/); return m ? m[1] : null; };

export function createArchive({ db, tenantId, now = () => new Date() }) {
  const dateOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  const api = {
    // Közlés rögzítése. Ugyanaz a forrás kétszer nem kerül be. A címzett e-mail-címe NEM tárolódik, csak a médium és a címtartomány.
    async record({ forrasTipus, forrasId, fajta, cim, szoveg, cimzettEmail = null, cimzettMedium = null, jovahagyta = null, kiment = false, kiadva = null }) {
      if (!ARCHIVE_KINDS[fajta]) throw new ArchiveError(400, 'Ismeretlen közlés-fajta.');
      const text = String(szoveg ?? '').trim();
      if (!text) throw new ArchiveError(400, 'A közlés szövege kötelező.');
      if (text.length > MAX_STATEMENT) throw new ArchiveError(400, `A közlés legfeljebb ${MAX_STATEMENT} karakter lehet.`);
      if (await db.prepare('SELECT id FROM kozlesek WHERE tenant_id = ? AND forras_tipus = ? AND forras_id = ?').bind(tenantId, forrasTipus, String(forrasId)).first()) return { id: null, uj: false };
      if ((await db.prepare('SELECT COUNT(*) AS n FROM kozlesek WHERE tenant_id = ?').bind(tenantId).first()).n >= ARCHIVE_LIMIT) throw new ArchiveError(400, `Az archívum megtelt (legfeljebb ${ARCHIVE_LIMIT} közlés).`);
      const date = kiadva && dateOk(kiadva) ? kiadva : now().toISOString().slice(0, 10);
      const title = String(cim || '').replace(/\s+/g, ' ').trim().slice(0, 200) || '(nincs tárgy)';
      const id = newId(now);
      await db.batch([
        db.prepare('INSERT INTO kozlesek (id, tenant_id, forras_tipus, forras_id, fajta, cim, szoveg, cimzett_medium, cimzett_domain, jovahagyta, kiment, kiadva, ido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, tenantId, forrasTipus, String(forrasId), fajta, title, text, cimzettMedium ? String(cimzettMedium).slice(0, 120) : null, domainOf(cimzettEmail), jovahagyta, kiment ? 1 : 0, date, now().toISOString()),
        db.prepare('INSERT INTO kozles_kereso (szoveg, cim, tenant_id, kozles_id) VALUES (?, ?, ?, ?)').bind(text, title, tenantId, id),
      ]);
      return { id, uj: true };
    },
    async addManual({ cim, datum, fajta, szoveg, medium = '', by }) {
      if (!dateOk(datum)) throw new ArchiveError(400, 'A dátum ÉÉÉÉ-HH-NN alakú legyen.');
      if (datum > now().toISOString().slice(0, 10)) throw new ArchiveError(400, 'A kiadás dátuma nem lehet jövőbeli.');
      return api.record({ forrasTipus: 'kezi', forrasId: `${datum}:${norm(cim).slice(0, 40)}:${String(szoveg).length}`, fajta, cim, szoveg, cimzettMedium: medium, jovahagyta: by, kiment: true, kiadva: datum });
    },
    async get(id) { const r = await db.prepare('SELECT * FROM kozlesek WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first(); return r ? map(r, true) : null; },
    async list({ fajta = null, tol = null, ig = null, limit = 200 } = {}) {
      const where = ['tenant_id = ?'], args = [tenantId];
      if (fajta) { where.push('fajta = ?'); args.push(fajta); }
      if (tol) { where.push('kiadva >= ?'); args.push(tol); }
      if (ig) { where.push('kiadva <= ?'); args.push(ig); }
      const { results } = await db.prepare(`SELECT * FROM kozlesek WHERE ${where.join(' AND ')} ORDER BY kiadva DESC, id DESC LIMIT ?`).bind(...args, Math.min(limit, 500)).all();
      return results.map(r => map(r, false));
    },
    async count() { return (await db.prepare('SELECT COUNT(*) AS n FROM kozlesek WHERE tenant_id = ?').bind(tenantId).first()).n; },
    // Szó alapú, ragozás-tűrő keresés (mint a Dokumentumtárban).
    async search(text, { fajta = null, tol = null, ig = null, limit = 10 } = {}) {
      const q = ftsQuery(text);
      if (!q) return [];
      const { results } = await db.prepare('SELECT kozles_id AS id, bm25(kozles_kereso) AS rang FROM kozles_kereso WHERE kozles_kereso MATCH ? AND tenant_id = ? ORDER BY rang LIMIT 60').bind(q, tenantId).all();
      const out = [];
      for (const r of results) {
        const k = await db.prepare('SELECT * FROM kozlesek WHERE tenant_id = ? AND id = ?').bind(tenantId, r.id).first();
        if (!k || (fajta && k.fajta !== fajta) || (tol && k.kiadva < tol) || (ig && k.kiadva > ig)) continue;
        out.push(map(k, false));
        if (out.length >= limit) break;
      }
      return out;
    },
    // Az adott témához kapcsolódó korábbi közlések (a tervezet mellé), legfeljebb `limit`, a legújabbak elöl.
    async related(text, { limit = 5 } = {}) { return (await api.search(text, { limit: 20 })).sort((a, b) => b.kiadva.localeCompare(a.kiadva)).slice(0, limit); },
    async remove(id) {
      const r = await db.prepare('SELECT id FROM kozlesek WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first();
      if (!r) return false;
      await db.batch([db.prepare('DELETE FROM kozles_kereso WHERE tenant_id = ? AND kozles_id = ?').bind(tenantId, id), db.prepare('DELETE FROM kozlesek WHERE tenant_id = ? AND id = ?').bind(tenantId, id)]);
      return true;
    },
    // Megőrzési idő: a kiadás napja alapján.
    async purgeBefore(isoDate) {
      const { results } = await db.prepare('SELECT id FROM kozlesek WHERE tenant_id = ? AND kiadva < ?').bind(tenantId, isoDate).all();
      for (const r of results) await api.remove(r.id);
      return results.length;
    },
    async exportAll() { const { results } = await db.prepare('SELECT * FROM kozlesek WHERE tenant_id = ? ORDER BY kiadva, id').bind(tenantId).all(); return results.map(r => map(r, true)); },
    async checksSince(iso) { return (await db.prepare('SELECT COUNT(*) AS n FROM archivum_ellenorzesek WHERE tenant_id = ? AND ido >= ?').bind(tenantId, iso).first()).n; },
    async addCheck() { await db.prepare('INSERT INTO archivum_ellenorzesek (id, tenant_id, ido) VALUES (?, ?, ?)').bind(newId(now), tenantId, now().toISOString()).run(); },
  };
  return api;
}
