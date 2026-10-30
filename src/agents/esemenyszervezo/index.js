// Az Eseményszervező Munkatárs: koncepció → (vezetői jóváhagyás) → meghívók és ellenőrzőlista → visszajelzések → utómunka.
// Csak jóváhagyott koncepcióval indul tovább; meghívó csak a vezető jóváhagyásával, a kimenő kapun át, a sajtólistán szereplő, hozzájáruló kapcsolatoknak megy.
import { gatherSources, startOfDayIso, AI_NOTE } from '../common/sources.js';
import { buildConcept, renderConcept, costSummary } from './concept.js';
import { suggestDay } from '../proaktiv/index.js';
import { EventError, EVENT_FORMATS, LIMITS, RESPONSES } from '../../cloudflare/esemeny-store.js';
import { agentActive } from '../../core/profile.js';
import { dayKey, escapeHtml, norm } from '../../core/text.js';
import { recordStatement } from '../archivum/index.js';

export const AGENT = 'esemenyszervezo';
const WHO = `ugynok:${AGENT}`;
export const LIMITS_DAILY = { concepts: 3, inviteDrafts: 50 };
const KIT = (s) => `[KITÖLTENDŐ: ${s}]`;
const PLACEHOLDER = /\[KITÖLTENDŐ[^\]]*\]/;
export { EventError };

const addDays = (dateStr, n) => new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// ---- sajtólista: CSV
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const delim = (src.split('\n', 1)[0].match(/;/g) || []).length > (src.split('\n', 1)[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c.trim())) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(c => c.trim())) rows.push(row);
  return rows;
}
const HEADERS = { nev: ['nev', 'név', 'name'], medium: ['medium', 'médium', 'szerkesztoseg', 'szerkesztőség'], email: ['email', 'e-mail', 'e-mail-cim', 'e-mail-cím'], tema: ['tema', 'téma', 'temak', 'témák'], prioritas: ['prioritas', 'prioritás'], megjegyzes: ['megjegyzes', 'megjegyzés'], hozzajarulas: ['hozzajarulas', 'hozzájárulás'] };

// A CSV importálása. A feltöltőnek meg kell erősítenie, hogy a listán szereplők hozzájárulása megvan (GDPR); ellenkező esetben a sor „hozzájárulás nélkül” kerül be, és nem hívható.
export async function importContacts(ctx, csvText, { megerosites = false, by }) {
  if (String(csvText).length > 2 * 1024 * 1024) throw new EventError(413, 'A CSV túl nagy (legfeljebb 2 MB).');
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new EventError(400, 'A CSV üres, vagy nincs fejlécsora.');
  const head = rows[0].map(h => norm(h).trim());
  const col = {};
  for (const [k, names] of Object.entries(HEADERS)) { const i = head.findIndex(h => names.map(norm).includes(h)); if (i >= 0) col[k] = i; }
  if (col.nev == null || col.email == null) throw new EventError(400, 'A fejlécben a „név” és az „e-mail” oszlop kötelező.');
  let hozzaadva = 0; const hibak = [];
  for (const [i, r] of rows.slice(1).entries()) {
    try {
      const consentCell = col.hozzajarulas != null ? norm(r[col.hozzajarulas] || '').trim() : null;
      const consent = consentCell != null ? ['igen', 'i', '1', 'true', 'x'].includes(consentCell) : megerosites;
      await ctx.esemeny.contacts.add({ nev: r[col.nev], email: r[col.email], medium: r[col.medium] || '', tema: r[col.tema] || '', prioritas: r[col.prioritas] || 2, megjegyzes: r[col.megjegyzes] || '', hozzajarulas: consent });
      hozzaadva++;
    } catch (e) { if (e instanceof EventError) hibak.push(`${i + 2}. sor: ${e.message}`); else throw e; }
  }
  await ctx.log.append({ szereplo: by, tipus: 'naptar_modositas', tartalom: { esemeny: 'sajtolista_import', hozzaadva, hibas: hibak.length, hozzajarulas_megerositve: !!megerosites } });
  return { hozzaadva, hibak: hibak.slice(0, 20), hibas_osszesen: hibak.length };
}

