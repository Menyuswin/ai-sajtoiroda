// A dokumentumtár: feltöltés, lista, keresés, törlés (D1 + R2). Minden lekérdezés a tenant_id-vel szűr.
import { extractDocument, DocError, DOC_LIMITS, extensionOf } from './extract.js';
import { norm } from '../core/text.js';

export const CATEGORIES = { nyilatkozat: 'Korábbi nyilatkozat', iranyelv: 'Belső irányelv', hatter: 'Háttéranyag', sajtoanyag: 'Sajtóanyag', kerdes_valasz: 'Kérdés-válasz', egyeb: 'Egyéb' };
let seq = 0;
const newId = (now) => `${now().toISOString()}-${String(++seq % 1000000).padStart(6, '0')}-${crypto.randomUUID().slice(0, 6)}`;
const safeName = (n) => String(n).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 120) || 'dokumentum';

const mapDoc = (r) => ({ id: r.id, cim: r.cim, kategoria: r.kategoria, fajlnev: r.fajlnev, tipus: r.tipus, meret: r.meret, karakterek: r.karakterek, szakaszok: r.szakaszok,
  hatokor: r.hatokor_json ? JSON.parse(r.hatokor_json) : null, ai_tiltott: !!r.ai_tiltott, eredeti: !!r.eredeti_kulcs, feltolto: r.feltolto, ido: r.ido });

// A keresőkifejezésből ragozás-tűrő FTS-lekérdezés: a hosszabb szavak végét levágjuk, és előtagra keresünk.
export function ftsQuery(text) {
  const words = [...new Set(norm(text).split(/[^a-z0-9]+/).filter(w => w.length >= 3))];
  const stop = new Set(['mit', 'mi', 'hogy', 'volt', 'van', 'azt', 'egy', 'meg', 'nem', 'vagy', 'jelent', 'mond', 'irt', 'irtak', 'szerint', 'milyen', 'amit', 'aki', 'ami', 'ezt', 'ezek', 'azok', 'miert', 'hogyan']);
  // 7+ betű: a ragozást a vég levágásával fogjuk meg; 5–6 betű: az utolsó betű; 3–4 betű: pontos szó (különben túl sok zaj).
  return words.filter(w => !stop.has(w)).map(w => (w.length >= 7 ? `"${w.slice(0, w.length - 3)}"*` : w.length >= 5 ? `"${w.slice(0, w.length - 1)}"*` : `"${w}"`)).join(' OR ');
}

