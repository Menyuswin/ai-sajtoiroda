// Életjel és forrásállapot (D1). Minden lekérdezés a tenant_id-vel szűr.
export const STALE_MIN = 180; // ennyi perc csend után „késik”
export const PROBE_COOLDOWN_S = 60;

export function createStatusStore({ db, tenantId, now = () => new Date() }) {
  return {
    async recordRun({ kezdet, vege, siker, idotartamMs = null, kulsoKeres = null, cikkLekert = null, cikkUj = null, hiba = null }) {
      await db.prepare('INSERT INTO futas_allapot (tenant_id, kezdet, vege, siker, idotartam_ms, kulso_keres, cikk_lekert, cikk_uj, hiba) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tenant_id) DO UPDATE SET kezdet = excluded.kezdet, vege = excluded.vege, siker = excluded.siker, idotartam_ms = excluded.idotartam_ms, kulso_keres = excluded.kulso_keres, cikk_lekert = excluded.cikk_lekert, cikk_uj = excluded.cikk_uj, hiba = excluded.hiba')
        .bind(tenantId, kezdet, vege, siker ? 1 : 0, idotartamMs, kulsoKeres, cikkLekert, cikkUj, hiba ? String(hiba).slice(0, 300) : null).run();
    },
    // A jelentés (`report`) a gyűjtés minden forrásáról szól; a nem szereplő (már kivett) források törlődnek.
    async recordSources(report) {
      const stamp = now().toISOString();
      const { results } = await db.prepare('SELECT url, utolso_siker_ido FROM forras_allapot WHERE tenant_id = ?').bind(tenantId).all();
      const lastOk = new Map(results.map(r => [r.url, r.utolso_siker_ido]));
      const stmts = [db.prepare('DELETE FROM forras_allapot WHERE tenant_id = ?').bind(tenantId)];
      for (const r of report) {
        stmts.push(db.prepare('INSERT INTO forras_allapot (tenant_id, url, nev, tipus, utolso_ido, utolso_siker_ido, cikkek, hiba) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(tenantId, r.url, String(r.nev).slice(0, 200), r.tipus, stamp, r.ok ? stamp : (lastOk.get(r.url) ?? null), r.ok ? r.db : null, r.ok ? null : String(r.hiba).slice(0, 300)));
      }
      await db.batch(stmts);
    },
    async get() {
      const futas = await db.prepare('SELECT * FROM futas_allapot WHERE tenant_id = ?').bind(tenantId).first();
      const { results } = await db.prepare('SELECT * FROM forras_allapot WHERE tenant_id = ? ORDER BY tipus, nev').bind(tenantId).all();
      return { futas: futas || null, forrasok: results };
    },
    async probeAllowed() {
      const r = await db.prepare('SELECT proba_ido FROM futas_allapot WHERE tenant_id = ?').bind(tenantId).first();
      return !r?.proba_ido || now().getTime() - Date.parse(r.proba_ido) >= PROBE_COOLDOWN_S * 1000;
    },
    async markProbe() {
      // Ha még nem volt futás, üres „vege” jelzi, hogy a sor csak a próba idejét őrzi.
      await db.prepare("INSERT INTO futas_allapot (tenant_id, kezdet, vege, siker, proba_ido) VALUES (?, '', '', 1, ?) ON CONFLICT (tenant_id) DO UPDATE SET proba_ido = excluded.proba_ido").bind(tenantId, now().toISOString()).run();
    },
  };
}

// Az életjel jelzése a felületnek: nincs | rendben | hiba | kesik
export function runBadge(futas, nowMs) {
  if (!futas || !futas.vege) return { allapot: 'nincs' };
  const kor = Math.max(0, Math.round((nowMs - Date.parse(futas.vege)) / 60000));
  const allapot = !futas.siker ? 'hiba' : kor > STALE_MIN ? 'kesik' : 'rendben';
  return { allapot, kor_perc: kor, utolso: futas.vege, idotartam_ms: futas.idotartam_ms, kulso_keres: futas.kulso_keres, cikk_lekert: futas.cikk_lekert, cikk_uj: futas.cikk_uj, hiba: futas.hiba };
}

// Az egész rendszer egészsége (az ügyfelek nevei nélkül): ok | kesik | indul
export async function systemHealth(db, nowMs) {
  const { results } = await db.prepare('SELECT vege, siker FROM futas_allapot WHERE vege <> \'\'').all();
  if (!results.length) return { allapot: 'indul', kor_perc: null };
  const kor = Math.max(...results.map(r => Math.max(0, Math.round((nowMs - Date.parse(r.vege)) / 60000))));
  const baj = results.some(r => !r.siker);
  return { allapot: baj || kor > STALE_MIN ? 'kesik' : 'ok', kor_perc: kor };
}