// ---- esemény létrehozása és koncepció
const CHECKLIST = [
  ['A helyszín lefoglalása és szerződés', -21], ['Technika: hang, kép, internet, tolmács', -14], ['Étkeztetés és pihenőterület', -14], ['Akkreditáció, névkártyák, regisztráció', -7],
  ['Hozzáférhetőség (akadálymentesség, jelnyelv igény szerint)', -7], ['Megszólalók felkészítése (Felkészítő csomag)', -5], ['Sajtóanyag-csomag összeállítása', -5],
  ['Meghívók kiküldése', -10], ['Visszajelzések követése, emlékeztető', -3], ['Rendezvény napi felelős és forgatókönyv', -1], ['Utómunka: sajtóanyag, résztvevői lista, megjelenések', 2],
];
export const buildChecklist = (idopont) => CHECKLIST.map(([tetel, off], i) => ({ id: `t${i + 1}`, tetel, felelos: '', hatarido: idopont ? addDays(idopont, off) : null, kesz: false }));

export function defaultInvite(ev, profile) {
  const when = ev.idopont || KIT('időpont');
  const sign = (profile.kapcsolattarto?.alairas || '').trim() || `${profile.vezeto.nev || 'A sajtóiroda'}\n${profile.megnevezes}`;
  return {
    targy: `Meghívó: ${ev.cim}`,
    szoveg: `A(z) ${profile.megnevezes} szeretettel meghívja Önt a következő sajtóeseményére:\n\n${ev.cim}\nFormátum: ${EVENT_FORMATS[ev.formatum]}\nIdőpont: ${when}\nHelyszín: ${ev.helyszin || KIT('helyszín')}\nTéma: ${ev.tema}\n\nKérjük, jelezzen vissza, hogy részt tud-e venni.\n\nÜdvözlettel:\n${sign}`,
  };
}

