// A Kommunikációs Kapcsolattartó Ügynök: levelek fogadása, besorolása, választervezet.
// Kifelé semmit nem küld: a tervezet az asztalon várja a vezető döntését; a válasz csak jóváhagyás után, a kimenő kapun át mehet.
//   ctx: { profile, log, outbox, llm, now, prompts, models, anyagok, atadasok, levelek, docs, mailbox? }
import { normalizeMessage, MAIL_LIMITS } from '../../mail/message.js';
import { classifyLetter } from './classify.js';
import { buildDraft, hasPlaceholder } from './draft.js';
import { agentActive } from '../../core/profile.js';
import { escapeHtml } from '../../core/text.js';
import { noteResponse } from '../esemenyszervezo/index.js';
import { recordStatement, checkConsistency } from '../archivum/index.js';

export const AGENT = 'kapcsolattarto';
const WHO = `ugynok:${AGENT}`;
export const MAX_PROCESS_PER_RUN = 20; // költségkorlát futásonként; a többi a következő futásra marad
export const FORWARD_TO = ['jogi', 'proaktiv', 'felkeszito'];

const FALLBACK_CLS = { tipus: 'egyeb', tema: 'ismeretlen', surgossag: 'normal', hangnem: 'semleges', hatarido: null, voros_vonal: false, jogi_gyanu: false, indoklas: 'A besorolás nem sikerült; kézi ellenőrzés javasolt.', bizonytalan: true, modell: 'hiba', gyanus_utasitas: false };

const draftText = (d) => d.opciok.map(o => (o.szoveg ? `## ${o.cim}\n${o.szoveg}` : `## ${o.cim}`)).join('\n\n');

