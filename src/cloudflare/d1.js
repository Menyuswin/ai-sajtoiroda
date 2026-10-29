// Cloudflare D1 illesztők: ugyanazok az interfészek, mint a fájlalapúaké (log, store, mailer),
// plusz a profiltár. A `db` a D1 köttés (env.DB); tesztben egy node:sqlite-alapú, D1-kompatibilis helyettesítő.
import { EVENT_TYPES } from '../core/log.js';
import { validateProfile } from '../core/profile.js';

const LOG_FILTER_COLUMNS = new Set(['tipus', 'hivatkozas', 'szereplo', 'dontes_ref']);
const rand = () => crypto.randomUUID().slice(0, 8);

export function createD1Log({ db, tenantId, now = () => new Date() }) {
  return {
    async append({ szereplo, tipus, hivatkozas = null, tartalom = null, dontes_ref = null }) {
      if (!EVENT_TYPES.has(tipus)) throw new Error(`Ismeretlen naplótípus: ${tipus}`);
      const ido = now().toISOString();
      const entry = { id: `${ido}-${rand()}`, ido, tenant_id: tenantId, szereplo, tipus, hivatkozas, tartalom, dontes_ref };
      await db.prepare('INSERT INTO naplo (id, tenant_id, ido, szereplo, tipus, hivatkozas, tartalom_json, dontes_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(entry.id, tenantId, ido, szereplo, tipus, hivatkozas, tartalom == null ? null : JSON.stringify(tartalom), dontes_ref).run();
      return entry;
    },
    async query(filter = {}) {
      const keys = Object.keys(filter);
      for (const k of keys) if (!LOG_FILTER_COLUMNS.has(k)) throw new Error(`Nem szűrhető naplómező: ${k}`);
      const where = ['tenant_id = ?', ...keys.map(k => `${k} = ?`)].join(' AND ');
      const { results } = await db.prepare(`SELECT * FROM naplo WHERE ${where} ORDER BY ido, id`).bind(tenantId, ...keys.map(k => filter[k])).all();
      return results.map(r => ({ id: r.id, ido: r.ido, tenant_id: r.tenant_id, szereplo: r.szereplo, tipus: r.tipus, hivatkozas: r.hivatkozas, tartalom: r.tartalom_json ? JSON.parse(r.tartalom_json) : null, dontes_ref: r.dontes_ref }));
    },
  };
}

export function createD1Store({ db, tenantId }) {
  return {
    async load() {
      const { results } = await db.prepare('SELECT data_json FROM articles WHERE tenant_id = ? ORDER BY fetched_at, id').bind(tenantId).all();
      return results.map(r => JSON.parse(r.data_json));
    },
    async save(articles) {
      const stmt = db.prepare('INSERT INTO articles (tenant_id, id, data_json, fetched_at, reported_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant_id, id) DO UPDATE SET data_json = excluded.data_json, reported_at = excluded.reported_at');
      if (articles.length) await db.batch(articles.map(a => stmt.bind(tenantId, a.id, JSON.stringify(a), a.fetchedAt, a.reportedAt || null)));
    },
    // Megőrzési idő: a nyers cikkadat törlése (a napló marad).
    async purgeOlderThan(isoDate) {
      await db.prepare('DELETE FROM articles WHERE tenant_id = ? AND fetched_at < ?').bind(tenantId, isoDate).run();
    },
  };
}

export function createD1DryMailer({ db, now = () => new Date() }) {
  return {
    name: 'd1-proba',
    async send(msg) {
      const ido = now().toISOString();
      const id = `${ido}-${rand()}`;
      await db.prepare('INSERT INTO proba_levelek (id, tenant_id, ido, kind, cimzett, targy, szoveg, html) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, msg.tenantId, ido, msg.kind, msg.to, msg.subject, msg.text, msg.html).run();
      return { id, delivered: false };
    },
  };
}

// Profiltár. A módosítás verziót emel és naplózódik (profil_modositas) – a kezelőfelület is ezen keresztül ír majd.
export function createD1ProfileRepo({ db, now = () => new Date() }) {
  return {
    async get(tenantId) {
      const r = await db.prepare('SELECT profile_json, version, updated_at FROM profiles WHERE tenant_id = ?').bind(tenantId).first();
      return r ? { profile: validateProfile(JSON.parse(r.profile_json)), version: r.version, updated_at: r.updated_at } : null;
    },
    async list() {
      const { results } = await db.prepare('SELECT profile_json FROM profiles ORDER BY tenant_id').all();
      return results.map(r => validateProfile(JSON.parse(r.profile_json)));
    },
    // A beírt profil mindig ellenőrzésen megy át; érvénytelen profil nem kerülhet a tárba.
    async put(rawProfile, { by }) {
      const profile = validateProfile(rawProfile);
      const prev = await this.get(profile.ugyfel_id);
      const ido = now().toISOString();
      const version = (prev?.version || 0) + 1;
      await db.prepare('INSERT INTO profiles (tenant_id, profile_json, version, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (tenant_id) DO UPDATE SET profile_json = excluded.profile_json, version = excluded.version, updated_at = excluded.updated_at')
        .bind(profile.ugyfel_id, JSON.stringify(profile), version, ido).run();
      const changed = prev ? Object.keys(profile).filter(k => JSON.stringify(profile[k]) !== JSON.stringify(prev.profile[k])) : ['(új profil)'];
      await createD1Log({ db, tenantId: profile.ugyfel_id, now }).append({
        szereplo: by, tipus: 'profil_modositas', tartalom: { version, valtozott: changed, vezeto_email_valtozott: !!prev && prev.profile.vezeto.email !== profile.vezeto.email },
      });
      return { profile, version };
    },
  };
}

// SQL-utasítás a profil beírásához (wrangler d1 execute-hoz) – az első feltöltéshez.
export function profileToSql(rawProfile, now = new Date()) {
  const p = validateProfile(rawProfile);
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  return `INSERT OR REPLACE INTO profiles (tenant_id, profile_json, version, updated_at) VALUES (${q(p.ugyfel_id)}, ${q(JSON.stringify(p))}, 1, ${q(now.toISOString())});`;
}
