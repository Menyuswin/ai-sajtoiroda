import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createD1Shim } from '../src/dev/d1-shim.js';
import { createD1ProfileRepo, createD1Log } from '../src/cloudflare/d1.js';
import { createAccessRepo } from '../src/cloudflare/desk.js';
import { handleRequest } from '../src/api/router.js';
import { runScheduled } from '../src/cloudflare/scheduler.js';
import { loadProfile } from '../src/core/profile.js';
import { checkVariant, exclusionTerms, forbiddenHit } from '../src/agents/kozossegi/rules.js';
import { validatePost } from '../src/agents/kozossegi/index.js';
import { fixture, readPrompts } from './helpers.js';

const NOW = new Date('2026-10-29T06:30:00Z');
const T = 'pelda-korhazak';
const LEADER = 'vezeto@pelda.example';
const OPER = 'zoltan@uzemelteto.example';
const base = await loadProfile(fixture('profil.yaml'));

const SOCIAL_FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>Reddit</title>
<item><title>Ápolóhiány a Példa Kórházaknál: mit tapasztaltok?</title><link>https://reddit.example/r/egeszseg/1</link><description>Szál a kórházi ápolóhiányról.</description><pubDate>Thu, 29 Oct 2026 06:00:00 +0100</pubDate></item>
<item><title>Hatósági eljárás a Példa Kórházak ellen? (szál)</title><link>https://reddit.example/r/egeszseg/2</link><description>Terjedő hír a közösségi oldalakon.</description><pubDate>Thu, 29 Oct 2026 06:10:00 +0100</pubDate></item>
</channel></rss>`;

async function setup({ env: extraEnv = {}, profileMod, feeds = {} } = {}) {
  const db = createD1Shim();
  const repo = createD1ProfileRepo({ db, now: () => NOW });
  const profile = profileMod ? profileMod(structuredClone(base)) : base;
  await repo.put(profile, { by: 'rendszer' });
  const access = createAccessRepo({ db });
  await access.grant(LEADER, T, 'vezeto'); await access.grant(OPER, T, 'uzemelteto');
  const prompts = await readPrompts();
  const baseEnv = { DB: db, SAJTOIRODA_DEV_AUTH: '1', ...extraEnv };
  const press = await readFile(fixture('feed.xml'), 'utf8');
  const fetchText = async (url) => (url.includes('reddit.example') ? feeds.social ?? SOCIAL_FEED : press);
  const call = async (method, path, body, { user = LEADER, deps = {}, now = NOW } = {}) => {
    const init = { method, headers: method === 'GET' ? {} : { 'X-Requested-With': 'iroda', 'Content-Type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await handleRequest(new Request(`https://iroda.pelda.example${path}`, init), { ...baseEnv, SAJTOIRODA_DEV_USER: user }, { now: () => now, prompts, ...deps });
    const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  const rows = async (sql, ...a) => (await db.prepare(sql).bind(...a).all()).results;
  const run = (opts = {}) => runScheduled(baseEnv, { now: () => NOW, fetchText, prompts, ...opts });
  return { db, call, rows, run, repo, log: (f) => createD1Log({ db, tenantId: T }).query(f) };
}
const post = (s, o, opts) => s.call('POST', '/api/kozossegi/javaslat', { tema: 'Várólista', ...o }, opts);
const withSocial = (p) => { p.forrasok.kozossegi = [{ nev: 'Reddit – egészség', url: 'https://reddit.example/r/egeszseg.rss', platform: 'reddit' }]; return p; };

// ---------- K1: platformszabályok

