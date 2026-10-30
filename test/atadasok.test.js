import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createD1Shim } from '../src/dev/d1-shim.js';
import { createD1Log, createD1ProfileRepo } from '../src/cloudflare/d1.js';
import { createDesk, createAccessRepo } from '../src/cloudflare/desk.js';
import { createHandoffs, HANDOFF_LIMITS } from '../src/core/handoff.js';
import { runScheduled } from '../src/cloudflare/scheduler.js';
import { handleRequest } from '../src/api/router.js';
import { loadProfile } from '../src/core/profile.js';
import { fixture, readPrompts } from './helpers.js';

const IDS = ['monitoring', 'proaktiv', 'felkeszito', 'jogi'];
function setup({ available = ['monitoring'], handlers = new Map(), now = { t: new Date('2026-10-29T10:00:00Z') }, tenant = 'a' } = {}) {
  const db = createD1Shim();
  const clock = () => now.t;
  const log = createD1Log({ db, tenantId: tenant, now: clock });
  const desk = createDesk({ db, tenantId: tenant, now: clock });
  const avail = new Set(available);
  const h = createHandoffs({ repo: desk.atadasok, log, agentIds: IDS, handlers, now: clock, isAvailable: (id) => avail.has(id) });
  return { db, log, desk, h, avail, now, handlers };
}
const msg = (o = {}) => ({ from: 'monitoring', to: 'proaktiv', tipus: 'jelzes', targy: 'Téma', szoveg: 'Felerősödött', ...o });

test('üres asztalnak küldött átadás várakozik, az asztal megérkezésekor kézbesül; minden naplózott', async () => {
  const s = setup();
  const r = await s.h.send(msg());
  assert.deepEqual([r.ok, r.allapot], [true, 'varakozik']);
  assert.equal((await s.h.flush()).delivered, 0); // még üres az asztal
  s.avail.add('proaktiv');
  assert.equal((await s.h.flush()).delivered, 1);
  assert.equal((await s.desk.atadasok.get(r.id)).allapot, 'kezbesitve');
  const events = (await s.log.query({ tipus: 'atadas' })).map(e => e.tartalom.esemeny);
  assert.deepEqual(events, ['elkuldve', 'kezbesitve']);
});

test('van feldolgozó: azonnal kézbesül és feldolgozódik, a válasz megmarad', async () => {
  const handlers = new Map([['proaktiv', async (h) => ({ valasz: `Megkaptam: ${h.targy}` })]]);
  const s = setup({ available: ['monitoring', 'proaktiv'], handlers });
  const r = await s.h.send(msg());
  assert.equal(r.allapot, 'feldolgozva');
  assert.equal((await s.desk.atadasok.get(r.id)).valasz, 'Megkaptam: Téma');
});

test('hibás feldolgozó nem veszi el az átadást: kézbesítve marad, a hiba naplózódik', async () => {
  const s = setup({ available: ['monitoring', 'proaktiv'], handlers: new Map([['proaktiv', async () => { throw new Error('elromlott'); }]]) });
  const r = await s.h.send(msg());
  assert.equal(r.allapot, 'kezbesitve');
  assert.ok((await s.log.query({ tipus: 'hiba' })).some(e => /elromlott/.test(e.tartalom.hiba)));
});

test('érvénytelen átadás elutasítva és naplózva: ismeretlen munkatárs, önmagának, rossz típus, üres szöveg', async () => {
  const s = setup();
  for (const bad of [msg({ to: 'nincs' }), msg({ from: 'nincs' }), msg({ to: 'monitoring' }), msg({ tipus: 'level' }), msg({ szoveg: '  ' }), msg({ targy: '' })]) {
    assert.equal((await s.h.send(bad)).ok, false, JSON.stringify(bad));
  }
  assert.equal((await s.desk.atadasok.list()).length, 0);
  assert.equal((await s.log.query({ tipus: 'hiba' })).length, 6);
});

test('a lánc mélysége korlátozott: a harmadik szint még megy, a negyedik nem', async () => {
  const s = setup({ available: [] });
  let r = await s.h.send(msg());
  const depths = [0];
  for (let i = 0; i < HANDOFF_LIMITS.maxDepth; i++) {
    r = await s.h.send(msg({ from: i % 2 ? 'monitoring' : 'proaktiv', to: i % 2 ? 'proaktiv' : 'monitoring', parentId: r.id }));
    assert.equal(r.ok, true);
    depths.push((await s.desk.atadasok.get(r.id)).melyseg);
  }
  assert.deepEqual(depths, [0, 1, 2, 3]);
  const tooDeep = await s.h.send(msg({ parentId: r.id }));
  assert.equal(tooDeep.ok, false);
  assert.match(tooDeep.ok_reason, /mélység/);
  assert.equal((await s.h.send(msg({ parentId: 'nincs-ilyen' }))).ok, false);
});

