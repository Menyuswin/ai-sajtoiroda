// A Proaktív munkatárs adatai (D1): naptár és megszólalási javaslatok. Minden lekérdezés a tenant_id-vel szűr.
let seq = 0;
const newId = (now) => `${now().toISOString()}-${String(++seq % 1000000).padStart(6, '0')}-${crypto.randomUUID().slice(0, 6)}`;
const parse = (j) => (j ? JSON.parse(j) : null);

export const CAL_TYPES = { kulso: 'Külső esemény', sajat: 'Saját esemény', vezetoi: 'Vezetői naptár' };
export const CAL_LIMIT = 300;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CalendarError extends Error {}

const mapJ = (r) => ({ id: r.id, cim: r.cim, tema: r.tema, anyag_id: r.anyag_id, forras: parse(r.forras_json), atadas_id: r.atadas_id, allapot: r.allapot, csomag_atadas_id: r.csomag_atadas_id, dontes_by: r.dontes_by, dontes_ido: r.dontes_ido, ido: r.ido });

export function createProactiveStore({ db, tenantId, now = () => new Date() }) {
  return {
    calendar: {
      async add({ datum, cim, megjegyzes = '', tipus = 'kulso' }) {
        if (!DATE_RE.test(String(datum)) || Number.isNaN(Date.parse(`${datum}T00:00:00Z`))) throw new CalendarError('A dátum ÉÉÉÉ-HH-NN alakú legyen.');
        const title = String(cim || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!title) throw new CalendarError('A bejegyzés címe kötelező.');
        if (!CAL_TYPES[tipus]) throw new CalendarError('Ismeretlen bejegyzéstípus.');
        const n = (await db.prepare('SELECT COUNT(*) AS n FROM naptar WHERE tenant_id = ?').bind(tenantId).first()).n;
        if (n >= CAL_LIMIT) throw new CalendarError(`A naptár megtelt (legfeljebb ${CAL_LIMIT} bejegyzés).`);
        const id = newId(now);
        await db.prepare('INSERT INTO naptar (id, tenant_id, datum, cim, megjegyzes, tipus, ido) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, tenantId, datum, title, String(megjegyzes || '').slice(0, 500), tipus, now().toISOString()).run();
        return id;
      },
      async list({ from = null, to = null, limit = 200 } = {}) {
        const where = ['tenant_id = ?'], args = [tenantId];
        if (from) { where.push('datum >= ?'); args.push(from); }
        if (to) { where.push('datum <= ?'); args.push(to); }
        const { results } = await db.prepare(`SELECT * FROM naptar WHERE ${where.join(' AND ')} ORDER BY datum, id LIMIT ?`).bind(...args, limit).all();
        return results.map(r => ({ id: r.id, datum: r.datum, cim: r.cim, megjegyzes: r.megjegyzes, tipus: r.tipus }));
      },
      async remove(id) { const r = await db.prepare('DELETE FROM naptar WHERE tenant_id = ? AND id = ?').bind(tenantId, id).run(); return (r.meta?.changes ?? 0) > 0; },
      async purgeBefore(isoDate) { const r = await db.prepare('DELETE FROM naptar WHERE tenant_id = ? AND datum < ?').bind(tenantId, isoDate).run(); return r.meta?.changes ?? 0; },
    },
    proposals: {
      async add({ cim, tema, anyagId, forras, atadasId = null }) {
        const id = newId(now);
        await db.prepare('INSERT INTO javaslatok (id, tenant_id, cim, tema, anyag_id, forras_json, atadas_id, ido) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, tenantId, cim, tema, anyagId ?? null, forras ? JSON.stringify(forras) : null, atadasId, now().toISOString()).run();
        return id;
      },
      async get(id) { const r = await db.prepare('SELECT * FROM javaslatok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first(); return r ? mapJ(r) : null; },
      async list({ allapot = null, limit = 100 } = {}) {
        const q = allapot ? 'SELECT * FROM javaslatok WHERE tenant_id = ? AND allapot = ? ORDER BY ido DESC, id DESC LIMIT ?' : 'SELECT * FROM javaslatok WHERE tenant_id = ? ORDER BY ido DESC, id DESC LIMIT ?';
        const { results } = await db.prepare(q).bind(...(allapot ? [tenantId, allapot, limit] : [tenantId, limit])).all();
        return results.map(mapJ);
      },
      // Döntés: csak nyitott vagy halasztott javaslatról lehet (a feltételes frissítés a versenyhelyzetet is kizárja).
      async decide(id, { allapot, by }) {
        const r = await db.prepare("UPDATE javaslatok SET allapot = ?, dontes_by = ?, dontes_ido = ? WHERE tenant_id = ? AND id = ? AND allapot IN ('nyitott', 'halasztva')").bind(allapot, by, now().toISOString(), tenantId, id).run();
        return (r.meta?.changes ?? 0) > 0;
      },
      async setPackageHandoff(id, atadasId) { await db.prepare('UPDATE javaslatok SET csomag_atadas_id = ? WHERE tenant_id = ? AND id = ?').bind(atadasId, tenantId, id).run(); },
      async countSince(iso) { return (await db.prepare('SELECT COUNT(*) AS n FROM javaslatok WHERE tenant_id = ? AND ido >= ?').bind(tenantId, iso).first()).n; },
      async openCount() { return (await db.prepare("SELECT COUNT(*) AS n FROM javaslatok WHERE tenant_id = ? AND allapot IN ('nyitott', 'halasztva')").bind(tenantId).first()).n; },
    },
  };
}
