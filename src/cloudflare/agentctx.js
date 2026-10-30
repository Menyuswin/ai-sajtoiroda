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
import { createEventStore } from './esemeny-store.js';
import { createArchive } from './archivum-store.js';
import { createSocialStore } from './kozossegi-store.js';
import { createMailStore } from '../mail/store.js';
import { createDocs } from '../docs/store.js';
import { AGENTS, agentById } from '../api/catalogue.js';
import { createProposal, OCCASION_OF } from '../agents/proaktiv/index.js';
import { createPackage } from '../agents/felkeszito/index.js';
import { createOpinion, kindOfAnyag } from '../agents/jogi/index.js';
import { answerQuestion as archiveAnswer } from '../agents/archivum/index.js';
import { createPost } from '../agents/kozossegi/index.js';

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
    esemeny: createEventStore({ db: env.DB, tenantId, now }),
    archivum: createArchive({ db: env.DB, tenantId, now }),
    social: createSocialStore({ db: env.DB, tenantId, now }),
  };
  // Gyári feldolgozók: a megérkezett (vagy megérkezéskor kézbesített) átadásokat az ügynökök itt dolgozzák fel.
  const own = new Map([
    ['proaktiv', async (h) => {
      if (!['jelzes', 'kerelem', 'kerdes'].includes(h.tipus)) return { valasz: 'Tudomásul véve.' };
      const r = await createProposal(ctx, { tema: topicOf(h.targy), jelzes: h.szoveg, atadasId: h.id });
      return { valasz: `Megszólalási javaslat készült: ${r.cim}` };
    }],
    // Az esemény szervezése a vezető indítására készül (koncepció, jóváhagyás); az átadás csak tudomásul vétel.
    ['esemenyszervezo', async () => ({ valasz: 'Tudomásul véve. Esemény csak a vezető indítására készül; a koncepció jóváhagyás után indul tovább.' })],
    // A Jogi asztal véleményt készít az átadásban hivatkozott anyagról (tervezet, csomag, koncepció).
    ['jogi', async (h) => {
      if (!['kerdes', 'kerelem'].includes(h.tipus)) return { valasz: 'Tudomásul véve.' };
      const src = h.anyag_id ? await desk.anyagok.get(h.anyag_id) : null;
      if (!src) return { valasz: 'Az átadás nem hivatkozik vizsgálható anyagra; a Jogi asztalon kérhet véleményt anyagra vagy beillesztett szövegre.' };
      const r = await createOpinion(ctx, { anyagId: h.anyag_id, fajta: kindOfAnyag(src.tipus), atadasId: h.id });
      return { valasz: `Jogi vélemény: ${{ alacsony: 'alacsony', kozepes: 'közepes', magas: 'magas' }[r.besorolas]} kockázat, ${r.db} megállapítás${r.jogasz ? ', jogász bevonása javasolt' : ''}.` };
    }],
    // Az Archívum az átadásban feltett kérdésre kivonatos, forrásjelölt összefoglalót ad (a teljes keresés az asztalán van).
    ['archivum', async (h) => {
      if (!['kerdes', 'kerelem'].includes(h.tipus)) return { valasz: 'Tudomásul véve.' };
      return { valasz: await archiveAnswer(ctx, `${h.targy} ${h.szoveg}`) };
    }],
    // A Közösségi média asztal posztjavaslatot készít a jelzésből (Monitoring, Kapcsolattartó, Proaktív, Eseményszervező); kifelé semmi nem megy.
    ['kozossegi', async (h) => {
      if (!['jelzes', 'kerelem', 'kerdes'].includes(h.tipus)) return { valasz: 'Tudomásul véve.' };
      const src = h.anyag_id ? await desk.anyagok.get(h.anyag_id) : null;
      const levelId = src?.meta?.level_id || null;
      const extra = src?.tipus === 'megszolalasi_javaslat' && src.meta?.javaslat?.uzenet ? ` Javasolt üzenet: ${src.meta.javaslat.uzenet}` : '';
      const r = await createPost(ctx, { tema: topicOf(h.targy), jelzes: `${h.szoveg}${extra}`, levelId, atadasId: h.id, auto: true });
      if (r.kihagyva) return { valasz: 'A napi korlát kimerült; a jelzés nem indított új javaslatot.' };
      if (r.megfigyelendo) return { valasz: r.ok };
      if (r.kiegeszitve) return { valasz: 'Ugyanerre a témára nemrég már készült javaslat; a jelzést ahhoz fűztem.' };
      return { valasz: `Posztjavaslat készült: ${r.cim}` };
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