test('platformszabályok: @megemlítés törlődik, forrásjelölés kiesik, hashtag legfeljebb 5, a hosszkorlát jelzett és nem csonkít, emoji a profil szerint', () => {
  const r = checkVariant({ platform: 'x', szoveg: 'Köszönjük a kérdést @pelda_ujsag! [1] Részletek: [D1 §2] 🙂 ' + 'a'.repeat(300), hashtagek: ['varolista', '#egeszseg', 'a', 'b', 'c', 'd', 'e'] }, { profile: base });
  assert.ok(!r.szoveg.includes('@')); assert.ok(!/\[\d\]|\[D1/.test(r.szoveg)); assert.ok(!r.szoveg.includes('🙂'));
  assert.equal(r.hashtagek.length, 5); assert.ok(r.tul_hosszu); assert.ok(r.szoveg.length > 300, 'nem csonkol'); assert.equal(r.hosszkorlat, 280);
  assert.ok(r.javitasok.some(x => /@megemlítés/.test(x))); assert.ok(r.javitasok.some(x => /rövidítse/.test(x)));
  const emoji = checkVariant({ platform: 'facebook', szoveg: 'Szia 🙂' }, { profile: { ...base, kozossegi: { ...base.kozossegi, emoji: true } } });
  assert.ok(emoji.szoveg.includes('🙂'));
});

test('a megkereső adata (név, e-mail, médium) a nyilvános szövegben blokkol; a freemail-tartomány nem médium; a kitöltendő rész blokkol; tiltott téma felismerhető', () => {
  const ex = exclusionTerms({ felado: 'tamas@napilap.example', felado_nev: 'Szabó Tamás' });
  assert.ok(ex.includes('Szabó Tamás') && ex.includes('tamas@napilap.example') && ex.includes('napilap'));
  assert.ok(!exclusionTerms({ felado: 'valaki@gmail.com', felado_nev: '' }).includes('gmail'));
  const bad = checkVariant({ platform: 'facebook', szoveg: 'A Napilap kérdésére válaszolunk: Szabó Tamás is kérdezte. [KITÖLTENDŐ: szám]' }, { profile: base, exclude: ex });
  assert.equal(bad.blokkolo.length, 2); // név/médium egyszer, plusz a kitöltendő rész
  assert.equal(checkVariant({ platform: 'facebook', szoveg: 'Rendben van.' }, { profile: base, exclude: ex }).blokkolo.length, 0);
  assert.equal(forbiddenHit({ ...base, kozossegi: { ...base.kozossegi, tiltott_temak: ['betegjogi per'] } }, 'Az ügyvéd a Betegjogi Per ügyében'), 'betegjogi per');
  assert.equal(forbiddenHit(base, 'bármi'), null);
});

test('az AI-válasz ellenőrzése: hamis forrás törlődik, csak a kért platform marad, a hiányzó változat kitöltendő, a „nem posztolunk” és a „csak megkeresésre” mindig jelen van', () => {
  const sources = { cikkek: [{ n: 1 }], reszletek: [] };
  const r = validatePost({ helyzet: 'Igaz [1] és kitalált [7].', valtozatok: [{ platform: 'facebook', szoveg: 'Szöveg [1]', hashtagek: [] }, { platform: 'instagram', szoveg: 'nem kért' }], alternativak: [{ forma: 'magyarazo_szal', indoklas: 'x' }] },
    { sources, platformok: ['facebook', 'linkedin'], profile: base, exclude: [], day: {}, model: 'm' });
  assert.ok(!r.helyzet.includes('[7]') && r.helyzet.includes('[1]'));
  assert.deepEqual(r.valtozatok.map(v => v.platform), ['facebook', 'linkedin']);
  assert.ok(!r.valtozatok[0].szoveg.includes('[1]')); assert.ok(r.valtozatok[1].blokkolo.length);
  assert.ok(['nem_posztolunk', 'csak_megkeresesre'].every(f => r.alternativak.some(a => a.forma === f)));
  assert.ok(r.kockazatok.some(k => /nem létező forrásra/.test(k)));
});

// ---------- K2: javaslat-készítés, védelmek, korlátok

test('AI nélkül váz készül: platformonként kitöltendő szöveg, kommentkezelés, időzítés a naptárból; a kitöltendő rész miatt nem hagyható jóvá; a javaslat a jogi vélemény mellett él; az üzemeltető nem látja', async () => {
  const s = await setup();
  const r = await post(s, { jelzes: 'Az újságírók többször kérdeztek.' });
  assert.equal(r.status, 201);
  const a = (await s.call('GET', `/api/anyagok/${encodeURIComponent(r.data.anyagId)}`)).data.anyag;
  assert.match(a.szoveg, /Facebook/); assert.match(a.szoveg, /LinkedIn/); assert.match(a.szoveg, /Kommentkezelési útmutató/); assert.match(a.szoveg, /Nem posztolunk/); assert.match(a.szoveg, /Csak a megkeresésekre válaszolunk/);
  assert.equal(a.meta.valtozatok.length, 2); assert.equal(a.meta.idozites.datum, '2026-10-30');
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${encodeURIComponent(r.data.id)}/dontes`, { dontes: 'elfogad' })).status, 422);
  assert.equal((await s.call('GET', `/api/anyagok/${encodeURIComponent(r.data.anyagId)}`, undefined, { user: OPER })).status, 403);
  assert.equal((await s.call('POST', '/api/kozossegi/javaslat', { tema: 'x' }, { user: OPER })).status, 403);
  const op = (await s.call('GET', '/api/ugynok/kozossegi', undefined, { user: OPER })).data;
  assert.equal(op.munka.tartalom_lathato, false); assert.deepEqual(op.munka.javaslatok, []); assert.ok(op.anyagok.every(x => x.tipus !== 'poszt_javaslat')); assert.equal(op.munka.javaslat_ma, 1);
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${encodeURIComponent(r.data.id)}/dontes`, { dontes: 'elvet' })).status, 200);
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${encodeURIComponent(r.data.id)}/dontes`, { dontes: 'elvet' })).status, 409);
  const opinions = await s.rows("SELECT * FROM anyagok WHERE ugynok = 'jogi' AND tipus = 'jogi_velemeny'");
  assert.ok(opinions.some(o => JSON.parse(o.meta_json).forras_anyag_id === r.data.anyagId && JSON.parse(o.meta_json).fajta === 'poszt')); // automatikus jogi vélemény
});

test('korlátok és szabályok: nincs kért platform, tiltott téma csak megjegyzés, azonos téma 3 napon belül kiegészül, napi 10 javaslat, szünet', async () => {
  const s = await setup({ profileMod: (p) => { p.kozossegi.tiltott_temak = ['betegjogi per']; return p; } });
  assert.equal((await post(s, { platformok: ['x'] })).status, 400); // az X nincs bekapcsolva
  assert.equal((await post(s, { tema: '' })).status, 400);
  const banned = await post(s, { tema: 'A betegjogi per állása' });
  assert.equal(banned.data.megfigyelendo, true); assert.equal(banned.data.anyagId, undefined);
  assert.equal((await s.rows("SELECT * FROM anyagok WHERE tipus = 'poszt_javaslat'")).length, 0);
  const first = await post(s, { tema: 'Műtéti várólista' });
  const again = await post(s, { tema: 'műtéti  várólista!', jelzes: 'Új jelzés érkezett.' });
  assert.equal(again.data.kiegeszitve, true); assert.equal(again.data.id, first.data.id);
  assert.equal((await s.rows("SELECT * FROM poszt_javaslatok WHERE allapot = 'tervezet'")).length, 1);
  assert.equal(JSON.parse((await s.rows('SELECT forras_json FROM poszt_javaslatok WHERE id = ?', first.data.id))[0].forras_json).jelzesek.length, 1);
  for (let i = 0; i < 9; i++) assert.equal((await post(s, { tema: `Különböző téma ${i}` })).status, 201);
  const over = await post(s, { tema: 'Tizenegyedik' });
  assert.equal(over.status, 429); assert.match(over.data.hiba, /korlát/);
  assert.equal((await post(s, { tema: 'Holnapi' }, { now: new Date('2026-10-30T06:30:00Z') })).status, 201);
  await s.call('PUT', '/api/ugynok/kozossegi/allapot', { aktiv: false });
  assert.equal((await post(s, { tema: 'Szünet alatt' }, { now: new Date('2026-10-31T06:30:00Z') })).status, 409);
});

// ---------- AI-ág, döntés, „Kiadtam”, Archívum

const aiFetch = (state) => async (url, init) => {
  const sys = JSON.parse(init.body).system;
  const ok = (o) => Response.json({ content: [{ text: JSON.stringify(o) }] });
  if (/besorolnod/.test(sys)) return ok(state.letterCls());
  if (/\*\*tervezetet\*\* írnod/.test(sys)) return ok({ valasz: 'Tisztelt Kolléga!\n\nKöszönjük a kérdést, hamarosan részletesen válaszolunk.\n\nÜdv', alapja: [], kockazatok: [] });
  if (/közösségi média munkatársa vagy/.test(sys)) { state.social++; return ok(state.socialResponse()); }
  if (/stratégiai munkatársa/.test(sys)) return ok({ lehetoseg: 'Poszt lehet.', javaslat: { forma: 'poszt', mikor: '2026-10-30 – nap', uzenet: 'Röviden elmondjuk, mi történik a várólistával.' }, hallgatas_kockazata: { van: false, leiras: '' }, alternativak: [] });
  if (/összevetned/.test(sys)) return ok({ ellentmondasok: [] });
  return ok({ besorolas: 'alacsony', megallapitasok: [] });
};
const cleanSocial = () => ({ helyzet: 'A várólista témája többször előjött.', valtozatok: [
  { platform: 'facebook', szoveg: 'Sokan kérdeznek a várólistáról, ezért összefoglaljuk, mit tudunk. @valaki', hashtagek: ['varolista', 'egeszseg', 'a', 'b', 'c', 'd'], kepotlet: 'Egy egyszerű ábra a számokról.' },
  { platform: 'linkedin', szoveg: 'A várólista alakulásáról rövid, tárgyilagos összefoglalót adunk.', hashtagek: [] }],
  szal: [], kommentkezeles: { varhato: [{ tipus: 'Türelmetlen beteg', valaszminta: 'Megértjük a türelmetlenséget, a részleteket itt olvashatja.' }], ne_valaszoljunk: 'Provokációra.', bevonas: 'Ha újságíró szólal meg.', moderalas: 'Személyes adatnál.' },
  alternativak: [{ forma: 'magyarazo_szal', indoklas: 'Ha összetett lesz.' }], amire_epul: ['[1] példa'], kockazatok: [] });

test('AI-s javaslat: a program javít (@, hashtag), a jóváhagyás csak ellenőrzés után megy, a „Kiadtam” az Archívumba kerül, a második rögzítés és a jövőbeli dátum elutasítva', async () => {
  const state = { social: 0, socialResponse: cleanSocial, letterCls: () => ({}) };
  const s = await setup({ env: { SAJTOIRODA_LLM: 'anthropic', ANTHROPIC_API_KEY: 'k' } });
  const d = { deps: { llmFetch: aiFetch(state) } };
  const r = await post(s, {}, d);
  assert.equal(r.status, 201); assert.equal(state.social, 1);
  const a = (await s.call('GET', `/api/anyagok/${encodeURIComponent(r.data.anyagId)}`, undefined, d)).data.anyag;
  const fb = a.meta.valtozatok.find(v => v.platform === 'facebook');
  assert.ok(!fb.szoveg.includes('@')); assert.equal(fb.hashtagek.length, 5); assert.deepEqual(fb.blokkolo, []);
  const id = encodeURIComponent(r.data.id);
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${id}/kiadva`, { platform: 'facebook' }, d)).status, 409); // jóváhagyás előtt nem rögzíthető
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${id}/dontes`, { dontes: 'elfogad' }, d)).status, 200);
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${id}/kiadva`, { platform: 'instagram' }, d)).status, 400);
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${id}/kiadva`, { platform: 'facebook', datum: '2026-11-05' }, d)).status, 400);
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${id}/kiadva`, { platform: 'facebook' }, d)).status, 200);
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${id}/kiadva`, { platform: 'facebook' }, d)).status, 409);
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${id}/kiadva`, { platform: 'linkedin', datum: '2026-10-28' }, d)).status, 200);
  const arch = (await s.call('GET', '/api/archivum/kozlesek?fajta=poszt', undefined, d)).data.kozlesek;
  assert.equal(arch.length, 2); assert.ok(arch.some(k => k.kiadva === '2026-10-28' && /LinkedIn/.test(k.cim)));
  assert.equal((await s.call('GET', '/api/kozossegi/javaslatok?allapot=kiadva', undefined, d)).data.javaslatok.length, 1);
  assert.equal((await s.log({ tipus: 'dontes' })).filter(e => e.tartalom?.dontes === 'kiadva').length, 2);
  // az Archívum innentől a következő tervezet mellé hozza a korábbi posztot
  const next = await post(s, { tema: 'Várólista kérdések' }, d);
  const meta = (await s.call('GET', `/api/anyagok/${encodeURIComponent(next.data.anyagId)}`, undefined, d)).data.anyag.meta;
  assert.ok(meta.archivum?.korabbi.some(k => k.fajta === 'poszt'));
});

