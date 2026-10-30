import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile, loadProfile, agentActive } from '../src/core/profile.js';
import { createOutbox } from '../src/core/outbox.js';
import { loadPrompt, extractJson } from '../src/core/llm.js';
import { norm, dayKey } from '../src/core/text.js';
import { readFile } from 'node:fs/promises';
import { fixture, promptDir, makeCtx } from './helpers.js';

test('a minta ügyfélprofil érvényes, a hiányos nem', async () => {
  const p = await loadProfile(fixture('profil.yaml'));
  assert.equal(p.ugyfel_id, 'pelda-korhazak');
  assert.equal(p.trend.szoras_szorzo, 2);
  assert.throws(() => validateProfile({ ...p, vezeto: { nev: 'x' } }), /vezeto\.email/);
  assert.throws(() => validateProfile({ ...p, ugyfel_id: 'Rossz Név' }), /ugyfel_id/);
});

test('a profilsablon (monitoring/profil-sablon.yaml) érvényes', async () => {
  const p = await loadProfile('monitoring/profil-sablon.yaml');
  assert.equal(p.schema_verzio, 1);
});

test('munkatárs kikapcsolható a profilban', async () => {
  const p = await loadProfile(fixture('profil.yaml'));
  assert.equal(agentActive(p, 'monitoring'), true);
  assert.equal(agentActive({ ...p, ugynokok: { monitoring: { aktiv: false } } }, 'monitoring'), false);
});

test('norm: ékezet- és kisbetű-független', () => {
  assert.equal(norm('ÁPOLÓHIÁNY őűÖŰ'), 'apolohiany ouou');
  assert.equal(dayKey('2026-10-29T23:30:00Z', 'Europe/Budapest'), '2026-10-30');
});

test('kimenő kapu: belső jelentés csak a vezetőnek, külső csak jóváhagyással', async () => {
  const { ctx } = await makeCtx();
  const msg = { agent: 'monitoring', subject: 's', text: 't', html: '<p>t</p>' };
  const ok = await ctx.outbox.send({ ...msg, kind: 'belso_jelentes', to: 'vezeto@pelda.example' });
  assert.ok(ok.id);
  await assert.rejects(ctx.outbox.send({ ...msg, kind: 'belso_jelentes', to: 'ujsagiro@media.example' }), /elutasítva/);
  await assert.rejects(ctx.outbox.send({ ...msg, kind: 'valasz', to: 'ujsagiro@media.example' }), /jóváhagyás nélkül/);
  await assert.rejects(ctx.outbox.send({ ...msg, kind: 'valasz', to: 'ujsagiro@media.example', approval: { dontes: 'jovahagyva', by: 'masvalaki@x.example' } }), /jóváhagyás nélkül/);
  const sent = await ctx.outbox.send({ ...msg, kind: 'valasz', to: 'ujsagiro@media.example', approval: { dontes: 'jovahagyva', by: 'Vezeto@Pelda.example' } });
  assert.ok(sent.id);
  const rejected = await ctx.log.query({ tipus: 'kimeno_elutasitva' });
  assert.equal(rejected.length, 3);
});

test('promptfájl szakaszokra bontása és kitöltése', async () => {
  const { system, user } = loadPrompt(await readFile(`${promptDir}/cikk-besorolas.md`, 'utf8'), {
    megnevezes: 'Példa Zrt.', szemelyek: ['A', 'B'], temak: ['t'], vorosvonalak: ['v'], cim: 'Cím', medium: 'M', ido: 'ma', reszlet: 'rész',
  });
  assert.match(system, /Példa Zrt\./);
  assert.match(user, /Cikk címe: Cím/);
  assert.match(user, /Figyelt szereplők: A, B/);
  assert.doesNotMatch(system + user, /\{\{/);
});

test('extractJson kiszedi a JSON-t a körítésből', () => {
  assert.deepEqual(extractJson('Íme:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => extractJson('nincs'));
});

test('a nulladik ügyfél profilja érvényes', async () => {
  const p = await loadProfile('monitoring/nulladik-ugyfel.yaml');
  assert.equal(p.ugyfel_id, 'manyai-zoltan');
});
