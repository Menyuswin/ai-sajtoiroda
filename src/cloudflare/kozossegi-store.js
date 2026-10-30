// A Közösségi média munkatárs adatai (D1): posztjavaslatok és digitális jelzések. Minden lekérdezés a tenant_id-vel szűr.
import { norm } from '../core/text.js';

let seq = 0;
const newId = (now) => `${now().toISOString()}-${String(++seq % 1000000).padStart(6, '0')}-${crypto.randomUUID().slice(0, 6)}`;
const parse = (j) => (j ? JSON.parse(j) : null);

export const POST_STATES = { tervezet: 'Tervezet', jovahagyva: 'Jóváhagyva', kiadva: 'Kiadva', elvetve: 'Elvetve', kesobb: 'Később', megfigyelendo: 'Megfigyelendő' };
export const MOODS = { negativ: 'negatív', semleges: 'semleges', pozitiv: 'pozitív' };
export const REACH = { kicsi: 'kicsi', kozepes: 'közepes', nagy: 'nagy' };
export const SIGNAL_LIMIT_DAY = 30;
export class SocialError extends Error { constructor(status, message) { super(message); this.status = status; } }

export const topicKey = (t) => norm(t).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120);

const mapP = (r) => ({ id: r.id, cim: r.cim, tema: r.tema, anyag_id: r.anyag_id, forras: parse(r.forras_json), atadas_id: r.atadas_id, level_id: r.level_id, allapot: r.allapot, kiadva: parse(r.kiadva_json), dontes_by: r.dontes_by, dontes_ido: r.dontes_ido, ido: r.ido, frissitve: r.frissitve });
const mapS = (r) => ({ id: r.id, platform: r.platform, osszefoglalo: r.osszefoglalo, hangulat: r.hangulat, elereles: r.elereles, url: r.url, javaslat_id: r.javaslat_id, ido: r.ido });