test('a megkereső neve a nyilvános szövegben blokkol; magas jogi kockázatnál tudomásulvétel kell (nem tilt); a közvetlen válasz függőben lévő állapota figyelmeztetés', async () => {
  const state = { social: 0, letterCls: () => ({ tipus: 'reakcio_kerese', tema: 'eljárás', surgossag: 'normal', hangnem: 'semleges', hatarido: null, voros_vonal: false, jogi_gyanu: false, indoklas: 'x', bizonytalan: false }),
    socialResponse: () => ({ ...cleanSocial(), valtozatok: [{ platform: 'facebook', szoveg: 'Szabó Tamás kérdésére válaszolunk.' }, { platform: 'linkedin', szoveg: 'Kiss Géza korrupt, és csalt a közpénzzel.' }] }) };
  const s = await setup({ env: { SAJTOIRODA_LLM: 'anthropic', ANTHROPIC_API_KEY: 'k' } });
  const d = { deps: { llmFetch: aiFetch(state) } };
  await s.call('POST', '/api/levelek', { felado: 'tamas@napilap.example', felado_nev: 'Szabó Tamás', targy: 'Eljárás?', szoveg: 'Igaz, hogy eljárás indult?' }, d);
  const l = (await s.call('GET', '/api/levelek', undefined, d)).data.levelek[0];
  assert.equal((await s.call('GET', `/api/levelek/${encodeURIComponent(l.id)}`, undefined, d)).data.kozossegi, null);
  const r = await s.call('POST', '/api/kozossegi/javaslat', { level_id: l.id }, d); // a „Közösségi támogatás kérése” gomb
  assert.equal(r.status, 201);
  const a = (await s.call('GET', `/api/anyagok/${encodeURIComponent(r.data.anyagId)}`, undefined, d)).data.anyag;
  assert.match(a.szoveg, /közvetlen válasz még nincs jóváhagyva/); assert.equal(a.meta.kozvetlen_valasz.jovahagyott, false);
  assert.equal((await s.call('GET', `/api/levelek/${encodeURIComponent(l.id)}`, undefined, d)).data.kozossegi.id, r.data.id); // a Bejövő mutatja
  const id = encodeURIComponent(r.data.id);
  const blocked = await s.call('POST', `/api/kozossegi/javaslatok/${id}/dontes`, { dontes: 'elfogad' }, d);
  assert.equal(blocked.status, 422); assert.match(blocked.data.hiba, /megkereső adata/);
  assert.equal((await s.call('GET', `/api/jogi/velemenyek?forras=${encodeURIComponent(r.data.anyagId)}`, undefined, d)).data.legrosszabb, 'magas');
  // javított szöveggel (új javaslat más témára): a magas jogi kockázat tudomásulvételt kér
  state.socialResponse = () => ({ ...cleanSocial(), valtozatok: [{ platform: 'facebook', szoveg: 'Kiss Géza korrupt, és csalt a közpénzzel.' }, { platform: 'linkedin', szoveg: 'Rendben van.' }] });
  const r2 = await post(s, { tema: 'Teljesen más téma' }, d);
  const id2 = encodeURIComponent(r2.data.id);
  const warn = await s.call('POST', `/api/kozossegi/javaslatok/${id2}/dontes`, { dontes: 'elfogad' }, d);
  assert.equal(warn.status, 409); assert.equal(warn.data.hiba.includes('jogi figyelmeztetést'), true);
  assert.equal((await s.call('POST', `/api/kozossegi/javaslatok/${id2}/dontes`, { dontes: 'elfogad', jogi_tudomasul: true }, d)).status, 200);
  assert.equal((await s.log({ tipus: 'dontes' })).find(e => e.tartalom?.fajta === 'poszt_javaslat').tartalom.jogi_tudomasul, true);
  assert.equal((await s.rows("SELECT * FROM proba_levelek WHERE kind NOT IN ('belso_jelentes', 'riasztas')")).length, 0); // kifelé semmi nem ment
});

