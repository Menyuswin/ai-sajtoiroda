// Cloudflare Worker belépő. Szándékosan vékony: a logika a src/cloudflare/ és src/agents/ alatt van (tesztelt).
// Itt csak a csomagba épített promptok és az időzített hívás van.
import classify from '../../monitoring/prompts/cikk-besorolas.md';
import synthesize from '../../monitoring/prompts/napi-szemle.md';
import { runScheduled } from '../cloudflare/scheduler.js';

const prompts = { classify, synthesize };

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduled(env, { prompts }).then(s => console.log(JSON.stringify(s))));
  },
  // A kezelőfelület (HTML) ide kerül majd – jóváhagyásra váró terv: docs/08.
  async fetch() {
    return new Response('AI-sajtóiroda – a kezelőfelület még nincs bekötve.', { status: 404 });
  },
};
