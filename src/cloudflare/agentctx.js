// Egy ügyfél Kapcsolattartó-környezete (napló, asztal, átadások, kimenő kapu, levéltár, dokumentumtár, AI).
// Az API és a levélhíd-fogadó is ezt használja, így ugyanaz a szabály vonatkozik rájuk, mint az ütemezett futásra.
import { getConfig } from '../core/config.js';
import { createLlm } from '../core/llm.js';
import { createOutbox } from '../core/outbox.js';
import { createLiveMailer } from '../core/mailer.js';
import { agentActive } from '../core/profile.js';
import { createHandoffs } from '../core/handoff.js';
import { createD1Log, createD1DryMailer } from './d1.js';
import { createDesk } from './desk.js';
import { createMailStore } from '../mail/store.js';
import { createDocs } from '../docs/store.js';
import { AGENTS, agentById } from '../api/catalogue.js';
import { handoffHandlers } from './scheduler.js';

export function buildLetterCtx({ env, profile, now, prompts, llmFetch, mailbox = null }) {
  const tenantId = profile.ugyfel_id;
  const config = getConfig(env);
  const log = createD1Log({ db: env.DB, tenantId, now });
  const desk = createDesk({ db: env.DB, tenantId, now });
  // Éles módban a levélküldő hiánya csak küldéskor derül ki (a többi API-hívást nem akasztja meg).
  const mailer = config.live ? { name: 'elo', send: async (msg) => createLiveMailer(config.mailer).send(msg) } : createD1DryMailer({ db: env.DB, now });
  const outbox = createOutbox({ profile, mailer, log });
  const handoffs = createHandoffs({ repo: desk.atadasok, log, agentIds: AGENTS.map(a => a.id), handlers: handoffHandlers, now, isAvailable: (id) => !!agentById(id)?.elerheto && agentActive(profile, id, now()) });
  let llm;
  try { llm = createLlm({ mode: env.SAJTOIRODA_LLM === 'anthropic' ? 'anthropic' : 'mock', key: config.anthropicKey, models: config.models, ...(llmFetch ? { fetchImpl: llmFetch } : {}) }); }
  catch { llm = createLlm({ mode: 'mock' }); }
  return {
    profile, log, outbox, llm, now, prompts, models: config.models, desk, handoffs, mailbox,
    anyagok: desk.anyagok, atadasok: handoffs,
    levelek: createMailStore({ db: env.DB, tenantId, now }),
    docs: createDocs({ db: env.DB, bucket: env.DOCS || null, tenantId, now }),
  };
}