// Egy levél feldolgozása: besorolás → tervezet → anyag az asztalra → szükség esetén riasztás és átadás.
export async function processLetter(ctx, id) {
  const { log, levelek, llm, prompts, models, profile, anyagok, atadasok, outbox, docs } = ctx;
  const letter = await levelek.get(id);
  if (!letter || !['uj', 'hiba'].includes(letter.allapot)) return { ok: false };
  let cls;
  try { cls = await classifyLetter(letter, { profile, llm, prompts, models }); }
  catch (e) {
    await log.append({ szereplo: WHO, tipus: 'hiba', hivatkozas: id, tartalom: { hiba: `levél besorolása sikertelen: ${e.message}` } });
    cls = { ...FALLBACK_CLS };
  }
  await log.append({ szereplo: WHO, tipus: 'level', hivatkozas: id, tartalom: { esemeny: 'besorolva', ...cls } });

  let draft;
  try { draft = await buildDraft({ letter, cls, profile, llm, prompts, models, docs }); }
  catch (e) {
    await log.append({ szereplo: WHO, tipus: 'hiba', hivatkozas: id, tartalom: { hiba: `tervezet készítése sikertelen: ${e.message}` } });
    await levelek.setProcessed(id, { besorolas: cls, anyagId: null, allapot: 'hiba' });
    return { ok: false, hiba: true };
  }
  // Az Archívum: kapcsolódó korábbi közlések (mindig) és ellentmondás-jelzés (csak AI-val, idézettel).
  const cons = await checkConsistency(ctx, { draftText: draft.opciok.map(o => o.szoveg).filter(Boolean).join('\n\n'), topic: `${letter.targy} ${cls.tema}` });
  const archivumMeta = { korabbi: cons.korabbi.map(({ id: kid, cim, kiadva, fajta, kivonat }) => ({ id: kid, cim, kiadva, fajta, kivonat })), ellentmondasok: cons.ellentmondasok, ellenorzes_megjegyzes: cons.megjegyzes, ellenorizve: cons.vizsgalt };
  const anyagId = await anyagok?.add({ ugynok: AGENT, tipus: 'valasz_tervezet', cim: `Választervezet: ${letter.targy}`, szoveg: draftText(draft), meta: { level_id: id, besorolas: cls, ...draft, ...archivumMeta } });
  if (cons.ellentmondasok.length) {
    await log.append({ szereplo: 'ugynok:archivum', tipus: 'javaslat', hivatkozas: id, tartalom: { fajta: 'ellentmondas_jelzes', darab: cons.ellentmondasok.length, kozlesek: cons.ellentmondasok.map(c => c.kozles_id) } });
    await atadasok?.send({ from: 'archivum', to: AGENT, tipus: 'jelzes', targy: `Ellentmondás a korábbi közlésekkel: ${letter.targy}`.slice(0, 200), szoveg: `A választervezet ${cons.ellentmondasok.length} ponton ellentmondhat korábbi közlésnek (pl. ${cons.ellentmondasok[0].kiadva || ''}: „${cons.ellentmondasok[0].regi_reszlet.slice(0, 120)}”). Nézze át, mielőtt jóváhagyja.`, anyagId: anyagId || null });
  }
  await levelek.setProcessed(id, { besorolas: cls, anyagId: anyagId || null, allapot: 'tervezet_kesz' });
  await log.append({ szereplo: WHO, tipus: 'valasz_tervezet', hivatkozas: id, tartalom: { anyag_id: anyagId, modell: draft.modell, forrasok: draft.forrasok.length, kockazatok: draft.kockazatok.length } });

  await noteResponse(ctx, letter); // ha a feladó meghívott egy nyitott eseményre, a válasz-javaslat az esemény meghívói közt is megjelenik
  if (cls.voros_vonal) {
    const subject = `Riasztás – vörös vonalba eső megkeresés – ${profile.megnevezes}`;
    const line = `Vörös vonalba eső levél érkezett: „${letter.targy}” (${letter.felado_nev || letter.felado}). A választervezet az asztalán vár.`;
    const note = 'Ezt a jelzést mesterséges intelligencia készítette elő; a levél ellenőrzése a vezető feladata.';
    await outbox.send({ agent: AGENT, kind: 'riasztas', to: profile.vezeto.email, subject, text: `- ${line}\n\n${note}`, html: `<body style="font-family:sans-serif"><h3>${escapeHtml(subject)}</h3><p>${escapeHtml(line)}</p><p><em>${escapeHtml(note)}</em></p></body>` });
    await log.append({ szereplo: WHO, tipus: 'riasztas_elkuldve', hivatkozas: `level:${id}`, tartalom: { sor: line } });
  }
  if (cls.jogi_gyanu) {
    // Belső kérdés a Jogi ügynöknek; üres asztalnál vár. Kifelé nem megy semmi.
    await atadasok?.send({ from: AGENT, to: 'jogi', tipus: 'kerdes', targy: `Jogi kérdés a levélben: ${letter.targy}`.slice(0, 200), szoveg: `A beérkezett levél jogi vonatkozást érinthet (téma: ${cls.tema}). A választervezet az asztalon van; kérjük a jogi szempontú véleményt a küldés előtt.`, anyagId: anyagId || null });
  }
  return { ok: true, cls, draft };
}

// Nyers levelek befogadása (postafiók, levélhíd vagy kézi felvitel). Az új leveleket (korlátig) azonnal feldolgozza.
export async function ingest(ctx, rawMessages, forras, { processLimit = MAX_PROCESS_PER_RUN } = {}) {
  const { log, levelek } = ctx;
  let fogadott = 0, duplikatum = 0, ervenytelen = 0;
  for (const raw of rawMessages.slice(0, MAIL_LIMITS.perBatch)) {
    const msg = normalizeMessage(raw);
    if (!msg) { ervenytelen++; continue; }
    const r = await levelek.add(msg, forras);
    if (!r.uj) { duplikatum++; continue; }
    fogadott++;
    await log.append({ szereplo: forras === 'kezi' ? 'rendszer' : WHO, tipus: 'level', hivatkozas: r.id, tartalom: { esemeny: 'fogadva', forras, felado: msg.felado, targy: msg.targy, karakter: msg.szoveg.length } });
  }
  const feldolgozva = await processPending(ctx, processLimit);
  return { fogadott, duplikatum, ervenytelen, feldolgozva };
}