// ---------- K3: jelzés-források

test('ismétlődő megkeresés: 3 azonos témájú levél 7 napon belül javaslatot indít (az első kettő nem); a negyedik a meglévőhöz fűz; a panasz azonnal indít; a láncmélység ≤ 3', async () => {
  const state = { social: 0, socialResponse: cleanSocial, letterCls: () => ({ tipus: 'reakcio_kerese', tema: 'várólista', surgossag: 'normal', hangnem: 'semleges', hatarido: null, voros_vonal: false, jogi_gyanu: false, indoklas: 'x', bizonytalan: false }) };
  const s = await setup({ env: { SAJTOIRODA_LLM: 'anthropic', ANTHROPIC_API_KEY: 'k' } });
  const d = { deps: { llmFetch: aiFetch(state) } };
  const mail = (i) => s.call('POST', '/api/levelek', { felado: `ujsagiro${i}@lap${i}.example`, felado_nev: `Újságíró Név${i}`, targy: `Várólista kérdés ${i}`, szoveg: 'Mi lesz a várólistával?' }, d);
  await mail(1); await mail(2);
  assert.equal((await s.rows("SELECT * FROM poszt_javaslatok")).length, 0);
  await mail(3);
  const posts = await s.rows("SELECT * FROM poszt_javaslatok");
  assert.equal(posts.length, 1); assert.ok(posts[0].level_id);
  const h = (await s.call('GET', '/api/atadasok', undefined, d)).data.atadasok.find(x => x.hova === 'kozossegi' && x.honnan === 'kapcsolattarto');
  assert.equal(h.allapot, 'feldolgozva'); assert.match(h.szoveg, /3 megkeresés/); assert.match(h.valasz, /Posztjavaslat készült/);
  await mail(4);
  assert.equal((await s.rows("SELECT * FROM poszt_javaslatok")).length, 1); // 3 napon belüli azonos téma: kiegészítés, nem új javaslat
  assert.ok(JSON.parse((await s.rows('SELECT forras_json FROM poszt_javaslatok'))[0].forras_json).jelzesek.length >= 1);
  state.letterCls = () => ({ tipus: 'panasz', tema: 'ápolói bánásmód', surgossag: 'normal', hangnem: 'feszult', hatarido: null, voros_vonal: false, jogi_gyanu: false, indoklas: 'x', bizonytalan: false });
  await s.call('POST', '/api/levelek', { felado: 'beteg@gmail.example', felado_nev: 'Beteg Béla', targy: 'Panasz', szoveg: 'Rossz volt a bánásmód.' }, d);
  assert.equal((await s.rows("SELECT * FROM poszt_javaslatok")).length, 2);
  assert.ok((await s.call('GET', '/api/atadasok', undefined, d)).data.atadasok.every(x => x.melyseg === undefined || x.melyseg <= 3));
});

