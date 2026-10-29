// Rákérdezés egy elkészült anyagra. Csak az anyagból és a hozzá tartozó cikkekből válaszol.
import { loadPrompt } from '../../core/llm.js';
import { norm } from '../../core/text.js';

const words = (s) => norm(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);

export function mockAnswer(question, anyag) {
  const q = new Set(words(question));
  const hits = (anyag.meta?.cikkek || []).filter(c => words(`${c.title} ${c.indoklas || ''}`).some(w => [...q].some(x => w.startsWith(x.slice(0, 5)) || x.startsWith(w.slice(0, 5)))));
  if (!hits.length) return 'Ebben az anyagban nem találtam erre vonatkozó információt. (Szabályalapú keresés, nem AI.)';
  return `Ezek a cikkek kapcsolódnak a kérdéshez:\n${hits.slice(0, 5).map(c => `[${c.n}] ${c.title} – ${c.medium}, ${c.hangnem}\n    ${c.url}`).join('\n')}\n(Szabályalapú keresés, nem AI.)`;
}

export async function answerQuestion({ question, anyag, profile, llm, prompts }) {
  if (llm.mode === 'mock') return mockAnswer(question, anyag);
  const { system, user } = loadPrompt(prompts.qa, { megnevezes: profile.megnevezes, kerdes: question });
  const data = { anyag: { cim: anyag.cim, szoveg: anyag.szoveg }, cikkek: anyag.meta?.cikkek || [] };
  const valid = new Set((anyag.meta?.cikkek || []).map(c => c.n));
  const answer = (await llm.complete({ task: 'classify', system, user: `${user}\n\n## Adatok\n${JSON.stringify(data, null, 1)}`, maxTokens: 600 })).trim();
  // Nem létező cikkszámra hivatkozó válasz nem mehet át ellenőrzés nélkül.
  const bad = [...answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1])).filter(n => !valid.has(n));
  return bad.length ? `${answer.replace(/\[(\d+)\]/g, (m, n) => (valid.has(Number(n)) ? m : ''))}\n(Figyelem: a válasz nem létező cikkszámra hivatkozott, ezeket töröltem; ellenőrizd a forrásokat.)` : answer;
}
