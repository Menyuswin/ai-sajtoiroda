import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1Shim } from '../src/dev/d1-shim.js';
import { createD1ProfileRepo, createD1Log } from '../src/cloudflare/d1.js';
import { createAccessRepo } from '../src/cloudflare/desk.js';
import { handleRequest } from '../src/api/router.js';
import { loadProfile } from '../src/core/profile.js';
import { issueSession, verifySession, passphraseOk } from '../src/api/session.js';
import { fixture, readPrompts } from './helpers.js';

const NOW = new Date('2026-10-30T10:00:00Z');
const T = 'pelda-korhazak';
const EMAIL = 'vezeto@pelda.example';
const PASS = 'korte-alma-szel-kert-nyar-hold';
const profile = await loadProfile(fixture('profil.yaml'));

async function setup(extra = {}) {
  const db = createD1Shim();
  await createD1ProfileRepo({ db, now: () => NOW }).put(profile, { by: 'rendszer' });
  await createAccessRepo({ db }).grant(EMAIL, T, 'vezeto');
  const prompts = await readPrompts();
  const env = { DB: db, SAJTOIRODA_JELMONDAT: PASS, SAJTOIRODA_BELEPES_EMAIL: EMAIL, ...extra };
  let clock = NOW;
  const call = async (method, path, body, { cookie = null, now = () => clock, headers = {} } = {}) => {
    const init = { method, headers: { ...(method === 'GET' ? {} : { 'X-Requested-With': 'iroda', 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await handleRequest(new Request(`https://iroda.pelda.example${path}`, init), env, { now, prompts });
    const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, setCookie: res.headers.get('Set-Cookie') };
  };
  const login = (pw = PASS) => call('POST', '/api/belepes', { jelmondat: pw });
  return { db, call, login, env, tick: (ms) => { clock = new Date(clock.getTime() + ms); }, log: (f) => createD1Log({ db, tenantId: T }).query(f) };
}

test('jelmondat nélkül zárva: az API 401-et ad a belépési jelzéssel; hibás jelmondat 401; helyes jelmondat sütit ad, amellyel az iroda megnyílik', async () => {
  const s = await setup();
  const closed = await s.call('GET', '/api/iroda');
  assert.equal(closed.status, 401); assert.equal(closed.data.belepes, 'jelmondat');
  assert.equal((await s.login('rossz jelmondat')).status, 401);
  const ok = await s.login();
  assert.equal(ok.status, 200);
  assert.match(ok.setCookie, /HttpOnly/); assert.match(ok.setCookie, /Secure/); assert.match(ok.setCookie, /SameSite=Strict/);
  assert.ok(!ok.setCookie.includes(PASS));
  const cookie = ok.setCookie.split(';')[0];
  const office = await s.call('GET', '/api/iroda', undefined, { cookie });
  assert.equal(office.status, 200); assert.equal(office.data.felhasznalo.email, EMAIL); assert.equal(office.data.mod.belepes, 'jelmondat');
  assert.equal((await s.call('GET', '/api/iroda', undefined, { cookie: `${cookie}x` })).status, 401); // hamisított süti
  const loggedOut = await s.call('POST', '/api/kilepes', {});
  assert.match(loggedOut.setCookie, /Max-Age=0/);
  const tipusok = (await s.log({ tipus: 'belepes' })).map(e => e.tartalom.eredmeny);
  assert.deepEqual(tipusok, ['hibas_jelmondat', 'sikeres']);
});

test('a süti 12 óra után lejár; a jelmondat cseréje érvényteleníti; másik e-mail-címre szóló süti nem jó', async () => {
  const s = await setup();
  const cookie = (await s.login()).setCookie.split(';')[0];
  assert.equal((await s.call('GET', '/api/iroda', undefined, { cookie })).status, 200);
  assert.equal((await s.call('GET', '/api/iroda', undefined, { cookie, now: () => new Date(NOW.getTime() + 13 * 3600e3) })).status, 401);
  s.env.SAJTOIRODA_JELMONDAT = 'teljesen-mas-jelmondat-szavak-itt';
  assert.equal((await s.call('GET', '/api/iroda', undefined, { cookie })).status, 401);
  const v = await issueSession({ secret: PASS, email: 'masik@pelda.example', nowMs: NOW.getTime() });
  assert.equal(await verifySession(`iroda_session=${v}`, { secret: PASS, email: EMAIL, nowMs: NOW.getTime() }), null);
  assert.equal(await passphraseOk(PASS, PASS), true); assert.equal(await passphraseOk(`${PASS} `, PASS), false);
});

test('5 hibás próba után 15 percre zárol (a helyes jelmondat sem jó); lejárat után újra lehet; a sikeres belépés törli a számlálót', async () => {
  const s = await setup();
  for (let i = 0; i < 4; i++) assert.equal((await s.login('rossz')).status, 401);
  assert.equal((await s.login(PASS)).status, 200); // a sikeres belépés nullázza
  for (let i = 0; i < 4; i++) assert.equal((await s.login('rossz')).status, 401);
  const fifth = await s.login('rossz');
  assert.equal(fifth.status, 401); assert.match(fifth.data.hiba, /zárolva/);
  const locked = await s.login(PASS);
  assert.equal(locked.status, 429); assert.match(locked.data.hiba, /perc múlva/);
  s.tick(16 * 60e3);
  assert.equal((await s.login(PASS)).status, 200);
});

test('a jelmondat nélküli vagy rövid jelmondatú beállítás zárva marad; kérésvédelem (fejléc, eredet, JSON); Access mellett a jelmondatos belépés nem él', async () => {
  const noPass = await setup({ SAJTOIRODA_JELMONDAT: undefined });
  assert.equal((await noPass.call('GET', '/api/iroda')).status, 503);
  assert.equal((await noPass.login()).status, 503);
  const short = await setup({ SAJTOIRODA_JELMONDAT: 'rovid' });
  assert.equal((await short.call('GET', '/api/iroda')).status, 503); assert.equal((await short.login('rovid')).status, 503);
  const s = await setup();
  assert.equal((await s.call('POST', '/api/belepes', { jelmondat: PASS }, { headers: { 'X-Requested-With': 'masik' } })).status, 403);
  assert.equal((await s.call('POST', '/api/belepes', { jelmondat: PASS }, { headers: { Origin: 'https://rosszindulatu.example' } })).status, 403);
  assert.equal((await s.call('POST', '/api/belepes', { jelmondat: PASS }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const access = await setup({ ACCESS_TEAM_DOMAIN: 'x.cloudflareaccess.com', ACCESS_AUD: 'aud' });
  assert.equal((await access.login()).status, 404); // az Access van érvényben
  const nobody = await setup(); await nobody.db.prepare('DELETE FROM felhasznalok').run();
  assert.equal((await nobody.login()).status, 403); // jelmondat jó, de nincs szerepe
});
