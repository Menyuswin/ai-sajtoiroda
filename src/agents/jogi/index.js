// A Jogi- és Kockázatfigyelő Munkatárs: tervezett szöveg → kockázati besorolás, megállapítások szó szerinti idézettel.
// Jelez, de nem helyettesíti a jogászt. Semmit nem módosít, és kifelé nem küld; magas kockázatnál riasztás csak a vezetőnek.
import { analyse, CATEGORIES, KINDS, LEVEL_LABEL } from './analysis.js';
import { startOfDayIso, AI_NOTE } from '../common/sources.js';
import { agentActive } from '../../core/profile.js';
import { escapeHtml } from '../../core/text.js';
import { AgentError } from '../felkeszito/index.js';

export const AGENT = 'jogi';
const WHO = `ugynok:${AGENT}`;
export const DAILY_LIMIT = 10;
export const MAX_TEXT = 10000;
export const DISCLAIMER = 'Ez a vélemény figyelmeztetés, nem jogi tanács, és nem helyettesíti a jogászt. A küldésről és a jogi kérdésekről a vezető és a jogász dönt.';
const KIND_OF = { valasz_tervezet: 'valasz', felkeszito_csomag: 'egyeb', esemeny_koncepcio: 'egyeb', megszolalasi_javaslat: 'nyilatkozat', esemeny_utomunka: 'sajtoanyag' };
export const kindOfAnyag = (tipus) => KIND_OF[tipus] || 'egyeb';

function render(title, kind, r, srcText) {
  const L = [`# Jogi vélemény: ${title}`, '', `**Besorolás: ${LEVEL_LABEL[r.besorolas].toUpperCase()}** · fajta: ${KINDS[kind] || kind}`, r.indoklas || '', ''];
  if (r.jogasz_javasolt) L.push('**Jogász bevonása javasolt a külső használat vagy a küldés előtt.**', '');
  L.push('## Megállapítások');
  if (!r.findings.length) L.push('- Nem találtunk jelzésre érdemes pontot. Ez nem jelenti azt, hogy a szöveg kockázatmentes.');
  r.findings.forEach((f, i) => { L.push(`${i + 1}. **${CATEGORIES[f.kategoria]}** (${LEVEL_LABEL[f.szint]})`, `  „${f.reszlet}”`, `  Indoklás: ${f.indoklas}`, ...(f.javitas ? [`  Javasolt javítás: ${f.javitas}`] : [])); });
  if (r.jegyzetek.length) L.push('', '**Megjegyzések**', ...r.jegyzetek.map(x => `- ${x}`));
  L.push('', DISCLAIMER, '', AI_NOTE);
  return L.join('\n');
}

// ctx: { profile, log, outbox, llm, now, prompts, models, anyagok }
export async function createOpinion(ctx, { anyagId = null, szoveg = null, fajta = 'egyeb', by = WHO, atadasId = null }) {
  const { profile, log, outbox, llm, now, prompts, models, anyagok } = ctx;
  if (!agentActive(profile, AGENT, now())) throw new AgentError(409, 'A Jogi munkatárs szünetel; kapcsolja vissza, mielőtt véleményt kér.');
  let text = String(szoveg ?? ''), title = 'beillesztett szöveg', kind = KINDS[fajta] ? fajta : null;
  if (anyagId) {
    const src = await anyagok.get(anyagId);
    if (!src) throw new AgentError(404, 'Nincs ilyen anyag.');
    text = src.szoveg; title = src.cim; kind = kind && fajta !== 'egyeb' ? kind : kindOfAnyag(src.tipus);
  }
  kind ||= 'egyeb';
  text = text.replace(/\r\n?/g, '\n').trim();
  if (!text) throw new AgentError(400, 'Nincs vizsgálható szöveg.');
  if (text.length > MAX_TEXT) { if (anyagId) text = text.slice(0, MAX_TEXT); else throw new AgentError(400, `A szöveg legfeljebb ${MAX_TEXT} karakter lehet.`); }
  if ((await anyagok.countSince(AGENT, 'jogi_velemeny', startOfDayIso(now()))) >= DAILY_LIMIT) {
    await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: `napi korlát (${DAILY_LIMIT} vélemény) kimerült` } });
    throw new AgentError(429, `A mai korlát (${DAILY_LIMIT} vélemény) kimerült; holnap újra kérhet.`);
  }
  const r = await analyse({ text, kind, profile, llm, prompts, models });
  const id = await anyagok.add({ ugynok: AGENT, tipus: 'jogi_velemeny', cim: `Jogi vélemény: ${title}`.slice(0, 200), szoveg: render(title, kind, r, text),
    meta: { forras_anyag_id: anyagId, forras_cim: title, fajta: kind, besorolas: r.besorolas, jogasz_javasolt: r.jogasz_javasolt, talalatok: r.findings.length, modell: r.modell, ai_alacsonyabb: r.ai_alacsonyabb, megallapitasok: r.findings.map(({ kategoria, szint }) => ({ kategoria, szint })) } });
  await log.append({ szereplo: by, tipus: 'javaslat', hivatkozas: id, tartalom: { fajta: 'jogi_velemeny', besorolas: r.besorolas, megallapitasok: r.findings.length, forras_anyag_id: anyagId, modell: r.modell, atadas: atadasId } });
  if (r.besorolas === 'magas') {
    const subject = `Riasztás – magas jogi kockázat: ${title}`.slice(0, 200);
    const line = `A(z) „${title}” szövegre magas kockázatú jogi vélemény készült (${r.findings.filter(f => f.szint === 'magas').length} magas szintű megállapítás). Jogász bevonása javasolt a külső használat vagy a küldés előtt.`;
    await outbox.send({ agent: AGENT, kind: 'riasztas', to: profile.vezeto.email, subject, text: `- ${line}\n\n${DISCLAIMER}`, html: `<body style="font-family:sans-serif"><h3>${escapeHtml(subject)}</h3><p>${escapeHtml(line)}</p><p><em>${escapeHtml(DISCLAIMER)}</em></p></body>` });
    await log.append({ szereplo: WHO, tipus: 'riasztas_elkuldve', hivatkozas: `jogi:${id}`, tartalom: { sor: line } });
  }
  return { id, besorolas: r.besorolas, db: r.findings.length, jogasz: r.jogasz_javasolt, modell: r.modell };
}

export const jogiAgent = { id: AGENT, modes: ['igeny'], run: async () => ({ skipped: true }) };
