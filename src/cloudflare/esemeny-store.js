// Az Eseményszervező adatai (D1): események, sajtólista, meghívók. Minden lekérdezés a tenant_id-vel szűr.
let seq = 0;
const newId = (now) => `${now().toISOString()}-${String(++seq % 1000000).padStart(6, '0')}-${crypto.randomUUID().slice(0, 6)}`;
const parse = (j) => (j ? JSON.parse(j) : null);

export const EVENT_FORMATS = { sajtotajekoztato: 'Sajtótájékoztató', kerekasztal: 'Kerekasztal-beszélgetés', sajtoreggeli: 'Sajtóreggeli', uzemlatogatas: 'Üzemlátogatás', online: 'Online sajtóesemény' };
export const EVENT_STATES = ['koncepcio', 'szervezes', 'lezajlott', 'utomunka', 'lezarva', 'elvetve', 'elhalasztva'];
export const LIMITS = { contacts: 2000, invitesPerEvent: 200 };
export const RESPONSES = ['nincs', 'reszt_vesz', 'nem_vesz_reszt', 'bizonytalan'];
export class EventError extends Error { constructor(status, message) { super(message); this.status = status; } }
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

const mapEvent = (r) => ({ id: r.id, cim: r.cim, tema: r.tema, formatum: r.formatum, allapot: r.allapot, idopont: r.idopont, helyszin: r.helyszin, keret: r.keret, javaslat_id: r.javaslat_id,
  koncepcio_anyag_id: r.koncepcio_anyag_id, utomunka_anyag_id: r.utomunka_anyag_id, ellenorzolista: parse(r.ellenorzolista_json) || [], meghivo_targy: r.meghivo_targy, meghivo_szoveg: r.meghivo_szoveg,
  jovahagyva_by: r.jovahagyva_by, jovahagyva_ido: r.jovahagyva_ido, ido: r.ido });
const mapContact = (r) => ({ id: r.id, nev: r.nev, medium: r.medium, email: r.email, tema: r.tema, prioritas: r.prioritas, megjegyzes: r.megjegyzes, hozzajarulas: !!r.hozzajarulas });

