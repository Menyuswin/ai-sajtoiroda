import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFeed, canonicalUrl, newsSearchUrl } from '../src/agents/monitoring/sources.js';
import { dedupe } from '../src/agents/monitoring/dedupe.js';
import { filterArticles } from '../src/agents/monitoring/filter.js';
import { mockClassify, normalizeClassification } from '../src/agents/monitoring/classify.js';
import { computeTrends } from '../src/agents/monitoring/trend.js';
import { validateSynthesis } from '../src/agents/monitoring/digest.js';
import { loadProfile } from '../src/core/profile.js';
import { fixture, makeCtx } from './helpers.js';
import { monitoringAgent } from '../src/agents/monitoring/index.js';

const feedXml = () => readFile(fixture('feed.xml'), 'utf8');

test('feed értelmezése: CDATA, HTML-tisztítás, dátum, tracking nélküli URL', async () => {
  const items = parseFeed(await feedXml(), 'Próba', '2026-10-29T06:30:00Z');
  assert.equal(items.length, 6);
  assert.equal(items[0].url, 'https://proba.example/a1');
  assert.equal(items[0].summary, 'Az ápolóhiány miatt osztályokat zárnak be.');
  assert.equal(items[0].published, '2026-10-29T05:10:00.000Z');
  assert.equal(canonicalUrl('https://X.example/p/?utm_source=a&b=1#frag'), 'https://x.example/p/?b=1');
  assert.match(newsSearchUrl('"Példa Kórházak"'), /^https:\/\/news\.google\.com\/rss\/search\?q=%22P/);
});

test('duplikátumok: azonos URL (tracking után) és azonos cím kiesik, ismert cikk is', async () => {
  const items = parseFeed(await feedXml(), 'Próba', 'x');
  const out = dedupe(items);
  assert.equal(out.length, 5);
  assert.equal(dedupe(out, [out[0]]).length, 4);
});

test('szűrés: ragozott alak, ékezet nélkül is; kizáró szó; nem releváns kiesik', async () => {
  const p = await loadProfile(fixture('profil.yaml'));
  const items = dedupe(parseFeed(await feedXml(), 'Próba', 'x'));
  const hits = filterArticles(items, p);
  assert.deepEqual(hits.map(a => a.url.split('/').pop()), ['a1', 'a2', 'a3']);
  const noAccent = filterArticles([{ title: 'apolohianyrol szolo cikk', summary: '' }], p);
  assert.equal(noAccent.length, 1);
});

test('mock besorolás: hangnem, fontosság, vörös vonal; a normalizálás határt szab', async () => {
  const p = await loadProfile(fixture('profil.yaml'));
  const hits = filterArticles(dedupe(parseFeed(await feedXml(), 'Próba', 'x')), p);
  const [a1, a2, a3] = hits.map(a => mockClassify(a, p));
  assert.equal(a1.hangnem, 'negativ');
  assert.equal(a2.hangnem, 'pozitiv');
  assert.equal(a3.voros_vonal, true);
  assert.ok(a1.fontossag >= 1 && a1.fontossag <= 5);
  const n = normalizeClassification({ fontossag: 99, hangnem: 'borús' }, 'm');
  assert.equal(n.fontossag, 5);
  assert.equal(n.hangnem, 'semleges');
  assert.equal(n.bizonytalan, true);
});

function mk(term, isoDate, n) {
  return Array.from({ length: n }, (_, i) => ({ id: `${term}${isoDate}${i}`, matches: [{ type: 'tema', term }], published: isoDate, fetchedAt: isoDate }));
}

test('trend: kiugrás jelez, normál nap nem, kevés előzménynél nincs jelzés', async () => {
  const p = await loadProfile(fixture('profil.yaml')); // minimum 3, szorzó 2
  const hist = [];
  for (let d = 20; d <= 28; d++) hist.push(...mk('ápolóhiány', `2026-10-${d}T10:00:00Z`, 1));
  const spike = [...hist, ...mk('ápolóhiány', '2026-10-29T08:00:00Z', 6)];
  const t = computeTrends({ articles: spike, profile: p, now: new Date('2026-10-29T09:00:00Z') });
  assert.equal(t[0].term, 'ápolóhiány');
  assert.equal(t[0].signal, true);

  const calm = [...hist, ...mk('ápolóhiány', '2026-10-29T08:00:00Z', 1)];
  assert.equal(computeTrends({ articles: calm, profile: p, now: new Date('2026-10-29T09:00:00Z') })[0].signal, false);

  const young = mk('ápolóhiány', '2026-10-29T08:00:00Z', 9);
  const ty = computeTrends({ articles: young, profile: p, now: new Date('2026-10-29T09:00:00Z') });
  assert.equal(ty[0].signal, false);
  assert.equal(ty[0].enough_history, false);
});

test('narratíva csak létező cikkszámra hivatkozhat', () => {
  const { synthesis, dropped } = validateSynthesis({
    osszkep: 'ok', figyelni: null,
    narrativak: [{ szoveg: 'jó', cikkek: [1, 2] }, { szoveg: 'kitalált', cikkek: [9] }, { szoveg: 'félig', cikkek: [2, 7] }],
  }, new Set([1, 2]));
  assert.deepEqual(synthesis.narrativak.map(n => n.cikkek), [[1, 2], [2]]);
  assert.deepEqual(dropped, ['kitalált']);
});

