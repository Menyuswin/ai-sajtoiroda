// A napi szemle összeállítása. Szétválasztás:
//  - a PROGRAM írja: számok, figyelmeztetések, cikklista (hivatkozásokkal), zárósor;
//  - az AI (vagy mock) CSAK az értelmező részt: összkép, narratívák, mire figyeljünk.
// Így nem kerülhet a levélbe kitalált cikk vagy hivatkozás, és minden narratíva cikkszámmal ellenőrizhető.
import { loadPrompt, extractJson } from '../../core/llm.js';
import { escapeHtml } from '../../core/text.js';

const TONE_HU = { pozitiv: 'pozitív', negativ: 'negatív', semleges: 'semleges' };

export function buildStats(items) {
  const tones = { pozitiv: 0, negativ: 0, semleges: 0 };
  const topics = new Map();
  for (const a of items) {
    tones[a.cls.hangnem]++;
    topics.set(a.cls.tema, (topics.get(a.cls.tema) || 0) + 1);
  }
  return { darab: items.length, hangnem: tones, temak: [...topics.entries()].sort((a, b) => b[1] - a[1]).map(([tema, db]) => ({ tema, db })) };
}

export function orderItems(items) {
  return [...items]
    .sort((a, b) => b.cls.fontossag - a.cls.fontossag || String(b.published).localeCompare(String(a.published)))
    .map((a, i) => ({ ...a, n: i + 1 }));
}

function mockSynthesis(items, stats) {
  if (!items.length) return { osszkep: 'Az utolsó szemle óta nem jelent meg releváns cikk.', narrativak: [], figyelni: null };
  const top = stats.temak.slice(0, 3);
  const narrativak = top.map(t => ({
    szoveg: `„${t.tema}” témában ${t.db} cikk jelent meg.`,
    cikkek: items.filter(a => a.cls.tema === t.tema).map(a => a.n).slice(0, 5),
  }));
  const dom = stats.hangnem.negativ > stats.hangnem.pozitiv ? 'inkább kedvezőtlen' : stats.hangnem.pozitiv > stats.hangnem.negativ ? 'inkább kedvező' : 'kiegyenlített';
  return {
    osszkep: `A megjelenések hangneme ${dom}; a leggyakoribb téma: „${top[0].tema}”. (Szabályalapú összefoglaló, nem AI – a minősége korlátozott.)`,
    narrativak,
    figyelni: null,
  };
}

// Az AI-válasz ellenőrzése: csak létező cikkszámra lehet hivatkozni.
export function validateSynthesis(obj, validNumbers) {
  const dropped = [];
  const narrativak = (Array.isArray(obj.narrativak) ? obj.narrativak : []).map(n => {
    const cikkek = (Array.isArray(n.cikkek) ? n.cikkek : []).map(Number).filter(x => validNumbers.has(x));
    return { szoveg: String(n.szoveg || '').trim(), cikkek };
  }).filter(n => {
    const ok = n.szoveg && n.cikkek.length;
    if (!ok) dropped.push(n.szoveg);
    return ok;
  }).slice(0, 4);
  return {
    synthesis: {
      osszkep: String(obj.osszkep || '').trim(),
      narrativak,
      figyelni: obj.figyelni ? String(obj.figyelni).trim() : null,
    },
    dropped,
  };
}

export async function synthesize({ items, stats, trends, profile, llm, promptDir }) {
  if (llm.mode === 'mock' || !items.length) return { synthesis: mockSynthesis(items, stats), dropped: [] };
  const { system, user } = await loadPrompt(`${promptDir}/napi-szemle.md`, {
    megnevezes: profile.megnevezes, vezeto_nev: profile.vezeto.nev || 'a vezető', alapido_nap: profile.trend.alapido_nap,
  });
  const data = {
    statisztika: stats,
    trendek: trends.map(t => ({ kifejezes: t.term, ma: t.today, atlag: t.mean, szoras: t.std, jelzes: t.signal })),
    cikkek: items.map(a => ({ szam: a.n, cim: a.title, medium: a.medium, hangnem: a.cls.hangnem, fontossag: a.cls.fontossag, tema: a.cls.tema, indoklas: a.cls.indoklas })),
  };
  const raw = await llm.complete({ task: 'synthesize', system, user: `${user}\n\n## Adatok\n${JSON.stringify(data, null, 1)}`, maxTokens: 1500 });
  return validateSynthesis(extractJson(raw), new Set(items.map(a => a.n)));
}