export function createEventStore({ db, tenantId, now = () => new Date() }) {
  return {
    events: {
      async add({ cim, tema, formatum, idopont = null, helyszin = null, keret = null, javaslatId = null }) {
        const id = newId(now);
        await db.prepare("INSERT INTO esemenyek (id, tenant_id, cim, tema, formatum, allapot, idopont, helyszin, keret, javaslat_id, ido) VALUES (?, ?, ?, ?, ?, 'koncepcio', ?, ?, ?, ?, ?)")
          .bind(id, tenantId, cim, tema, formatum, idopont, helyszin, keret, javaslatId, now().toISOString()).run();
        return id;
      },
      async get(id) { const r = await db.prepare('SELECT * FROM esemenyek WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first(); return r ? mapEvent(r) : null; },
      async list({ allapot = null, limit = 100 } = {}) {
        const q = allapot ? 'SELECT * FROM esemenyek WHERE tenant_id = ? AND allapot = ? ORDER BY ido DESC, id DESC LIMIT ?' : 'SELECT * FROM esemenyek WHERE tenant_id = ? ORDER BY ido DESC, id DESC LIMIT ?';
        const { results } = await db.prepare(q).bind(...(allapot ? [tenantId, allapot, limit] : [tenantId, limit])).all();
        return results.map(mapEvent);
      },
      // Állapotváltás csak a megadott állapotok valamelyikéből (a feltételes frissítés a versenyhelyzetet is kizárja).
      async transition(id, from, to, extra = {}) {
        const cols = ['allapot = ?'], args = [to];
        for (const [k, v] of Object.entries(extra)) { cols.push(`${k} = ?`); args.push(v); }
        const r = await db.prepare(`UPDATE esemenyek SET ${cols.join(', ')} WHERE tenant_id = ? AND id = ? AND allapot IN (${from.map(() => '?').join(', ')})`).bind(...args, tenantId, id, ...from).run();
        return (r.meta?.changes ?? 0) > 0;
      },
      async set(id, fields) {
        const keys = Object.keys(fields);
        if (!keys.length) return;
        const col = (k) => (k === 'ellenorzolista' ? 'ellenorzolista_json' : k);
        await db.prepare(`UPDATE esemenyek SET ${keys.map(k => `${col(k)} = ?`).join(', ')} WHERE tenant_id = ? AND id = ?`).bind(...keys.map(k => (k === 'ellenorzolista' ? JSON.stringify(fields[k]) : fields[k])).map(v => v ?? null), tenantId, id).run();
      },
      async openCount() { return (await db.prepare("SELECT COUNT(*) AS n FROM esemenyek WHERE tenant_id = ? AND allapot = 'koncepcio'").bind(tenantId).first()).n; },
    },
    contacts: {
      async add({ nev, medium = '', email, tema = '', prioritas = 2, megjegyzes = '', hozzajarulas = false }) {
        const name = String(nev || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const mail = String(email || '').trim().toLowerCase().slice(0, 200);
        if (!name) throw new EventError(400, 'A név kötelező.');
        if (!EMAIL_RE.test(mail)) throw new EventError(400, `Érvénytelen e-mail-cím: ${mail || '(üres)'}`);
        const p = Math.round(Number(prioritas));
        if (![1, 2, 3].includes(p)) throw new EventError(400, 'A prioritás 1, 2 vagy 3 lehet.');
        if (await db.prepare('SELECT id FROM sajtolista WHERE tenant_id = ? AND email = ?').bind(tenantId, mail).first()) throw new EventError(409, `Ez a cím már szerepel a listán: ${mail}`);
        if ((await db.prepare('SELECT COUNT(*) AS n FROM sajtolista WHERE tenant_id = ?').bind(tenantId).first()).n >= LIMITS.contacts) throw new EventError(400, `A sajtólista megtelt (legfeljebb ${LIMITS.contacts} kapcsolat).`);
        const id = newId(now);
        await db.prepare('INSERT INTO sajtolista (id, tenant_id, nev, medium, email, tema, prioritas, megjegyzes, hozzajarulas, ido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, tenantId, name, String(medium).trim().slice(0, 120), mail, String(tema).trim().slice(0, 200), p, String(megjegyzes).trim().slice(0, 300), hozzajarulas ? 1 : 0, now().toISOString()).run();
        return id;
      },
      async list({ q = null, limit = 2000 } = {}) {
        const { results } = await db.prepare('SELECT * FROM sajtolista WHERE tenant_id = ? ORDER BY prioritas, nev LIMIT ?').bind(tenantId, limit).all();
        const rows = results.map(mapContact);
        if (!q) return rows;
        const needle = String(q).toLowerCase();
        return rows.filter(c => `${c.nev} ${c.medium} ${c.email} ${c.tema}`.toLowerCase().includes(needle));
      },
      async get(id) { const r = await db.prepare('SELECT * FROM sajtolista WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first(); return r ? mapContact(r) : null; },
      async getMany(ids) { const out = []; for (const id of ids) { const c = await this.get(id); if (c) out.push(c); } return out; },
      async findByEmail(email) { const r = await db.prepare('SELECT * FROM sajtolista WHERE tenant_id = ? AND email = ?').bind(tenantId, String(email).toLowerCase()).first(); return r ? mapContact(r) : null; },
      async remove(id) {
        await db.prepare('DELETE FROM meghivok WHERE tenant_id = ? AND kapcsolat_id = ?').bind(tenantId, id).run(); // a törölt kapcsolat meghívói is törlődnek
        const r = await db.prepare('DELETE FROM sajtolista WHERE tenant_id = ? AND id = ?').bind(tenantId, id).run();
        return (r.meta?.changes ?? 0) > 0;
      },
      async count() { return (await db.prepare('SELECT COUNT(*) AS n FROM sajtolista WHERE tenant_id = ?').bind(tenantId).first()).n; },
    },
    invites: {
      async add(eventId, contactId) {
        const id = newId(now);
        await db.prepare('INSERT OR IGNORE INTO meghivok (id, tenant_id, esemeny_id, kapcsolat_id, ido) VALUES (?, ?, ?, ?, ?)').bind(id, tenantId, eventId, contactId, now().toISOString()).run();
        return id;
      },
      async list(eventId) {
        const { results } = await db.prepare('SELECT m.*, s.nev, s.email, s.medium, s.prioritas FROM meghivok m LEFT JOIN sajtolista s ON s.id = m.kapcsolat_id AND s.tenant_id = m.tenant_id WHERE m.tenant_id = ? AND m.esemeny_id = ? ORDER BY s.prioritas, s.nev').bind(tenantId, eventId).all();
        return results.map(r => ({ id: r.id, kapcsolat_id: r.kapcsolat_id, nev: r.nev, email: r.email, medium: r.medium, prioritas: r.prioritas, allapot: r.allapot, valasz: r.valasz, valasz_javaslat: r.valasz_javaslat, level_id: r.level_id, kuldve: r.kuldve }));
      },
      async get(id) { const r = await db.prepare('SELECT * FROM meghivok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first(); return r || null; },
      async count(eventId) { return (await db.prepare('SELECT COUNT(*) AS n FROM meghivok WHERE tenant_id = ? AND esemeny_id = ?').bind(tenantId, eventId).first()).n; },
      async countCreatedSince(iso) { return (await db.prepare('SELECT COUNT(*) AS n FROM meghivok WHERE tenant_id = ? AND ido >= ?').bind(tenantId, iso).first()).n; },
      // Elküldöttnek jelöl, csak ha még tervezet (kétszer nem megy ki ugyanaz).
      async markSent(id) { const r = await db.prepare("UPDATE meghivok SET allapot = 'elkuldve', kuldve = ? WHERE tenant_id = ? AND id = ? AND allapot = 'tervezet'").bind(now().toISOString(), tenantId, id).run(); return (r.meta?.changes ?? 0) > 0; },
      async setResponse(id, valasz) { await db.prepare('UPDATE meghivok SET valasz = ? WHERE tenant_id = ? AND id = ?').bind(valasz, tenantId, id).run(); },
      async setSuggestion(id, javaslat, levelId) { await db.prepare('UPDATE meghivok SET valasz_javaslat = ?, level_id = ? WHERE tenant_id = ? AND id = ?').bind(javaslat, levelId, tenantId, id).run(); },
      async remove(id) { const r = await db.prepare("DELETE FROM meghivok WHERE tenant_id = ? AND id = ? AND allapot = 'tervezet'").bind(tenantId, id).run(); return (r.meta?.changes ?? 0) > 0; },
      // Egy címhez tartozó, még nyitott eseményekhez kötött meghívók (a beérkező levél párosításához).
      async openForEmail(email) {
        const { results } = await db.prepare("SELECT m.id, m.esemeny_id FROM meghivok m JOIN sajtolista s ON s.id = m.kapcsolat_id AND s.tenant_id = m.tenant_id JOIN esemenyek e ON e.id = m.esemeny_id AND e.tenant_id = m.tenant_id WHERE m.tenant_id = ? AND s.email = ? AND m.allapot = 'elkuldve' AND e.allapot IN ('szervezes', 'lezajlott')").bind(tenantId, String(email).toLowerCase()).all();
        return results;
      },
    },
  };
}
