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
import { createDocs, CATEGORIES } from '../docs/store.js';
import { DocError, DOC_LIMITS } from '../docs/extract.js';
import { answerFromDocs, suggestKeywords } from '../docs/answer.js';
import { dayKey } from '../core/text.js';
import { buildLetterCtx } from '../cloudflare/agentctx.js';
import { ingest, processLetter, decideLetter, run as runMailAgent } from '../agents/kapcsolattarto/index.js';
import { buildDraft } from '../agents/kapcsolattarto/draft.js';
import { isBridged, createMailbox } from '../mail/providers.js';
import { MAIL_LIMITS } from '../mail/message.js';
import { createPackage, AgentError, DAILY_LIMIT as PACKAGE_LIMIT } from '../agents/felkeszito/index.js';
import { OCCASIONS } from '../agents/felkeszito/package.js';
import { createProposal, decideProposal, DAILY_LIMIT as PROPOSAL_LIMIT } from '../agents/proaktiv/index.js';
import { CalendarError, CAL_TYPES } from '../cloudflare/proaktiv-store.js';
import { startOfDayIso } from '../agents/common/sources.js';
import { searchAll, timeline, ArchiveError, ARCHIVE_KINDS, CHECK_LIMIT } from '../agents/archivum/index.js';
import { ARCHIVE_LIMIT, MAX_STATEMENT } from '../cloudflare/archivum-store.js';
import { createOpinion, DAILY_LIMIT as OPINION_LIMIT, MAX_TEXT as OPINION_MAX } from '../agents/jogi/index.js';
import { CATEGORIES as RISK_CATEGORIES, KINDS as RISK_KINDS, LEVELS as RISK_LEVELS } from '../agents/jogi/analysis.js';
import { createEvent, decideEvent, inviteCandidates, addInvites, sendInvites, setInviteResponse, createPostWork, importContacts, EventError, LIMITS_DAILY as EVENT_DAILY } from '../agents/esemenyszervezo/index.js';
import { EVENT_FORMATS, LIMITS as EVENT_LIMITS, RESPONSES } from '../cloudflare/esemeny-store.js';
import { createPost, decidePost, recordPublished, addSignal, DAILY_LIMIT as POST_LIMIT, SIGNAL_LIMIT_DAY } from '../agents/kozossegi/index.js';
import { PLATFORM_LIMITS } from '../agents/kozossegi/rules.js';
import { SocialError, POST_STATES, MOODS, REACH } from '../cloudflare/kozossegi-store.js';
import { sessionLogin, passphraseUsable, passphraseOk, issueSession, setCookie, clearCookie, createThrottle } from './session.js';
import { validateMailbox, normalizeSocial, SOCIAL_PLATFORMS, SOURCE_PLATFORMS } from '../core/profile.js';

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const SECURITY = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' };
const fromBase64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...SECURITY, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// Mit szerkeszthet az ügyfél (vezető), és mit csak az üzemeltető.
const VEZETO_EDITABLE = { megnevezes: true, kulcsszavak: true, forrasok: true, vorosvonalak: true, utemezes: ['szemle'], kapcsolattarto: true, proaktiv: true, kozossegi: true };
const UZEMELTETO_EXTRA = { vezeto: true, nyelv: true, trend: true, megorzes: true, ai_jelzes: true, utemezes: ['szemle', 'idozona'], megjelenes: true, postafiok: true };

