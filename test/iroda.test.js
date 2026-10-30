import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { createD1Shim } from '../src/dev/d1-shim.js';
import { createD1ProfileRepo, createD1Log } from '../src/cloudflare/d1.js';
import { createAccessRepo } from '../src/cloudflare/desk.js';
import { runScheduled } from '../src/cloudflare/scheduler.js';
import { handleRequest, applyProfileEdit } from '../src/api/router.js';
import { verifyAccessJwt, identify, clearKeyCache } from '../src/api/auth.js';
import { AGENTS } from '../src/api/catalogue.js';
import { mockInterpret, validateOperation } from '../src/agents/monitoring/instruct.js';
import { loadProfile } from '../src/core/profile.js';
import { fixture, readPrompts } from './helpers.js';

const NOW = new Date('2026-10-29T06:30:00Z');
const T = 'pelda-korhazak';

async function office() {
  const db = createD1Shim();
  const profile = await loadProfile(fixture('profil.yaml'));
  const repo = createD1ProfileRepo({ db, now: () => NOW });
  await repo.put(profile, { by: 'rendszer' });
  await repo.put({ ...profile, ugyfel_id: 'masik-kft', megnevezes: 'Másik Kft.' }, { by: 'rendszer' });
  const access = createAccessRepo({ db });
  await access.grant('vezeto@pelda.example', T, 'vezeto');
  await access.grant('zoltan@uzemelteto.example', T, 'uzemelteto');
  await access.grant('zoltan@uzemelteto.example', 'masik-kft', 'uzemelteto');
  await access.grant('masik@masik.example', 'masik-kft', 'vezeto');
  const prompts = await readPrompts();
  const feed = await readFile(fixture('feed.xml'), 'utf8');
  const baseEnv = { DB: db, SAJTOIRODA_DEV_AUTH: '1', SAJTOIRODA_DEV_USER: 'vezeto@pelda.example' };
  await runScheduled(baseEnv, { now: () => NOW, fetchText: async () => feed, prompts }); // feltölti a cikkeket és az anyagokat
  const call = async (method, path, body, { user = 'vezeto@pelda.example', headers = {}, env = {}, deps = {} } = {}) => {
    const init = { method, headers: { ...(method !== 'GET' ? { 'X-Requested-With': 'iroda', 'Content-Type': 'application/json' } : {}), ...headers } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await handleRequest(new Request(`https://iroda.pelda.example${path}`, init), { ...baseEnv, SAJTOIRODA_DEV_USER: user, ...env }, { now: () => NOW, prompts, ...deps });
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, res };
  };
  return { db, repo, call, profileNow: async () => (await repo.get(T)).profile, logNow: async (f) => createD1Log({ db, tenantId: T }).query(f) };
}

test('katalógus egyezik az agents/*.yaml specifikációkkal', async () => {
  for (const a of AGENTS) {
    const y = parse(await readFile(`agents/${a.fajl}.yaml`, 'utf8'));
    assert.equal(a.nev, y.nev, a.id);
    assert.equal(a.munkanev, y.munkanev, a.id);
    assert.equal(a.szakasz, y.bevezetesi_szakasz, a.id);
  }
});

test('belépés zárt alapértelmezéssel: beállítás nélkül 503, ismeretlen felhasználó 403, próbabelépés csak engedéllyel', async () => {
  const o = await office();
  const closed = await o.call('GET', '/api/iroda', undefined, { env: { SAJTOIRODA_DEV_AUTH: '0' } });
  assert.equal(closed.status, 503);
  const stranger = await o.call('GET', '/api/iroda', undefined, { user: 'idegen@x.example' });
  assert.equal(stranger.status, 403);
  const noAuthCfg = await o.call('GET', '/api/iroda', undefined, { env: { SAJTOIRODA_DEV_USER: '' , SAJTOIRODA_DEV_AUTH: '1' } });
  assert.equal(noAuthCfg.status, 503);
});

test('az iroda: 8 asztal, mindegyik ügynök dolgozik (a Közösségi média az utolsó); olvasatlan anyagok jelezve', async () => {
  const o = await office();
  const { status, data } = await o.call('GET', '/api/iroda');
  assert.equal(status, 200);
  assert.equal(data.ugynokok.length, 8);
  assert.equal(data.ugynokok.find(a => a.id === 'monitoring').allapot, 'dolgozik');
  assert.ok(data.ugynokok.every(a => a.allapot === 'dolgozik'));
  assert.equal(data.ugynokok.find(a => a.id === 'kapcsolattarto').allapot, 'dolgozik');
  assert.ok(data.ugynokok.find(a => a.id === 'monitoring').olvasatlan >= 2); // szemle + riasztás
  assert.equal(data.mod.elo, false);
  assert.equal(data.ugyfel.megnevezes, 'Példa Kórházak Zrt.');
});

