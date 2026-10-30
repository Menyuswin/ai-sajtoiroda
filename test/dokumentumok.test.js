import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createD1Shim } from '../src/dev/d1-shim.js';
import { createR2Shim } from '../src/dev/r2-shim.js';
import { createD1ProfileRepo, createD1Log } from '../src/cloudflare/d1.js';
import { createAccessRepo } from '../src/cloudflare/desk.js';
import { createDocs, ftsQuery } from '../src/docs/store.js';
import { extractDocument, DocError, DOC_LIMITS, chunkBlocks } from '../src/docs/extract.js';
import { answerFromDocs, suggestKeywords, mockSuggest, validateSuggestions } from '../src/docs/answer.js';
import { createLlm } from '../src/core/llm.js';
import { handleRequest } from '../src/api/router.js';
import { loadProfile } from '../src/core/profile.js';
import { fixture, readPrompts } from './helpers.js';

const NOW = new Date('2026-10-29T10:00:00Z');
const file = async (n) => new Uint8Array(await readFile(fixture(`docs/${n}`)));
const T = 'pelda-korhazak';

test('kinyerés valódi fájlokból: docx (címsorok, táblázat), szöveges PDF (ő, ű), markdown, csv, régi kódolású txt', async () => {
  const docx = await extractDocument(await file('sajtoiranyelv.docx'), 'sajtoiranyelv.docx');
  assert.deepEqual(docx.szakaszok.map(s => s.cim), ['Sajtóirányelvek – Példa Kórházak Zrt.', 'Az ápolóhiányról szóló nyilatkozatok', 'Várólisták']);
  assert.match(docx.szakaszok[1].szoveg, /Őszinteség, pontosság, türelem/);
  assert.match(docx.szakaszok[1].szoveg, /Űrlapokat/);
  assert.match(docx.szakaszok[2].szoveg, /Téma \| Felelős/);
  assert.match(docx.szakaszok[2].szoveg, /Bérek \| Gazdasági igazgató/);

  const pdf = await extractDocument(await file('sajtoiranyelv.pdf'), 'sajtoiranyelv.pdf');
  const pdfText = pdf.szakaszok.map(s => s.szoveg).join(' ');
  for (const w of ['Őszinteség', 'Űrlapokat', 'ápolóhiány', 'Országos Kórházi Főigazgatóság']) assert.ok(pdfText.includes(w), w);

  const md = await extractDocument(await file('kerdesek.md'), 'kerdesek.md');
  assert.deepEqual(md.szakaszok.map(s => s.cim), ['Gyakori kérdések', 'Mennyi az átlagos várakozási idő?', 'Hány ápolót vettek fel?']);
  assert.match((await extractDocument(await file('adatok.csv'), 'adatok.csv')).szakaszok[0].szoveg, /Sürgősségi,24,91/);
  assert.match((await extractDocument(await file('regi-jegyzet.txt'), 'regi-jegyzet.txt')).szakaszok[0].szoveg, /Árvíztűrő tükörfúrógép/); // windows-1250
  assert.match((await extractDocument(await file('jegyzet.txt'), 'jegyzet.txt')).szakaszok[0].szoveg, /Kiss Géza/);
});

test('hibás, hamis vagy veszélyes fájl elutasítva magyar üzenettel: a tartalom dönt, nem a kiterjesztés', async () => {
  const bad = async (bytes, name, re) => { await assert.rejects(extractDocument(bytes, name), (e) => e instanceof DocError && re.test(e.message), name); };
  await bad(await file('hamis.pdf'), 'hamis.pdf', /nem érvényes PDF/);
  await bad(await file('hamis.docx'), 'hamis.docx', /nem Word-dokumentum/);
  await bad(await file('beolvasott.pdf'), 'beolvasott.pdf', /nincs kinyerhető szöveg/);
  await bad(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'program.exe', /nem támogatott/);
  await bad(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x41]), 'program.txt', /nem egyezik a kiterjesztésével/);
  await bad(await file('sajtoiranyelv.pdf'), 'atnevezett.txt', /nem egyezik a kiterjesztésével/); // PDF txt-nek álcázva
  await bad(await file('sajtoiranyelv.docx'), 'atnevezett.md', /nem egyezik a kiterjesztésével/);
  await bad(new Uint8Array([65, 66, 0, 67, 68]), 'bin.txt', /bináris/);
  await bad(new Uint8Array(), 'ures.txt', /üres/);
  await bad(new TextEncoder().encode('   \n\n  '), 'szokoz.txt', /nem találtam szöveget/);
  await bad(new Uint8Array(DOC_LIMITS.fileBytes + 1).fill(65), 'nagy.txt', /túl nagy/);
  await bad(new TextEncoder().encode('szöveg'), 'kiterjesztes-nelkul', /nem támogatott/);
});