// ctx: { profile, log, outbox, llm, now, prompts, models, anyagok, atadasok, docs, proactive, esemeny, levelek }
export async function createEvent(ctx, { tema, formatum = 'sajtotajekoztato', idopont = '', helyszin = '', keret = null, javaslatId = null, by = WHO }) {
  const { profile, log, llm, now, prompts, models, anyagok, atadasok, docs, proactive, esemeny, outbox } = ctx;
  const topic = String(tema || '').replace(/\s+/g, ' ').trim();
  if (!topic || topic.length > 300) throw new EventError(400, 'A téma 1–300 karakter legyen.');
  if (!EVENT_FORMATS[formatum]) throw new EventError(400, 'Ismeretlen formátum.');
  const date = String(idopont || '').trim();
  if (date && !validDate(date)) throw new EventError(400, 'Az időpont ÉÉÉÉ-HH-NN alakú legyen.');
  const budget = keret === '' || keret == null ? null : Math.round(Number(keret));
  if (budget != null && !(budget >= 0 && budget <= 1e9)) throw new EventError(400, 'A költségkeret 0 és 1 000 000 000 Ft közötti szám legyen.');
  if (!agentActive(profile, AGENT, now())) throw new EventError(409, 'Az Eseményszervező szünetel; kapcsolja vissza, mielőtt új eseményt indít.');
  if ((await anyagok.countSince(AGENT, 'esemeny_koncepcio', startOfDayIso(now()))) >= LIMITS_DAILY.concepts) {
    await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: `napi korlát (${LIMITS_DAILY.concepts} koncepció) kimerült`, tema: topic } });
    throw new EventError(429, `A mai korlát (${LIMITS_DAILY.concepts} új koncepció) kimerült; holnap újra kérhet.`);
  }
  const req = { cim: `${EVENT_FORMATS[formatum]}: ${topic}`.slice(0, 200), tema: topic, formatum, idopont: date, helyszin: String(helyszin || '').trim().slice(0, 200), keret: budget };
  const tz = profile.utemezes.idozona;
  const calendar = await proactive.calendar.list({ from: dayKey(new Date(now().getTime() - 3 * 86400000), tz), to: dayKey(new Date(now().getTime() + 60 * 86400000), tz) });
  const day = suggestDay(calendar, now(), tz);
  const sources = await gatherSources({ articles: [], docs, topic, agent: AGENT, forAI: llm.mode !== 'mock', now: now() });
  let content;
  try { content = await buildConcept(req, { sources, calendar, day, profile, llm, prompts, models }); }
  catch (e) {
    await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: `koncepció AI-val sikertelen, váz készül: ${e.message}` } });
    content = await buildConcept(req, { sources, calendar, day, profile, llm: { mode: 'mock' }, prompts, models });
  }
  const cost = costSummary(content.koltseg_tetelek, budget);
  const contacts = await esemeny.contacts.list();
  const consenting = contacts.filter(c => c.hozzajarulas);
  const words = norm(topic).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  const matching = consenting.filter(c => words.some(w => norm(`${c.tema} ${c.medium}`).includes(w.slice(0, Math.max(4, w.length - 2)))));
  const audience = `A sajtólistán ${consenting.length} hozzájáruló kapcsolat van, ebből ${matching.length} kapcsolódik a témához (téma-egyezés), ${consenting.filter(c => c.prioritas === 1).length} kiemelt (1. prioritás).`;
  const text = renderConcept(req, content, cost, audience, day);
  const anyagId = await anyagok.add({ ugynok: AGENT, tipus: 'esemeny_koncepcio', cim: `Eseménykoncepció: ${req.cim}`, szoveg: text, meta: { ...req, koltseg: cost, tetelek: content.koltseg_tetelek, javasolt_nap: day, modell: content.modell, kizart_ai: sources.kizart_ai, forrasok: sources.reszletek.map(({ szoveg, ...r }) => r), jogi: content.jogi_biztonsagi_kerdesek } });
  const id = await esemeny.events.add({ cim: req.cim, tema: topic, formatum, idopont: date || null, helyszin: req.helyszin || null, keret: budget, javaslatId });
  await esemeny.events.set(id, { koncepcio_anyag_id: anyagId });
  await log.append({ szereplo: by, tipus: 'javaslat', hivatkozas: id, tartalom: { fajta: 'esemeny_koncepcio', tema: topic, formatum, modell: content.modell, osszeg: cost.osszeg, keret: budget, tullepes: cost.tullepes, anyag_id: anyagId } });
  if (cost.tullepes) {
    const subject = `Riasztás – költségkeret-túllépés: ${req.cim}`;
    const line = `Az esemény becsült költsége (${Math.round(cost.osszeg)} Ft) meghaladja a keretet (${budget} Ft). A koncepció az asztalán vár.`;
    await outbox.send({ agent: AGENT, kind: 'riasztas', to: profile.vezeto.email, subject, text: `- ${line}`, html: `<body style="font-family:sans-serif"><h3>${escapeHtml(subject)}</h3><p>${escapeHtml(line)}</p></body>` });
    await log.append({ szereplo: WHO, tipus: 'riasztas_elkuldve', hivatkozas: `esemeny:${id}`, tartalom: { sor: line } });
  }
  if (content.jogi_biztonsagi_kerdesek.length) {
    await atadasok?.send({ from: AGENT, to: 'jogi', tipus: 'kerdes', targy: `Jogi vagy biztonsági kérdés: ${req.cim}`.slice(0, 200), szoveg: `A koncepcióban ${content.jogi_biztonsagi_kerdesek.length} jogi vagy biztonsági kérdés merült fel (helyszín, rendezvény). Kérjük a véleményt a jóváhagyás előtt.`, anyagId });
  }
  return { id, anyagId, cim: req.cim, tullepes: cost.tullepes, modell: content.modell };
}