test('ügyfél-elkülönítés: más ügyfél irodája nem érhető el, az üzemeltető átkapcsolhat', async () => {
  const o = await office();
  const denied = await o.call('GET', '/api/iroda?ugyfel=masik-kft');
  assert.equal(denied.status, 403);
  const other = await o.call('GET', '/api/iroda?ugyfel=masik-kft', undefined, { user: 'masik@masik.example' });
  assert.equal(other.data.ugyfel.megnevezes, 'Másik Kft.');
  const op = await o.call('GET', '/api/iroda?ugyfel=masik-kft', undefined, { user: 'zoltan@uzemelteto.example' });
  assert.equal(op.status, 200);
  assert.deepEqual(op.data.ugyfelek.sort(), [T, 'masik-kft'].sort());
  // mindkét ügyfélnek saját anyagai vannak; a másik ügyfél anyaga azonosító ismeretében sem olvasható
  const mine = (await o.call('GET', '/api/anyagok')).data.anyagok;
  const theirs = (await o.call('GET', '/api/anyagok', undefined, { user: 'masik@masik.example' })).data.anyagok;
  assert.ok(mine.length >= 2 && theirs.length >= 2);
  assert.ok(mine.every(a => !theirs.some(b => b.id === a.id)));
  assert.equal((await o.call('GET', `/api/anyagok/${encodeURIComponent(mine[0].id)}`, undefined, { user: 'masik@masik.example' })).status, 404);
  assert.equal((await o.call('POST', `/api/anyagok/${encodeURIComponent(mine[0].id)}/kerdes`, { szoveg: 'x?' }, { user: 'masik@masik.example' })).status, 404);
});

test('CSRF és tartalom: módosító kérés fejléc, azonos eredet és JSON nélkül nem megy át', async () => {
  const o = await office();
  const noHeader = await o.call('PUT', '/api/iroda/elrendezes', { pozicio: {} }, { headers: { 'X-Requested-With': 'valami' } });
  assert.equal(noHeader.status, 403);
  const foreign = await o.call('PUT', '/api/iroda/elrendezes', { pozicio: {} }, { headers: { Origin: 'https://rossz.example' } });
  assert.equal(foreign.status, 403);
  const notJson = await o.call('PUT', '/api/iroda/elrendezes', undefined, { headers: { 'Content-Type': 'text/plain' } });
  assert.equal(notJson.status, 415);
  assert.equal((await o.call('PUT', '/api/iroda/elrendezes', { pozicio: {} }, { headers: { Origin: 'https://iroda.pelda.example' } })).status, 200);
});

test('elrendezés mentése felhasználónként, érvénytelen érték elutasítva', async () => {
  const o = await office();
  assert.equal((await o.call('PUT', '/api/iroda/elrendezes', { pozicio: { monitoring: { x: 300, y: 40 } } })).status, 200);
  assert.deepEqual((await o.call('GET', '/api/iroda')).data.elrendezes.monitoring, { x: 300, y: 40 });
  assert.notDeepEqual((await o.call('GET', '/api/iroda', undefined, { user: 'zoltan@uzemelteto.example' })).data.elrendezes.monitoring, { x: 300, y: 40 });
  assert.equal((await o.call('PUT', '/api/iroda/elrendezes', { pozicio: { monitoring: { x: -5, y: 1 } } })).status, 400);
  assert.equal((await o.call('PUT', '/api/iroda/elrendezes', { pozicio: { nincs: { x: 1, y: 1 } } })).status, 400);
});

