// A Sajtófelkészítő Munkatárs: téma → felkészítő csomag (háttér, Q&A, üzenetkeretek, red flagek, talking points).
// Belső anyag: kifelé semmit nem küld. Red flag esetén belső kérdést ad át a Jogi asztalnak.
import { gatherSources, startOfDayIso } from '../common/sources.js';
import { buildContent, renderPackage, OCCASIONS } from './package.js';
import { agentActive } from '../../core/profile.js';

export const AGENT = 'felkeszito';
const WHO = `ugynok:${AGENT}`;
export const DAILY_LIMIT = 10;

export class AgentError extends Error { constructor(status, message) { super(message); this.status = status; } }

// ctx: { profile, log, llm, now, prompts, models, anyagok, atadasok, store, docs }
export async function createPackage(ctx, { tema, alkalom = 'nyilatkozat', idopont = '', megszolalo = '', by = WHO, parentId = null, sourceAnyagId = null }) {
  const { profile, log, llm, now, prompts, models, anyagok, atadasok, store, docs } = ctx;
  const topic = String(tema || '').replace(/\s+/g, ' ').trim();
  if (!topic || topic.length > 300) throw new AgentError(400, 'A téma 1–300 karakter legyen.');
  if (!OCCASIONS[alkalom]) throw new AgentError(400, 'Ismeretlen alkalom.');
  if (!agentActive(profile, AGENT, now())) throw new AgentError(409, 'A Felkészítő szünetel; kapcsolja vissza, mielőtt új csomagot kér.');
  if ((await anyagok.countSince(AGENT, 'felkeszito_csomag', startOfDayIso(now()))) >= DAILY_LIMIT) {
    await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: `napi korlát (${DAILY_LIMIT} csomag) kimerült`, tema: topic } });
    throw new AgentError(429, `A mai korlát (${DAILY_LIMIT} csomag) kimerült; holnap újra kérhet.`);
  }
  const req = { tema: topic, alkalom, idopont: String(idopont || '').trim().slice(0, 60), megszolalo: String(megszolalo || '').trim().slice(0, 120) };
  const sources = await gatherSources({ articles: await store.load(), docs, topic, agent: AGENT, forAI: llm.mode !== 'mock', now: now() });
  let content;
  try { content = await buildContent(req, sources, { profile, llm, prompts, models }); }
  catch (e) {
    await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: `csomag készítése AI-val sikertelen, váz készül: ${e.message}` } });
    content = await buildContent(req, sources, { profile, llm: { mode: 'mock' }, prompts, models });
  }
  const text = renderPackage(req, content, sources);
  const cim = `Felkészítő csomag: ${topic}`;
  const anyagId = await anyagok.add({ ugynok: AGENT, tipus: 'felkeszito_csomag', cim, szoveg: text, meta: { ...req, forras_anyag: sourceAnyagId, red_flag: content.red_flag, modell: content.modell, kizart_ai: sources.kizart_ai, kockazatok: content.kockazatok,
    cikkek: sources.cikkek.map(({ n, id, title, url, medium, hangnem, indoklas }) => ({ n, id, title, url, medium, hangnem, indoklas })), forrasok: sources.reszletek.map(({ szoveg, ...r }) => r) } });
  await log.append({ szereplo: by, tipus: 'csomag', hivatkozas: anyagId, tartalom: { tema: topic, alkalom, modell: content.modell, cikkek: sources.cikkek.length, dokumentumok: sources.reszletek.length, red_flag: content.red_flag } });
  if (content.red_flag) {
    await atadasok?.send({ from: AGENT, to: 'jogi', tipus: 'kerdes', targy: `Red flag a felkészítő csomagban: ${topic}`.slice(0, 200), szoveg: `A(z) „${topic}” témájú csomagban red flag van (${content.red_flags.length} pont). Kérjük a jogi szempontú átnézést a külső használat előtt.`, anyagId, parentId });
  }
  return { anyagId, cim, redFlag: content.red_flag, modell: content.modell };
}

export const felkeszitoAgent = { id: AGENT, modes: ['igeny'], run: async () => ({ skipped: true }) };