// ---- állapotgép
export async function decideEvent(ctx, id, { dontes, by }) {
  const { esemeny, log, profile } = ctx;
  const ev = await esemeny.events.get(id);
  if (!ev) return { status: 404, hiba: 'Nincs ilyen esemény.' };
  const rules = {
    jovahagy: { from: ['koncepcio'], to: 'szervezes' }, elvet: { from: ['koncepcio', 'szervezes'], to: 'elvetve' }, elhalaszt: { from: ['koncepcio', 'szervezes'], to: 'elhalasztva' },
    lezajlott: { from: ['szervezes'], to: 'lezajlott' }, lezar: { from: ['utomunka', 'lezajlott'], to: 'lezarva' },
  };
  const r = rules[dontes];
  if (!r) return { status: 400, hiba: 'Ismeretlen döntés.' };
  if (!r.from.includes(ev.allapot)) return { status: 409, hiba: dontes === 'jovahagy' ? 'Ez a koncepció már nem hagyható jóvá (már döntöttek róla).' : `Ebben az állapotban (${ev.allapot}) ez a lépés nem lehetséges.` };
  const extra = {};
  if (dontes === 'jovahagy') {
    const inv = defaultInvite(ev, profile);
    Object.assign(extra, { jovahagyva_by: by, jovahagyva_ido: ctx.now().toISOString(), meghivo_targy: inv.targy, meghivo_szoveg: inv.szoveg, ellenorzolista_json: JSON.stringify(buildChecklist(ev.idopont)) });
  }
  if (!(await esemeny.events.transition(id, r.from, r.to, extra))) return { status: 409, hiba: 'Az esemény állapota közben megváltozott.' };
  await log.append({ szereplo: by, tipus: 'dontes', hivatkozas: id, dontes_ref: id, tartalom: { dontes: dontes === 'jovahagy' ? 'jovahagyva' : r.to, fajta: 'esemeny', esemeny: ev.cim } });
  return { status: 200, allapot: r.to };
}

// ---- meghívók
export async function inviteCandidates(ctx, id) {
  const ev = await ctx.esemeny.events.get(id);
  if (!ev) return null;
  const invited = new Set((await ctx.esemeny.invites.list(id)).map(i => i.kapcsolat_id));
  const words = norm(ev.tema).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  const match = (c) => words.some(w => norm(`${c.tema} ${c.medium}`).includes(w.slice(0, Math.max(4, w.length - 2))));
  const all = await ctx.esemeny.contacts.list();
  return all.filter(c => !invited.has(c.id)).map(c => ({ ...c, temahoz_illik: match(c) }))
    .sort((a, b) => a.prioritas - b.prioritas || Number(b.temahoz_illik) - Number(a.temahoz_illik) || a.nev.localeCompare(b.nev, 'hu'));
}

export async function addInvites(ctx, id, contactIds, { by }) {
  const { esemeny, log, now } = ctx;
  const ev = await esemeny.events.get(id);
  if (!ev) throw new EventError(404, 'Nincs ilyen esemény.');
  if (ev.allapot !== 'szervezes') throw new EventError(409, 'Meghívólista csak jóváhagyott koncepciójú, szervezés alatti eseményhez készíthető.');
  const ids = [...new Set((Array.isArray(contactIds) ? contactIds : []).map(String))];
  if (!ids.length) throw new EventError(400, 'Jelöljön ki legalább egy kapcsolatot.');
  if ((await esemeny.invites.count(id)) + ids.length > LIMITS.invitesPerEvent) throw new EventError(400, `Egy eseményre legfeljebb ${LIMITS.invitesPerEvent} meghívó készíthető.`);
  if ((await esemeny.invites.countCreatedSince(startOfDayIso(now()))) + ids.length > LIMITS_DAILY.inviteDrafts) throw new EventError(429, `A mai korlát (${LIMITS_DAILY.inviteDrafts} meghívótervezet) túllépődne.`);
  const contacts = await esemeny.contacts.getMany(ids);
  if (contacts.length !== ids.length) throw new EventError(400, 'Ismeretlen kapcsolat a kijelölésben.');
  const noConsent = contacts.filter(c => !c.hozzajarulas);
  if (noConsent.length) throw new EventError(422, `${noConsent.length} kijelölt kapcsolatnál nincs hozzájárulás-jelölés, ők nem hívhatók: ${noConsent.slice(0, 3).map(c => c.nev).join(', ')}`);
  for (const c of contacts) await esemeny.invites.add(id, c.id);
  await log.append({ szereplo: by, tipus: 'dontes', hivatkozas: id, tartalom: { dontes: 'meghivolista', fajta: 'esemeny', darab: contacts.length } });
  return { darab: contacts.length };
}

const toHtml = (text) => `<body style="font-family:sans-serif">${String(text).split(/\n{2,}/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')}</body>`;