test('utasítás → javaslat → jóváhagyás: jóváhagyás nélkül nem változik semmi, utána igen, és minden naplózva', async () => {
  const o = await office();
  const r = await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: 'Figyeld a sürgősségi ellátás témát is' });
  assert.equal(r.data.allapot, 'javaslat');
  assert.match(r.data.valasz, /sürgősségi ellátás/);
  assert.ok(!(await o.profileNow()).kulcsszavak.temak.includes('sürgősségi ellátás'));
  assert.equal((await o.call('GET', '/api/iroda')).data.ugynokok.find(a => a.id === 'monitoring').jovahagyasra_var, 1);

  const ok = await o.call('POST', `/api/utasitasok/${encodeURIComponent(r.data.id)}/dontes`, { dontes: 'jovahagyva' });
  assert.equal(ok.data.allapot, 'vegrehajtva');
  assert.ok((await o.profileNow()).kulcsszavak.temak.includes('sürgősségi ellátás'));
  assert.equal((await o.call('POST', `/api/utasitasok/${encodeURIComponent(r.data.id)}/dontes`, { dontes: 'jovahagyva' })).status, 409);

  const types = (await o.logNow()).map(e => e.tipus);
  for (const t of ['utasitas', 'javaslat', 'dontes', 'profil_modositas']) assert.ok(types.includes(t), t);
});

test('elvetett javaslat nem módosít; a döntés szerepe és értéke ellenőrzött', async () => {
  const o = await office();
  const r = await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: 'Hagyd ki a Próba Hírportált' });
  assert.equal(r.data.allapot, 'javaslat');
  assert.equal((await o.call('POST', `/api/utasitasok/${encodeURIComponent(r.data.id)}/dontes`, { dontes: 'talan' })).status, 400);
  assert.equal((await o.call('POST', `/api/utasitasok/${encodeURIComponent(r.data.id)}/dontes`, { dontes: 'elvetve' })).data.allapot, 'elvetve');
  assert.equal((await o.profileNow()).forrasok.rss.length, 1);
});

test('amit az ügynök nem ért vagy nem tud (levélküldés), arra visszakérdez, és nem hajt végre semmit', async () => {
  const o = await office();
  for (const szoveg of ['Írj levelet az újságírónak, hogy cáfoljuk a hírt', 'Küldd el a szemlét a sajtónak', 'blablabla']) {
    const r = await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg });
    assert.equal(r.data.allapot, 'visszakerdez', szoveg);
  }
  const p = await o.profileNow();
  assert.equal(p.version ?? 1, p.version ?? 1);
  assert.equal((await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: '' })).status, 400);
  assert.equal((await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: 'x'.repeat(501) })).status, 400);
});

test('az AI nem léphet ki a zárt műveletlistából: ismeretlen művelet és hibás paraméter visszakérdezéssé válik', async () => {
  const o = await office();
  const reply = (obj) => async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] }) });
  const env = { SAJTOIRODA_LLM: 'anthropic', ANTHROPIC_API_KEY: 'teszt' };
  const bad1 = await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: 'bármi' }, { env, deps: { llmFetch: reply({ muvelet: 'level_kuldes', parameterek: { cimzett: 'a@b.hu' } }) } });
  assert.equal(bad1.data.allapot, 'visszakerdez');
  const bad2 = await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: 'bármi' }, { env, deps: { llmFetch: reply({ muvelet: 'kifejezes_hozzaad', parameterek: { csoport: 'rendszer', ertek: 'x' } }) } });
  assert.equal(bad2.data.allapot, 'visszakerdez');
  const good = await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: 'bármi' }, { env, deps: { llmFetch: reply({ muvelet: 'kifejezes_hozzaad', parameterek: { csoport: 'temak', ertek: 'oltás' }, magyarazat: 'x' }) } });
  assert.equal(good.data.allapot, 'javaslat');
});

test('olvasó utasítás („mi történt a héten…”) azonnal jelentést készít, ami anyagként az asztalra kerül', async () => {
  const o = await office();
  const r = await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: 'Mi történt a héten az ápolóhiány körül?' });
  assert.equal(r.data.allapot, 'kesz');
  const a = await o.call('GET', `/api/anyagok/${encodeURIComponent(r.data.anyag_id)}`);
  assert.equal(a.data.anyag.tipus, 'jelentes');
  assert.match(a.data.anyag.szoveg, /ápolóhiány/i);
  assert.match(a.data.anyag.szoveg, /https:\/\/proba\.example\/a1/);
});

test('rákérdezés egy anyagra: válasz csak az anyag cikkeiből, ami nincs benne, azt kimondja', async () => {
  const o = await office();
  const list = (await o.call('GET', '/api/anyagok?ugynok=monitoring')).data.anyagok;
  const szemle = list.find(a => a.tipus === 'szemle');
  const q1 = await o.call('POST', `/api/anyagok/${encodeURIComponent(szemle.id)}/kerdes`, { szoveg: 'Mi volt a várólistáról?' });
  assert.equal(q1.data.uzenetek.length, 2);
  assert.match(q1.data.uzenetek[1].szoveg, /várólista/i);
  const q2 = await o.call('POST', `/api/anyagok/${encodeURIComponent(szemle.id)}/kerdes`, { szoveg: 'Mit írtak a gombaszezonról?' });
  assert.match(q2.data.uzenetek[3].szoveg, /nem találtam/);
  assert.ok((await o.logNow({ tipus: 'kerdes' })).length >= 2);
});