test('szakaszolás: ~450 szavas darabok, hosszú bekezdés is kezelve, minden szakasz számozott', () => {
  const long = Array.from({ length: 1200 }, (_, i) => `szó${i}.`).join(' ');
  const out = chunkBlocks([{ cim: 'Hosszú', bekezdesek: [long, 'Rövid bekezdés.'] }]);
  assert.ok(out.length >= 3);
  assert.ok(out.every(s => s.szoveg.split(/\s+/).length <= DOC_LIMITS.sectionWords));
  assert.deepEqual(out.map(s => s.sorszam), out.map((_, i) => i + 1));
  assert.equal(out.map(s => s.szoveg).join(' ').split(/\s+/).filter(w => w.startsWith('szó')).length, 1200); // semmi nem veszett el
});

test('keresőkifejezés: ragozás-tűrő előtag, ékezet-független, nincs injekció', () => {
  assert.equal(ftsQuery('Mit mondanak az ápolóhiányról?'), '"monda"* OR "apolohiany"*');
  assert.equal(ftsQuery('Mennyi az idő?'), '"menny"*  OR "ido"'.replace('  ', ' '));
  assert.equal(ftsQuery('"; DROP TABLE x; --'), '"drop" OR "tabl"*');
  assert.equal(ftsQuery('a'), '');
});

async function lab({ withBucket = true } = {}) {
  const db = createD1Shim();
  const bucket = withBucket ? createR2Shim() : null;
  const docs = (tenant = T) => createDocs({ db, bucket, tenantId: tenant, now: () => NOW });
  return { db, bucket, docs };
}
const addAll = async (d) => {
  const out = {};
  for (const [f, kat] of [['sajtoiranyelv.docx', 'iranyelv'], ['kerdesek.md', 'kerdes_valasz'], ['jegyzet.txt', 'hatter']]) out[f] = await d.add({ bytes: await file(f), fajlnev: f, kategoria: kat, by: 'ember:x' });
  return out;
};

test('dokumentumtár: feltöltés, lista, keresés (ragozott alakkal és ékezet nélkül), szakaszok, eredeti letöltése', async () => {
  const { docs, bucket } = await lab();
  const d = docs(); const all = await addAll(d);
  assert.equal((await d.list()).length, 3);
  assert.equal(all['sajtoiranyelv.docx'].cim, 'sajtoiranyelv'); // cím híján a fájlnév
  assert.ok(all['sajtoiranyelv.docx'].eredeti);
  const r1 = await d.search('Mit mondtak az ápolóhiányról?');
  assert.ok(r1.talalatok.some(t => t.dokumentum_cim === 'sajtoiranyelv' && /ápolóhiány/.test(t.szoveg)));
  assert.ok((await d.search('apolohiany')).talalatok.length >= 1); // ékezet nélkül is
  assert.ok((await d.search('Gyoztes bajnoksag nincs ilyen')).talalatok.length === 0);
  const full = await d.get(all['kerdesek.md'].id);
  assert.equal(full.szakaszLista.length, 3);
  const o = await d.original(all['kerdesek.md'].id);
  assert.equal(o.fajlnev, 'kerdesek.md');
  assert.deepEqual([...o.bytes], [...(await file('kerdesek.md'))]);
  assert.equal(bucket._keys().length, 3);
});