// A meghívók kiküldése: a vezető kifejezett döntése. A címzett mindig a sajtólistán szereplő, hozzájáruló kapcsolat; a kimenő kapun át megy.
export async function sendInvites(ctx, id, { by }) {
  const { esemeny, outbox, profile, log } = ctx;
  const ev = await esemeny.events.get(id);
  if (!ev) throw new EventError(404, 'Nincs ilyen esemény.');
  if (ev.allapot !== 'szervezes') throw new EventError(409, 'Meghívó csak jóváhagyott koncepciójú, szervezés alatti eseményhez küldhető.');
  const subject = String(ev.meghivo_targy || '').trim(), body = String(ev.meghivo_szoveg || '').trim();
  if (!subject || !body) throw new EventError(400, 'A meghívó tárgya és szövege kötelező.');
  if (PLACEHOLDER.test(subject) || PLACEHOLDER.test(body)) throw new EventError(422, 'A meghívó még kitöltendő részt tartalmaz ([KITÖLTENDŐ: …]); írja meg, mielőtt kiküldi.');
  const drafts = (await esemeny.invites.list(id)).filter(i => i.allapot === 'tervezet');
  if (!drafts.length) throw new EventError(400, 'Nincs kiküldésre váró meghívó.');
  let sent = 0, delivered = 0;
  for (const inv of drafts) {
    const c = await esemeny.contacts.get(inv.kapcsolat_id);
    if (!c || !c.hozzajarulas) continue; // időközben törölt vagy visszavont hozzájárulás
    try {
      const text = `Tisztelt ${c.nev}!\n\n${body}`;
      const r = await outbox.send({ agent: AGENT, kind: 'meghivo', to: c.email, subject, text, html: toHtml(text), approval: { dontes: 'jovahagyva', by: profile.vezeto.email } });
      if (await esemeny.invites.markSent(inv.id)) { sent++; if (r.delivered) delivered++; }
    } catch (e) {
      await log.append({ szereplo: by, tipus: 'dontes', hivatkozas: id, tartalom: { dontes: 'meghivok_kuldese', fajta: 'esemeny', elkuldve: sent, megszakadt: true } });
      throw new EventError(502, `A kiküldés megszakadt (${sent} meghívó elment): ${e.message}`);
    }
  }
  if (sent) {
    let h = 0; for (const ch of body) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; // ugyanaz a meghívószöveg ugyanahhoz az eseményhez egyszer kerül az archívumba
    await recordStatement(ctx, { forrasTipus: 'meghivo', forrasId: `${id}:${(h >>> 0).toString(16)}`, fajta: 'meghivo', cim: subject, szoveg: body, cimzettMedium: `Sajtólista (${sent} címzett, esemény: ${ev.cim})`.slice(0, 120), jovahagyta: profile.vezeto.email, kiment: delivered > 0 });
  }
  await log.append({ szereplo: by, tipus: 'dontes', hivatkozas: id, dontes_ref: id, tartalom: { dontes: 'meghivok_kuldese', fajta: 'esemeny', esemeny: ev.cim, darab: sent, kiment: delivered } });
  return { elkuldve: sent, kiment: delivered };
}

// ---- visszajelzések: a beérkező levélből javaslat (a vezető véglegesít)
const NEG = ['nem tudok', 'nem tudunk', 'sajnos', 'nem leszek', 'nem leszunk', 'lemond', 'elfoglalt', 'nem megyek', 'nem jovunk', 'nem veszek reszt', 'nem tudunk reszt'];
const POS = ['reszt veszek', 'reszt vesz', 'reszt tudok', 'ott leszek', 'ott leszunk', 'megjelen', 'elfogad', 'jovok', 'jovunk', 'szivesen', 'koszonjuk a meghivast', 'koszonom a meghivast'];
export function suggestResponse(text) {
  const t = norm(text);
  if (NEG.some(w => t.includes(w))) return 'nem_vesz_reszt';
  if (POS.some(w => t.includes(w))) return 'reszt_vesz';
  return 'bizonytalan';
}
export async function noteResponse(ctx, letter) {
  if (!ctx.esemeny) return 0;
  const open = await ctx.esemeny.invites.openForEmail(letter.felado);
  for (const inv of open) await ctx.esemeny.invites.setSuggestion(inv.id, suggestResponse(`${letter.targy} ${letter.szoveg}`), letter.id);
  if (open.length) await ctx.log.append({ szereplo: WHO, tipus: 'level', hivatkozas: letter.id, tartalom: { esemeny: 'meghivo_valasz_javaslat', meghivok: open.length } });
  return open.length;
}
export async function setInviteResponse(ctx, inviteId, valasz, { by }) {
  if (!RESPONSES.includes(valasz)) throw new EventError(400, 'Ismeretlen válasz-állapot.');
  const inv = await ctx.esemeny.invites.get(inviteId);
  if (!inv) throw new EventError(404, 'Nincs ilyen meghívó.');
  await ctx.esemeny.invites.setResponse(inviteId, valasz);
  await ctx.log.append({ szereplo: by, tipus: 'dontes', hivatkozas: inviteId, tartalom: { dontes: 'visszajelzes', fajta: 'esemeny', valasz } });
}

