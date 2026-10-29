// Az iroda API-ja és a felület kiszolgálása. A HTML oldal ennek csak egy kliense (később app is csatlakozhat).
import { identify } from './auth.js';
import { AGENTS, agentById, defaultLayout } from './catalogue.js';
import { getConfig } from '../core/config.js';
import { createLlm } from '../core/llm.js';
import { agentActive, checkLimits } from '../core/profile.js';
import { createD1Log, createD1Store, createD1ProfileRepo } from '../cloudflare/d1.js';
import { createDesk, createAccessRepo } from '../cloudflare/desk.js';
import { interpret, describeOperation, applyOperation, READ_ONLY } from '../agents/monitoring/instruct.js';
import { buildReport } from '../agents/monitoring/report.js';
import { answerQuestion } from '../agents/monitoring/qa.js';
import { computeTrends } from '../agents/monitoring/trend.js';
import { dayKey } from '../core/text.js';

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const SECURITY = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...SECURITY, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// Mit szerkeszthet az ügyfél (vezető), és mit csak az üzemeltető.
const VEZETO_EDITABLE = { megnevezes: true, kulcsszavak: true, forrasok: true, vorosvonalak: true, utemezes: ['szemle'] };
const UZEMELTETO_EXTRA = { vezeto: true, nyelv: true, trend: true, megorzes: true, ai_jelzes: true, utemezes: ['szemle', 'idozona'], megjelenes: true };

const cleanList = (a) => [...new Set((Array.isArray(a) ? a : []).map(x => String(x).trim()).filter(Boolean))];

export function applyProfileEdit(profile, patch, role) {
  const allowed = role === 'uzemelteto' ? { ...VEZETO_EDITABLE, ...UZEMELTETO_EXTRA } : VEZETO_EDITABLE;
  for (const key of Object.keys(patch)) {
    if (!allowed[key]) throw new HttpError(403, `Ezt a beállítást csak az üzemeltető módosíthatja: ${key}`);
  }
  const next = structuredClone(profile);
  if ('megnevezes' in patch) { next.megnevezes = String(patch.megnevezes).trim(); if (!next.megnevezes) throw new HttpError(400, 'A szervezet neve nem lehet üres'); }
  if (patch.kulcsszavak) for (const g of ['szervezet', 'szemelyek', 'temak', 'kizaro']) if (g in patch.kulcsszavak) next.kulcsszavak[g] = cleanList(patch.kulcsszavak[g]);
  if (patch.forrasok) {
    for (const g of ['rss', 'sajat']) if (g in patch.forrasok) next.forrasok[g] = (patch.forrasok[g] || []).map(s => ({ nev: String(s.nev || '').trim(), url: String(s.url || '').trim() })).filter(s => s.url);
    if ('hirkereso' in patch.forrasok) next.forrasok.hirkereso = cleanList(patch.forrasok.hirkereso);
  }
  if ('vorosvonalak' in patch) next.vorosvonalak = cleanList(patch.vorosvonalak);
  if (patch.utemezes) {
    for (const k of Object.keys(patch.utemezes)) if (!allowed.utemezes.includes(k)) throw new HttpError(403, `Ezt a beállítást csak az üzemeltető módosíthatja: utemezes.${k}`);
    if ('szemle' in patch.utemezes) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.utemezes.szemle)) throw new HttpError(400, 'A szemle időpontja ÓÓ:PP alakú legyen'); next.utemezes.szemle = patch.utemezes.szemle; }
    if ('idozona' in patch.utemezes) next.utemezes.idozona = String(patch.utemezes.idozona);
  }
  for (const k of ['vezeto', 'nyelv', 'trend', 'megorzes', 'megjelenes']) if (k in patch) next[k] = k === 'vezeto' ? { ...next.vezeto, ...patch.vezeto } : patch[k];
  if ('ai_jelzes' in patch) { next.ai_jelzes = String(patch.ai_jelzes).trim(); if (!next.ai_jelzes) throw new HttpError(400, 'Az AI-jelzés nem hagyható el'); }
  try { checkLimits(next); } catch (e) { throw new HttpError(400, e.message); }
  return next;
}