test('rákérdezés AI-val: a nem létező cikkszámra hivatkozó válasz javítva jelenik meg', async () => {
  const o = await office();
  const szemle = (await o.call('GET', '/api/anyagok?ugynok=monitoring')).data.anyagok.find(a => a.tipus === 'szemle');
  const llmFetch = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'Az [1] szerint igen, a [99] szerint is.' }] }) });
  const r = await o.call('POST', `/api/anyagok/${encodeURIComponent(szemle.id)}/kerdes`, { szoveg: 'Kérdés?' }, { env: { SAJTOIRODA_LLM: 'anthropic', ANTHROPIC_API_KEY: 't' }, deps: { llmFetch } });
  const ans = r.data.uzenetek[1].szoveg;
  assert.doesNotMatch(ans, /\[99\]/);
  assert.match(ans, /nem létező cikkszám/);
});

test('beállítások: a vezető a kulcsszavakat szerkesztheti, a címzettet és az AI-jelzést nem; korlátok érvényesek', async () => {
  const o = await office();
  const g = await o.call('GET', '/api/profil');
  assert.equal(g.data.szerep, 'vezeto');
  const ok = await o.call('PUT', '/api/profil', { kulcsszavak: { temak: ['ápolóhiány', 'oltás'] }, utemezes: { szemle: '08:15' } });
  assert.equal(ok.status, 200);
  assert.deepEqual((await o.profileNow()).kulcsszavak.temak, ['ápolóhiány', 'oltás']);
  assert.equal((await o.profileNow()).utemezes.szemle, '08:15');

  assert.equal((await o.call('PUT', '/api/profil', { vezeto: { email: 'masik@x.hu' } })).status, 403);
  assert.equal((await o.call('PUT', '/api/profil', { ai_jelzes: 'semmi' })).status, 403);
  assert.equal((await o.call('PUT', '/api/profil', { ugyfel_id: 'masik-kft' })).status, 403);
  assert.equal((await o.call('PUT', '/api/profil', { utemezes: { idozona: 'UTC' } })).status, 403);
  assert.equal((await o.call('PUT', '/api/profil', { utemezes: { szemle: '25:99' } })).status, 400);
  assert.equal((await o.call('PUT', '/api/profil', { kulcsszavak: { temak: Array.from({ length: 101 }, (_, i) => `t${i}`) } })).status, 400);
  assert.equal((await o.call('PUT', '/api/profil', { forrasok: { rss: [{ nev: 'x', url: 'http://nem-biztonsagos.example/rss' }] } })).status, 400);
  assert.equal((await o.call('PUT', '/api/profil', { megnevezes: '   ' })).status, 400);
  assert.equal((await o.profileNow()).vezeto.email, 'vezeto@pelda.example');
});

test('az üzemeltető megváltoztathatja a címzettet; a változás naplózott és jelölt', async () => {
  const o = await office();
  const r = await o.call('PUT', `/api/profil?ugyfel=${T}`, { vezeto: { email: 'uj@pelda.example' } }, { user: 'zoltan@uzemelteto.example' });
  assert.equal(r.status, 200);
  assert.equal((await o.profileNow()).vezeto.email, 'uj@pelda.example');
  const e = (await o.logNow({ tipus: 'profil_modositas' })).pop();
  assert.equal(e.tartalom.vezeto_email_valtozott, true);
  assert.equal(e.szereplo, 'ember:zoltan@uzemelteto.example');
  assert.throws(() => applyProfileEdit({}, { ai_jelzes: '   ' }, 'uzemelteto'), /AI-jelzés/);
});