test('hatókör és „nem küldhető AI-nak” jelölés: csak az engedélyezett munkatárs és csak AI nélkül látja', async () => {
  const { docs } = await lab();
  const d = docs();
  await d.add({ bytes: await file('jegyzet.txt'), fajlnev: 'jegyzet.txt', cim: 'Bizalmas', hatokor: ['felkeszito'], by: 'x' });
  await d.add({ bytes: await file('kerdesek.md'), fajlnev: 'kerdesek.md', cim: 'Titkos kérdések', aiTiltott: true, by: 'x' });
  assert.equal((await d.search('sürgősségi ellátás', { agent: 'monitoring' })).talalatok.length, 0); // más munkatársnak van fenntartva
  assert.equal((await d.search('sürgősségi ellátás', { agent: 'felkeszito' })).talalatok.length, 1);
  const ai = await d.search('várakozási', { forAI: true });
  assert.equal(ai.talalatok.length, 0);
  assert.ok(ai.kizart_ai >= 1);
  assert.equal((await d.search('várakozási', { forAI: false })).talalatok.length >= 1, true);
  const u = await d.update((await d.list())[0].id, { aiTiltott: true, hatokor: null });
  assert.equal(u.ai_tiltott, true);
  assert.equal(u.hatokor, null);
});

test('ügyfél-elkülönítés: más ügyfél dokumentuma nem kereshető, nem olvasható, nem törölhető, nem tölthető le', async () => {
  const { docs, bucket } = await lab();
  const a = docs('a'), b = docs('b');
  const doc = await a.add({ bytes: await file('sajtoiranyelv.docx'), fajlnev: 'sajtoiranyelv.docx', by: 'x' });
  assert.deepEqual((await b.search('ápolóhiány')).talalatok, []);
  assert.equal(await b.get(doc.id), null);
  assert.equal((await b.list()).length, 0);
  assert.equal(await b.original(doc.id), null);
  assert.equal(await b.remove(doc.id), false);
  assert.equal(await b.update(doc.id, { cim: 'Átírva' }), null);
  assert.equal((await a.get(doc.id)).cim, 'sajtoiranyelv');
  assert.equal(bucket._keys().length, 1);
  assert.equal((await b.usage()).darab, 0);
});

test('törlés mindent töröl: eredeti fájl, szakaszok, keresési index', async () => {
  const { docs, bucket, db } = await lab();
  const d = docs(); const x = await d.add({ bytes: await file('sajtoiranyelv.docx'), fajlnev: 'sajtoiranyelv.docx', by: 'x' });
  assert.ok((await d.search('ápolóhiány')).talalatok.length);
  assert.equal(await d.remove(x.id), true);
  assert.deepEqual((await d.search('ápolóhiány')).talalatok, []);
  assert.equal(bucket._keys().length, 0);
  for (const t of ['dokumentumok', 'doksi_szakaszok', 'doksi_kereso']) assert.equal(db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0, t);
  assert.equal(await d.remove(x.id), false);
});

test('korlátok: darabszám, tárhelykeret; R2 nélkül az eredeti nem őrződik meg; R2-hiba visszavonja a feltöltést', async () => {
  const saved = { ...DOC_LIMITS };
  try {
    const { docs } = await lab();
    const d = docs();
    DOC_LIMITS.count = 2;
    await d.add({ bytes: await file('jegyzet.txt'), fajlnev: 'a.txt', by: 'x' });
    await d.add({ bytes: await file('jegyzet.txt'), fajlnev: 'b.txt', by: 'x' });
    await assert.rejects(d.add({ bytes: await file('jegyzet.txt'), fajlnev: 'c.txt', by: 'x' }), /megtelt/);
    DOC_LIMITS.count = 200; DOC_LIMITS.tenantBytes = 200;
    await assert.rejects(d.add({ bytes: await file('jegyzet.txt'), fajlnev: 'd.txt', by: 'x' }), /tárhelykerete/);
  } finally { Object.assign(DOC_LIMITS, saved); }
  const noR2 = (await lab({ withBucket: false })).docs();
  const doc = await noR2.add({ bytes: await file('jegyzet.txt'), fajlnev: 'e.txt', by: 'x' });
  assert.equal(doc.eredeti, false);
  assert.equal(await noR2.original(doc.id), null);
  const lab3 = await lab(); lab3.bucket.put = async () => { throw new Error('R2 leállt'); };
  await assert.rejects(lab3.docs().add({ bytes: await file('jegyzet.txt'), fajlnev: 'f.txt', by: 'x' }), /visszavontuk/);
  assert.equal((await lab3.docs().list()).length, 0); // nem maradt félkész dokumentum
  assert.equal((await lab3.docs().search('sürgősségi')).talalatok.length, 0);
  await assert.rejects(lab3.docs().add({ bytes: await file('jegyzet.txt'), fajlnev: 'g.txt', kategoria: 'valami', by: 'x' }), /kategória/);
});