test('napi keret: a keret feletti átadás nem jön létre; másnap újra lehet', async () => {
  const s = setup({ available: [] });
  for (let i = 0; i < HANDOFF_LIMITS.dailyQuota; i++) assert.equal((await s.h.send(msg({ targy: `T${i}` }))).ok, true);
  const over = await s.h.send(msg());
  assert.equal(over.ok, false);
  assert.match(over.ok_reason, /keret/);
  s.now.t = new Date('2026-10-30T00:05:00Z');
  assert.equal((await s.h.send(msg())).ok, true);
});

test('a megállított átadás sosem kézbesül; csak nyitott átadás állítható meg; a lezárás csak kézbesítettre megy', async () => {
  const s = setup();
  const r = await s.h.send(msg());
  assert.equal((await s.h.stop(r.id, 'ember:vezeto')).ok, true);
  s.avail.add('proaktiv');
  assert.equal((await s.h.flush()).delivered, 0);
  assert.equal((await s.desk.atadasok.get(r.id)).allapot, 'megallitva');
  assert.equal((await s.h.stop(r.id, 'ember:vezeto')).ok, false);
  assert.equal((await s.h.close(r.id, 'ember:vezeto')).ok, false);
  const r2 = await s.h.send(msg({ targy: 'Másik' })); // már dolgozik a címzett: azonnal kézbesül
  assert.equal(r2.allapot, 'kezbesitve');
  assert.equal((await s.h.close(r2.id, 'ember:vezeto', 'Rendben')).ok, true);
  assert.equal((await s.h.stop('nincs', 'x')).ok, false);
});

test('14 nap után a lezáratlan átadás lejár, és nem kézbesül', async () => {
  const s = setup();
  const r = await s.h.send(msg());
  s.now.t = new Date('2026-11-13T10:00:00Z'); // 15 nap
  s.avail.add('proaktiv');
  const out = await s.h.flush();
  assert.deepEqual([out.expired, out.delivered], [1, 0]);
  assert.equal((await s.desk.atadasok.get(r.id)).allapot, 'lejart');
});

test('a feldolgozó újabb átadást indíthat (válasz), a lánc mélysége nő; végtelen pingpong megáll', async () => {
  const handlers = new Map();
  const s = setup({ available: ['monitoring', 'proaktiv'], handlers });
  let count = 0, failed = 0;
  const pingpong = (self, other) => async (h) => { count++; const r = await s.h.send({ from: self, to: other, tipus: 'kerdes', targy: 'ping', szoveg: 'pong', parentId: h.id }); if (!r.ok) failed++; };
  handlers.set('monitoring', pingpong('monitoring', 'proaktiv'));
  handlers.set('proaktiv', pingpong('proaktiv', 'monitoring'));
  await s.h.send(msg());
  assert.equal(count, HANDOFF_LIMITS.maxDepth + 1); // 0..3 szint, utána megáll
  assert.equal(failed, 1);
});

test('az átadások ügyfelenként elkülönülnek', async () => {
  const db = createD1Shim();
  const mk = (tenant) => { const log = createD1Log({ db, tenantId: tenant }); const desk = createDesk({ db, tenantId: tenant }); return { desk, h: createHandoffs({ repo: desk.atadasok, log, agentIds: IDS, isAvailable: () => false }) }; };
  const a = mk('a'), b = mk('b');
  const r = await a.h.send(msg());
  assert.equal(await b.desk.atadasok.get(r.id), null);
  assert.equal((await b.desk.atadasok.list()).length, 0);
  assert.equal((await b.h.stop(r.id, 'x')).ok, false);
  assert.equal((await a.desk.atadasok.get(r.id)).allapot, 'varakozik');
});