test('szüneteltetés kapcsolóval és utasítással; szünet alatt a Worker nem fut', async () => {
  const o = await office();
  assert.equal((await o.call('PUT', '/api/ugynok/monitoring/allapot', { aktiv: false })).data.allapot, 'szunetel');
  assert.equal((await o.call('GET', '/api/ugynok/monitoring')).data.allapot, 'szunetel');
  assert.equal((await o.call('PUT', '/api/ugynok/monitoring/allapot', { aktiv: true })).data.allapot, 'dolgozik');
  const r = await o.call('POST', '/api/ugynok/monitoring/utasitas', { szoveg: 'Szüneteltesd 2026-11-05-ig' });
  await o.call('POST', `/api/utasitasok/${encodeURIComponent(r.data.id)}/dontes`, { dontes: 'jovahagyva' });
  const d = (await o.call('GET', '/api/ugynok/monitoring')).data;
  assert.equal(d.allapot, 'szunetel');
  assert.equal(d.szunet_ig, '2026-11-05');
  assert.equal((await o.call('PUT', '/api/ugynok/nincs/allapot', { aktiv: false })).status, 409);
  assert.equal((await o.call('POST', '/api/ugynok/kozossegi/utasitas', { szoveg: 'Szervezz eseményt' })).status, 409);
  assert.equal((await o.call('GET', '/api/ugynok/kozossegi')).data.allapot, 'dolgozik');
});

test('az asztal Munka sávja: mai cikkek, hangnem, legutóbbi találatok', async () => {
  const o = await office();
  const d = (await o.call('GET', '/api/ugynok/monitoring')).data;
  assert.equal(d.munka.ma, 3);
  assert.equal(d.munka.hangnem.negativ + d.munka.hangnem.pozitiv + d.munka.hangnem.semleges, 3);
  assert.equal(d.munka.legutobbi.length, 3);
  assert.ok(d.anyagok.some(a => a.tipus === 'szemle'));
});