export async function processPending(ctx, limit = MAX_PROCESS_PER_RUN) {
  if (!agentActive(ctx.profile, AGENT, ctx.now())) return 0;
  let n = 0;
  for (const letter of await ctx.levelek.pending(limit)) {
    try { if ((await processLetter(ctx, letter.id)).ok) n++; }
    catch (e) { await ctx.log.append({ szereplo: WHO, tipus: 'hiba', hivatkozas: letter.id, tartalom: { hiba: `levél feldolgozása sikertelen: ${e.message}` } }); }
  }
  return n;
}

// Ütemezett futás: a postafiók lekérdezése (ha van lekérdezhető) és a függő levelek feldolgozása.
export async function run(ctx) {
  const { profile, log, levelek, mailbox, now } = ctx;
  if (!agentActive(profile, AGENT, now())) {
    await log.append({ szereplo: 'rendszer', tipus: 'futas', tartalom: { agent: AGENT, kimenet: 'kihagyva: az ügynök ki van kapcsolva' } });
    return { skipped: true };
  }
  const result = { fogadott: 0, duplikatum: 0, ervenytelen: 0, feldolgozva: 0, hiba: null };
  if (mailbox) {
    const state = await levelek.mailboxState();
    try {
      const { messages, cursor } = await mailbox.pull({ since: state.kurzor });
      Object.assign(result, await ingest(ctx, messages, 'postafiok'));
      await levelek.saveMailboxState({ kurzor: cursor, siker: true });
    } catch (e) {
      // A hibaüzenet nem tartalmaz titkot (az illesztők nem teszik bele a szolgáltató válaszát).
      result.hiba = String(e.message || e).slice(0, 300);
      await levelek.saveMailboxState({ kurzor: null, hiba: result.hiba });
      await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: `postafiók lekérdezése sikertelen: ${result.hiba}` } });
    }
  } else {
    result.feldolgozva = await processPending(ctx);
  }
  await log.append({ szereplo: WHO, tipus: 'futas', tartalom: { agent: AGENT, ...result } });
  return result;
}

const toHtml = (text) => `<body style="font-family:sans-serif">${String(text).split(/\n{2,}/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')}</body>`;