const profile = () => loadProfile(fixture('profil.yaml'));
const fakeLlm = (reply) => createLlm({ mode: 'anthropic', key: 't', models: { classify: 'm' }, fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: reply }] }) }) });

test('kérdés a dokumentumokhoz: AI nélkül forrásjelölt részletek, ami nincs benne, azt kimondja', async () => {
  const { docs } = await lab(); const d = docs(); await addAll(d);
  const r = await answerFromDocs({ question: 'Mennyi az átlagos várakozási idő?', docs: d, profile: await profile(), llm: { mode: 'mock' }, prompts: await readPrompts() });
  assert.match(r.valasz, /\[D1 §\d+\]/);
  assert.match(r.valasz, /42 nap/);
  assert.ok(r.forrasok.length >= 1 && r.forrasok.every(f => f.ref && f.dokumentum_id));
  const none = await answerFromDocs({ question: 'Mit írtak a gombaszezonról?', docs: d, profile: await profile(), llm: { mode: 'mock' }, prompts: await readPrompts() });
  assert.match(none.valasz, /nem találtam/);
  assert.deepEqual(none.forrasok, []);
});

test('kérdés AI-val: a nem létező forrásjelölés törölve; az AI-nak tiltott dokumentum kizárva és jelezve', async () => {
  const { docs } = await lab(); const d = docs();
  await d.add({ bytes: await file('kerdesek.md'), fajlnev: 'kerdesek.md', cim: 'Nyilvános kérdések', by: 'x' });
  await d.add({ bytes: await file('jegyzet.txt'), fajlnev: 'jegyzet.txt', cim: 'Bizalmas jegyzet', aiTiltott: true, by: 'x' });
  const prompts = await readPrompts();
  const r = await answerFromDocs({ question: 'Mennyi a várakozási idő és mi a sürgősségi terv?', docs: d, profile: await profile(), llm: fakeLlm('A várakozás 42 nap [D1 §2], és még valami [D9 §9].'), prompts });
  assert.match(r.valasz, /\[D1 §2\]/);
  assert.doesNotMatch(r.valasz, /D9/);
  assert.match(r.valasz, /nem létező forrásra/);
  assert.match(r.valasz, /„nem küldhető AI-nak” jelölésű dokumentumban van/);
  assert.ok(!r.forrasok.some(f => f.dokumentum_cim === 'Bizalmas jegyzet'));
  // AI nélkül ugyanez a dokumentum használható (a tartalom nem hagyja el a rendszert)
  const mock = await answerFromDocs({ question: 'sürgősségi terv', docs: d, profile: await profile(), llm: { mode: 'mock' }, prompts });
  assert.ok(mock.forrasok.some(f => f.dokumentum_cim === 'Bizalmas jegyzet'));
});