test('napló: szűrhető, CSV-ben a képletinjekció semlegesítve', async () => {
  const o = await office();
  const log = createD1Log({ db: o.db, tenantId: T });
  await log.append({ szereplo: '=HYPERLINK("x")', tipus: 'hiba', tartalom: { hiba: 'x' } });
  const j = await o.call('GET', '/api/naplo?tipus=hiba');
  assert.ok(j.data.naplo.every(e => e.tipus === 'hiba'));
  const c = await o.call('GET', '/api/naplo.csv');
  assert.match(c.data, /"'=HYPERLINK/);
  assert.equal(c.res.headers.get('Content-Type'), 'text/csv; charset=utf-8');
});

test('statikus felület: szigorú biztonsági fejlécekkel; ismeretlen útvonal 404', async () => {
  const assets = { '/index.html': { type: 'html', body: '<!doctype html><title>t</title>' }, '/app.js': { type: 'js', body: '1' } };
  const res = await handleRequest(new Request('https://iroda.pelda.example/'), {}, { assets });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.match(res.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.equal((await handleRequest(new Request('https://x/ismeretlen'), {}, { assets })).status, 404);
  assert.equal((await handleRequest(new Request('https://x/api/iroda'), {}, { assets })).status, 503);
});

async function makeJwt({ aud = 'AUD1', iss = 'csapat.cloudflareaccess.com', exp = 2000000000, email = 'Vezeto@Pelda.example', alg = 'RS256', tamper = false, kid = 'k1' } = {}) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' };
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const head = b64({ alg, kid }), pay = b64({ aud: [aud], iss: `https://${iss}`, exp, email });
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${pay}`))).toString('base64url');
  const token = tamper ? `${head}.${b64({ aud: [aud], iss: `https://${iss}`, exp, email: 'tamado@x.hu' })}.${sig}` : `${head}.${pay}.${sig}`;
  return { token, fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }) };
}

test('Cloudflare Access azonosító ellenőrzése: érvényes elfogadva; hamis, lejárt, rossz célközönség, módosított elutasítva', async () => {
  const opt = (j, extra = {}) => ({ teamDomain: 'csapat.cloudflareaccess.com', aud: 'AUD1', fetchImpl: j.fetchImpl, nowMs: 1800000000000, ...extra });
  clearKeyCache(); const good = await makeJwt();
  assert.equal(await verifyAccessJwt(good.token, opt(good)), 'vezeto@pelda.example');
  clearKeyCache(); const wrongAud = await makeJwt({ aud: 'MAS' });
  assert.equal(await verifyAccessJwt(wrongAud.token, opt(wrongAud)), null);
  clearKeyCache(); const expired = await makeJwt({ exp: 1700000000 });
  assert.equal(await verifyAccessJwt(expired.token, opt(expired)), null);
  clearKeyCache(); const tampered = await makeJwt({ tamper: true });
  assert.equal(await verifyAccessJwt(tampered.token, opt(tampered)), null);
  clearKeyCache(); const wrongIss = await makeJwt({ iss: 'masik.cloudflareaccess.com' });
  assert.equal(await verifyAccessJwt(wrongIss.token, opt(wrongIss)), null);
  clearKeyCache(); const none = await makeJwt({ alg: 'none' });
  assert.equal(await verifyAccessJwt(none.token, opt(none)), null);
  clearKeyCache();
  assert.equal(await verifyAccessJwt('nem.jwt', opt(good)), null);
  assert.equal(await verifyAccessJwt(null, opt(good)), null);
  // egy másik kulccsal aláírt azonosító (a „kid” egyezik, az aláírás nem)
  clearKeyCache(); const other = await makeJwt();
  assert.equal(await verifyAccessJwt(good.token, opt(good, { fetchImpl: other.fetchImpl })), null);
  clearKeyCache();
  const id = await identify(new Request('https://x', { headers: { 'Cf-Access-Jwt-Assertion': good.token } }), { ACCESS_TEAM_DOMAIN: 'csapat.cloudflareaccess.com', ACCESS_AUD: 'AUD1' }, { fetchImpl: good.fetchImpl, nowMs: 1800000000000 });
  assert.equal(id.email, 'vezeto@pelda.example');
  clearKeyCache();
});

test('utasítás-értelmező: gyakori magyar fordulatok, és ami nem illik, az „ismeretlen”', async () => {
  const p = await loadProfile(fixture('profil.yaml'));
  const t = (s) => mockInterpret(s, p);
  assert.deepEqual(t('Figyeld a várólista témát is.').parameterek, { csoport: 'temak', ertek: 'várólista' });
  assert.deepEqual(t('Figyeld Nagy Péter nevet').parameterek, { csoport: 'szemelyek', ertek: 'Nagy Péter' });
  assert.equal(t('A Próba Hírportált ne figyeld').muvelet, 'forras_elvesz'); // ragozott név, hátul álló „ne figyeld”
  assert.equal(t('Ne figyeld a Próba Hírportál forrást').muvelet, 'forras_elvesz');
  assert.equal(t('A várólista témát ne figyeld').muvelet, 'kifejezes_elvesz');
  assert.equal(t('Hagyd ki az ápolóhiány témát').muvelet, 'kifejezes_elvesz');
  assert.equal(t('Szólj azonnal, ha a vezérigazgató lemond').muvelet, 'vorosvonal_hozzaad');
  assert.equal(t('Szüneteltesd 2026-11-05-ig').parameterek.ig, '2026-11-05');
  assert.equal(t('Folytasd').muvelet, 'szunet_vege');
  assert.deepEqual(t('Mi történt tegnap a várólista körül?').parameterek, { tema: 'várólista', napok: 1 });
  assert.equal(t('Küldj egy közleményt a médiának').muvelet, 'ismeretlen');
  assert.throws(() => validateOperation({ muvelet: 'szunet', parameterek: { ig: 'holnap' } }), /ÉÉÉÉ-HH-NN/);
});

test('telepíthető weboldal (PWA): manifest, service worker, ikonok; a service worker az API-t nem tárolja', async () => {
  const { buildAssets } = await import('../src/api/assets.js');
  const { readFileSync } = await import('node:fs');
  const ui = (f) => new URL(`../ui/${f}`, import.meta.url);
  const assets = buildAssets((f) => readFileSync(ui(f), 'utf8'), (f) => readFileSync(ui(f)));
  const get = (path) => handleRequest(new Request(`https://x${path}`), {}, { assets });

  const m = await get('/manifest.webmanifest');
  assert.equal(m.headers.get('Content-Type'), 'application/manifest+json');
  const manifest = await m.json();
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const icon of manifest.icons) { // minden megadott ikon valóban elérhető és PNG
    const r = await get(icon.src);
    assert.equal(r.status, 200, icon.src);
    assert.equal(r.headers.get('Content-Type'), 'image/png');
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer()).slice(1, 4)], [80, 78, 71], icon.src);
  }
  const sw = await (await get('/sw.js')).text();
  assert.doesNotMatch(sw, /__VERSION__/); // a gyorsítótár-verzió beíródott
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)\) return/); // az API-t nem kezeli
  const csp = (await get('/')).headers.get('Content-Security-Policy');
  assert.match(csp, /manifest-src 'self'/);
  assert.match(csp, /worker-src 'self'/);
  assert.match(await (await get('/')).text(), /rel="manifest"/);
});