export function createSocialStore({ db, tenantId, now = () => new Date() }) {
  return {
    posts: {
      async add({ cim, tema, anyagId = null, forras = null, atadasId = null, levelId = null, allapot = 'tervezet' }) {
        const id = newId(now), stamp = now().toISOString();
        await db.prepare('INSERT INTO poszt_javaslatok (id, tenant_id, cim, tema, tema_kulcs, anyag_id, forras_json, atadas_id, level_id, allapot, ido, frissitve) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, tenantId, cim, tema, topicKey(tema), anyagId, forras ? JSON.stringify(forras) : null, atadasId, levelId, allapot, stamp, stamp).run();
        return id;
      },
      async get(id) { const r = await db.prepare('SELECT * FROM poszt_javaslatok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first(); return r ? mapP(r) : null; },
      async list({ allapot = null, limit = 100 } = {}) {
        const q = allapot ? 'SELECT * FROM poszt_javaslatok WHERE tenant_id = ? AND allapot = ? ORDER BY ido DESC, id DESC LIMIT ?' : 'SELECT * FROM poszt_javaslatok WHERE tenant_id = ? ORDER BY ido DESC, id DESC LIMIT ?';
        const { results } = await db.prepare(q).bind(...(allapot ? [tenantId, allapot, limit] : [tenantId, limit])).all();
        return results.map(mapP);
      },
      // Ugyanarra a témára a megadott idő óta készült (nem elvetett) javaslat: az újabb jelzés ezt egészíti ki.
      async findRecent(tema, sinceIso) {
        const r = await db.prepare("SELECT * FROM poszt_javaslatok WHERE tenant_id = ? AND tema_kulcs = ? AND ido >= ? AND allapot != 'elvetve' ORDER BY ido DESC LIMIT 1").bind(tenantId, topicKey(tema), sinceIso).first();
        return r ? mapP(r) : null;
      },
      async setForras(id, forras) { await db.prepare('UPDATE poszt_javaslatok SET forras_json = ?, frissitve = ? WHERE tenant_id = ? AND id = ?').bind(JSON.stringify(forras), now().toISOString(), tenantId, id).run(); },
      // A megfigyelendő megjegyzésből tényleges javaslat lesz: ugyanazt a sort tölti ki.
      async promote(id, { cim, anyagId, forras }) {
        const r = await db.prepare("UPDATE poszt_javaslatok SET cim = ?, anyag_id = ?, forras_json = ?, allapot = 'tervezet', frissitve = ? WHERE tenant_id = ? AND id = ? AND allapot = 'megfigyelendo'").bind(cim, anyagId, JSON.stringify(forras), now().toISOString(), tenantId, id).run();
        return (r.meta?.changes ?? 0) > 0;
      },
      // Döntés: tervezetről vagy halasztottról (a feltételes frissítés a versenyhelyzetet is kizárja).
      async decide(id, { allapot, by }) {
        const r = await db.prepare("UPDATE poszt_javaslatok SET allapot = ?, dontes_by = ?, dontes_ido = ?, frissitve = ? WHERE tenant_id = ? AND id = ? AND allapot IN ('tervezet', 'kesobb')").bind(allapot, by, now().toISOString(), now().toISOString(), tenantId, id).run();
        return (r.meta?.changes ?? 0) > 0;
      },
      async markPublished(id, kiadva) {
        const r = await db.prepare("UPDATE poszt_javaslatok SET allapot = 'kiadva', kiadva_json = ?, frissitve = ? WHERE tenant_id = ? AND id = ? AND allapot IN ('jovahagyva', 'kiadva')").bind(JSON.stringify(kiadva), now().toISOString(), tenantId, id).run();
        return (r.meta?.changes ?? 0) > 0;
      },
      async reopen(id) { await db.prepare("UPDATE poszt_javaslatok SET allapot = 'tervezet', frissitve = ? WHERE tenant_id = ? AND id = ? AND allapot = 'jovahagyva'").bind(now().toISOString(), tenantId, id).run(); },
      async countSince(iso) { return (await db.prepare("SELECT COUNT(*) AS n FROM poszt_javaslatok WHERE tenant_id = ? AND ido >= ? AND allapot != 'megfigyelendo'").bind(tenantId, iso).first()).n; },
      async openCount() { return (await db.prepare("SELECT COUNT(*) AS n FROM poszt_javaslatok WHERE tenant_id = ? AND allapot IN ('tervezet', 'kesobb')").bind(tenantId).first()).n; },
      async byLetter(levelId) { const r = await db.prepare("SELECT * FROM poszt_javaslatok WHERE tenant_id = ? AND level_id = ? AND allapot != 'megfigyelendo' ORDER BY ido DESC LIMIT 1").bind(tenantId, levelId).first(); return r ? mapP(r) : null; },
    },
    signals: {
      async add({ platform, osszefoglalo, hangulat, elereles, url = null }) {
        const id = newId(now);
        await db.prepare('INSERT INTO digitalis_jelzesek (id, tenant_id, platform, osszefoglalo, hangulat, elereles, url, ido) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, tenantId, platform, osszefoglalo, hangulat, elereles, url, now().toISOString()).run();
        return id;
      },
      async get(id) { const r = await db.prepare('SELECT * FROM digitalis_jelzesek WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first(); return r ? mapS(r) : null; },
      async list({ limit = 60 } = {}) { const { results } = await db.prepare('SELECT * FROM digitalis_jelzesek WHERE tenant_id = ? ORDER BY ido DESC, id DESC LIMIT ?').bind(tenantId, limit).all(); return results.map(mapS); },
      async setProposal(id, proposalId) { await db.prepare('UPDATE digitalis_jelzesek SET javaslat_id = ? WHERE tenant_id = ? AND id = ?').bind(proposalId, tenantId, id).run(); },
      async countSince(iso) { return (await db.prepare('SELECT COUNT(*) AS n FROM digitalis_jelzesek WHERE tenant_id = ? AND ido >= ?').bind(tenantId, iso).first()).n; },
      async remove(id) { const r = await db.prepare('DELETE FROM digitalis_jelzesek WHERE tenant_id = ? AND id = ?').bind(tenantId, id).run(); return (r.meta?.changes ?? 0) > 0; },
    },
  };
}
