import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1Shim } from '../src/dev/d1-shim.js';
import { createD1Log, createD1DryMailer } from '../src/cloudflare/d1.js';
import { createOutbox } from '../src/core/outbox.js';
import { withNotifications, buildMime, DAILY_NOTIFY_LIMIT } from '../src/cloudflare/notify.js';
import { loadProfile } from '../src/core/profile.js';
import { fixture } from './helpers.js';

const NOW = new Date('2026-10-30T10:00:00Z');
const profile = await loadProfile(fixture('profil.yaml'));
const LEADER = profile.vezeto.email;

function setup(envExtra = {}) {
  const db = createD1Shim();
  const sent = [];
  class Msg { constructor(from, to, raw) { Object.assign(this, { from, to, raw }); } }
  const env = { SAJTOIRODA_BELSO_ERTESITES: '1', SEND_EMAIL: { send: async (m) => { sent.push(m); } }, EMAIL_MESSAGE_CTOR: Msg, ...envExtra };
  const log = createD1Log({ db, tenantId: profile.ugyfel_id, now: () => NOW });
  const base = createD1DryMailer({ db, now: () => NOW });
  const mailer = withNotifications({ base, env, profile, log, now: () => NOW });
  const outbox = createOutbox({ profile, mailer, log });
  return { db, sent, env, log, outbox, rows: async () => (await db.prepare('SELECT kind, cimzett FROM proba_levelek').all()).results };
}
const alarm = (o) => o.send({ agent: 'monitoring', kind: 'riasztas', to: LEADER, subject: 'Riasztás – Példa', text: 'Titkos cikkcím: Kiss Géza botránya', html: '<p>x</p>' });
const decode = (raw) => { const [head, ...rest] = raw.split('\r\n\r\n'); return { head, body: Buffer.from(rest.join('').replace(/\r\n/g, ''), 'base64').toString('utf8') }; };

test('a riasztás e-mailben is megy a vezető címére; az üzenet általános (a részletek nélkül), ékezetesen helyes MIME; a próba-kimenő is rögzíti', async () => {
  const s = setup();
  await alarm(s.outbox);
  assert.equal(s.sent.length, 1); assert.equal(s.sent[0].to, LEADER); assert.equal(s.sent[0].from, 'iroda@manyai.hu');
  const { head, body } = decode(s.sent[0].raw);
  assert.match(head, /Content-Transfer-Encoding: base64/); assert.match(head, /^Subject: =\?UTF-8\?B\?/m);
  assert.match(body, /Riasztás – Példa/); assert.match(body, /https:\/\/iroda\.manyai\.hu/);
  assert.ok(!body.includes('Kiss Géza') && !head.includes('Kiss'), 'a cikk részletei nem kerülnek az értesítésbe');
  assert.deepEqual((await s.rows()).map(r => r.kind), ['riasztas']);
  assert.equal((await s.log.query({ tipus: 'ertesites' })).length, 1);
});

test('kikapcsolva vagy kötés nélkül nem küld; a szemle alapból nem, kérésre igen; idegen címre sosem', async () => {
  for (const extra of [{ SAJTOIRODA_BELSO_ERTESITES: '0' }, { SEND_EMAIL: undefined }]) { const s = setup(extra); await alarm(s.outbox); assert.equal(s.sent.length, 0); assert.equal((await s.rows()).length, 1); }
  const a = setup();
  await a.outbox.send({ agent: 'monitoring', kind: 'belso_jelentes', to: LEADER, subject: 'Sajtószemle', text: 't', html: 'h' });
  assert.equal(a.sent.length, 0);
  const b = setup({ SAJTOIRODA_ERTESITES_SZEMLE: '1' });
  await b.outbox.send({ agent: 'monitoring', kind: 'belso_jelentes', to: LEADER, subject: 'Sajtószemle', text: 't', html: 'h' });
  assert.equal(b.sent.length, 1);
  // a kimenő kapu idegen címre belső levelet el sem enged, így az értesítés sem indulhat
  await assert.rejects(() => b.outbox.send({ agent: 'monitoring', kind: 'riasztas', to: 'masvalaki@evil.example', subject: 'x', text: 't', html: 'h' }), /elutasítva/);
  assert.equal(b.sent.length, 1);
  // sajtónak szóló levél jóváhagyás nélkül nem megy, jóváhagyással sem értesítésként
  await assert.rejects(() => b.outbox.send({ agent: 'kapcsolattarto', kind: 'valasz', to: 'ujsagiro@lap.example', subject: 'Re', text: 't', html: 'h' }), /jóváhagyás nélkül/);
  await b.outbox.send({ agent: 'kapcsolattarto', kind: 'valasz', to: 'ujsagiro@lap.example', subject: 'Re', text: 't', html: 'h', approval: { dontes: 'jovahagyva', by: LEADER } });
  assert.equal(b.sent.length, 1, 'a jóváhagyott válasz nem értesítés: nem megy az Email Workers-en át');
});

test('küldési hiba nem akasztja meg a rendszert (naplózódik); napi korlát; az Email-üzenet fejlécei nem injektálhatók', async () => {
  const bad = setup({ SEND_EMAIL: { send: async () => { throw new Error('destination address not verified'); } } });
  await alarm(bad.outbox);
  assert.equal((await bad.rows()).length, 1);
  assert.match(JSON.stringify(await bad.log.query({ tipus: 'hiba' })), /az e-mail értesítés nem ment el/);
  const s = setup();
  for (let i = 0; i < DAILY_NOTIFY_LIMIT + 3; i++) await alarm(s.outbox);
  assert.equal(s.sent.length, DAILY_NOTIFY_LIMIT);
  const raw = buildMime({ from: 'a@b.hu', to: 'c@d.hu\r\nBcc: x@y.hu', subject: 'T\r\nBcc: x@y.hu', body: 'b', messageId: '1', date: NOW });
  assert.ok(!/^Bcc:/m.test(raw), 'a fejléc-injektálás kiszűrve');
});