// ---- utómunka
export async function createPostWork(ctx, id, { by }) {
  const { esemeny, anyagok, log, store, docs, now, llm } = ctx;
  const ev = await esemeny.events.get(id);
  if (!ev) throw new EventError(404, 'Nincs ilyen esemény.');
  if (ev.allapot !== 'lezajlott') throw new EventError(409, 'Az utómunka a „lezajlott” állapotú eseményhez készíthető (előbb jelölje lezajlottnak).');
  const invites = await esemeny.invites.list(id);
  const count = (v) => invites.filter(i => i.valasz === v).length;
  const days = ev.idopont ? Math.max(1, Math.ceil((now().getTime() - Date.parse(`${ev.idopont}T00:00:00Z`)) / 86400000) + 1) : 30;
  const sources = await gatherSources({ articles: await store.load(), docs: null, topic: ev.tema, agent: AGENT, forAI: llm.mode !== 'mock', now: now(), days: Math.min(days, 90) });
  const after = sources.cikkek.filter(c => !ev.idopont || !c.published || c.published.slice(0, 10) >= ev.idopont);
  const L = [`# Utómunka: ${ev.cim}`, '', `**Időpont:** ${ev.idopont || KIT('időpont')} · **Helyszín:** ${ev.helyszin || KIT('helyszín')}`, '',
    '## Résztvevői lista', ...(count('reszt_vesz') ? invites.filter(i => i.valasz === 'reszt_vesz').map(i => `- ${i.nev}${i.medium ? ` (${i.medium})` : ''}`) : ['- (nincs rögzített résztvevő; a visszajelzéseket a meghívók listáján véglegesítheti)']), '',
    `**Meghívottak:** ${invites.length} · **részt vesz:** ${count('reszt_vesz')} · **nem vesz részt:** ${count('nem_vesz_reszt')} · **bizonytalan:** ${count('bizonytalan')} · **nincs válasz:** ${count('nincs')}`, '',
    '## Megjelenések összefoglalója (a Monitoring tárolt cikkeiből)', ...(after.length ? after.map(c => `- [${c.n}] ${c.title} (${c.medium}, ${c.hangnem})${c.url ? ` ${c.url}` : ''}`) : ['- (az esemény óta nem találtunk a témához kapcsolódó tárolt cikket)']), '',
    '## Sajtóanyag-tervezet', KIT('a sajtóanyag szövege; a munkatárs AI nélkül nem írja meg, és tényt nem talál ki'), `Alapadatok: ${ev.cim}, ${ev.idopont || KIT('időpont')}, ${ev.helyszin || KIT('helyszín')}.`, '',
    '## Tanulságok', KIT('mi működött, mi nem; a vezető tölti ki'), '', AI_NOTE];
  const anyagId = await anyagok.add({ ugynok: AGENT, tipus: 'esemeny_utomunka', cim: `Utómunka: ${ev.cim}`, szoveg: L.join('\n'), meta: { esemeny_id: id, cikkek: after.map(({ n, id: aid, title, url, medium, hangnem, indoklas }) => ({ n, id: aid, title, url, medium, hangnem, indoklas })), resztvevok: count('reszt_vesz') } });
  await esemeny.events.transition(id, ['lezajlott'], 'utomunka', { utomunka_anyag_id: anyagId });
  await log.append({ szereplo: by, tipus: 'csomag', hivatkozas: id, tartalom: { fajta: 'esemeny_utomunka', anyag_id: anyagId, resztvevok: count('reszt_vesz'), cikkek: after.length } });
  return { anyagId };
}

export const esemenyszervezoAgent = { id: AGENT, modes: ['igeny'], run: async () => ({ skipped: true }) };