export function renderDigest({ profile, dateLabel, items, stats, trends, synthesis, errors }) {
  const signals = trends.filter(t => t.signal);
  const red = items.filter(a => a.cls.voros_vonal);
  const uncertain = items.filter(a => a.cls.bizonytalan).length;
  const t = stats.hangnem;
  const numbers = `${stats.darab} cikk: ${t.negativ} negatív, ${t.semleges} semleges, ${t.pozitiv} pozitív${uncertain ? ` (${uncertain} besorolás bizonytalan)` : ''}.`;

  const md = [];
  md.push(`# Sajtószemle – ${profile.megnevezes} – ${dateLabel}`, '');
  md.push(`**${numbers}**`, '');
  if (signals.length || red.length) {
    md.push('## Figyelem');
    for (const s of signals) md.push(`- „${s.term}”: ma ${s.today} említés, az előző napok átlaga ${s.mean} (szórás ${s.std}).`);
    for (const a of red) md.push(`- Vörös vonalba eső jelzés a(z) ${a.n}. cikknél.`);
    md.push('');
  }
  if (synthesis.osszkep) md.push('## Összkép', synthesis.osszkep, '');
  if (synthesis.narrativak.length) {
    md.push('## Narratívák');
    for (const n of synthesis.narrativak) md.push(`- ${n.szoveg} (${n.cikkek.map(x => `${x}.`).join(', ')})`);
    md.push('');
  }
  if (synthesis.figyelni) md.push('## Mire érdemes figyelni', synthesis.figyelni, '');
  if (items.length) {
    md.push('## Cikkek');
    for (const a of items) {
      md.push(`${a.n}. **${a.title}** – ${a.medium} – ${TONE_HU[a.cls.hangnem]}, fontosság ${a.cls.fontossag}/5${a.cls.bizonytalan ? ', bizonytalan' : ''}`);
      md.push(`   ${a.cls.indoklas}`);
      md.push(`   ${a.url}`);
    }
    md.push('');
  }
  if (errors.length) md.push(`*Nem elérhető forrás: ${errors.map(e => e.forras).join(', ')}*`, '');
  md.push(`*${profile.ai_jelzes}*`);
  const text = md.join('\n');

  const h = [];
  h.push(`<h2>Sajtószemle – ${escapeHtml(profile.megnevezes)} – ${escapeHtml(dateLabel)}</h2>`, `<p><strong>${escapeHtml(numbers)}</strong></p>`);
  if (signals.length || red.length) {
    h.push('<h3>Figyelem</h3><ul>');
    for (const s of signals) h.push(`<li>„${escapeHtml(s.term)}”: ma ${s.today} említés, az előző napok átlaga ${s.mean} (szórás ${s.std}).</li>`);
    for (const a of red) h.push(`<li>Vörös vonalba eső jelzés a(z) ${a.n}. cikknél.</li>`);
    h.push('</ul>');
  }
  if (synthesis.osszkep) h.push(`<h3>Összkép</h3><p>${escapeHtml(synthesis.osszkep)}</p>`);
  if (synthesis.narrativak.length) {
    h.push('<h3>Narratívák</h3><ul>');
    for (const n of synthesis.narrativak) h.push(`<li>${escapeHtml(n.szoveg)} (${n.cikkek.map(x => `${x}.`).join(', ')})</li>`);
    h.push('</ul>');
  }
  if (synthesis.figyelni) h.push(`<h3>Mire érdemes figyelni</h3><p>${escapeHtml(synthesis.figyelni)}</p>`);
  if (items.length) {
    h.push('<h3>Cikkek</h3><ol>');
    for (const a of items) {
      const safe = /^https?:\/\//.test(a.url) ? a.url : '#';
      h.push(`<li value="${a.n}"><strong>${escapeHtml(a.title)}</strong> – ${escapeHtml(a.medium)} – ${TONE_HU[a.cls.hangnem]}, fontosság ${a.cls.fontossag}/5${a.cls.bizonytalan ? ', bizonytalan' : ''}<br>${escapeHtml(a.cls.indoklas)}<br><a href="${escapeHtml(safe)}">${escapeHtml(a.url)}</a></li>`);
    }
    h.push('</ol>');
  }
  if (errors.length) h.push(`<p><em>Nem elérhető forrás: ${escapeHtml(errors.map(e => e.forras).join(', '))}</em></p>`);
  h.push(`<p><em>${escapeHtml(profile.ai_jelzes)}</em></p>`);
  return { text, html: `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;max-width:680px">${h.join('\n')}</body>` };
}