// ---- az iroda API-ján keresztül
async function office() {
  const db = createD1Shim();
  const NOW = new Date('2026-10-29T06:30:00Z');
  const profile = await loadProfile(fixture('profil.yaml'));
  const repo = createD1ProfileRepo({ db, now: () => NOW });
  await repo.put(profile, { by: 'rendszer' });
  await repo.put({ ...profile, ugyfel_id: 'masik-kft', megnevezes: 'Másik Kft.' }, { by: 'rendszer' });
  const access = createAccessRepo({ db });
  await access.grant('vezeto@pelda.example', 'pelda-korhazak', 'vezeto');
  await access.grant('masik@masik.example', 'masik-kft', 'vezeto');
  const prompts = await readPrompts();
  const feed = await readFile(fixture('feed.xml'), 'utf8');
  await runScheduled({ DB: db }, { now: () => NOW, fetchText: async () => feed, prompts });
  const call = async (method, path, body, user = 'vezeto@pelda.example') => {
    const res = await handleRequest(new Request(`https://iroda.pelda.example${path}`, { method, headers: { 'X-Requested-With': 'iroda', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }),
      { DB: db, SAJTOIRODA_DEV_AUTH: '1', SAJTOIRODA_DEV_USER: user }, { now: () => NOW, prompts });
    return { status: res.status, data: await res.json() };
  };
  return { db, call };
}

test('a Monitoring riasztásából átadás születik; a megérkezett Proaktív feldolgozza és megszólalási javaslatot készít; az iroda és az asztal mutatja', async () => {
  const o = await office();
  const list = (await o.call('GET', '/api/atadasok')).data.atadasok;
  assert.ok(list.length >= 1);
  const h = list.find(x => x.hova === 'proaktiv');
  assert.deepEqual([h.honnan, h.hova, h.tipus, h.allapot], ['monitoring', 'proaktiv', 'jelzes', 'feldolgozva']);
  assert.ok(list.some(x => x.hova === 'kozossegi' && x.honnan === 'monitoring' && x.allapot === 'feldolgozva')); // ugyanaz a jelzés a Közösségi médiához is megy
  assert.ok(h.anyag_id); // a riasztás anyagára hivatkozik
  const iroda = (await o.call('GET', '/api/iroda')).data.ugynokok;
  assert.equal(iroda.find(a => a.id === 'proaktiv').atadas_varakozik, 0);
  assert.ok(iroda.find(a => a.id === 'proaktiv').jovahagyasra_var >= 1); // nyitott megszólalási javaslat
  assert.equal(iroda.find(a => a.id === 'monitoring').atadas_nyitott, 0);
  assert.ok((await o.call('GET', '/api/ugynok/proaktiv')).data.atadasok.some(x => x.id === h.id)); // a címzett asztalánál is látszik
  assert.ok((await o.call('GET', '/api/ugynok/monitoring')).data.atadasok.some(x => x.id === h.id)); // és a küldőnél is
  assert.ok((await o.call('GET', '/api/atadasok?allapot=feldolgozva')).data.atadasok.length >= 1);
  assert.equal((await o.call('GET', '/api/atadasok?allapot=lezarva')).data.atadasok.length, 0);
});

test('a vezető megállíthat egy átadást; másik ügyfél átadásához nem fér hozzá', async () => {
  const o = await office();
  // üres asztalnak (Eseményszervező) szóló átadás vár; azt lehet megállítani
  const id = await createDesk({ db: o.db, tenantId: 'pelda-korhazak' }).atadasok.add({ tipus: 'jelzes', honnan: 'monitoring', hova: 'esemenyszervezo', targy: 'T', szoveg: 'Sz', allapot: 'varakozik' });
  assert.equal((await o.call('POST', `/api/atadasok/${encodeURIComponent(id)}/megallit`, {}, 'masik@masik.example')).status, 404);
  assert.equal((await o.call('POST', `/api/atadasok/${encodeURIComponent(id)}/megallit`, {})).status, 200);
  assert.equal((await o.call('GET', '/api/atadasok?allapot=megallitva')).data.atadasok[0].id, id);
  assert.equal((await o.call('POST', `/api/atadasok/${encodeURIComponent(id)}/megallit`, {})).status, 409);
  assert.equal((await o.call('GET', '/api/atadasok', undefined, 'masik@masik.example')).data.atadasok.every(x => x.id !== id), true);
});

test('az átadás belső: nem hoz létre kimenő levelet a vezetőn kívül senkinek', async () => {
  const o = await office();
  const { results } = await o.db.prepare('SELECT DISTINCT cimzett FROM proba_levelek').all();
  assert.ok(results.every(r => r.cimzett === 'vezeto@pelda.example'));
});
