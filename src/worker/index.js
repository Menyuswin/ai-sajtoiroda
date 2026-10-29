// Cloudflare Worker belépő. Szándékosan vékony: a logika a src/api/, src/cloudflare/ és src/agents/ alatt van (tesztelt).
// Itt csak a csomagba épített promptok, a felület és a két belépési pont (ütemezett futás, HTTP) van.
import classify from '../../monitoring/prompts/cikk-besorolas.md';
import synthesize from '../../monitoring/prompts/napi-szemle.md';
import instruct from '../../monitoring/prompts/utasitas-ertelmezes.md';
import qa from '../../monitoring/prompts/kerdes-valasz.md';
import { runScheduled } from '../cloudflare/scheduler.js';
import { handleRequest } from '../api/router.js';
import { ASSETS } from './ui-assets.js';

const prompts = { classify, synthesize, instruct, qa };

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduled(env, { prompts }).then(s => console.log(JSON.stringify(s))));
  },
  async fetch(request, env) {
    return handleRequest(request, env, { assets: ASSETS, prompts });
  },
};
