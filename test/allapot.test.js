import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createD1Shim } from '../src/dev/d1-shim.js';
import { createD1ProfileRepo } from '../src/cloudflare/d1.js';
import { createAccessRepo } from '../src/cloudflare/desk.js';
import { handleRequest } from '../src/api/router.js';
import { runScheduled } from '../src/cloudflare/scheduler.js';
import { loadProfile } from '../src/core/profile.js';
import { explainError } from '../src/agents/monitoring/sources.js';
import { fixture, readPrompts } from './helpers.js';

const NOW = new Date('2026-10-29T06:30:00Z');
const T = 'pelda-korhazak';
const profile = await loadProfile(fixture('profil.yaml'));

async function setup(feedFn) {
  const db = createD1Shim();
  await createD1ProfileRepo({ db, now: () => NOW }).put({ ...profile, forrasok: { ...profile.forrasok, rss: [...profile.forrasok.rss, { nev: 'Tiltott Portál', url: 'https://tiltott.example/rss' }, { nev: 'Régi Portál', url: 'https://regi.example/rss' }] } }, { by: 'rendszer' });
  const access = createAccessRepo({ db });
  await access.grant('vezeto@pelda.example', T, 'vezeto'); await access.grant('uzemelteto@x.example', T, 'uzemelteto');
  const prompts = await readPrompts();
  const press = await readFile(fixture('feed.xml'), 'utf8');
  const state = { calls: 0, fn: feedFn || (async (url) => { if (url.includes('tiltott')) throw new Error('HTTP 403'); if (url.includes('regi')) throw new Error('HTTP 404'); return press; }) };
  const fetchText = async (url) => { state.calls++; return state.fn(url); };
  const env = { DB: db, SAJTOIRODA_DEV_AUTH: '1' };
  const call = async (method, path, body, { user = 'vezeto@pelda.example', now = NOW } = {}) => {
    const init = { method, headers: method === 'GET' ? {} : { 'X-Requested-With': 'iroda', 'Content-Type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await handleRequest(new Request(`https://iroda.pelda.example${path}`, init), { ...env, SAJTOIRODA_DEV_USER: user }, { now: () => now, prompts, fetchText });
    const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return { db, call, state, run: (now = NOW) => runScheduled(env, { now: () => now, fetchText, prompts }) };
}

test('a hibamagyarázatok érthetőek', () => {
  assert.match(explainError('HTTP 403'), /blokkol/); assert.match(explainError('HTTP 404'), /nem létezik/); assert.match(explainError('HTTP 503'), /túlterhelt|elutasítja/);
  assert.match(explainError('nincs cikk a csatornában'), /nincs benne cikk/); assert.match(explainError('The operation was aborted due to timeout'), /időben/);
});

test('futás előtt nincs életjel; futás után az életjel és a forrásonkénti állapot rögzül, a hibák magyarázattal; az üzemeltető is látja', async () => {
  const s = await setup();
  assert.equal((await s.call('GET', '/api/iroda')).data.futas.allapot, 'nincs');
  assert.deepEqual((await s.call('GET', '/api/forrasok/allapot')).data.forrasok, []);
  await s.run();
  const f = (await s.call('GET', '/api/iroda')).data.futas;
  assert.equal(f.allapot, 'rendben'); assert.equal(f.kor_perc, 0); assert.ok(f.kulso_keres >= 3); assert.ok(f.cikk_lekert > 0); assert.ok(f.idotartam_ms >= 0);
  const st = (await s.call('GET', '/api/forrasok/allapot', undefined, { user: 'uzemelteto@x.example' })).data;
  assert.equal(st.forrasok.length, 3);
  const bad = st.forrasok.filter(r => !r.ok);
  assert.deepEqual(bad.map(r => r.nev).sort(), ['Régi Portál', 'Tiltott Portál']);
  assert.match(bad.find(r => r.nev === 'Tiltott Portál').magyarazat, /blokkol/); assert.match(bad.find(r => r.nev === 'Régi Portál').magyarazat, /nem létezik/);
  assert.ok(st.forrasok.find(r => r.ok).cikkek > 0);
  // 4 óra csend: késik
  const late = new Date(NOW.getTime() + 4 * 3600e3);
  assert.equal((await s.call('GET', '/api/iroda', undefined, { now: late })).data.futas.allapot, 'kesik');
});

test('az egészség-végpont belépés nélkül működik, nem árul el ügyfelet; késő futásnál 503', async () => {
  const s = await setup();
  const probe = async (now) => { const res = await handleRequest(new Request('https://iroda.pelda.example/api/egeszseg'), { DB: s.db }, { now: () => now }); return { status: res.status, data: await res.json() }; };
  assert.deepEqual(await probe(NOW), { status: 200, data: { allapot: 'indul', kor_perc: null } });
  await s.run();
  const ok = await probe(new Date(NOW.getTime() + 10 * 60e3));
  assert.equal(ok.status, 200); assert.deepEqual(ok.data, { allapot: 'ok', kor_perc: 10 });
  assert.ok(!JSON.stringify(ok.data).includes('pelda'));
  assert.equal((await probe(new Date(NOW.getTime() + 4 * 3600e3))).status, 503);
});

test('a források próbája mér, percenként egyszer kérhető, az utolsó sikeres idő megmarad, és a javított forrás eltűnik a hibák közül', async () => {
  const s = await setup();
  await s.run();
  s.state.fn = async () => { throw new Error('HTTP 503'); };
  const t2 = new Date(NOW.getTime() + 3600e3);
  const p1 = await s.call('POST', '/api/forrasok/proba', {}, { now: t2 });
  assert.equal(p1.status, 200); assert.equal(p1.data.hibas, 3);
  assert.equal((await s.call('POST', '/api/forrasok/proba', {}, { now: new Date(t2.getTime() + 20e3) })).status, 429);
  const st = (await s.call('GET', '/api/forrasok/allapot', undefined, { now: t2 })).data;
  assert.ok(st.forrasok.every(r => !r.ok) && st.forrasok[0].utolso_siker_ido, 'az utolsó sikeres idő megmarad');
  s.state.fn = async () => readFile(fixture('feed.xml'), 'utf8');
  const p2 = await s.call('POST', '/api/forrasok/proba', {}, { now: new Date(t2.getTime() + 90e3) });
  assert.equal(p2.data.hibas, 0);
  assert.equal((await s.call('POST', '/api/forrasok/proba', {}, { now: new Date(t2.getTime() + 95e3) })).status, 429); // a próba után újra várni kell
  assert.equal((await s.call('GET', '/api/forrasok/allapot', undefined, { now: t2 })).data.forrasok.every(r => r.ok), true);
});

test('a hírkereső szolgáltatója állítható (Google vagy Bing); a Bing átirányító címe kibontódik; a profil menthető', async () => {
  const { bingNewsUrl, newsSearchUrl, unwrapRedirect, collectArticles } = await import('../src/agents/monitoring/sources.js');
  assert.match(bingNewsUrl('"receptnaptár"'), /^https:\/\/www\.bing\.com\/news\/search\?q=%22receptnapt%C3%A1r%22&format=rss/);
  assert.match(newsSearchUrl('x'), /news\.google\.com/);
  assert.equal(unwrapRedirect('http://www.bing.com/news/apiclick.aspx?ref=FexRss&url=https%3a%2f%2fpelda.hu%2fcikk%3fa%3d1&c=1'), 'https://pelda.hu/cikk?a=1');
  assert.equal(unwrapRedirect('https://pelda.hu/x'), 'https://pelda.hu/x');
  const bingProfile = { ...profile, forrasok: { ...profile.forrasok, rss: [], hirkereso: ['"Példa Kórházak"'], hirkereso_motor: 'bing' } };
  const feed = '<rss><channel><item><title>Példa Kórházak hír</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fhir.example%2fa1&amp;c=1</link><pubDate>Thu, 29 Oct 2026 06:10:00 GMT</pubDate></item></channel></rss>';
  const seen = [];
  const r = await collectArticles(bingProfile, { fetchText: async (u) => { seen.push(u); return feed; }, now: () => NOW });
  assert.match(seen[0], /bing\.com\/news\/search/); assert.equal(r.articles[0].url, 'https://hir.example/a1'); assert.equal(r.report[0].nev, 'Keresés: "Példa Kórházak"');
  const s = await setup();
  assert.equal((await s.call('PUT', '/api/profil', { forrasok: { hirkereso_motor: 'bing' } })).status, 200);
  assert.equal((await s.call('GET', '/api/profil')).data.profil.forrasok.hirkereso_motor, 'bing');
  assert.equal((await s.call('PUT', '/api/profil', { forrasok: { hirkereso_motor: 'rossz' } })).status, 200);
  assert.equal((await s.call('GET', '/api/profil')).data.profil.forrasok.hirkereso_motor, 'google'); // ismeretlen érték → alapérték
});