function csv(rows) {
  const cell = (v) => { let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return [['ido', 'szereplo', 'tipus', 'hivatkozas', 'tartalom'].map(cell).join(',')]
    .concat(rows.map(r => [r.ido, r.szereplo, r.tipus, r.hivatkozas, r.tartalom].map(cell).join(','))).join('\r\n');
}

export async function handleRequest(request, env, deps = {}) {
  try { return await route(request, env, deps); }
  catch (e) {
    if (e instanceof HttpError) return json({ hiba: e.message }, e.status);
    console.error(e);
    return json({ hiba: 'Belső hiba történt.' }, 500);
  }
}

async function route(request, env, deps) {
  const url = new URL(request.url);
  const now = deps.now || (() => new Date());
  const method = request.method;

  // Statikus felület (a belépést a Cloudflare Access védi; az API külön ellenőriz).
  if (method === 'GET' && !url.pathname.startsWith('/api/')) {
    const asset = deps.assets?.[url.pathname === '/' ? '/index.html' : url.pathname];
    if (!asset) return new Response('Nem található.', { status: 404, headers: SECURITY });
    return new Response(asset.body, { headers: { ...SECURITY, 'Content-Type': TYPES[asset.type], 'Cache-Control': 'no-cache' } });
  }
  if (!url.pathname.startsWith('/api/')) return json({ hiba: 'Nem található.' }, 404);

  // Belépés és jogosultság.
  const who = await identify(request, env, { fetchImpl: deps.accessFetch, nowMs: now().getTime() });
  if (!who.email) return json({ hiba: who.hiba }, who.status);
  const access = createAccessRepo({ db: env.DB });
  const roles = await access.rolesFor(who.email);
  if (!roles.length) return json({ hiba: 'Ehhez az irodához nincs hozzáférése.' }, 403);
  const hostTenant = await access.tenantForHost(url.host);
  const wanted = hostTenant || url.searchParams.get('ugyfel') || roles[0].tenantId;
  const grant = roles.find(r => r.tenantId === wanted);
  if (!grant) return json({ hiba: 'Ehhez az irodához nincs hozzáférése.' }, 403);
  const tenantId = grant.tenantId;
  const role = grant.szerep;

  // Módosító kérések védelme (CSRF): saját fejléc, azonos eredet, JSON tartalom.
  if (method !== 'GET') {
    if (request.headers.get('X-Requested-With') !== 'iroda') throw new HttpError(403, 'Érvénytelen kérés.');
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Érvénytelen kérés eredete.');
  }
  const body = async () => {
    if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw new HttpError(415, 'JSON tartalom szükséges.');
    try { return await request.json(); } catch { throw new HttpError(400, 'Hibás JSON.'); }
  };

  const config = getConfig(env);
  const profiles = createD1ProfileRepo({ db: env.DB, now });
  const log = createD1Log({ db: env.DB, tenantId, now });
  const store = createD1Store({ db: env.DB, tenantId });
  const desk = createDesk({ db: env.DB, tenantId, now });
  const current = await profiles.get(tenantId);
  if (!current) throw new HttpError(404, 'Az ügyfélprofil nem található.');
  const profile = current.profile;
  let llm;
  try { llm = createLlm({ mode: env.SAJTOIRODA_LLM === 'anthropic' ? 'anthropic' : 'mock', key: config.anthropicKey, models: config.models, ...(deps.llmFetch ? { fetchImpl: deps.llmFetch } : {}) }); }
  catch { llm = createLlm({ mode: 'mock' }); }
  const prompts = deps.prompts;
  const actor = `ember:${who.email}`;
  const p = url.pathname;
  let m;

  // ---- Iroda
  if (method === 'GET' && p === '/api/iroda') {
    const [unread, pending, layout] = await Promise.all([desk.anyagok.unreadCounts(), desk.utasitasok.pendingCounts(), desk.layout.get(who.email)]);
    const agents = [];
    for (const a of AGENTS) {
      const last = a.elerheto ? (await desk.anyagok.list({ ugynok: a.id, limit: 1 }))[0] : null;
      const aktiv = a.elerheto && agentActive(profile, a.id, now());
      agents.push({ id: a.id, nev: a.nev, munkanev: a.munkanev, szakasz: a.szakasz, elerheto: a.elerheto,
        allapot: !a.elerheto ? 'ures' : aktiv ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null,
        utolso: last ? { cim: last.cim, ido: last.ido } : null, olvasatlan: unread[a.id] || 0, jovahagyasra_var: pending[a.id] || 0 });
    }
    return json({ ugyfel: { id: tenantId, megnevezes: profile.megnevezes }, felhasznalo: { email: who.email, szerep: role },
      mod: { elo: config.live, ai: llm.mode }, ugynokok: agents, elrendezes: { ...defaultLayout(), ...(layout || {}) },
      ugyfelek: roles.map(r => r.tenantId) });
  }
  if (method === 'PUT' && p === '/api/iroda/elrendezes') {
    const b = await body();
    const out = {};
    for (const [id, pos] of Object.entries(b.pozicio || {})) {
      if (!agentById(id)) throw new HttpError(400, `Ismeretlen ügynök: ${id}`);
      const x = Number(pos.x), y = Number(pos.y);
      if (!(x >= 0 && x <= 5000 && y >= 0 && y <= 5000)) throw new HttpError(400, 'Érvénytelen pozíció.');
      out[id] = { x: Math.round(x), y: Math.round(y) };
    }
    await desk.layout.put(who.email, { ...((await desk.layout.get(who.email)) || {}), ...out });
    return json({ ok: true });
  }

  // ---- Egy ügynök asztala
  if (method === 'GET' && (m = p.match(/^\/api\/ugynok\/([a-z]+)$/))) {
    const a = agentById(m[1]);
    if (!a) throw new HttpError(404, 'Ismeretlen ügynök.');
    if (!a.elerheto) return json({ ugynok: a, allapot: 'ures', utasitasok: [], anyagok: [], munka: null });
    const articles = await store.load();
    const today = dayKey(now(), profile.utemezes.idozona);
    const todays = articles.filter(x => dayKey(x.published || x.fetchedAt, profile.utemezes.idozona) === today);
    const hangnem = { pozitiv: 0, negativ: 0, semleges: 0 };
    todays.forEach(x => { hangnem[x.cls.hangnem]++; });
    const trendek = computeTrends({ articles, profile, now: now() }).slice(0, 6);
    return json({
      ugynok: a, allapot: agentActive(profile, a.id, now()) ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null,
      utasitasok: await desk.utasitasok.list(a.id), anyagok: await desk.anyagok.list({ ugynok: a.id, limit: 30 }),
      munka: { ma: todays.length, hangnem, trendek, legutobbi: [...articles].sort((x, y) => String(y.published || y.fetchedAt).localeCompare(String(x.published || x.fetchedAt))).slice(0, 8).map(x => ({ cim: x.title, medium: x.medium, hangnem: x.cls.hangnem, url: x.url })) },
    });
  }
  if (method === 'PUT' && (m = p.match(/^\/api\/ugynok\/([a-z]+)\/allapot$/))) {
    const a = agentById(m[1]);
    if (!a?.elerheto) throw new HttpError(409, 'Ennél az asztalnál még nem ül senki.');
    const b = await body();
    const next = structuredClone(profile);
    next.ugynokok = { ...next.ugynokok, [a.id]: { ...next.ugynokok[a.id], aktiv: b.aktiv === true, szunet_ig: null } };
    await profiles.put(next, { by: actor });
    await log.append({ szereplo: actor, tipus: 'ugynok_ki_be_kapcsolas', hivatkozas: a.id, tartalom: { aktiv: b.aktiv === true } });
    return json({ ok: true, allapot: b.aktiv === true ? 'dolgozik' : 'szunetel' });
  }

  // ---- Utasítások: értelmezés → javaslat → jóváhagyás
  if (method === 'POST' && (m = p.match(/^\/api\/ugynok\/([a-z]+)\/utasitas$/))) {
    const a = agentById(m[1]);
    if (!a) throw new HttpError(404, 'Ismeretlen ügynök.');
    if (!a.elerheto) throw new HttpError(409, 'Ennél az asztalnál még nem ül senki.');
    const text = String((await body()).szoveg || '').trim();
    if (!text || text.length > 500) throw new HttpError(400, 'Az utasítás 1–500 karakter legyen.');
    await log.append({ szereplo: actor, tipus: 'utasitas', hivatkozas: a.id, tartalom: { szoveg: text } });
    let op;
    try { op = await interpret({ text, profile, llm, prompts, now: now() }); }
    catch (e) { op = { muvelet: 'ismeretlen', parameterek: {}, magyarazat: 'Az utasítást most nem tudtam értelmezni. Fogalmazd meg másképp, vagy próbáld újra.' }; }
    if (op.muvelet === 'ismeretlen') {
      const id = await desk.utasitasok.add({ ugynok: a.id, szoveg: text, allapot: 'visszakerdez', valasz: op.magyarazat });
      return json({ id, allapot: 'visszakerdez', valasz: op.magyarazat });
    }
    const leiras = describeOperation(op);
    if (READ_ONLY.has(op.muvelet)) {
      const report = await buildReport({ tema: op.parameterek.tema, napok: op.parameterek.napok, articles: await store.load(), profile, llm, prompts, now: now() });
      const anyagId = await desk.anyagok.add({ ugynok: a.id, tipus: 'jelentes', cim: report.cim, szoveg: report.text, html: report.html, meta: report.meta });
      const valasz = report.darab ? `Elkészült: ${report.cim} (${report.darab} cikk).` : `${report.cim}: ebben az időszakban nem találtam a tárolt cikkek között releváns cikket.`;
      const id = await desk.utasitasok.add({ ugynok: a.id, szoveg: text, muvelet: op, allapot: 'kesz', valasz, anyag_id: anyagId });
      await log.append({ szereplo: `ugynok:${a.id}`, tipus: 'javaslat', hivatkozas: id, tartalom: { muvelet: op, vegrehajtva: 'azonnal (olvasó művelet)' } });
      return json({ id, allapot: 'kesz', valasz, anyag_id: anyagId });
    }
    const id = await desk.utasitasok.add({ ugynok: a.id, szoveg: text, muvelet: op, allapot: 'javaslat', valasz: leiras });
    await log.append({ szereplo: `ugynok:${a.id}`, tipus: 'javaslat', hivatkozas: id, tartalom: { muvelet: op, leiras } });
    return json({ id, allapot: 'javaslat', valasz: leiras, muvelet: op });
  }
  if (method === 'POST' && (m = p.match(/^\/api\/utasitasok\/([^/]+)\/dontes$/))) {
    const u = await desk.utasitasok.get(decodeURIComponent(m[1]));
    if (!u) throw new HttpError(404, 'Nincs ilyen utasítás.');
    if (u.allapot !== 'javaslat') throw new HttpError(409, 'Erről a javaslatról már döntöttek.');
    const d = (await body()).dontes;
    if (!['jovahagyva', 'elvetve'].includes(d)) throw new HttpError(400, 'A döntés „jovahagyva” vagy „elvetve” lehet.');
    await log.append({ szereplo: actor, tipus: 'dontes', hivatkozas: u.id, dontes_ref: u.id, tartalom: { dontes: d, muvelet: u.muvelet } });
    if (d === 'elvetve') { await desk.utasitasok.resolve(u.id, { allapot: 'elvetve', by: actor }); return json({ allapot: 'elvetve' }); }
    try {
      await profiles.put(applyOperation(u.muvelet, profile), { by: actor });
      await desk.utasitasok.resolve(u.id, { allapot: 'vegrehajtva', valasz: 'Végrehajtva.', by: actor });
      return json({ allapot: 'vegrehajtva' });
    } catch (e) {
      await desk.utasitasok.resolve(u.id, { allapot: 'hiba', valasz: `Nem sikerült végrehajtani: ${e.message}`, by: actor });
      return json({ allapot: 'hiba', valasz: e.message });
    }
  }

  // ---- Anyagok és rákérdezés
  if (method === 'GET' && p === '/api/anyagok') return json({ anyagok: await desk.anyagok.list({ ugynok: url.searchParams.get('ugynok'), limit: 100 }) });
  if (method === 'GET' && (m = p.match(/^\/api\/anyagok\/([^/]+)$/))) {
    const anyag = await desk.anyagok.get(decodeURIComponent(m[1]));
    if (!anyag) throw new HttpError(404, 'Nincs ilyen anyag.');
    await desk.anyagok.markRead(anyag.id);
    return json({ anyag, uzenetek: await desk.uzenetek.list(anyag.id) });
  }
  if (method === 'POST' && (m = p.match(/^\/api\/anyagok\/([^/]+)\/kerdes$/))) {
    const anyag = await desk.anyagok.get(decodeURIComponent(m[1]));
    if (!anyag) throw new HttpError(404, 'Nincs ilyen anyag.');
    const q = String((await body()).szoveg || '').trim();
    if (!q || q.length > 500) throw new HttpError(400, 'A kérdés 1–500 karakter legyen.');
    await desk.uzenetek.add(anyag.id, 'vezeto', q);
    let answer;
    try { answer = await answerQuestion({ question: q, anyag, profile, llm, prompts }); }
    catch { answer = 'A kérdésre most nem tudtam válaszolni. Próbáld újra később.'; }
    await desk.uzenetek.add(anyag.id, 'ugynok', answer);
    await log.append({ szereplo: actor, tipus: 'kerdes', hivatkozas: anyag.id, tartalom: { kerdes: q } });
    return json({ uzenetek: await desk.uzenetek.list(anyag.id) });
  }
  if (method === 'GET' && p === '/api/jelentesek') return json({ anyagok: await desk.anyagok.list({ limit: 100 }) });

  // ---- Beállítások
  if (method === 'GET' && p === '/api/profil') {
    const { ugyfel_id, megnevezes, nyelv, vezeto, kulcsszavak, forrasok, vorosvonalak, utemezes, ai_jelzes } = profile;
    return json({ szerep: role, profil: { ugyfel_id, megnevezes, nyelv, vezeto, kulcsszavak, forrasok, vorosvonalak, utemezes, ai_jelzes }, szerkesztheto_vezeto: Object.keys(VEZETO_EDITABLE), verzio: current.version });
  }
  if (method === 'PUT' && p === '/api/profil') {
    const next = applyProfileEdit(profile, await body(), role);
    try { const saved = await profiles.put(next, { by: actor }); return json({ ok: true, verzio: saved.version }); }
    catch (e) { throw new HttpError(400, e.message); }
  }

  // ---- Napló
  if (method === 'GET' && (p === '/api/naplo' || p === '/api/naplo.csv')) {
    const rows = await log.recent({ tipus: url.searchParams.get('tipus'), limit: Number(url.searchParams.get('limit')) || 100 });
    if (p.endsWith('.csv')) return new Response(csv(rows), { headers: { ...SECURITY, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="naplo.csv"', 'Cache-Control': 'no-store' } });
    return json({ naplo: rows });
  }
  throw new HttpError(404, 'Nem található.');
}