test('kulcsszójavaslat: szervezetek, személyek, témák a dokumentumokból; a meglévőket nem ismétli; az AI válasza ellenőrzött', async () => {
  const { docs } = await lab(); const d = docs(); await addAll(d);
  const p = await profile();
  p.kulcsszavak = { szervezet: [], szemelyek: [], temak: [], kizaro: [] };
  const sug = await suggestKeywords({ docs: d, profile: p, llm: { mode: 'mock' }, prompts: await readPrompts() });
  const has = (csoport, ertek) => sug.tetelek.some(t => t.csoport === csoport && t.ertek === ertek);
  assert.ok(has('szervezet', 'Példa Kórházak Zrt.'));
  assert.ok(has('szervezet', 'Országos Kórházi Főigazgatóság'));
  assert.ok(has('szemelyek', 'Kiss Géza'));
  assert.ok(sug.tetelek.every(t => t.forras !== undefined));
  const known = { ...p, kulcsszavak: { ...p.kulcsszavak, szemelyek: ['kiss geza'] } };
  assert.ok(!mockSuggest((await d.sectionsFor({ agent: 'monitoring', forAI: false })).szakaszok, known).some(t => t.ertek === 'Kiss Géza')); // ékezet-független egyezés
  assert.deepEqual(validateSuggestions({ tetelek: [{ csoport: 'rendszer', ertek: 'x' }, { csoport: 'temak', ertek: '  ' }, { csoport: 'temak', ertek: 'oltás' }, { csoport: 'temak', ertek: 'OLTÁS' }, null] }, p), [{ csoport: 'temak', ertek: 'oltás', forras: '' }]);
  const many = { tetelek: Array.from({ length: 25 }, (_, i) => ({ csoport: 'temak', ertek: `téma${i}` })) };
  assert.equal(validateSuggestions(many, p).length, 10);
  const ai = await suggestKeywords({ docs: d, profile: p, llm: fakeLlm('{"tetelek":[{"csoport":"temak","ertek":"bérfejlesztés","forras":"x"}]}'), prompts: await readPrompts() });
  assert.deepEqual(ai.tetelek.map(t => t.ertek), ['bérfejlesztés']);
  const empty = await suggestKeywords({ docs: (await lab()).docs(), profile: p, llm: { mode: 'mock' }, prompts: await readPrompts() });
  assert.equal(empty.uresTar, true);
});