export function createDocs({ db, bucket = null, tenantId, now = () => new Date() }) {
  const inScope = (d, agent) => !agent || d.hatokor === null || d.hatokor.includes(agent);
  const api = {
    hasOriginals: !!bucket,

    async usage() {
      const r = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(meret), 0) AS b FROM dokumentumok WHERE tenant_id = ?').bind(tenantId).first();
      return { darab: r.n, bajt: r.b, korlat: { darab: DOC_LIMITS.count, bajt: DOC_LIMITS.tenantBytes, fajl: DOC_LIMITS.fileBytes } };
    },

    async add({ bytes, fajlnev, cim, kategoria = 'egyeb', hatokor = null, aiTiltott = false, by }) {
      if (!CATEGORIES[kategoria]) throw new DocError('Ismeretlen kategória.');
      const u = await api.usage();
      if (u.darab >= DOC_LIMITS.count) throw new DocError(`A dokumentumtár megtelt (legfeljebb ${DOC_LIMITS.count} dokumentum).`);
      if (u.bajt + bytes.length > DOC_LIMITS.tenantBytes) throw new DocError(`A dokumentumtár tárhelykerete (${DOC_LIMITS.tenantBytes / 1024 / 1024} MB) betelne.`);
      const ex = await extractDocument(bytes, fajlnev); // hibás vagy nem támogatott fájlnál DocError
      const id = newId(now);
      const key = bucket ? `${tenantId}/${id}/${safeName(fajlnev)}` : null;
      const title = String(cim || '').trim().slice(0, 200) || fajlnev.replace(/\.[^.]+$/, '');
      const scope = Array.isArray(hatokor) && hatokor.length ? JSON.stringify([...new Set(hatokor.map(String))]) : null;
      const stmts = [db.prepare('INSERT INTO dokumentumok (id, tenant_id, cim, kategoria, fajlnev, tipus, meret, karakterek, szakaszok, hatokor_json, ai_tiltott, eredeti_kulcs, feltolto, ido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, tenantId, title, kategoria, String(fajlnev).slice(0, 200), ex.tipus, bytes.length, ex.karakterek, ex.szakaszok.length, scope, aiTiltott ? 1 : 0, key, by, now().toISOString())];
      for (const s of ex.szakaszok) {
        const sid = `${id}#${s.sorszam}`;
        stmts.push(db.prepare('INSERT INTO doksi_szakaszok (id, tenant_id, dokumentum_id, sorszam, cim, szoveg) VALUES (?, ?, ?, ?, ?, ?)').bind(sid, tenantId, id, s.sorszam, s.cim, s.szoveg));
        stmts.push(db.prepare('INSERT INTO doksi_kereso (szoveg, cim, tenant_id, dokumentum_id, szakasz_id) VALUES (?, ?, ?, ?, ?)').bind(s.szoveg, `${title} ${s.cim}`, tenantId, id, sid));
      }
      await db.batch(stmts);
      if (bucket) {
        try { await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/octet-stream' } }); }
        catch (e) { await api.remove(id, { silent: true }); throw new DocError('Az eredeti fájl mentése nem sikerült, a feltöltést visszavontuk. Próbálja újra.'); }
      }
      return mapDoc(await db.prepare('SELECT * FROM dokumentumok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first());
    },

    async list({ kategoria = null } = {}) {
      const q = kategoria ? 'SELECT * FROM dokumentumok WHERE tenant_id = ? AND kategoria = ? ORDER BY ido DESC, id DESC' : 'SELECT * FROM dokumentumok WHERE tenant_id = ? ORDER BY ido DESC, id DESC';
      const { results } = await db.prepare(q).bind(...(kategoria ? [tenantId, kategoria] : [tenantId])).all();
      return results.map(mapDoc);
    },

    async get(id) {
      const r = await db.prepare('SELECT * FROM dokumentumok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first();
      if (!r) return null;
      const { results } = await db.prepare('SELECT sorszam, cim, szoveg FROM doksi_szakaszok WHERE tenant_id = ? AND dokumentum_id = ? ORDER BY sorszam').bind(tenantId, id).all();
      return { ...mapDoc(r), szakaszLista: results.map(s => ({ sorszam: s.sorszam, cim: s.cim, szoveg: s.szoveg })) };
    },

    async update(id, { cim, kategoria, hatokor, aiTiltott }) {
      const cur = await db.prepare('SELECT * FROM dokumentumok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first();
      if (!cur) return null;
      if (kategoria !== undefined && !CATEGORIES[kategoria]) throw new DocError('Ismeretlen kategória.');
      const scope = hatokor === undefined ? cur.hatokor_json : (Array.isArray(hatokor) && hatokor.length ? JSON.stringify([...new Set(hatokor.map(String))]) : null);
      await db.prepare('UPDATE dokumentumok SET cim = ?, kategoria = ?, hatokor_json = ?, ai_tiltott = ? WHERE tenant_id = ? AND id = ?')
        .bind(cim === undefined ? cur.cim : String(cim).trim().slice(0, 200) || cur.cim, kategoria ?? cur.kategoria, scope, aiTiltott === undefined ? cur.ai_tiltott : aiTiltott ? 1 : 0, tenantId, id).run();
      return mapDoc(await db.prepare('SELECT * FROM dokumentumok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first());
    },

    // A törlés mindent töröl: az eredeti fájlt, a szakaszokat és a keresési indexet is.
    async remove(id) {
      const cur = await db.prepare('SELECT eredeti_kulcs FROM dokumentumok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first();
      if (!cur) return false;
      await db.batch([
        db.prepare('DELETE FROM doksi_kereso WHERE tenant_id = ? AND dokumentum_id = ?').bind(tenantId, id),
        db.prepare('DELETE FROM doksi_szakaszok WHERE tenant_id = ? AND dokumentum_id = ?').bind(tenantId, id),
        db.prepare('DELETE FROM dokumentumok WHERE tenant_id = ? AND id = ?').bind(tenantId, id),
      ]);
      if (bucket && cur.eredeti_kulcs) await bucket.delete(cur.eredeti_kulcs);
      return true;
    },

    async original(id) {
      const r = await db.prepare('SELECT fajlnev, eredeti_kulcs FROM dokumentumok WHERE tenant_id = ? AND id = ?').bind(tenantId, id).first();
      if (!r || !r.eredeti_kulcs || !bucket) return null;
      const obj = await bucket.get(r.eredeti_kulcs);
      return obj ? { fajlnev: r.fajlnev, bytes: new Uint8Array(await obj.arrayBuffer()) } : null;
    },

    // Keresés. `agent`: csak az ennek a munkatársnak engedélyezett dokumentumok; `forAI`: az AI-nak tiltottak kizárva.
    // Visszaadja a találatokat és azt is, hány találatot zártunk ki az AI-jelölés miatt.
    async search(text, { agent = null, forAI = false, limit = 6 } = {}) {
      const q = ftsQuery(text);
      if (!q) return { talalatok: [], kizart_ai: 0 };
      const { results } = await db.prepare(`SELECT szakasz_id AS sid, dokumentum_id AS did, bm25(doksi_kereso) AS rang FROM doksi_kereso WHERE doksi_kereso MATCH ? AND tenant_id = ? ORDER BY rang LIMIT 60`).bind(q, tenantId).all();
      const docs = new Map();
      const out = []; let kizart = 0;
      for (const r of results) {
        if (!docs.has(r.did)) { const d = await db.prepare('SELECT * FROM dokumentumok WHERE tenant_id = ? AND id = ?').bind(tenantId, r.did).first(); docs.set(r.did, d ? mapDoc(d) : null); }
        const d = docs.get(r.did);
        if (!d || !inScope(d, agent)) continue;
        if (forAI && d.ai_tiltott) { kizart++; continue; }
        if (out.length >= limit) continue;
        const s = await db.prepare('SELECT sorszam, cim, szoveg FROM doksi_szakaszok WHERE tenant_id = ? AND id = ?').bind(tenantId, r.sid).first();
        if (s) out.push({ dokumentum_id: d.id, dokumentum_cim: d.cim, kategoria: d.kategoria, sorszam: s.sorszam, szakasz_cim: s.cim, szoveg: s.szoveg });
      }
      return { talalatok: out, kizart_ai: kizart };
    },

    // Szakaszok egy munkatárs számára (pl. kulcsszójavaslathoz): a hatókör és az AI-jelölés szerint szűrve.
    async sectionsFor({ agent, forAI, limit = 40 }) {
      const { results } = await db.prepare('SELECT s.dokumentum_id AS did, s.sorszam, s.cim, s.szoveg FROM doksi_szakaszok s WHERE s.tenant_id = ? ORDER BY s.dokumentum_id, s.sorszam').bind(tenantId).all();
      const docs = new Map((await api.list()).map(d => [d.id, d]));
      const out = []; let kizart = 0;
      for (const r of results) {
        const d = docs.get(r.did);
        if (!d || !inScope(d, agent)) continue;
        if (forAI && d.ai_tiltott) { kizart++; continue; }
        if (out.length < limit) out.push({ dokumentum_id: d.id, dokumentum_cim: d.cim, sorszam: r.sorszam, szakasz_cim: r.cim, szoveg: r.szoveg });
      }
      return { szakaszok: out, kizart_ai: kizart };
    },
  };
  return api;
}
export { DocError, extensionOf };
