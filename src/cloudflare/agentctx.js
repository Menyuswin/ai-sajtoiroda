// Egy ügyfél ügynök-környezete (napló, asztal, átadások, kimenő kapu, levéltár, dokumentumtár, naptár, AI).
// Az ütemező, az API és a levélhíd-fogadó is ezt használja, így ugyanaz a szabály vonatkozik mindegyikre.
import { getConfig } from '../core/config.js';
import { createLlm } from '../core/llm.js';
import { createOutbox } from '../core/outbox.js';
import { createLiveMailer } from '../core/mailer.js';
import { agentActive } from '../core/profile.js';
import { createHandoffs } from '../core/handoff.js';
import { createD1Log, createD1Store, createD1DryMailer } from './d1.js';
import { createDesk } from './desk.js';
import { createProactiveStore } from './proaktiv-store.js';
import { createMailStore } from '../mail/store.js';
import { createDocs } from '../docs/store.js';
import { AGENTS, agentById } from '../api/catalogue.js';
import { createProposal, OCCASION_OF } from '../agents/proaktiv/index.js';
import { createPackage } from '../agents/felkeszito/index.js';

// Próbákhoz: ügynök-azonosító → feldolgozó, amely felülírja a gyári feldolgozókat (üresen hagyva nem hat).
export const handoffHandlers = new Map();

// Az átadás tárgyából a téma: „Továbbított levél: Interjúkérés” → „Interjúkérés”.
const topicOf = (targy) => String(targy).replace(/^[^:]{3,40}:\s*/, '').trim() || String(targy);

// `strictLive`: éles módban levélküldő nélkül azonnal hibát ad (az ütemező így hangosan megáll); az API-nál csak küldéskor derül ki.
export function buildAgentCtx({ env, profile, now, prompts, llmFetch, mailbox = null, handlers = handoffHandlers, strictLive = false }) {
  const tenantId = profile.ugyfel_id;
  const config = getConfig(env);
  const log = createD1Log({ db: env.DB, tenantId, now });
  const desk = createDesk({ db: env.DB, tenantId, now });
  // Éles módban a levélküldő hiánya csak küldéskor derül ki (a többi API-hívást nem akasztja meg).
  if (config.live && strictLive) createLiveMailer(config.mailer);
  const mailer = config.live ? { name: 'elo', send: async (msg) => createLiveMailer(config.mailer).send(msg) } : createD1DryMailer({ db: env.DB, now });
  const outbox = createOutbox({ profile, mailer, log });
  let llm;
  try { llm = createLlm({ mode: env.SAJTOIRODA_LLM === 'anthropic' ? 'anthropic' : 'mock', key: config.anthropicKey, models: config.models, ...(llmFetch ? { fetchImpl: llmFetch } : {}) }); }
  catch { llm = createLlm({ mode: 'mock' }); }
  const ctx = {
    env, profile, log, outbox, llm, now, prompts, models: config.models, config, desk, mailbox,
    anyagok: desk.anyagok,
    store: createD1Store({ db: env.DB, tenantId }),
    levelek: createMailStore({ db: env.DB, tenantId, now }),
    docs: createDocs({ db: env.DB, bucket: env.DOCS || null, tenantId, now }),
    proactive: createProactiveStore({ db: env.DB, tenantId, now }),
  };
  // Gyári feldolgozók: a megérkezett (vagy megérkezéskor kézbesített) átadásokat az ügynökök itt dolgozzák fel.
  const own = new Map([
    ['proaktiv', async (h) => {
      if (!['jelzes', 'kerelem', 'kerdes'].includes(h.tipus)) return { valasz: 'Tudomásul véve.' };
      const r = await createProposal(ctx, { tema: topicOf(h.targy), jelzes: h.szoveg, atadasId: h.id });
      return { valasz: `Megszólalási javaslat készült: ${r.cim}` };
    }],
    ['felkeszito', async (h) => {
      if (h.tipus !== 'kerelem') return { valasz: 'Tudomásul véve.' };
      const src = h.anyag_id ? await desk.anyagok.get(h.anyag_id) : null;
      const alkalom = OCCASION_OF[src?.meta?.javaslat?.forma] || 'nyilatkozat';
      const r = await createPackage(ctx, { tema: topicOf(h.targy), alkalom, parentId: h.id, sourceAnyagId: h.anyag_id || null });
      return { valasz: `Felkészítő csomag készült: ${r.cim}` };
    }],
  ]);
  const all = new Map([...own, ...handlers]);
  ctx.handoffs = createHandoffs({ repo: desk.atadasok, log, agentIds: AGENTS.map(a => a.id), handlers: all, now, isAvailable: (id) => !!agentById(id)?.elerheto && agentActive(profile, id, now()) });
  ctx.atadasok = ctx.handoffs;
  return ctx;
}
export const buildLetterCtx = buildAgentCtx; // régi név