// ---- az iroda API-ján keresztül
async function office({ bucket = createR2Shim() } = {}) {
  const db = createD1Shim();
  const p = await profile();
  const repo = createD1ProfileRepo({ db, now: () => NOW });
  await repo.put(p, { by: 'rendszer' });
  await repo.put({ ...p, ugyfel_id: 'masik-kft', megnevezes: 'Másik Kft.' }, { by: 'rendszer' });
  const access = createAccessRepo({ db });
  await access.grant('vezeto@pelda.example', T, 'vezeto');
  await access.grant('masik@masik.example', 'masik-kft', 'vezeto');
  const prompts = await readPrompts();
  const call = async (method, path, { json, bytes, user = 'vezeto@pelda.example', headers = {} } = {}) => {
    const init = { method, headers: { 'X-Requested-With': 'iroda', ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: json ? JSON.stringify(json) : bytes };
    const res = await handleRequest(new Request(`https://iroda.pelda.example${path}`, init), { DB: db, DOCS: bucket, SAJTOIRODA_DEV_AUTH: '1', SAJTOIRODA_DEV_USER: user }, { now: () => NOW, prompts });
    const ct = res.headers.get('Content-Type') || '';
    return { status: res.status, res, data: ct.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
  };
  const upload = (name, bytes, q = '', user) => call('POST', `/api/dokumentumok?fajlnev=${encodeURIComponent(name)}${q}`, { bytes, user });
  return { db, bucket, call, upload, logNow: (tenant = T) => createD1Log({ db, tenantId: tenant }).query({ tipus: 'dokumentum' }) };
}

test('API: feltöltés, lista, keresés, szakaszok, letöltés biztonságos fejlécekkel, módosítás, törlés, napló', async () => {
  const o = await office();
  const up = await o.upload('sajtoiranyelv.docx', await file('sajtoiranyelv.docx'), '&cim=' + encodeURIComponent('Sajtóirányelvek') + '&kategoria=iranyelv&hatokor=monitoring,felkeszito&ai_tiltott=1');
  assert.equal(up.status, 201);
  const doc = up.data.dokumentum;
  assert.deepEqual([doc.cim, doc.kategoria, doc.hatokor, doc.ai_tiltott, doc.szakaszok], ['Sajtóirányelvek', 'iranyelv', ['monitoring', 'felkeszito'], true, 3]);

  const list = (await o.call('GET', '/api/dokumentumok')).data;
  assert.equal(list.dokumentumok.length, 1);
  assert.equal(list.hasznalat.darab, 1);
  assert.equal(list.eredeti_megorzes, true);
  assert.equal(list.kategoriak.iranyelv, 'Belső irányelv');
  assert.equal((await o.call('GET', `/api/dokumentumok/${encodeURIComponent(doc.id)}`)).data.dokumentum.szakaszLista.length, 3);
  assert.ok((await o.call('GET', '/api/dokumentumok/kereses?q=' + encodeURIComponent('ápolóhiányról'))).data.talalatok.length >= 1);

  const dl = await o.call('GET', `/api/dokumentumok/${encodeURIComponent(doc.id)}/eredeti`);
  assert.equal(dl.status, 200);
  assert.match(dl.res.headers.get('Content-Disposition'), /^attachment; filename="sajtoiranyelv.docx"/);
  assert.equal(dl.res.headers.get('Content-Security-Policy'), 'sandbox');
  assert.equal(dl.res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(dl.res.headers.get('Content-Type'), 'application/octet-stream');

  const put = await o.call('PUT', `/api/dokumentumok/${encodeURIComponent(doc.id)}`, { json: { cim: 'Új cím', hatokor: [], ai_tiltott: false } });
  assert.deepEqual([put.data.dokumentum.cim, put.data.dokumentum.hatokor, put.data.dokumentum.ai_tiltott], ['Új cím', null, false]);
  assert.equal((await o.call('PUT', `/api/dokumentumok/${encodeURIComponent(doc.id)}`, { json: { hatokor: ['nincs'] } })).status, 400);
  assert.equal((await o.call('PUT', `/api/dokumentumok/${encodeURIComponent(doc.id)}`, { json: { kategoria: 'valami' } })).status, 422);

  assert.equal((await o.call('DELETE', `/api/dokumentumok/${encodeURIComponent(doc.id)}`)).status, 200);
  assert.equal((await o.call('GET', `/api/dokumentumok/${encodeURIComponent(doc.id)}`)).status, 404);
  assert.equal(o.bucket._keys().length, 0);
  assert.deepEqual((await o.logNow()).map(e => e.tartalom.esemeny), ['feltoltve', 'modositva', 'torolve']);
});

test('API: hibás feltöltések, CSRF, ügyfél-elkülönítés', async () => {
  const o = await office();
  assert.equal((await o.upload('hamis.pdf', await file('hamis.pdf'))).status, 422);
  assert.match((await o.upload('hamis.pdf', await file('hamis.pdf'))).data.hiba, /nem érvényes PDF/);
  assert.equal((await o.upload('program.exe', new Uint8Array([77, 90, 1]))).status, 422);
  assert.equal((await o.call('POST', '/api/dokumentumok', { bytes: new Uint8Array([65]) })).status, 400); // fájlnév nélkül
  assert.equal((await o.upload('a.txt', new TextEncoder().encode('szöveg'), '&hatokor=nincsilyen')).status, 400);
  assert.equal((await o.call('POST', '/api/dokumentumok?fajlnev=a.txt', { bytes: new TextEncoder().encode('x'), headers: { 'X-Requested-With': 'valami' } })).status, 403);
  assert.equal((await o.call('POST', '/api/dokumentumok?fajlnev=a.txt', { bytes: new TextEncoder().encode('x'), headers: { Origin: 'https://rossz.example' } })).status, 403);
  assert.equal((await o.call('POST', '/api/dokumentumok?fajlnev=a.txt', { bytes: new Uint8Array(1), headers: { 'Content-Length': String(DOC_LIMITS.fileBytes + 10000) } })).status, 413);
  assert.equal((await o.logNow()).length, 0); // elutasított fájl nem hagy nyomot a dokumentumok között

  const doc = (await o.upload('jegyzet.txt', await file('jegyzet.txt'))).data.dokumentum;
  const other = 'masik@masik.example';
  assert.equal((await o.call('GET', '/api/dokumentumok', { user: other })).data.dokumentumok.length, 0);
  assert.equal((await o.call('GET', `/api/dokumentumok/${encodeURIComponent(doc.id)}`, { user: other })).status, 404);
  assert.equal((await o.call('GET', `/api/dokumentumok/${encodeURIComponent(doc.id)}/eredeti`, { user: other })).status, 404);
  assert.equal((await o.call('DELETE', `/api/dokumentumok/${encodeURIComponent(doc.id)}`, { user: other })).status, 404);
  assert.equal((await o.call('GET', '/api/dokumentumok/kereses?q=sürgősségi', { user: other })).data.talalatok.length, 0);
  assert.equal((await o.call('GET', '/api/dokumentumok/kereses?q=sürgősségi')).data.talalatok.length, 1);
});

test('API: R2 nélkül is működik (csak a szöveg marad meg), és ezt jelzi', async () => {
  const o = await office({ bucket: null });
  const doc = (await o.upload('jegyzet.txt', await file('jegyzet.txt'))).data.dokumentum;
  assert.equal(doc.eredeti, false);
  assert.equal((await o.call('GET', '/api/dokumentumok')).data.eredeti_megorzes, false);
  assert.equal((await o.call('GET', `/api/dokumentumok/${encodeURIComponent(doc.id)}/eredeti`)).status, 404);
});

test('API: kérdés a dokumentumokhoz és kulcsszójavaslat tételenkénti jóváhagyással', async () => {
  const o = await office();
  const empty = await o.call('POST', '/api/ugynok/monitoring/utasitas', { json: { szoveg: 'Javasolj kulcsszavakat a feltöltött dokumentumok alapján' } });
  assert.equal(empty.data.allapot, 'kesz');
  assert.match(empty.data.valasz, /Még nincs feltöltött dokumentum/);

  await o.upload('sajtoiranyelv.docx', await file('sajtoiranyelv.docx'));
  await o.upload('jegyzet.txt', await file('jegyzet.txt'));
  const q = await o.call('POST', '/api/dokumentumok/kerdes', { json: { szoveg: 'Mit mond az irányelv az ápolóhiányról?' } });
  assert.match(q.data.valasz, /\[D1 §\d+\]/);
  assert.equal((await o.call('POST', '/api/dokumentumok/kerdes', { json: { szoveg: '' } })).status, 400);

  const r = await o.call('POST', '/api/ugynok/monitoring/utasitas', { json: { szoveg: 'Javasolj kulcsszavakat a feltöltött dokumentumok alapján' } });
  assert.equal(r.data.allapot, 'javaslat');
  const tetelek = r.data.muvelet.parameterek.tetelek;
  assert.ok(tetelek.length >= 2);
  const before = (await o.call('GET', '/api/profil')).data.profil.kulcsszavak;
  const idx = tetelek.findIndex(t => t.ertek === 'Országos Kórházi Főigazgatóság');
  assert.ok(idx >= 0);
  const ok = await o.call('POST', `/api/utasitasok/${encodeURIComponent(r.data.id)}/dontes`, { json: { dontes: 'jovahagyva', kivalasztott: [idx] } });
  assert.equal(ok.data.allapot, 'vegrehajtva');
  const after = (await o.call('GET', '/api/profil')).data.profil.kulcsszavak;
  const added = [...after.szervezet, ...after.szemelyek, ...after.temak].filter(x => ![...before.szervezet, ...before.szemelyek, ...before.temak].includes(x));
  assert.deepEqual(added, ['Országos Kórházi Főigazgatóság']); // csak a kijelölt tétel került be
  const r2 = await o.call('POST', '/api/ugynok/monitoring/utasitas', { json: { szoveg: 'Ajánlj kulcsszavakat a dokumentumokból' } });
  const none = await o.call('POST', `/api/utasitasok/${encodeURIComponent(r2.data.id)}/dontes`, { json: { dontes: 'jovahagyva', kivalasztott: [] } });
  assert.equal(none.data.allapot, 'hiba'); // jóváhagyás kijelölés nélkül nem módosít
});