// Az ügynökök bizalmas anyagait (levéltervezet, csomag, javaslat, koncepció, jogi vélemény) csak a vezető olvashatja.
const SENSITIVE_TYPES = new Set(['valasz_tervezet', 'felkeszito_csomag', 'megszolalasi_javaslat', 'esemeny_koncepcio', 'esemeny_utomunka', 'jogi_velemeny', 'poszt_javaslat']);
const worstLevel = (list) => list.reduce((w, o) => (RISK_LEVELS.indexOf(o.besorolas) > RISK_LEVELS.indexOf(w) ? o.besorolas : w), 'alacsony');

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
    if ('kozossegi' in patch.forrasok) next.forrasok.kozossegi = (Array.isArray(patch.forrasok.kozossegi) ? patch.forrasok.kozossegi : []).map(s => ({ nev: String(s.nev || '').trim(), url: String(s.url || '').trim(), platform: String(s.platform || 'egyeb') })).filter(s => s.url);
  }
  if ('vorosvonalak' in patch) next.vorosvonalak = cleanList(patch.vorosvonalak);
  if (patch.utemezes) {
    for (const k of Object.keys(patch.utemezes)) if (!allowed.utemezes.includes(k)) throw new HttpError(403, `Ezt a beállítást csak az üzemeltető módosíthatja: utemezes.${k}`);
    if ('szemle' in patch.utemezes) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.utemezes.szemle)) throw new HttpError(400, 'A szemle időpontja ÓÓ:PP alakú legyen'); next.utemezes.szemle = patch.utemezes.szemle; }
    if ('idozona' in patch.utemezes) next.utemezes.idozona = String(patch.utemezes.idozona);
  }
  if (patch.kapcsolattarto) {
    for (const k of ['alairas', 'hangnem']) if (k in patch.kapcsolattarto) next.kapcsolattarto = { ...next.kapcsolattarto, [k]: String(patch.kapcsolattarto[k] ?? '').trim().slice(0, k === 'alairas' ? 400 : 300) };
  }
  if (patch.kozossegi) next.kozossegi = normalizeSocial({ ...next.kozossegi, ...patch.kozossegi });
  if (patch.proaktiv && 'szabalyok' in patch.proaktiv) next.proaktiv = { ...next.proaktiv, szabalyok: String(patch.proaktiv.szabalyok ?? '').trim().slice(0, 600) };
  if ('postafiok' in patch) {
    if (patch.postafiok === null) delete next.postafiok;
    else { try { next.postafiok = validateMailbox(patch.postafiok); } catch (e) { throw new HttpError(400, e.message.replace(/^Érvénytelen ügyfélprofil:\n- /, '')); } }
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

// A postafiók állapota a felületnek. Titkot sosem ad vissza; csak azt, hogy be van-e állítva.
async function mailboxStatus(lctx, env, profile) {
  const cfg = profile.postafiok || null;
  const st = await lctx.levelek.mailboxState();
  const mod = !cfg || cfg.szolgaltato === 'proba' ? 'kezi' : isBridged(cfg) ? 'hid' : 'lekerdezes';
  return { beallitva: !!cfg, szolgaltato: cfg?.szolgaltato || null, cim: cfg?.cim || null, mappa: cfg?.mappa || null, mod,
    titok_megvan: cfg?.titok ? typeof env[cfg.titok] === 'string' && env[cfg.titok].length > 0 : cfg?.szolgaltato === 'proba',
    utolso_siker: st.utolso_siker, utolso_hiba: st.utolso_hiba, utolso_hiba_ido: st.utolso_hiba_ido };
}

async function safeEqual(a, b) {
  const h = async (x) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// A levélhíd (tools/levelhid) fogadója. Nem a Cloudflare Access mögött van (a híd nem ember), hanem saját titokkal védett:
// a profil `postafiok.titok` nevű Workers-titka a megosztott jelszó. Minden hiba ugyanazt a 401-et adja, hogy az ügyfélazonosító ne legyen kitalálható.
async function bridgeIngest(request, env, deps, tenantId, now) {
  const denied = () => json({ hiba: 'Nincs jogosultság.' }, 401);
  const current = await createD1ProfileRepo({ db: env.DB, now }).get(tenantId);
  const cfg = current?.profile.postafiok;
  const expected = cfg && isBridged(cfg) ? env[cfg.titok] : null;
  const auth = request.headers.get('Authorization') || '';
  if (typeof expected !== 'string' || expected.length < 20 || !auth.startsWith('Bearer ') || !(await safeEqual(auth.slice(7), expected))) return denied();
  if (Number(request.headers.get('Content-Length') || 0) > MAIL_LIMITS.bodyBytes) return json({ hiba: 'A kérés túl nagy.' }, 413);
  const text = await request.text();
  if (text.length > MAIL_LIMITS.bodyBytes) return json({ hiba: 'A kérés túl nagy.' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ hiba: 'Hibás JSON.' }, 400); }
  if (!Array.isArray(body?.levelek)) return json({ hiba: 'A „levelek” lista hiányzik.' }, 400);
  const ctx = buildLetterCtx({ env, profile: current.profile, now, prompts: deps.prompts, llmFetch: deps.llmFetch });
  const result = await ingest(ctx, body.levelek, 'hid', { processLimit: 5 }); // a többi a következő ütemezett futásra marad
  await ctx.levelek.saveMailboxState({ kurzor: null, siker: true });
  return json(result);
}

async function sessionEndpoints(request, env, deps, url, now) {
  const headers = (cookie) => ({ ...SECURITY, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) });
  const reply = (data, status = 200, cookie = null) => new Response(JSON.stringify(data), { status, headers: headers(cookie) });
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) throw new HttpError(404, 'Nem található.');
  if (request.headers.get('X-Requested-With') !== 'iroda') throw new HttpError(403, 'Érvénytelen kérés.');
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Érvénytelen kérés eredete.');
  if (url.pathname === '/api/kilepes') return reply({ ok: true }, 200, clearCookie());
  if (!sessionLogin(env) || !passphraseUsable(env)) throw new HttpError(503, 'A belépés nincs beállítva, ezért az oldal zárva van.');
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw new HttpError(415, 'JSON tartalom szükséges.');
  let b; try { b = await request.json(); } catch { throw new HttpError(400, 'Hibás JSON.'); }
  const access = createAccessRepo({ db: env.DB });
  const email = String(env.SAJTOIRODA_BELEPES_EMAIL).toLowerCase();
  const roles = await access.rolesFor(email);
  const tenantId = (await access.tenantForHost(url.host)) || roles[0]?.tenantId;
  const log = tenantId ? createD1Log({ db: env.DB, tenantId, now }) : null;
  const throttle = createThrottle(env.DB, now);
  const wait = await throttle.locked();
  if (wait) { await log?.append({ szereplo: 'rendszer', tipus: 'belepes', tartalom: { eredmeny: 'zarolva' } }); return reply({ hiba: `Túl sok sikertelen próbálkozás. Próbálja újra ${wait} perc múlva.` }, 429); }
  if (!(await passphraseOk(b?.jelmondat, env.SAJTOIRODA_JELMONDAT))) {
    const f = await throttle.fail();
    await log?.append({ szereplo: 'rendszer', tipus: 'belepes', tartalom: { eredmeny: 'hibas_jelmondat', zarolva: f.zarolva } });
    return reply({ hiba: f.zarolva ? 'Túl sok sikertelen próbálkozás. A belépés 15 percre zárolva van.' : 'Hibás jelmondat.' }, 401);
  }
  if (!roles.length) return reply({ hiba: 'Ehhez az irodához nincs hozzáférése.' }, 403);
  await throttle.ok();
  await log?.append({ szereplo: `ember:${email}`, tipus: 'belepes', tartalom: { eredmeny: 'sikeres' } });
  return reply({ ok: true }, 200, setCookie(await issueSession({ secret: env.SAJTOIRODA_JELMONDAT, email, nowMs: now().getTime() })));
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
    return new Response(asset.base64 ? fromBase64(asset.body) : asset.body, { headers: { ...SECURITY, 'Content-Type': TYPES[asset.type], 'Cache-Control': asset.type === 'png' ? 'public, max-age=86400' : 'no-cache' } });
  }
  let hid;
  if (method === 'POST' && (hid = url.pathname.match(/^\/hid\/([a-z0-9][a-z0-9-]{1,62})\/levelek$/))) return bridgeIngest(request, env, deps, hid[1], now);
  if (!url.pathname.startsWith('/api/')) return json({ hiba: 'Nem található.' }, 404);

  // Saját belépés (jelmondat): csak akkor él, ha a Cloudflare Access nincs beállítva.
  if (method === 'POST' && (url.pathname === '/api/belepes' || url.pathname === '/api/kilepes')) return sessionEndpoints(request, env, deps, url, now);

  // Belépés és jogosultság.
  const who = await identify(request, env, { fetchImpl: deps.accessFetch, nowMs: now().getTime() });
  if (!who.email) return json({ hiba: who.hiba, ...(who.belepes ? { belepes: who.belepes } : {}) }, who.status);
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
  const docs = createDocs({ db: env.DB, bucket: env.DOCS || null, tenantId, now });
  const mapHandoff = (h) => ({ id: h.id, tipus: h.tipus, honnan: h.honnan, hova: h.hova, targy: h.targy, szoveg: h.szoveg, anyag_id: h.anyag_id, melyseg: h.melyseg, allapot: h.allapot, ido: h.ido, valasz: h.valasz });
  const lctx = buildLetterCtx({ env, profile, now, prompts, llmFetch: deps.llmFetch });
  const handoffs = lctx.handoffs;
  const actor = `ember:${who.email}`;
  const p = url.pathname;
  let m;

  // ---- Iroda
  if (method === 'GET' && p === '/api/iroda') {
    const [unread, pending, layout, open] = await Promise.all([desk.anyagok.unreadCounts(), desk.utasitasok.pendingCounts(), desk.layout.get(who.email), desk.atadasok.openCounts()]);
    const agents = [];
    const letterCounts = await lctx.levelek.counts();
    const openProposals = await lctx.proactive.proposals.openCount();
    const openEvents = await lctx.esemeny.events.openCount();
    const openPosts = role === 'vezeto' ? await lctx.social.posts.openCount() : 0;
    const openHighRisk = role === 'vezeto' ? (await desk.anyagok.list({ ugynok: 'jogi', limit: 100, withMeta: true })).filter(x => x.meta?.besorolas === 'magas' && !x.olvasott).length : 0;
    for (const a of AGENTS) {
      const last = a.elerheto ? (await desk.anyagok.list({ ugynok: a.id, limit: 1 }))[0] : null;
      const aktiv = a.elerheto && agentActive(profile, a.id, now());
      agents.push({ id: a.id, nev: a.nev, munkanev: a.munkanev, szakasz: a.szakasz, elerheto: a.elerheto,
        allapot: !a.elerheto ? 'ures' : aktiv ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null,
        utolso: last ? { cim: last.cim, ido: last.ido } : null, olvasatlan: a.id === 'kapcsolattarto' ? (role === 'vezeto' ? letterCounts.olvasatlan : 0) : unread[a.id] || 0, jovahagyasra_var: a.id === 'jogi' ? openHighRisk : a.id === 'esemenyszervezo' ? openEvents : a.id === 'kozossegi' ? openPosts : a.id === 'kapcsolattarto' ? ['uj', 'tervezet_kesz', 'halasztva', 'hiba'].reduce((n, k) => n + (letterCounts[k] || 0), 0) : a.id === 'proaktiv' ? openProposals : pending[a.id] || 0, atadas_nyitott: (open[a.id]?.varakozik || 0) + (open[a.id]?.kezbesitve || 0), atadas_varakozik: open[a.id]?.varakozik || 0 });
    }
    return json({ ugyfel: { id: tenantId, megnevezes: profile.megnevezes }, felhasznalo: { email: who.email, szerep: role },
      mod: { elo: config.live, ai: llm.mode, belepes: who.mod || 'proba' }, ugynokok: agents, elrendezes: { ...defaultLayout(), ...(layout || {}) },
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
    const atadasok = (await desk.atadasok.list({ ugynok: a.id, limit: 50 })).map(mapHandoff);
    if (!a.elerheto) return json({ ugynok: a, allapot: 'ures', utasitasok: [], anyagok: [], munka: null, atadasok });
    if (a.id === 'kapcsolattarto') {
      return json({ ugynok: a, allapot: agentActive(profile, a.id, now()) ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null,
        utasitasok: [], anyagok: role === 'vezeto' ? await desk.anyagok.list({ ugynok: a.id, limit: 30 }) : [], atadasok,
        munka: { tipus: 'kapcsolattarto', szamok: await lctx.levelek.counts(), postafiok: await mailboxStatus(lctx, env, profile), tartalom_lathato: role === 'vezeto',
          legutobbi: role === 'vezeto' ? (await lctx.levelek.list({ limit: 6 })) : [] } });
    }
    if (a.id === 'archivum') {
      const leader = role === 'vezeto';
      return json({ ugynok: a, allapot: agentActive(profile, a.id, now()) ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null, utasitasok: [], anyagok: [], atadasok,
        munka: { tipus: 'archivum', tartalom_lathato: leader, kozles_db: await lctx.archivum.count(), korlat: ARCHIVE_LIMIT, max_szoveg: MAX_STATEMENT, fajtak: ARCHIVE_KINDS, ellenorzes_ma: await lctx.archivum.checksSince(startOfDayIso(now())), ellenorzes_korlat: CHECK_LIMIT, megorzes_honap: profile.megorzes?.kozles_honap ?? 36,
          legutobbi: leader ? await lctx.archivum.list({ limit: 8 }) : [] } });
    }
    if (a.id === 'jogi') {
      const leader = role === 'vezeto';
      const all = await desk.anyagok.list({ ugynok: 'jogi', limit: 50, withMeta: true });
      const sorted = [...all].sort((x, y) => RISK_LEVELS.indexOf(y.meta?.besorolas) - RISK_LEVELS.indexOf(x.meta?.besorolas));
      return json({ ugynok: a, allapot: agentActive(profile, a.id, now()) ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null, utasitasok: [], anyagok: [], atadasok,
        munka: { tipus: 'jogi', tartalom_lathato: leader, velemeny_ma: await desk.anyagok.countSince('jogi', 'jogi_velemeny', startOfDayIso(now())), korlat: OPINION_LIMIT, max_szoveg: OPINION_MAX, osszes: all.length, magas_db: all.filter(x => x.meta?.besorolas === 'magas').length,
          kategoriak: RISK_CATEGORIES, fajtak: RISK_KINDS, velemenyek: leader ? sorted.map(x => ({ id: x.id, cim: x.cim, ido: x.ido, olvasott: x.olvasott, besorolas: x.meta?.besorolas, jogasz_javasolt: x.meta?.jogasz_javasolt, talalatok: x.meta?.talalatok, forras_anyag_id: x.meta?.forras_anyag_id, modell: x.meta?.modell })) : [],
          vizsgalhato: leader ? (await desk.anyagok.list({ limit: 60 })).filter(x => x.ugynok !== 'jogi' && SENSITIVE_TYPES.has(x.tipus)).map(x => ({ id: x.id, cim: x.cim, tipus: x.tipus, ido: x.ido })) : [] } });
    }
    if (a.id === 'kozossegi') {
      const leader = role === 'vezeto';
      const reports = (await desk.anyagok.list({ ugynok: a.id, limit: 30 })).filter(x => x.tipus !== 'poszt_javaslat');
      return json({ ugynok: a, allapot: agentActive(profile, a.id, now()) ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null, utasitasok: [], anyagok: reports, atadasok,
        munka: { tipus: 'kozossegi', tartalom_lathato: leader, javaslat_ma: await lctx.social.posts.countSince(startOfDayIso(now())), korlat: POST_LIMIT, jelzes_ma: await lctx.social.signals.countSince(startOfDayIso(now())), jelzes_korlat: SIGNAL_LIMIT_DAY, nyitott_db: await lctx.social.posts.openCount(),
          platformok: profile.kozossegi.platformok, minden_platform: SOCIAL_PLATFORMS, hosszkorlatok: PLATFORM_LIMITS, allapotok: POST_STATES, hangulatok: MOODS, elerések: REACH, kozossegi_forras_db: (profile.forrasok.kozossegi || []).length,
          javaslatok: leader ? await lctx.social.posts.list({ limit: 50 }) : [], jelzesek: leader ? await lctx.social.signals.list({ limit: 30 }) : [] } });
    }
    if (a.id === 'esemenyszervezo') {
      const leader = role === 'vezeto';
      return json({ ugynok: a, allapot: agentActive(profile, a.id, now()) ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null, utasitasok: [], anyagok: leader ? await desk.anyagok.list({ ugynok: a.id, limit: 30 }) : [], atadasok,
        munka: { tipus: 'esemenyszervezo', tartalom_lathato: leader, nyitott_db: await lctx.esemeny.events.openCount(), kapcsolat_db: await lctx.esemeny.contacts.count(), formatumok: EVENT_FORMATS, korlatok: { ...EVENT_DAILY, ...EVENT_LIMITS }, koncepcio_ma: await desk.anyagok.countSince('esemenyszervezo', 'esemeny_koncepcio', startOfDayIso(now())),
          esemenyek: leader ? await lctx.esemeny.events.list({ limit: 50 }) : [] } });
    }
    if (a.id === 'felkeszito' || a.id === 'proaktiv') {
      const leader = role === 'vezeto';
      const base = { ugynok: a, allapot: agentActive(profile, a.id, now()) ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null, utasitasok: [], anyagok: leader ? await desk.anyagok.list({ ugynok: a.id, limit: 30 }) : [], atadasok };
      if (a.id === 'felkeszito') return json({ ...base, munka: { tipus: 'felkeszito', csomag_ma: await desk.anyagok.countSince('felkeszito', 'felkeszito_csomag', startOfDayIso(now())), korlat: PACKAGE_LIMIT, alkalmak: OCCASIONS, tartalom_lathato: leader } });
      const today = dayKey(now(), profile.utemezes.idozona);
      return json({ ...base, munka: { tipus: 'proaktiv', javaslat_ma: await lctx.proactive.proposals.countSince(startOfDayIso(now())), korlat: PROPOSAL_LIMIT, tartalom_lathato: leader, nyitott_db: await lctx.proactive.proposals.openCount(),
        javaslatok: leader ? await lctx.proactive.proposals.list({ limit: 30 }) : [], naptar: leader ? await lctx.proactive.calendar.list({ from: today, limit: 60 }) : [], naptar_tipusok: CAL_TYPES, szabalyok: profile.proaktiv?.szabalyok || '' } });
    }
    const articles = await store.load();
    const today = dayKey(now(), profile.utemezes.idozona);
    const todays = articles.filter(x => dayKey(x.published || x.fetchedAt, profile.utemezes.idozona) === today);
    const hangnem = { pozitiv: 0, negativ: 0, semleges: 0 };
    todays.forEach(x => { hangnem[x.cls.hangnem]++; });
    const trendek = computeTrends({ articles, profile, now: now() }).slice(0, 6);
    return json({
      ugynok: a, allapot: agentActive(profile, a.id, now()) ? 'dolgozik' : 'szunetel', szunet_ig: profile.ugynokok?.[a.id]?.szunet_ig || null,
      utasitasok: await desk.utasitasok.list(a.id), anyagok: await desk.anyagok.list({ ugynok: a.id, limit: 30 }), atadasok,
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
    if (a.id !== 'monitoring') throw new HttpError(409, 'Ennek az ügynöknek a levelekre adhat utasítást: nyissa meg a Bejövő nézetet, és ott kérhet átírást vagy hozhat döntést.');
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
    if (op.muvelet === 'kulcsszo_javaslat') {
      let sug;
      try { sug = await suggestKeywords({ docs, profile, llm, prompts }); }
      catch (e) { const id = await desk.utasitasok.add({ ugynok: a.id, szoveg: text, allapot: 'hiba', valasz: 'A javaslatot most nem tudtam elkészíteni. Próbálja újra később.' }); return json({ id, allapot: 'hiba', valasz: 'A javaslatot most nem tudtam elkészíteni.' }); }
      const note = sug.kizart_ai ? ` (${sug.kizart_ai} szakasz „nem küldhető AI-nak” jelölésű dokumentumban van, ezeket nem használtam.)` : '';
      if (!sug.tetelek.length) {
        const valasz = (sug.uresTar ? 'Még nincs feltöltött dokumentum, amelyből javasolhatnék. A Dokumentumtárban tölthet fel.' : 'Nem találtam új, figyelésre érdemes kifejezést a feltöltött dokumentumokban.') + note;
        const id = await desk.utasitasok.add({ ugynok: a.id, szoveg: text, allapot: 'kesz', valasz });
        return json({ id, allapot: 'kesz', valasz });
      }
      const javaslat = { muvelet: 'kifejezesek_hozzaad', parameterek: { tetelek: sug.tetelek }, magyarazat: '' };
      const valasz = `${sug.tetelek.length} kifejezést találtam a feltöltött dokumentumokban. Jelölje ki, melyiket vegyem fel a figyeltek közé.${note}`;
      const id = await desk.utasitasok.add({ ugynok: a.id, szoveg: text, muvelet: javaslat, allapot: 'javaslat', valasz });
      await log.append({ szereplo: `ugynok:${a.id}`, tipus: 'javaslat', hivatkozas: id, tartalom: { muvelet: javaslat, leiras: valasz } });
      return json({ id, allapot: 'javaslat', valasz, muvelet: javaslat });
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
    const b = await body();
    const d = b.dontes;
    const selected = Array.isArray(b.kivalasztott) ? b.kivalasztott.map(Number).filter(Number.isInteger) : null;
    if (!['jovahagyva', 'elvetve'].includes(d)) throw new HttpError(400, 'A döntés „jovahagyva” vagy „elvetve” lehet.');
    await log.append({ szereplo: actor, tipus: 'dontes', hivatkozas: u.id, dontes_ref: u.id, tartalom: { dontes: d, muvelet: u.muvelet, kivalasztott: selected } });
    if (d === 'elvetve') { await desk.utasitasok.resolve(u.id, { allapot: 'elvetve', by: actor }); return json({ allapot: 'elvetve' }); }
    try {
      await profiles.put(applyOperation(u.muvelet, profile, selected), { by: actor });
      await desk.utasitasok.resolve(u.id, { allapot: 'vegrehajtva', valasz: 'Végrehajtva.', by: actor });
      return json({ allapot: 'vegrehajtva' });
    } catch (e) {
      await desk.utasitasok.resolve(u.id, { allapot: 'hiba', valasz: `Nem sikerült végrehajtani: ${e.message}`, by: actor });
      return json({ allapot: 'hiba', valasz: e.message });
    }
  }

  // ---- Anyagok és rákérdezés
  const visibleAnyag = (a) => role === 'vezeto' || !SENSITIVE_TYPES.has(a.tipus);
  if (method === 'GET' && p === '/api/anyagok') return json({ anyagok: (await desk.anyagok.list({ ugynok: url.searchParams.get('ugynok'), limit: 100 })).filter(visibleAnyag) });
  if (method === 'GET' && (m = p.match(/^\/api\/anyagok\/([^/]+)$/))) {
    const anyag = await desk.anyagok.get(decodeURIComponent(m[1]));
    if (!anyag) throw new HttpError(404, 'Nincs ilyen anyag.');
    if (!visibleAnyag(anyag)) throw new HttpError(403, 'Ezt az anyagot csak a vezető olvashatja.');
    await desk.anyagok.markRead(anyag.id);
    const jogi = role === 'vezeto' ? await desk.anyagok.opinionsFor(anyag.id) : [];
    return json({ anyag, uzenetek: await desk.uzenetek.list(anyag.id), jogi: jogi.length ? { besorolas: worstLevel(jogi), velemenyek: jogi.map(o => ({ id: o.id, besorolas: o.besorolas, ido: o.ido })) } : null });
  }
  if (method === 'POST' && (m = p.match(/^\/api\/anyagok\/([^/]+)\/kerdes$/))) {
    const anyag = await desk.anyagok.get(decodeURIComponent(m[1]));
    if (!anyag) throw new HttpError(404, 'Nincs ilyen anyag.');
    if (!visibleAnyag(anyag)) throw new HttpError(403, 'Ezt az anyagot csak a vezető olvashatja.');
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
  if (method === 'GET' && p === '/api/jelentesek') return json({ anyagok: (await desk.anyagok.list({ limit: 100 })).filter(visibleAnyag) });

  // ---- Dokumentumtár
  const docMeta = (d) => d;
  if (method === 'GET' && p === '/api/dokumentumok') {
    return json({ dokumentumok: (await docs.list({ kategoria: url.searchParams.get('kategoria') })).map(docMeta), hasznalat: await docs.usage(), eredeti_megorzes: docs.hasOriginals, kategoriak: CATEGORIES,
      ugynokok: AGENTS.map(a => ({ id: a.id, nev: a.nev })), ai: llm.mode !== 'mock' });
  }
  if (method === 'POST' && p === '/api/dokumentumok') {
    const name = String(url.searchParams.get('fajlnev') || '').trim();
    if (!name) throw new HttpError(400, 'A fájl neve hiányzik.');
    if (Number(request.headers.get('Content-Length') || 0) > DOC_LIMITS.fileBytes + 4096) throw new HttpError(413, 'A fájl túl nagy.');
    const bytes = new Uint8Array(await request.arrayBuffer());
    const scope = (url.searchParams.get('hatokor') || '').split(',').map(x => x.trim()).filter(Boolean);
    if (scope.some(x => !agentById(x))) throw new HttpError(400, 'Ismeretlen ügynök a hatókörben.');
    try {
      const doc = await docs.add({ bytes, fajlnev: name, cim: url.searchParams.get('cim') || '', kategoria: url.searchParams.get('kategoria') || 'egyeb', hatokor: scope, aiTiltott: url.searchParams.get('ai_tiltott') === '1', by: actor });
      await log.append({ szereplo: actor, tipus: 'dokumentum', hivatkozas: doc.id, tartalom: { esemeny: 'feltoltve', cim: doc.cim, fajlnev: doc.fajlnev, meret: doc.meret, szakaszok: doc.szakaszok, ai_tiltott: doc.ai_tiltott, hatokor: doc.hatokor } });
      return json({ dokumentum: doc }, 201);
    } catch (e) { if (e instanceof DocError) throw new HttpError(422, e.message); throw e; }
  }
  if (method === 'GET' && p === '/api/dokumentumok/kereses') {
    const r = await docs.search(url.searchParams.get('q') || '', { forAI: false, limit: 10 });
    return json({ talalatok: r.talalatok.map(t => ({ ...t, szoveg: t.szoveg.slice(0, 500) })) });
  }
  if (method === 'POST' && p === '/api/dokumentumok/kerdes') {
    const q = String((await body()).szoveg || '').trim();
    if (!q || q.length > 500) throw new HttpError(400, 'A kérdés 1–500 karakter legyen.');
    await log.append({ szereplo: actor, tipus: 'kerdes', hivatkozas: 'dokumentumtar', tartalom: { kerdes: q } });
    let r;
    try { r = await answerFromDocs({ question: q, docs, profile, llm, prompts }); } catch { r = { valasz: 'A kérdésre most nem tudtam válaszolni. Próbálja újra később.', forrasok: [] }; }
    return json(r);
  }
  if ((m = p.match(/^\/api\/dokumentumok\/([^/]+)(\/eredeti)?$/))) {
    const id = decodeURIComponent(m[1]);
    if (method === 'GET' && m[2]) {
      const o = await docs.original(id);
      if (!o) throw new HttpError(404, 'Az eredeti fájl nincs megőrizve.');
      const ascii = o.fajlnev.replace(/[^\x20-\x7e]|["\\]/g, '_');
      return new Response(o.bytes, { headers: { ...SECURITY, 'Content-Security-Policy': 'sandbox', 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(o.fajlnev)}`, 'Cache-Control': 'no-store' } });
    }
    if (method === 'GET') { const d = await docs.get(id); if (!d) throw new HttpError(404, 'Nincs ilyen dokumentum.'); return json({ dokumentum: d }); }
    if (method === 'PUT') {
      const b = await body();
      const hatokor = b.hatokor === undefined ? undefined : (Array.isArray(b.hatokor) ? b.hatokor : null);
      if (Array.isArray(hatokor) && hatokor.some(x => !agentById(x))) throw new HttpError(400, 'Ismeretlen ügynök a hatókörben.');
      try {
        const d = await docs.update(id, { cim: b.cim, kategoria: b.kategoria, hatokor, aiTiltott: b.ai_tiltott === undefined ? undefined : b.ai_tiltott === true });
        if (!d) throw new HttpError(404, 'Nincs ilyen dokumentum.');
        await log.append({ szereplo: actor, tipus: 'dokumentum', hivatkozas: id, tartalom: { esemeny: 'modositva', cim: d.cim, ai_tiltott: d.ai_tiltott, hatokor: d.hatokor } });
        return json({ dokumentum: d });
      } catch (e) { if (e instanceof DocError) throw new HttpError(422, e.message); throw e; }
    }
    if (method === 'DELETE') {
      const d = await docs.get(id);
      if (!d || !(await docs.remove(id))) throw new HttpError(404, 'Nincs ilyen dokumentum.');
      await log.append({ szereplo: actor, tipus: 'dokumentum', hivatkozas: id, tartalom: { esemeny: 'torolve', cim: d.cim, fajlnev: d.fajlnev } });
      return json({ ok: true });
    }
  }


  // ---- Levelek (Kapcsolattartó): a tartalmat csak a vezető látja, a döntés is az övé
  if (p.startsWith('/api/levelek') || p.startsWith('/api/postafiok')) {
    if (method === 'GET' && p === '/api/postafiok') return json(await mailboxStatus(lctx, env, profile));
    if (method === 'POST' && p === '/api/postafiok/beolvasas') {
      const mailbox = (() => { try { return createMailbox(profile.postafiok, { env, fetchImpl: deps.mailFetch }); } catch (e) { throw new HttpError(409, e.message); } })();
      const r = await runMailAgent({ ...lctx, mailbox });
      await log.append({ szereplo: actor, tipus: 'level', tartalom: { esemeny: 'kezi_beolvasas', ...r } });
      return json(r);
    }
    if (role !== 'vezeto') throw new HttpError(403, 'A levelek tartalmát csak a vezető látja és kezeli.');
    if (!agentById('kapcsolattarto').elerheto) throw new HttpError(409, 'A Kapcsolattartó asztala nincs betöltve.');
    if (method === 'GET' && p === '/api/levelek') {
      const allapot = url.searchParams.get('allapot');
      return json({ levelek: await lctx.levelek.list({ allapot: allapot || null, limit: 200 }), szamok: await lctx.levelek.counts() });
    }
    if (method === 'POST' && p === '/api/levelek') {
      const b = await body();
      const raw = { azonosito: `kezi:${crypto.randomUUID()}`, felado: String(b.felado || ''), felado_nev: String(b.felado_nev || ''), targy: String(b.targy || ''), szoveg: String(b.szoveg || ''), ido: now().toISOString() };
      const r = await ingest(lctx, [raw], 'kezi');
      if (!r.fogadott) throw new HttpError(400, 'A levél nem fogadható be: a feladó címe (e-mail) és a tárgy vagy a szöveg kötelező.');
      return json(r, 201);
    }
    if ((m = p.match(/^\/api\/levelek\/([^/]+)$/)) && method === 'GET') {
      const letter = await lctx.levelek.get(decodeURIComponent(m[1]));
      if (!letter) throw new HttpError(404, 'Nincs ilyen levél.');
      await lctx.levelek.markRead(letter.id);
      const anyag = letter.anyag_id ? await desk.anyagok.get(letter.anyag_id) : null;
      if (anyag) await desk.anyagok.markRead(anyag.id);
      const arcMeta = anyag?.meta || {};
      const korabbi = await lctx.archivum.related(`${letter.targy} ${letter.besorolas?.tema || ''}`, { limit: 5 });
      const jogiOps = letter.anyag_id ? await desk.anyagok.opinionsFor(letter.anyag_id) : [];
      const posztJavaslat = await lctx.social.posts.byLetter(letter.id);
      return json({ kozossegi: posztJavaslat ? { id: posztJavaslat.id, allapot: posztJavaslat.allapot } : null, archivum: { korabbi, ellentmondasok: arcMeta.ellentmondasok || [], ellenorizve: !!arcMeta.ellenorizve, megjegyzes: arcMeta.ellenorzes_megjegyzes || null }, jogi: jogiOps.length ? { besorolas: worstLevel(jogiOps), anyag_id: jogiOps[0].id, jogasz_javasolt: jogiOps.some(o => o.jogasz_javasolt) } : null, level: letter, tervezet: anyag?.meta && anyag.meta.opciok ? { opciok: anyag.meta.opciok, kockazatok: anyag.meta.kockazatok || [], alapja: anyag.meta.alapja || [], forrasok: anyag.meta.forrasok || [], modell: anyag.meta.modell, kizart_ai: anyag.meta.kizart_ai || 0 } : null, ai: lctx.llm.mode !== 'mock', elo: config.live });
    }
    if ((m = p.match(/^\/api\/levelek\/([^/]+)\/dontes$/)) && method === 'POST') {
      const b = await body();
      const r = await decideLetter(lctx, decodeURIComponent(m[1]), { dontes: b.dontes, szoveg: b.szoveg, targy: b.targy, hova: b.hova, jogiTudomasul: b.jogi_tudomasul === true, by: actor });
      if (r.status !== 200) throw new HttpError(r.status, r.hiba);
      return json({ allapot: r.allapot, kiment: r.kiment === true });
    }
    if ((m = p.match(/^\/api\/levelek\/([^/]+)\/(ujra|atiras)$/)) && method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const letter = await lctx.levelek.get(id);
      if (!letter) throw new HttpError(404, 'Nincs ilyen levél.');
      if (!['tervezet_kesz', 'hiba', 'halasztva'].includes(letter.allapot)) throw new HttpError(409, 'Erről a levélről már döntöttek.');
      if (m[2] === 'ujra') {
        if (letter.allapot !== 'hiba') throw new HttpError(409, 'Csak a sikertelen feldolgozás próbálható újra.');
        const r = await processLetter(lctx, id);
        return json({ ok: r.ok === true });
      }
      const utasitas = String((await body()).utasitas || '').trim();
      if (!utasitas || utasitas.length > 300) throw new HttpError(400, 'Az átírási kérés 1–300 karakter legyen.');
      if (lctx.llm.mode === 'mock') throw new HttpError(409, 'Átírást kérni csak bekapcsolt AI-val lehet; AI nélkül szerkessze kézzel a tervezetet.');
      let draft;
      try { draft = await buildDraft({ letter, cls: letter.besorolas, profile, llm: lctx.llm, prompts, models: lctx.models, docs: lctx.docs, instruction: utasitas }); }
      catch { throw new HttpError(502, 'Az átírás most nem sikerült. Próbálja újra később.'); }
      await desk.anyagok.update(letter.anyag_id, { szoveg: draft.opciok.map(o => (o.szoveg ? `## ${o.cim}\n${o.szoveg}` : `## ${o.cim}`)).join('\n\n'), meta: { level_id: id, besorolas: letter.besorolas, ...draft } });
      await log.append({ szereplo: actor, tipus: 'valasz_tervezet', hivatkozas: id, tartalom: { esemeny: 'atiras_kerve', utasitas } });
      return json({ ok: true });
    }
    throw new HttpError(404, 'Nem található.');
  }

  // ---- Felkészítő és Proaktív: csomag, javaslat, döntés, naptár (a tartalmat csak a vezető látja és kezeli)
  if (p.startsWith('/api/felkeszito') || p.startsWith('/api/proaktiv') || p.startsWith('/api/javaslatok') || p.startsWith('/api/naptar')) {
    if (role !== 'vezeto') throw new HttpError(403, 'Ezt csak a vezető kezelheti.');
    const agentErr = (e) => { if (e instanceof AgentError) throw new HttpError(e.status, e.message); if (e instanceof CalendarError) throw new HttpError(400, e.message); throw e; };
    if (method === 'POST' && p === '/api/felkeszito/csomag') {
      const b = await body();
      try { const r = await createPackage(lctx, { tema: b.tema, alkalom: b.alkalom || 'nyilatkozat', idopont: b.idopont, megszolalo: b.megszolalo, by: actor }); return json({ anyag_id: r.anyagId, cim: r.cim, red_flag: r.redFlag, modell: r.modell }, 201); }
      catch (e) { agentErr(e); }
    }
    if (method === 'POST' && p === '/api/proaktiv/javaslat') {
      const b = await body();
      try { const r = await createProposal(lctx, { tema: b.tema, jelzes: String(b.jelzes || ''), by: actor }); return json({ id: r.id, anyag_id: r.anyagId, cim: r.cim, modell: r.modell }, 201); }
      catch (e) { agentErr(e); }
    }
    if (method === 'GET' && p === '/api/javaslatok') return json({ javaslatok: await lctx.proactive.proposals.list({ allapot: url.searchParams.get('allapot') || null, limit: 100 }) });
    if ((m = p.match(/^\/api\/javaslatok\/([^/]+)\/dontes$/)) && method === 'POST') {
      const b = await body();
      const r = await decideProposal(lctx, decodeURIComponent(m[1]), { dontes: b.dontes, csomag: b.csomag === true, by: actor });
      if (r.status !== 200) throw new HttpError(r.status, r.hiba);
      return json({ allapot: r.allapot, csomag_atadas: r.csomag_atadas });
    }
    if (method === 'GET' && p === '/api/naptar') return json({ naptar: await lctx.proactive.calendar.list({ from: url.searchParams.get('tol') || null, limit: 300 }), tipusok: CAL_TYPES });
    if (method === 'POST' && p === '/api/naptar') {
      const b = await body();
      try {
        const id = await lctx.proactive.calendar.add({ datum: b.datum, cim: b.cim, megjegyzes: b.megjegyzes, tipus: b.tipus || 'kulso' });
        await log.append({ szereplo: actor, tipus: 'naptar_modositas', hivatkozas: id, tartalom: { esemeny: 'felvitel', datum: b.datum, cim: String(b.cim).slice(0, 200) } });
        return json({ id }, 201);
      } catch (e) { agentErr(e); }
    }
    if ((m = p.match(/^\/api\/naptar\/([^/]+)$/)) && method === 'DELETE') {
      if (!(await lctx.proactive.calendar.remove(decodeURIComponent(m[1])))) throw new HttpError(404, 'Nincs ilyen naptárbejegyzés.');
      await log.append({ szereplo: actor, tipus: 'naptar_modositas', hivatkozas: decodeURIComponent(m[1]), tartalom: { esemeny: 'torles' } });
      return json({ ok: true });
    }
    throw new HttpError(404, 'Nem található.');
  }

  // ---- Archívum: keresés, idővonal, közlések (a tartalmat csak a vezető látja és kezeli)
  if (p.startsWith('/api/archivum')) {
    if (role !== 'vezeto') throw new HttpError(403, 'Ezt csak a vezető kezelheti.');
    const A = lctx.archivum;
    const arcErr = (e) => { if (e instanceof ArchiveError) throw new HttpError(e.status, e.message); throw e; };
    try {
      if (method === 'GET' && p === '/api/archivum/kereses') {
        const fajta = url.searchParams.get('fajta') || null;
        if (fajta && !ARCHIVE_KINDS[fajta]) throw new HttpError(400, 'Ismeretlen fajta.');
        return json(await searchAll(lctx, url.searchParams.get('q') || '', { fajta, tol: url.searchParams.get('tol') || null, ig: url.searchParams.get('ig') || null }));
      }
      if (method === 'GET' && p === '/api/archivum/idovonal') return json({ idovonal: await timeline(lctx, url.searchParams.get('tema') || '') });
      if (method === 'GET' && p === '/api/archivum/kozlesek') return json({ kozlesek: await A.list({ fajta: url.searchParams.get('fajta') || null, tol: url.searchParams.get('tol') || null, ig: url.searchParams.get('ig') || null, limit: 200 }), fajtak: ARCHIVE_KINDS });
      if (method === 'GET' && p === '/api/archivum/export.csv') {
        const rows = await A.exportAll();
        const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
        const out = [['kiadva', 'fajta', 'cim', 'cimzett_medium', 'cimzett_domain', 'jovahagyta', 'kiment', 'szoveg'].map(cell).join(',')].concat(rows.map(r => [r.kiadva, r.fajta, r.cim, r.cimzett_medium, r.cimzett_domain, r.jovahagyta, r.kiment ? 'igen' : 'nem', r.szoveg].map(cell).join(','))).join('\r\n');
        await log.append({ szereplo: actor, tipus: 'kozles', tartalom: { esemeny: 'export', darab: rows.length } });
        return new Response(out, { headers: { ...SECURITY, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="kozlesek.csv"', 'Cache-Control': 'no-store' } });
      }
      if (method === 'POST' && p === '/api/archivum/kozlesek') {
        const b = await body();
        const r = await A.addManual({ cim: b.cim, datum: b.datum, fajta: b.fajta, szoveg: b.szoveg, medium: b.medium, by: profile.vezeto.email });
        if (!r.uj) throw new HttpError(409, 'Ez a közlés már szerepel az archívumban.');
        await log.append({ szereplo: actor, tipus: 'kozles', hivatkozas: r.id, tartalom: { esemeny: 'kezi_felvitel', fajta: b.fajta, kiadva: b.datum } });
        return json({ id: r.id }, 201);
      }
      if ((m = p.match(/^\/api\/archivum\/kozlesek\/([^/]+)$/))) {
        const id = decodeURIComponent(m[1]);
        if (method === 'GET') { const k = await A.get(id); if (!k) throw new HttpError(404, 'Nincs ilyen közlés.'); return json({ kozles: k }); }
        if (method === 'DELETE') {
          if (!(await A.remove(id))) throw new HttpError(404, 'Nincs ilyen közlés.');
          await log.append({ szereplo: actor, tipus: 'kozles', hivatkozas: id, tartalom: { esemeny: 'torolve' } });
          return json({ ok: true });
        }
      }
    } catch (e) { arcErr(e); }
    throw new HttpError(404, 'Nem található.');
  }

  // ---- Jogi és kockázat: vélemény kérése (anyagra vagy beillesztett szövegre), a vélemények listája (a tartalmat csak a vezető látja)
  if (p.startsWith('/api/jogi')) {
    if (role !== 'vezeto') throw new HttpError(403, 'Ezt csak a vezető kezelheti.');
    if (method === 'POST' && p === '/api/jogi/velemeny') {
      const b = await body();
      if (!b.anyag_id && !String(b.szoveg || '').trim()) throw new HttpError(400, 'Válasszon anyagot, vagy illesszen be szöveget.');
      try { const r = await createOpinion(lctx, { anyagId: b.anyag_id ? String(b.anyag_id) : null, szoveg: b.anyag_id ? null : String(b.szoveg), fajta: RISK_KINDS[b.fajta] ? b.fajta : 'egyeb', by: actor }); return json({ id: r.id, besorolas: r.besorolas, megallapitasok: r.db, jogasz_javasolt: r.jogasz, modell: r.modell }, 201); }
      catch (e) { if (e instanceof AgentError) throw new HttpError(e.status, e.message); throw e; }
    }
    if (method === 'GET' && p === '/api/jogi/velemenyek') {
      const forras = url.searchParams.get('forras');
      if (forras) { const ops = await desk.anyagok.opinionsFor(forras); return json({ velemenyek: ops.map(o => ({ id: o.id, besorolas: o.besorolas, ido: o.ido, jogasz_javasolt: o.jogasz_javasolt })), legrosszabb: ops.length ? worstLevel(ops) : null }); }
      return json({ velemenyek: (await desk.anyagok.list({ ugynok: 'jogi', limit: 100 })).map(x => ({ id: x.id, cim: x.cim, ido: x.ido })) });
    }
    throw new HttpError(404, 'Nem található.');
  }

  // ---- Közösségi média: posztjavaslatok, döntés, „Kiadtam”, digitális jelzések, jelentés (a tartalmat csak a vezető látja és kezeli)
  if (p.startsWith('/api/kozossegi')) {
    if (role !== 'vezeto') throw new HttpError(403, 'Ezt csak a vezető kezelheti.');
    const S = lctx.social;
    const socErr = (e) => { if (e instanceof AgentError || e instanceof SocialError) throw new HttpError(e.status, e.message); throw e; };
    try {
      if (method === 'GET' && p === '/api/kozossegi/javaslatok') return json({ javaslatok: await S.posts.list({ allapot: url.searchParams.get('allapot') || null, limit: 100 }), allapotok: POST_STATES });
      if (method === 'POST' && p === '/api/kozossegi/javaslat') {
        const b = await body();
        let tema = String(b.tema || '').trim(), jelzes = String(b.jelzes || '');
        let levelId = null, jelzesId = null;
        if (b.level_id) {
          const letter = await lctx.levelek.get(String(b.level_id));
          if (!letter) throw new HttpError(404, 'Nincs ilyen levél.');
          levelId = letter.id; tema ||= letter.besorolas?.tema || letter.targy;
          jelzes ||= `Sajtómegkeresés alapján (típus: ${letter.besorolas?.tipus || 'ismeretlen'}, hangnem: ${letter.besorolas?.hangnem || 'ismeretlen'}). A levélíró adata nem kerülhet a nyilvános szövegbe.`;
        }
        if (b.jelzes_id) { const s = await S.signals.get(String(b.jelzes_id)); if (!s) throw new HttpError(404, 'Nincs ilyen digitális jelzés.'); jelzesId = s.id; tema ||= s.osszefoglalo.slice(0, 120); }
        const r = await createPost(lctx, { tema, jelzes, levelId, jelzesId, platformok: Array.isArray(b.platformok) ? b.platformok : null, by: actor });
        return json(r, 201);
      }
      if ((m = p.match(/^\/api\/kozossegi\/javaslatok\/([^/]+)\/dontes$/)) && method === 'POST') {
        const b = await body();
        const r = await decidePost(lctx, decodeURIComponent(m[1]), { dontes: b.dontes, jogiTudomasul: b.jogi_tudomasul === true, by: actor });
        if (r.status !== 200) throw new HttpError(r.status, r.hiba);
        return json({ allapot: r.allapot });
      }
      if ((m = p.match(/^\/api\/kozossegi\/javaslatok\/([^/]+)\/kiadva$/)) && method === 'POST') {
        const b = await body();
        const r = await recordPublished(lctx, decodeURIComponent(m[1]), { platform: b.platform, datum: b.datum || null, szoveg: b.szoveg || null, by: actor });
        if (r.status !== 200) throw new HttpError(r.status, r.hiba);
        return json({ ok: true, archivum_id: r.archivum_id });
      }
      if (method === 'GET' && p === '/api/kozossegi/jelzesek') return json({ jelzesek: await S.signals.list({ limit: 100 }) });
      if (method === 'POST' && p === '/api/kozossegi/jelzesek') {
        const b = await body();
        const r = await addSignal(lctx, { platform: b.platform, osszefoglalo: b.osszefoglalo, hangulat: b.hangulat, elereles: b.elereles, url: b.url || null, by: actor });
        return json(r, 201);
      }
      if ((m = p.match(/^\/api\/kozossegi\/jelzesek\/([^/]+)$/)) && method === 'DELETE') {
        if (!(await S.signals.remove(decodeURIComponent(m[1])))) throw new HttpError(404, 'Nincs ilyen digitális jelzés.');
        await log.append({ szereplo: actor, tipus: 'javaslat', hivatkozas: decodeURIComponent(m[1]), tartalom: { fajta: 'digitalis_jelzes_torolve' } });
        return json({ ok: true });
      }
      // Igény szerinti jelentés a Monitoring közösségi csatornákról gyűjtött bejegyzéseiből (olvasó művelet).
      if (method === 'POST' && p === '/api/kozossegi/jelentes') {
        const b = await body();
        const napok = Math.min(Math.max(Number(b.napok) || 7, 1), 90);
        const report = await buildReport({ tema: String(b.tema || '').trim() || null, napok, articles: await store.load(), profile, llm, prompts, now: now(), csatorna: 'kozossegi' });
        const anyagId = await desk.anyagok.add({ ugynok: 'kozossegi', tipus: 'kozossegi_jelentes', cim: report.cim, szoveg: report.text, html: report.html, meta: report.meta });
        return json({ anyag_id: anyagId, cim: report.cim, darab: report.darab, megjegyzes: (profile.forrasok.kozossegi || []).length ? null : 'Nincs beállítva közösségi forrás (Beállítások → Források), ezért nincs miből jelentést készíteni.' }, 201);
      }
    } catch (e) { socErr(e); }
    throw new HttpError(404, 'Nem található.');
  }

  // ---- Eseményszervező: események, sajtólista, meghívók, ellenőrzőlista, utómunka (a tartalmat csak a vezető látja és kezeli)
  if (p.startsWith('/api/esemenyek') || p.startsWith('/api/sajtolista') || p.startsWith('/api/meghivok')) {
    if (role !== 'vezeto') throw new HttpError(403, 'Ezt csak a vezető kezelheti.');
    const evErr = (e) => { if (e instanceof EventError) throw new HttpError(e.status, e.message); throw e; };
    const E = lctx.esemeny;
    const eventOr404 = async (id) => { const ev = await E.events.get(decodeURIComponent(id)); if (!ev) throw new HttpError(404, 'Nincs ilyen esemény.'); return ev; };
    try {
      if (method === 'GET' && p === '/api/esemenyek') return json({ esemenyek: await E.events.list({ allapot: url.searchParams.get('allapot') || null, limit: 100 }), formatumok: EVENT_FORMATS });
      if (method === 'POST' && p === '/api/esemenyek') {
        const b = await body();
        const r = await createEvent(lctx, { tema: b.tema, formatum: b.formatum || 'sajtotajekoztato', idopont: b.idopont, helyszin: b.helyszin, keret: b.keret, javaslatId: b.javaslat_id || null, by: actor });
        return json({ id: r.id, anyag_id: r.anyagId, cim: r.cim, tullepes: r.tullepes, modell: r.modell }, 201);
      }
      if ((m = p.match(/^\/api\/esemenyek\/([^/]+)$/)) && method === 'GET') {
        const ev = await eventOr404(m[1]);
        return json({ esemeny: ev, meghivok: await E.invites.list(ev.id), koncepcio: ev.koncepcio_anyag_id ? { id: ev.koncepcio_anyag_id } : null, valaszok: RESPONSES, korlatok: { ...EVENT_DAILY, ...EVENT_LIMITS }, elo: config.live });
      }
      if ((m = p.match(/^\/api\/esemenyek\/([^/]+)\/dontes$/)) && method === 'POST') {
        const ev = await eventOr404(m[1]);
        const r = await decideEvent(lctx, ev.id, { dontes: (await body()).dontes, by: actor });
        if (r.status !== 200) throw new HttpError(r.status, r.hiba);
        return json({ allapot: r.allapot });
      }
      if ((m = p.match(/^\/api\/esemenyek\/([^/]+)\/meghivo$/)) && method === 'PUT') {
        const ev = await eventOr404(m[1]);
        if (ev.allapot !== 'szervezes') throw new HttpError(409, 'A meghívó szövege a jóváhagyott, szervezés alatti eseménynél szerkeszthető.');
        const b = await body();
        const targy = String(b.targy ?? '').replace(/\s+/g, ' ').trim().slice(0, 300), szoveg = String(b.szoveg ?? '').trim().slice(0, 5000);
        if (!targy || !szoveg) throw new HttpError(400, 'A tárgy és a szöveg kötelező.');
        await E.events.set(ev.id, { meghivo_targy: targy, meghivo_szoveg: szoveg });
        await log.append({ szereplo: actor, tipus: 'dontes', hivatkozas: ev.id, tartalom: { dontes: 'meghivo_szoveg_mentve', fajta: 'esemeny' } });
        return json({ ok: true });
      }
      if ((m = p.match(/^\/api\/esemenyek\/([^/]+)\/jeloltek$/)) && method === 'GET') {
        const ev = await eventOr404(m[1]);
        return json({ jeloltek: await inviteCandidates(lctx, ev.id) });
      }
      if ((m = p.match(/^\/api\/esemenyek\/([^/]+)\/meghivolista$/)) && method === 'POST') {
        const ev = await eventOr404(m[1]);
        return json(await addInvites(lctx, ev.id, (await body()).kapcsolatok, { by: actor }), 201);
      }
      if ((m = p.match(/^\/api\/esemenyek\/([^/]+)\/kuldes$/)) && method === 'POST') {
        const ev = await eventOr404(m[1]);
        return json(await sendInvites(lctx, ev.id, { by: actor }));
      }
      if ((m = p.match(/^\/api\/esemenyek\/([^/]+)\/ellenorzolista$/)) && method === 'PUT') {
        const ev = await eventOr404(m[1]);
        if (!['szervezes', 'lezajlott', 'utomunka'].includes(ev.allapot)) throw new HttpError(409, 'Az ellenőrzőlista a jóváhagyott eseményhez tartozik.');
        const raw = (await body()).tetelek;
        if (!Array.isArray(raw) || raw.length > 40) throw new HttpError(400, 'Az ellenőrzőlista legfeljebb 40 tételből állhat.');
        const items = raw.map((t, i) => ({ id: String(t.id || `u${i + 1}`).slice(0, 20), tetel: String(t.tetel || '').trim().slice(0, 200), felelos: String(t.felelos || '').trim().slice(0, 100), hatarido: /^\d{4}-\d{2}-\d{2}$/.test(String(t.hatarido || '')) ? t.hatarido : null, kesz: t.kesz === true })).filter(t => t.tetel);
        await E.events.set(ev.id, { ellenorzolista: items });
        return json({ ok: true, tetelek: items });
      }
      if ((m = p.match(/^\/api\/esemenyek\/([^/]+)\/utomunka$/)) && method === 'POST') {
        const ev = await eventOr404(m[1]);
        const r = await createPostWork(lctx, ev.id, { by: actor });
        return json({ anyag_id: r.anyagId }, 201);
      }
      if ((m = p.match(/^\/api\/meghivok\/([^/]+)$/)) && method === 'PUT') {
        await setInviteResponse(lctx, decodeURIComponent(m[1]), (await body()).valasz, { by: actor });
        return json({ ok: true });
      }
      if ((m = p.match(/^\/api\/meghivok\/([^/]+)$/)) && method === 'DELETE') {
        if (!(await E.invites.remove(decodeURIComponent(m[1])))) throw new HttpError(404, 'Nincs ilyen, még el nem küldött meghívótervezet.');
        return json({ ok: true });
      }
      // ---- sajtólista
      if (method === 'GET' && p === '/api/sajtolista') return json({ kapcsolatok: await E.contacts.list({ q: url.searchParams.get('q') || null }), korlat: EVENT_LIMITS.contacts });
      if (method === 'GET' && p === '/api/sajtolista.csv') {
        const rows = await E.contacts.list();
        const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
        const out = [['nev', 'medium', 'email', 'tema', 'prioritas', 'megjegyzes', 'hozzajarulas'].map(cell).join(',')].concat(rows.map(c => [c.nev, c.medium, c.email, c.tema, c.prioritas, c.megjegyzes, c.hozzajarulas ? 'igen' : 'nem'].map(cell).join(','))).join('\r\n');
        await log.append({ szereplo: actor, tipus: 'dokumentum', hivatkozas: 'sajtolista', tartalom: { esemeny: 'export', darab: rows.length } });
        return new Response(out, { headers: { ...SECURITY, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sajtolista.csv"', 'Cache-Control': 'no-store' } });
      }
      if (method === 'POST' && p === '/api/sajtolista') {
        const b = await body();
        const id = await E.contacts.add({ nev: b.nev, medium: b.medium, email: b.email, tema: b.tema, prioritas: b.prioritas ?? 2, megjegyzes: b.megjegyzes, hozzajarulas: b.hozzajarulas === true });
        await log.append({ szereplo: actor, tipus: 'naptar_modositas', hivatkozas: id, tartalom: { esemeny: 'sajtolista_felvitel', hozzajarulas: b.hozzajarulas === true } });
        return json({ id }, 201);
      }
      if (method === 'POST' && p === '/api/sajtolista/csv') {
        const b = await body();
        return json(await importContacts(lctx, String(b.csv || ''), { megerosites: b.hozzajarulas_megerositve === true, by: actor }), 201);
      }
      if ((m = p.match(/^\/api\/sajtolista\/([^/]+)$/)) && method === 'DELETE') {
        if (!(await E.contacts.remove(decodeURIComponent(m[1])))) throw new HttpError(404, 'Nincs ilyen kapcsolat.');
        await log.append({ szereplo: actor, tipus: 'naptar_modositas', hivatkozas: decodeURIComponent(m[1]), tartalom: { esemeny: 'sajtolista_torles' } });
        return json({ ok: true });
      }
    } catch (e) { evErr(e); }
    throw new HttpError(404, 'Nem található.');
  }

  // ---- Átadások az ügynökök között
  if (method === 'GET' && p === '/api/atadasok') {
    const list = await desk.atadasok.list({ ugynok: url.searchParams.get('ugynok'), allapot: url.searchParams.get('allapot'), limit: 200 });
    return json({ atadasok: list.map(mapHandoff) });
  }
  if (method === 'POST' && (m = p.match(/^\/api\/atadasok\/([^/]+)\/(megallit|lezar)$/))) {
    const id = decodeURIComponent(m[1]);
    const r = m[2] === 'megallit' ? await handoffs.stop(id, actor) : await handoffs.close(id, actor);
    if (!r.ok) throw new HttpError(r.ok_reason.startsWith('nincs') ? 404 : 409, r.ok_reason.charAt(0).toUpperCase() + r.ok_reason.slice(1) + '.');
    return json({ ok: true });
  }

  // ---- Beállítások
  if (method === 'GET' && p === '/api/profil') {
    const { ugyfel_id, megnevezes, nyelv, vezeto, kulcsszavak, forrasok, vorosvonalak, utemezes, ai_jelzes, kapcsolattarto, postafiok, proaktiv, kozossegi } = profile;
    return json({ szerep: role, profil: { ugyfel_id, megnevezes, nyelv, vezeto, kulcsszavak, forrasok, vorosvonalak, utemezes, ai_jelzes, kapcsolattarto, proaktiv, kozossegi, platformok: SOCIAL_PLATFORMS, forras_platformok: SOURCE_PLATFORMS, postafiok: postafiok || null }, szerkesztheto_vezeto: Object.keys(VEZETO_EDITABLE), verzio: current.version });
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
