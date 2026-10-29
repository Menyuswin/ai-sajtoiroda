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
  };
  const feed = read('test/fixtures/feed.xml');
  const env = { DB: db, SAJTOIRODA_DEV_AUTH: '1', SAJTOIRODA_DEV_USER: user };
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