test('a Proaktív „poszt” formájú elfogadott javaslatából kérelem megy a Közösségi médiának; más forma esetén nem', async () => {
  const state = { social: 0, socialResponse: cleanSocial, letterCls: () => ({}) };
  const s = await setup({ env: { SAJTOIRODA_LLM: 'anthropic', ANTHROPIC_API_KEY: 'k' } });
  const d = { deps: { llmFetch: aiFetch(state) } };
  const pr = await s.call('POST', '/api/proaktiv/javaslat', { tema: 'Új ambulancia', jelzes: 'Megnyílt az új ambulancia.' }, d);
  assert.equal(pr.status, 201);
  const before = (await s.rows("SELECT * FROM atadasok WHERE hova = 'kozossegi' AND honnan = 'proaktiv'")).length;
  assert.equal((await s.call('POST', `/api/javaslatok/${encodeURIComponent(pr.data.id)}/dontes`, { dontes: 'elfogad' }, d)).status, 200);
  const rows = await s.rows("SELECT * FROM atadasok WHERE hova = 'kozossegi' AND honnan = 'proaktiv'");
  assert.equal(rows.length, before + 1); assert.equal(rows.at(-1).tipus, 'kerelem'); assert.equal(rows.at(-1).allapot, 'feldolgozva');
  assert.ok((await s.rows("SELECT * FROM poszt_javaslatok WHERE tema = 'Poszt: Új ambulancia' OR tema LIKE '%ambulancia%'")).length >= 1);
});

