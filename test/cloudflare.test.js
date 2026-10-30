import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createD1Shim } from '../src/dev/d1-shim.js';
import { createD1Log, createD1Store, createD1ProfileRepo, profileToSql, accessToSql, hostToSql } from '../src/cloudflare/d1.js';
import { createAccessRepo } from '../src/cloudflare/desk.js';
import { decideMode, localTime, runScheduled } from '../src/cloudflare/scheduler.js';
import { loadProfile } from '../src/core/profile.js';
import { fixture, readPrompts } from './helpers.js';

const feed = () => readFile(fixture('feed.xml'), 'utf8');

test('napló D1-ben: hozzáfűzős, ügyfelenként elkülönül, ismeretlen típust és mezőt elutasít', async () => {
  const db = createD1Shim();
  const a = createD1Log({ db, tenantId: 'a' });
  const b = createD1Log({ db, tenantId: 'b' });
  await a.append({ szereplo: 'rendszer', tipus: 'futas', tartalom: { x: 1 } });
  await b.append({ szereplo: 'rendszer', tipus: 'futas' });
  assert.equal((await a.query()).length, 1);
  assert.deepEqual((await a.query({ tipus: 'futas' }))[0].tartalom, { x: 1 });
  await assert.rejects(a.append({ szereplo: 'x', tipus: 'valami' }), /Ismeretlen/);
  await assert.rejects(a.query({ 'tenant_id; DROP TABLE naplo': 1 }), /Nem szűrhető/);
  assert.throws(() => db.raw.exec("UPDATE naplo SET szereplo = 'hamis'"), /hozzáfűzős/);
});

test('cikktár D1-ben: mentés, frissítés, ügyfél-elkülönítés, megőrzési törlés', async () => {
  const db = createD1Shim();
  const s = createD1Store({ db, tenantId: 'a' });
  const other = createD1Store({ db, tenantId: 'b' });
  await s.save([{ id: '1', fetchedAt: '2020-01-01T00:00:00Z' }, { id: '2', fetchedAt: '2026-10-01T00:00:00Z', reportedAt: null }]);
  await other.save([{ id: '1', fetchedAt: '2026-10-01T00:00:00Z' }]);
  await s.save([{ id: '2', fetchedAt: '2026-10-01T00:00:00Z', reportedAt: '2026-10-02T00:00:00Z' }]);
  assert.equal((await s.load()).find(x => x.id === '2').reportedAt, '2026-10-02T00:00:00Z');
  await s.purgeOlderThan('2025-01-01T00:00:00Z');
  assert.deepEqual((await s.load()).map(x => x.id), ['2']);
  assert.equal((await other.load()).length, 1);
});

test('profiltár: érvénytelen nem kerül be; módosítás verziót emel és naplózódik, a címzett-váltás jelölt', async () => {
  const db = createD1Shim();
  const repo = createD1ProfileRepo({ db });
  const p = await loadProfile(fixture('profil.yaml'));
  await assert.rejects(repo.put({ ...p, vezeto: { nev: 'x', email: 'rossz' } }, { by: 'ember:teszt' }), /vezeto\.email/);
  assert.equal((await repo.list()).length, 0);
  assert.equal((await repo.put(p, { by: 'ember:vezeto' })).version, 1);
  const r = await repo.put({ ...p, vezeto: { ...p.vezeto, email: 'uj@pelda.example' } }, { by: 'ember:vezeto' });
  assert.equal(r.version, 2);
  const log = await createD1Log({ db, tenantId: p.ugyfel_id }).query({ tipus: 'profil_modositas' });
  assert.equal(log.length, 2);
  assert.equal(log[1].tartalom.vezeto_email_valtozott, true);
  assert.ok(log[1].tartalom.valtozott.includes('vezeto'));
});

test('profileToSql: idézőjelet megfelelően kezel, és a kimenet beolvasható', async () => {
  const db = createD1Shim();
  const p = await loadProfile(fixture('profil.yaml'));
  db.raw.exec(profileToSql({ ...p, megnevezes: "O'Brien Kft." }));
  const repo = createD1ProfileRepo({ db });
  assert.equal((await repo.get(p.ugyfel_id)).profile.megnevezes, "O'Brien Kft.");
});