// A vezető döntése egy levélről. `by`: a döntést hozó (naplóhoz); a küldés jóváhagyása a vezetőé (profil.vezeto).
// opcio: 'valasz' | 'kesobb' → a válasz a kimenő kapun át megy (száraz módban a kimenő mappába); 'nem_valaszolunk' | 'halaszt' | 'tovabbit'.
export async function decideLetter(ctx, id, { dontes, szoveg, targy, hova, by, jogiTudomasul = false }) {
  const { log, levelek, outbox, profile, atadasok } = ctx;
  const letter = await levelek.get(id);
  if (!letter) return { status: 404, hiba: 'Nincs ilyen levél.' };
  if (!['uj', 'tervezet_kesz', 'halasztva', 'hiba'].includes(letter.allapot)) return { status: 409, hiba: 'Erről a levélről már döntöttek.' };

  if (dontes === 'valasz' || dontes === 'kesobb') {
    const text = String(szoveg ?? '').trim();
    const subject = String(targy ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text || text.length > 5000) return { status: 400, hiba: 'A válasz szövege 1–5000 karakter legyen.' };
    if (!subject) return { status: 400, hiba: 'A tárgy kötelező.' };
    if (hasPlaceholder(text)) return { status: 422, hiba: 'A tervezet még kitöltendő részt tartalmaz ([KITÖLTENDŐ: …]); írja meg, mielőtt jóváhagyja.' };
    // Magas kockázatú jogi vélemény esetén a vezetőnek külön tudomásul kell vennie a figyelmeztetést (nem tilt, csak lassít).
    const ops = letter.anyag_id && ctx.anyagok.opinionsFor ? await ctx.anyagok.opinionsFor(letter.anyag_id) : [];
    if (ops.some(o => o.besorolas === 'magas') && !jogiTudomasul) return { status: 409, hiba: 'Erre a tervezetre magas kockázatú jogi vélemény készült. Olvassa el, és jelezze, hogy tudomásul vette a jogi figyelmeztetést, mielőtt jóváhagyja.', jogi_figyelmeztetes: true };
    if (!(await levelek.decide(id, { allapot: 'jovahagyva', by, valasz: { opcio: dontes, targy: subject, szoveg: text } }))) return { status: 409, hiba: 'Erről a levélről már döntöttek.' };
    try {
      // A címzett mindig a levél feladója; a felületről nem módosítható (nem lehet vele tetszőleges címre küldeni).
      const sent = await outbox.send({ agent: AGENT, kind: 'valasz', to: letter.felado, subject, text, html: toHtml(text), approval: { dontes: 'jovahagyva', by: profile.vezeto.email } });
      await log.append({ szereplo: by, tipus: 'dontes', hivatkozas: id, dontes_ref: id, tartalom: { dontes: 'jovahagyva', opcio: dontes, jogi_tudomasul: ops.some(o => o.besorolas === 'magas') ? true : undefined, kuldes: sent.id, kiment: !!sent.delivered, cimzett: letter.felado } });
      await recordStatement(ctx, { forrasTipus: 'level_valasz', forrasId: id, fajta: 'valasz', cim: subject, szoveg: text, cimzettEmail: letter.felado, jovahagyta: profile.vezeto.email, kiment: !!sent.delivered });
      return { status: 200, allapot: 'jovahagyva', kiment: !!sent.delivered };
    } catch (e) {
      await levelek.reopen(id);
      return { status: 502, hiba: `A válasz nem ment el: ${e.message}` };
    }
  }
  if (dontes === 'nem_valaszolunk' || dontes === 'elvet') {
    await levelek.decide(id, { allapot: 'elvetve', by });
    await log.append({ szereplo: by, tipus: 'dontes', hivatkozas: id, dontes_ref: id, tartalom: { dontes: 'elvetve' } });
    return { status: 200, allapot: 'elvetve' };
  }
  if (dontes === 'halaszt') {
    await levelek.decide(id, { allapot: 'halasztva', by });
    await log.append({ szereplo: by, tipus: 'dontes', hivatkozas: id, dontes_ref: id, tartalom: { dontes: 'halasztva' } });
    return { status: 200, allapot: 'halasztva' };
  }
  if (dontes === 'tovabbit') {
    if (!FORWARD_TO.includes(hova)) return { status: 400, hiba: 'Ismeretlen címzett ügynök.' };
    const r = await atadasok.send({ from: AGENT, to: hova, tipus: 'kerelem', targy: `Továbbított levél: ${letter.targy}`.slice(0, 200), szoveg: `A vezető továbbította a levelet (feladó: ${letter.felado_nev || letter.felado}). A választervezet az asztalon van.`, anyagId: letter.anyag_id });
    if (!r.ok) return { status: 409, hiba: `Az átadás nem sikerült: ${r.ok_reason}` };
    await levelek.decide(id, { allapot: 'tovabbitva', by });
    await log.append({ szereplo: by, tipus: 'dontes', hivatkozas: id, dontes_ref: id, tartalom: { dontes: 'tovabbitva', hova } });
    return { status: 200, allapot: 'tovabbitva' };
  }
  return { status: 400, hiba: 'Ismeretlen döntés.' };
}

export const kapcsolattartoAgent = { id: AGENT, modes: ['poll'], run };
