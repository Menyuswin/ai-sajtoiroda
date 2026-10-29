// Helyi bemutató: az iroda a saját gépén, egy memóriabeli D1-helyettesítővel és a tesztadatokkal (kitalált „Példa Kórházak”).
// Indítás: npm run iroda   (opciók: --port 8787, --uzemelteto, --valos-ido)
// FIGYELEM: kizárólag próbára való: a próbabelépés és az in-memory adatbázis élesben nem használható.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createD1Shim } from './d1-shim.js';
import { createD1ProfileRepo } from '../cloudflare/d1.js';
import { createAccessRepo } from '../cloudflare/desk.js';
import { runScheduled } from '../cloudflare/scheduler.js';
import { handleRequest } from '../api/router.js';
import { loadProfile } from '../core/profile.js';
import { buildAssets } from '../api/assets.js';
import { createR2Shim } from './r2-shim.js';
import { createDocs } from '../docs/store.js';
import { buildLetterCtx } from '../cloudflare/agentctx.js';
import { ingest } from '../agents/kapcsolattarto/index.js';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
export const DEMO_NOW = new Date('2026-10-29T10:00:00Z');

export async function createDemo({ user = 'vezeto@pelda.example', now = () => DEMO_NOW } = {}) {
  const db = createD1Shim();
  const profile = await loadProfile(fileURLToPath(new URL('test/fixtures/profil.yaml', root)));
  await createD1ProfileRepo({ db, now }).put(profile, { by: 'rendszer' });
  const access = createAccessRepo({ db });
  await access.grant('vezeto@pelda.example', profile.ugyfel_id, 'vezeto');
  await access.grant('uzemelteto@pelda.example', profile.ugyfel_id, 'uzemelteto');
  const prompts = {
    classify: read('monitoring/prompts/cikk-besorolas.md'), synthesize: read('monitoring/prompts/napi-szemle.md'),
    instruct: read('monitoring/prompts/utasitas-ertelmezes.md'), qa: read('monitoring/prompts/kerdes-valasz.md'),
    docqa: read('monitoring/prompts/dokumentum-kerdes.md'), keywords: read('monitoring/prompts/kulcsszo-javaslat.md'),
    letterClassify: read('monitoring/prompts/level-besorolas.md'), letterReply: read('monitoring/prompts/level-valasz.md'),
    briefing: read('monitoring/prompts/felkeszito-csomag.md'), proposal: read('monitoring/prompts/proaktiv-javaslat.md'),
  };
  const feed = read('test/fixtures/feed.xml');
  const env = { DB: db, DOCS: createR2Shim(), SAJTOIRODA_DEV_AUTH: '1', SAJTOIRODA_DEV_USER: user };
  // néhány kitalált mintadokumentum a bemutatóhoz
  const docs = createDocs({ db, bucket: env.DOCS, tenantId: profile.ugyfel_id, now });
  for (const [f, cim, kat] of [['sajtoiranyelv.docx', 'Sajtóirányelvek', 'iranyelv'], ['kerdesek.md', 'Gyakori kérdések és válaszok', 'kerdes_valasz'], ['jegyzet.txt', 'Értekezlet jegyzete', 'hatter']]) {
    await docs.add({ bytes: new Uint8Array(readFileSync(new URL(`test/fixtures/docs/${f}`, root))), fajlnev: f, cim, kategoria: kat, by: 'rendszer' });
  }
  // kitalált mintalevelek a Kapcsolattartó asztalához (a bemutatóban kézi felvitel)
  await ingest(buildLetterCtx({ env, profile, now, prompts }), [
    { azonosito: 'minta:1', felado: 'Kovács Éva <eva.kovacs@hirportal.example>', targy: 'Interjúkérés az ápolóhiányról', szoveg: 'Tisztelt Sajtóiroda! A Hírportál egészségügyi rovata interjút szeretne készíteni az ápolóhiányról a szervezet vezetőjével. Kérjük, holnap 12:00-ig jelezzenek vissza, hogy elérhető-e.\n\nÜdvözlettel: Kovács Éva', ido: '2026-10-29T08:10:00Z' },
    { azonosito: 'minta:2', felado: 'Nagy Bence <bence@regionalis.example>', targy: 'Adatkérés: várólisták', szoveg: 'Kedves Kollégák! Cikkhez kérnék adatot a várólisták átlagos hosszáról az elmúlt két évben. Köszönöm a segítségüket.', ido: '2026-10-29T08:40:00Z' },
    { azonosito: 'minta:3', felado: 'Szabó Tamás <tamas@napilap.example>', targy: 'Hatósági eljárás indult?', szoveg: 'Értesüléseink szerint hatósági eljárás indult az egyik intézményükkel szemben, és feljelentés is született. Szeretnénk megkapni a szervezet álláspontját még ma, 16:00-ig.', ido: '2026-10-29T09:05:00Z' },
  ], 'kezi');
  await runScheduled(env, { now, fetchText: async () => feed, prompts }); // első szemle a tesztcikkekből
  const ui = (f) => new URL(`ui/${f}`, root);
  const assets = buildAssets((f) => readFileSync(ui(f), 'utf8'), (f) => readFileSync(ui(f)));
  return { env, deps: { assets, prompts, now } };
}

export async function startServer({ port = 8787, user, now } = {}) {
  const { env, deps } = await createDemo({ user, now });
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    const response = await handleRequest(request, env, deps);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const port = Number(args[args.indexOf('--port') + 1]) || 8787;
  const user = args.includes('--uzemelteto') ? 'uzemelteto@pelda.example' : 'vezeto@pelda.example';
  const now = args.includes('--valos-ido') ? () => new Date() : undefined;
  await startServer({ port, user, now });
  console.log(`Az iroda bemutató változata: http://127.0.0.1:${port}/  (felhasználó: ${user}, minden adat kitalált és csak a memóriában él)`);
}