test('ütemezés: szemle-időpont után naponta egyszer, egyébként ellenőrzés; nyári/téli idő kezelve', async () => {
  const p = await loadProfile(fixture('profil.yaml')); // alapértelmezett 07:30 Europe/Budapest
  assert.equal(localTime(new Date('2026-07-01T05:30:00Z'), 'Europe/Budapest'), '07:30'); // nyár: UTC+2
  assert.equal(localTime(new Date('2026-12-01T06:30:00Z'), 'Europe/Budapest'), '07:30'); // tél: UTC+1
  assert.equal(decideMode(p, new Date('2026-12-01T05:30:00Z'), null), 'check');   // még 06:30 van
  assert.equal(decideMode(p, new Date('2026-12-01T06:30:00Z'), null), 'digest');
  assert.equal(decideMode(p, new Date('2026-12-01T09:30:00Z'), '2026-12-01'), 'check'); // ma már volt
  assert.equal(decideMode(p, new Date('2026-12-02T06:30:00Z'), '2026-12-01'), 'digest');
});

test('Worker-futás D1-gyel: szemle a próbalevelek közé kerül, nem megy ki; óránkénti ellenőrzés nem ismétel', async () => {
  const db = createD1Shim();
  const p = await loadProfile(fixture('profil.yaml'));
  await createD1ProfileRepo({ db }).put(p, { by: 'rendszer' });
  const prompts = await readPrompts();
  const f = await feed();
  const env = { DB: db };
  const base = { fetchText: async () => f, prompts };

  const early = await runScheduled(env, { ...base, now: () => new Date('2026-10-29T04:30:00Z') }); // 05:30 helyi
  assert.equal(early[0].mode, 'check');
  assert.equal(early[0].digest, false);

  const morning = await runScheduled(env, { ...base, now: () => new Date('2026-10-29T06:30:00Z') }); // 07:30 helyi
  assert.equal(morning[0].mode, 'digest');
  assert.equal(morning[0].digest, true);

  const later = await runScheduled(env, { ...base, now: () => new Date('2026-10-29T10:30:00Z') });
  assert.equal(later[0].mode, 'check'); // aznapra már ment szemle

  const { results } = await db.prepare('SELECT kind, cimzett FROM proba_levelek ORDER BY ido').all();
  assert.ok(results.every(r => r.cimzett === 'vezeto@pelda.example'));
  assert.equal(results.filter(r => r.kind === 'belso_jelentes').length, 1);
  assert.equal(results.filter(r => r.kind === 'riasztas').length, 1);
});

test('Worker-futás: egy ügyfél hibája nem állítja le a másikat; kikapcsolt munkatárs kimarad; éles mód levélküldő nélkül megáll', async () => {
  const db = createD1Shim();
  const repo = createD1ProfileRepo({ db });
  const p = await loadProfile(fixture('profil.yaml'));
  await repo.put(p, { by: 'rendszer' });
  await repo.put({ ...p, ugyfel_id: 'masik', ugynokok: { monitoring: { aktiv: false } } }, { by: 'rendszer' });
  const prompts = await readPrompts();
  const f = await feed();
  const now = () => new Date('2026-10-29T06:30:00Z');

  const ok = await runScheduled({ DB: db }, { now, fetchText: async () => f, prompts });
  assert.equal(ok.find(s => s.tenantId === 'masik').skipped, true);
  assert.equal(ok.find(s => s.tenantId === p.ugyfel_id).digest, true);

  const live = await runScheduled({ DB: db, SAJTOIRODA_LIVE: '1' }, { now, fetchText: async () => f, prompts });
  assert.match(live.find(s => s.tenantId === p.ugyfel_id).error, /Éles levélküldő nincs bekötve/);
  const errs = await createD1Log({ db, tenantId: p.ugyfel_id }).query({ tipus: 'hiba' });
  assert.ok(errs.some(e => /Éles levélküldő/.test(e.tartalom.hiba)));
});

test('hozzáférés- és doménkiosztás SQL-je: érvényes beírható, érvénytelen és idézőjeles bemenet biztonságos', async () => {
  const db = createD1Shim();
  db.raw.exec(accessToSql('Vezeto@Pelda.example', 'pelda', 'vezeto'));
  db.raw.exec(hostToSql('Sajtoiroda.Pelda.example', 'pelda'));
  const access = createAccessRepo({ db });
  assert.deepEqual(await access.rolesFor('vezeto@pelda.example'), [{ tenantId: 'pelda', szerep: 'vezeto' }]);
  assert.equal(await access.tenantForHost('sajtoiroda.pelda.example'), 'pelda');
  assert.throws(() => accessToSql('nem-email', 'pelda', 'vezeto'), /e-mail/);
  assert.throws(() => accessToSql('a@b.hu', 'pelda', 'admin'), /szerep/);
  assert.throws(() => hostToSql("x'; DROP TABLE domenek;--", 'pelda'), /domén/);
  db.raw.exec(accessToSql('a@b.hu', "o'brien", 'vezeto'));
  assert.deepEqual(await access.rolesFor('a@b.hu'), [{ tenantId: "o'brien", szerep: 'vezeto' }]);
});