test('teljes futás (száraz, mock): szemle fájlba kerül, napló és tár kitöltve, nem megy ki semmi', async () => {
  const { ctx, outFiles } = await makeCtx();
  const r = await monitoringAgent.run(ctx, { mode: 'digest' });
  assert.equal(r.digest, true);
  assert.equal(r.articles, 3);
  const files = await outFiles();
  assert.ok(files.some(f => f.endsWith('belso_jelentes.txt')));
  assert.ok(files.some(f => f.endsWith('riasztas.txt')), 'a vörös vonalas cikk riasztást ad');
  const log = await ctx.log.query();
  const types = new Set(log.map(e => e.tipus));
  for (const t of ['cikk_besorolas', 'riasztas_elkuldve', 'szemle_elkuldve', 'futas']) assert.ok(types.has(t), t);
  assert.ok(log.every(e => e.tenant_id === 'pelda-korhazak'));
  const stored = await ctx.store.load();
  assert.equal(stored.length, 3);
  assert.ok(stored.every(a => a.reportedAt));
});

test('a szemle tartalma: számok, cikklista linkkel, AI-jelzés', async () => {
  const { ctx, config } = await makeCtx();
  await monitoringAgent.run(ctx, { mode: 'digest' });
  const { readdir } = await import('node:fs/promises');
  const dir = join(config.outDir, 'pelda-korhazak');
  const f = (await readdir(dir)).find(x => x.endsWith('belso_jelentes.txt'));
  const body = await readFile(join(dir, f), 'utf8');
  assert.match(body, /Címzett: vezeto@pelda\.example/);
  assert.match(body, /3 cikk:/);
  assert.match(body, /https:\/\/proba\.example\/a1/);
  assert.match(body, /mesterséges intelligencia/);
  assert.doesNotMatch(body, /időjárás/i);
});

test('második futás ugyanazzal a feeddel: nincs új cikk, nincs ismételt riasztás', async () => {
  const { ctx, outFiles } = await makeCtx();
  await monitoringAgent.run(ctx, { mode: 'digest' });
  const before = (await outFiles()).filter(f => f.endsWith('riasztas.txt')).length;
  const r = await monitoringAgent.run(ctx, { mode: 'digest' });
  assert.equal(r.classified, 0);
  assert.equal(r.alerts, 0);
  assert.equal((await outFiles()).filter(f => f.endsWith('riasztas.txt')).length, before);
});

test('check mód: csak riasztás, szemle nem készül, a cikkek jelentetlenek maradnak', async () => {
  const { ctx, outFiles } = await makeCtx();
  const r = await monitoringAgent.run(ctx, { mode: 'check' });
  assert.equal(r.digest, false);
  assert.ok(!(await outFiles()).some(f => f.endsWith('belso_jelentes.txt')));
  assert.ok((await ctx.store.load()).every(a => !a.reportedAt));
});

test('kikapcsolt ügynök nem fut, és ez naplózva van', async () => {
  const { ctx } = await makeCtx({ profileMod: p => ({ ...p, ugynokok: { monitoring: { aktiv: false } } }) });
  const r = await monitoringAgent.run(ctx);
  assert.equal(r.skipped, true);
  assert.equal((await ctx.store.load()).length, 0);
  assert.equal((await ctx.log.query({ tipus: 'futas' })).length, 1);
});

test('hibás forrás nem állítja le a futást, hanem naplózódik', async () => {
  const feed = await feedXml();
  const { ctx } = await makeCtx({
    profileMod: p => ({ ...p, forrasok: { ...p.forrasok, rss: [...p.forrasok.rss, { nev: 'Rossz', url: 'https://rossz.example/rss' }] } }),
    fetchText: async (url) => { if (url.includes('rossz')) throw new Error('HTTP 503'); return feed; },
  });
  const r = await monitoringAgent.run(ctx);
  assert.equal(r.errors, 1);
  assert.equal(r.digest, true);
  assert.equal((await ctx.log.query({ tipus: 'hiba' })).length >= 1, true);
});

test('AI-mód (hamis API-val): besorolás a modell JSON-jából, kitalált cikkszám elvetve, hibára mock-tartalék', async () => {
  const calls = [];
  const llmFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.model);
    if (body.model === 'm-c') {
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"relevans":true,"fontossag":4,"tema":"ápolóhiány","hangnem":"negativ","erintett_szereplok":[],"voros_vonal":false,"indoklas":"teszt","bizonytalan":false}' }] }) };
    }
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"osszkep":"Összkép.","narrativak":[{"szoveg":"valós","cikkek":[1]},{"szoveg":"kitalált","cikkek":[42]}],"figyelni":null}' }] }) };
  };
  const { ctx } = await makeCtx({ llmMode: 'anthropic', llmFetch });
  const r = await monitoringAgent.run(ctx);
  assert.equal(r.digest, true);
  assert.ok(calls.includes('m-c') && calls.includes('m-s'));
  const hibak = await ctx.log.query({ tipus: 'hiba' });
  assert.ok(hibak.some(e => e.tartalom.hiba.includes('ellenőrizhetetlen')));
  const stored = await ctx.store.load();
  assert.equal(stored[0].cls.modell, 'm-c');
});

test('AI-hiba esetén a futás nem áll le: bizonytalan besorolás, napló', async () => {
  const llmFetch = async () => ({ ok: false, status: 529 });
  const { ctx } = await makeCtx({ llmMode: 'anthropic', llmFetch });
  const r = await monitoringAgent.run(ctx);
  assert.equal(r.digest, true);
  const stored = await ctx.store.load();
  assert.ok(stored.every(a => a.cls.bizonytalan && a.cls.modell === 'hiba'));
});
