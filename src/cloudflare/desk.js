// Az asztalok adatai (D1): anyagok, rákérdezések, utasítások, elrendezés, hozzáférések.
// Minden lekérdezés a tenant_id-vel szűr; az ügyfelek adata nem keveredhet.
let seq = 0;
// Azonosító: időbélyeg + folyamatos sorszám + véletlen rész, így az azonos ezredmásodperces bejegyzések sorrendje is stabil.
const rand = () => `${String(++seq % 1000000).padStart(6, '0')}-${crypto.randomUUID().slice(0, 6)}`;
const parse = (j) => (j ? JSON.parse(j) : null);

export function createDesk({ db, tenantId, now = () => new Date() }) {
  const newId = () => `${now().toISOString()}-${rand()}`;
  const mapAnyag = (r, full) => ({ id: r.id, ugynok: r.ugynok, tipus: r.tipus, cim: r.cim, allapot: r.allapot, ido: r.ido, olvasott: !!r.olvasott, ...(full ? { szoveg: r.szoveg, html: r.html, meta: parse(r.meta_json) } : {}) });
  const mapUt = (r) => ({ id: r.id, ugynok: r.ugynok, szoveg: r.szoveg, muvelet: parse(r.muvelet_json), allapot: r.allapot, valasz: r.valasz, anyag_id: r.anyag_id, ido: r.ido, dontes_by: r.dontes_by, dontes_ido: r.dontes_ido });

  return {
    anyagok: {
      async add({ ugynok, tipus, cim, szoveg, html = null, meta = null, allapot = 'kesz' }) {
        const id = newId();
        await db.prepare('INSERT INTO anyagok (id, tenant_id, ugynok, tipus, cim, szoveg, html, meta_json, allapot, ido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, tenantId, ugynok, tipus, cim, szoveg, html, meta ? JSON.stringify(meta) : null, allapot, now().toISOString()).run();
        return id;
      },
      async list({ ugynok = null, limit = 50 } = {}) {
        const q = ugynok ? 'SELECT * FROM anyagok WHERE tenant_id = ? AND ugynok = ? ORDER BY ido DESC, id DESC LIMIT ?' : 'SELECT * FROM anyagok WHERE tenant_id = ? ORDER BY ido DESC, id DESC LIMIT ?';
        const { results } = await db.prepare(q).bind(...(ugynok ? [tenantId, ugynok, limit] : [tenantId, limit])).all();
        return results.map(r => mapAnyag(r, false));
      },
      async get(id) {
        const r = await db.prepare('SELECT * FROM anyagok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first();
        return r ? mapAnyag(r, true) : null;
      },
      async markRead(id) {
        await db.prepare('UPDATE anyagok SET olvasott = 1 WHERE tenant_id = ? AND id = ?').bind(tenantId, id).run();
      },
      async setState(id, allapot) {
        await db.prepare('UPDATE anyagok SET allapot = ? WHERE tenant_id = ? AND id = ?').bind(allapot, tenantId, id).run();
      },
      async unreadCounts() {
        const { results } = await db.prepare('SELECT ugynok, COUNT(*) AS n FROM anyagok WHERE tenant_id = ? AND olvasott = 0 GROUP BY ugynok').bind(tenantId).all();
        return Object.fromEntries(results.map(r => [r.ugynok, r.n]));
      },
    },
    uzenetek: {
      async add(anyagId, szerep, szoveg) {
        const id = newId();
        await db.prepare('INSERT INTO uzenetek (id, tenant_id, anyag_id, szerep, szoveg, ido) VALUES (?, ?, ?, ?, ?, ?)').bind(id, tenantId, anyagId, szerep, szoveg, now().toISOString()).run();
        return id;
      },
      async list(anyagId) {
        const { results } = await db.prepare('SELECT * FROM uzenetek WHERE tenant_id = ? AND anyag_id = ? ORDER BY ido, id').bind(tenantId, anyagId).all();
        return results.map(r => ({ id: r.id, szerep: r.szerep, szoveg: r.szoveg, ido: r.ido }));
      },
    },
    utasitasok: {
      async add({ ugynok, szoveg, muvelet = null, allapot, valasz = null, anyag_id = null }) {
        const id = newId();
        await db.prepare('INSERT INTO utasitasok (id, tenant_id, ugynok, szoveg, muvelet_json, allapot, valasz, anyag_id, ido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, tenantId, ugynok, szoveg, muvelet ? JSON.stringify(muvelet) : null, allapot, valasz, anyag_id, now().toISOString()).run();
        return id;
      },
      async get(id) {
        const r = await db.prepare('SELECT * FROM utasitasok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first();
        return r ? mapUt(r) : null;
      },
      async list(ugynok, limit = 50) {
        const { results } = await db.prepare('SELECT * FROM utasitasok WHERE tenant_id = ? AND ugynok = ? ORDER BY ido DESC, id DESC LIMIT ?').bind(tenantId, ugynok, limit).all();
        return results.map(mapUt).reverse();
      },
      async resolve(id, { allapot, valasz = null, anyag_id = null, by }) {
        await db.prepare('UPDATE utasitasok SET allapot = ?, valasz = COALESCE(?, valasz), anyag_id = COALESCE(?, anyag_id), dontes_by = ?, dontes_ido = ? WHERE tenant_id = ? AND id = ?')
          .bind(allapot, valasz, anyag_id, by, now().toISOString(), tenantId, id).run();
      },
      async pendingCounts() {
        const { results } = await db.prepare("SELECT ugynok, COUNT(*) AS n FROM utasitasok WHERE tenant_id = ? AND allapot = 'javaslat' GROUP BY ugynok").bind(tenantId).all();
        return Object.fromEntries(results.map(r => [r.ugynok, r.n]));
      },
    },
    layout: {
      async get(email) {
        const r = await db.prepare('SELECT json FROM elrendezes WHERE email = ? AND tenant_id = ?').bind(email, tenantId).first();
        return r ? JSON.parse(r.json) : null;
      },
      async put(email, layout) {
        await db.prepare('INSERT INTO elrendezes (email, tenant_id, json) VALUES (?, ?, ?) ON CONFLICT (email, tenant_id) DO UPDATE SET json = excluded.json').bind(email, tenantId, JSON.stringify(layout)).run();
      },
    },
  };
}

// Hozzáférések: kit milyen szerepben engedünk be, melyik doménhez melyik ügyfél tartozik.
export function createAccessRepo({ db }) {
  return {
    async rolesFor(email) {
      const { results } = await db.prepare('SELECT tenant_id, szerep FROM felhasznalok WHERE email = ? ORDER BY tenant_id').bind(String(email).toLowerCase()).all();
      return results.map(r => ({ tenantId: r.tenant_id, szerep: r.szerep }));
    },
    async tenantForHost(host) {
      const r = await db.prepare('SELECT tenant_id FROM domenek WHERE host = ?').bind(String(host).toLowerCase()).first();
      return r ? r.tenant_id : null;
    },
    async grant(email, tenantId, szerep) {
      await db.prepare('INSERT INTO felhasznalok (email, tenant_id, szerep) VALUES (?, ?, ?) ON CONFLICT (email, tenant_id) DO UPDATE SET szerep = excluded.szerep').bind(String(email).toLowerCase(), tenantId, szerep).run();
    },
    async mapHost(host, tenantId) {
      await db.prepare('INSERT INTO domenek (host, tenant_id) VALUES (?, ?) ON CONFLICT (host) DO UPDATE SET tenant_id = excluded.tenant_id').bind(String(host).toLowerCase(), tenantId).run();
    },
  };
}
