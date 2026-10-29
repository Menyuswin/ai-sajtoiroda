// A levelek tára (D1). Minden lekérdezés a tenant_id-vel szűr.
let seq = 0;
const newId = (now) => `${now().toISOString()}-${String(++seq % 1000000).padStart(6, '0')}-${crypto.randomUUID().slice(0, 6)}`;
const parse = (j) => (j ? JSON.parse(j) : null);

export const LETTER_STATES = ['uj', 'tervezet_kesz', 'jovahagyva', 'elvetve', 'halasztva', 'tovabbitva', 'hiba'];

const map = (r, full) => ({
  id: r.id, forras: r.forras, felado: r.felado, felado_nev: r.felado_nev, targy: r.targy, ido: r.ido, fogadva: r.fogadva, allapot: r.allapot,
  besorolas: parse(r.besorolas_json), anyag_id: r.anyag_id, olvasott: !!r.olvasott, dontes_by: r.dontes_by, dontes_ido: r.dontes_ido,
  ...(full ? { szoveg: r.szoveg, valasz: parse(r.valasz_json) } : {}),
});

export function createMailStore({ db, tenantId, now = () => new Date() }) {
  return {
    // Befogad egy (már normalizált) levelet. Ugyanaz a levélazonosító kétszer nem kerül be.
    async add(msg, forras) {
      const known = await db.prepare('SELECT id FROM levelek WHERE tenant_id = ? AND azonosito = ?').bind(tenantId, msg.azonosito).first();
      if (known) return { id: known.id, uj: false };
      const id = newId(now), stamp = now().toISOString();
      await db.prepare('INSERT INTO levelek (id, tenant_id, azonosito, forras, felado, felado_nev, targy, szoveg, ido, fogadva) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, tenantId, msg.azonosito, forras, msg.felado, msg.felado_nev || null, msg.targy, msg.szoveg, msg.ido || stamp, stamp).run();
      return { id, uj: true };
    },
    async get(id) {
      const r = await db.prepare('SELECT * FROM levelek WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first();
      return r ? map(r, true) : null;
    },
    async list({ allapot = null, limit = 100 } = {}) {
      const q = allapot ? 'SELECT * FROM levelek WHERE tenant_id = ? AND allapot = ? ORDER BY ido DESC, id DESC LIMIT ?' : 'SELECT * FROM levelek WHERE tenant_id = ? ORDER BY ido DESC, id DESC LIMIT ?';
      const { results } = await db.prepare(q).bind(...(allapot ? [tenantId, allapot, limit] : [tenantId, limit])).all();
      return results.map(r => map(r, false));
    },
    async pending(limit = 20) {
      const { results } = await db.prepare("SELECT * FROM levelek WHERE tenant_id = ? AND allapot = 'uj' ORDER BY ido, id LIMIT ?").bind(tenantId, limit).all();
      return results.map(r => map(r, true));
    },
    async setProcessed(id, { besorolas, anyagId, allapot }) {
      await db.prepare('UPDATE levelek SET besorolas_json = ?, anyag_id = ?, allapot = ? WHERE tenant_id = ? AND id = ?').bind(besorolas ? JSON.stringify(besorolas) : null, anyagId ?? null, allapot, tenantId, id).run();
    },
    // A vezető döntése. Csak olyan levélre érvényes, amelyről még nem döntöttek (a feltételes frissítés a versenyhelyzetet is kizárja).
    async decide(id, { allapot, by, valasz = null }) {
      const r = await db.prepare("UPDATE levelek SET allapot = ?, dontes_by = ?, dontes_ido = ?, valasz_json = ? WHERE tenant_id = ? AND id = ? AND allapot IN ('uj', 'tervezet_kesz', 'halasztva', 'hiba')")
        .bind(allapot, by, now().toISOString(), valasz ? JSON.stringify(valasz) : null, tenantId, id).run();
      return (r.meta?.changes ?? 0) > 0;
    },
    // Ha a döntés végrehajtása (a küldés) nem sikerült, a levél újra nyitott lesz.
    async reopen(id) {
      await db.prepare("UPDATE levelek SET allapot = 'tervezet_kesz', dontes_by = NULL, dontes_ido = NULL, valasz_json = NULL WHERE tenant_id = ? AND id = ? AND allapot = 'jovahagyva'").bind(tenantId, id).run();
    },
    async markRead(id) { await db.prepare('UPDATE levelek SET olvasott = 1 WHERE tenant_id = ? AND id = ?').bind(tenantId, id).run(); },
    async counts() {
      const { results } = await db.prepare('SELECT allapot, SUM(CASE WHEN olvasott = 0 THEN 1 ELSE 0 END) AS olvasatlan, COUNT(*) AS n FROM levelek WHERE tenant_id = ? GROUP BY allapot').bind(tenantId).all();
      const out = { olvasatlan: 0 };
      for (const r of results) { out[r.allapot] = r.n; out.olvasatlan += r.olvasatlan; }
      return out;
    },
    // Megőrzési idő: a levélszöveg törlése (a napló marad).
    async purgeOlderThan(iso) {
      const r = await db.prepare('DELETE FROM levelek WHERE tenant_id = ? AND fogadva < ?').bind(tenantId, iso).run();
      return r.meta?.changes ?? 0;
    },
    async mailboxState() {
      return (await db.prepare('SELECT * FROM postafiok_allapot WHERE tenant_id = ?').bind(tenantId).first()) || { kurzor: null, utolso_siker: null, utolso_hiba: null, utolso_hiba_ido: null };
    },
    async saveMailboxState({ kurzor, siker = null, hiba = null }) {
      const stamp = now().toISOString();
      await db.prepare('INSERT INTO postafiok_allapot (tenant_id, kurzor, utolso_siker, utolso_hiba, utolso_hiba_ido) VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant_id) DO UPDATE SET kurzor = COALESCE(excluded.kurzor, kurzor), utolso_siker = COALESCE(excluded.utolso_siker, utolso_siker), utolso_hiba = excluded.utolso_hiba, utolso_hiba_ido = excluded.utolso_hiba_ido')
        .bind(tenantId, kurzor ?? null, siker ? stamp : null, hiba, hiba ? stamp : null).run();
    },
  };
}