test('digitális jelzés: negatív és nagy elérésű javaslatot indít; a negatív vagy nagy elérésű csak megfigyelendő; a többi csak naplózott; érvénytelen adat és napi 30 korlát', async () => {
  const s = await setup();
  const sig = (o) => s.call('POST', '/api/kozossegi/jelzesek', { platform: 'facebook', osszefoglalo: 'Terjedő bejegyzés a kórházról', hangulat: 'negativ', elereles: 'nagy', ...o });
  const hot = await sig({});
  assert.equal(hot.status, 201); assert.ok(hot.data.javaslat.anyagId);
  const watch = await sig({ osszefoglalo: 'Kisebb negatív hozzászólás', elereles: 'kicsi' });
  assert.equal(watch.data.javaslat.megfigyelendo, true);
  const calm = await sig({ osszefoglalo: 'Kedves poszt', hangulat: 'pozitiv', elereles: 'kicsi' });
  assert.equal(calm.data.javaslat, null);
  assert.equal((await sig({ platform: 'tiktok' })).status, 400); assert.equal((await sig({ hangulat: 'dühös' })).status, 400); assert.equal((await sig({ osszefoglalo: '  ' })).status, 400); assert.equal((await sig({ url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await s.rows("SELECT * FROM poszt_javaslatok WHERE allapot = 'megfigyelendo'")).length, 1);
  for (let i = 0; i < 27; i++) assert.equal((await sig({ hangulat: 'pozitiv', elereles: 'kicsi', osszefoglalo: `Jelzés ${i}` })).status, 201);
  assert.equal((await sig({ hangulat: 'pozitiv', elereles: 'kicsi' })).status, 429);
  const list = (await s.call('GET', '/api/kozossegi/jelzesek')).data.jelzesek;
  assert.equal(list.length, 30);
  assert.equal((await s.call('DELETE', `/api/kozossegi/jelzesek/${encodeURIComponent(list[0].id)}`)).status, 200);
  assert.equal((await s.call('GET', '/api/kozossegi/jelzesek', undefined, { user: OPER })).status, 403);
});

// ---------- K6: a Monitoring közösségi csatornái

test('Monitoring közösségi csatornák: külön szemle a Közösségi asztalra (nem a sajtószemlébe), vörös vonalú közösségi bejegyzés riasztás, a jelzés a Közösségi médiához is megy; a sajtószemle csak utalást kap', async () => {
  const s = await setup({ profileMod: withSocial });
  await s.run();
  const szemle = await s.rows("SELECT * FROM anyagok WHERE tipus = 'kozossegi_szemle'");
  assert.equal(szemle.length, 1); assert.equal(szemle[0].ugynok, 'kozossegi');
  assert.match(szemle[0].szoveg, /Közösségi szemle/); assert.match(szemle[0].szoveg, /Reddit 2/); assert.match(szemle[0].szoveg, /reddit\.example\/r\/egeszseg\/1/);
  assert.ok(!/proba\.example/.test(szemle[0].szoveg));
  const press = (await s.rows("SELECT * FROM anyagok WHERE tipus = 'szemle'"))[0];
  assert.ok(!/reddit\.example/.test(press.szoveg)); assert.match(press.szoveg, /közösségi csatornákról külön szemle készült \(2 bejegyzés\)/);
  const alerts = await s.rows("SELECT szoveg FROM anyagok WHERE tipus = 'riasztas'");
  assert.ok(alerts.some(a => /Vörös vonalba eső közösségi bejegyzés: Hatósági eljárás a Példa Kórházak ellen\? \(szál\)/.test(a.szoveg)));
  const toSocial = await s.rows("SELECT * FROM atadasok WHERE hova = 'kozossegi' AND honnan = 'monitoring'");
  assert.ok(toSocial.length >= 2); assert.ok(toSocial.every(h => h.allapot === 'feldolgozva'));
  assert.ok((await s.rows("SELECT * FROM poszt_javaslatok")).length >= 1);
  // az üzemeltető látja a szemlét (nem bizalmas), a posztjavaslatot nem
  const op = (await s.call('GET', '/api/ugynok/kozossegi', undefined, { user: OPER })).data;
  assert.ok(op.anyagok.some(x => x.tipus === 'kozossegi_szemle')); assert.ok(op.anyagok.every(x => x.tipus !== 'poszt_javaslat'));
  assert.equal(op.munka.kozossegi_forras_db, 1);
  // újabb futás: ugyanazt nem jelenti újra
  const later = new Date('2026-10-30T06:30:00Z');
  await s.run({ now: () => later });
  assert.equal((await s.rows("SELECT * FROM anyagok WHERE tipus = 'kozossegi_szemle'")).length, 1);
});

test('közösségi jelentés igény szerint: csak a közösségi csatornák bejegyzéseiből; a sajtójelentés nem tartalmazza őket; forrás nélkül magyarázat; a beállítás https-t kér', async () => {
  const s = await setup({ profileMod: withSocial });
  await s.run();
  const rep = await s.call('POST', '/api/kozossegi/jelentes', { napok: 7 });
  assert.equal(rep.status, 201); assert.equal(rep.data.darab, 2);
  const a = (await s.call('GET', `/api/anyagok/${encodeURIComponent(rep.data.anyag_id)}`)).data.anyag;
  assert.match(a.szoveg, /Közösségi jelentés/); assert.ok(!/proba\.example/.test(a.szoveg));
  const press = await s.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: 'Készíts jelentést az elmúlt 7 napról' });
  const pa = (await s.call('GET', `/api/anyagok/${encodeURIComponent(press.data.anyag_id)}`)).data.anyag;
  assert.ok(!/reddit\.example/.test(pa.szoveg));
  const bad = await s.call('PUT', '/api/profil', { forrasok: { kozossegi: [{ nev: 'x', url: 'http://reddit.example/x.rss', platform: 'reddit' }] } });
  assert.equal(bad.status, 400);
  const good = await s.call('PUT', '/api/profil', { forrasok: { kozossegi: [{ nev: 'Mastodon', url: 'https://mastodon.example/tags/egeszseg.rss', platform: 'mastodon' }] }, kozossegi: { platformok: ['linkedin', 'x', 'tiktok'], tiltott_temak: ['per'], hashtagek: ['kórház'], emoji: true } });
  assert.equal(good.status, 200);
  const prof = (await s.call('GET', '/api/profil')).data.profil;
  assert.deepEqual(prof.kozossegi.platformok, ['linkedin', 'x']); assert.deepEqual(prof.kozossegi.hashtagek, ['#kórház']); assert.equal(prof.forrasok.kozossegi[0].platform, 'mastodon');
  assert.equal((await s.call('PUT', '/api/profil', { kozossegi: { emoji: true } }, { user: OPER })).status, 200); // az üzemeltető is szerkesztheti
});
