import test from 'node:test';
import assert from 'node:assert/strict';
import { toPayload, sendBatches, BATCH } from '../tools/levelhid/core.mjs';
import { normalizeMessage } from '../src/mail/message.js';

test('levélhíd: a kiolvasott levélből az iroda formátuma lesz, az azonosító postafiók+mappa+UID alapú', () => {
  const p = toPayload({ from: { value: [{ name: 'Kovács Éva', address: 'EVA@hirportal.example' }] }, subject: 'Interjú', text: 'Szia', date: new Date('2026-10-29T08:00:00Z') }, { account: 'sajto@icloud.com', mailbox: 'Sajtó', uid: 42, uidValidity: '7' });
  assert.equal(p.azonosito, 'imap:sajto@icloud.com:Sajtó:7:42');
  const m = normalizeMessage(p);
  assert.deepEqual([m.felado, m.felado_nev, m.targy, m.szoveg], ['eva@hirportal.example', 'Kovács Éva', 'Interjú', 'Szia']);
  assert.equal(normalizeMessage(toPayload({ subject: 'x', text: 'y' }, { account: 'a', mailbox: 'b', uid: 1, uidValidity: '1' })), null); // feladó nélküli levelet az iroda nem fogad
});

test('levélhíd: kötegekben küld, titokkal; hibánál kivételt dob (a kurzor nem léphet előre), a titok nem kerül a hibaüzenetbe', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, auth: init.headers.authorization, n: JSON.parse(init.body).levelek.length }); return Response.json({ fogadott: JSON.parse(init.body).levelek.length }); };
  const many = Array.from({ length: BATCH * 2 + 3 }, (_, i) => ({ azonosito: `a${i}` }));
  const r = await sendBatches(many, { url: 'https://iroda.example/', tenant: 'pelda-kft', token: 'TITOK', fetchImpl });
  assert.equal(r.fogadott, many.length); assert.deepEqual(calls.map(c => c.n), [BATCH, BATCH, 3]);
  assert.equal(calls[0].url, 'https://iroda.example/hid/pelda-kft/levelek'); assert.equal(calls[0].auth, 'Bearer TITOK');
  await assert.rejects(sendBatches(many, { url: 'https://iroda.example', tenant: 't', token: 'TITOK', fetchImpl: async () => new Response('', { status: 401 }) }), (e) => /401/.test(e.message) && !/TITOK/.test(e.message));
});
