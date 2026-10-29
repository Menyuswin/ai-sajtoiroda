// Kérdés a feltöltött dokumentumokhoz, és kulcsszójavaslat belőlük. Minden állítás forrásjelöléssel ([D1 §2]) megy,
// a jelöléseket a program ellenőrzi: nem létező forrásra hivatkozó rész törlődik.
import { loadPrompt, extractJson } from '../core/llm.js';
import { norm } from '../core/text.js';

const REF = /\[D(\d+)\s*§(\d+)\]/g;

export async function answerFromDocs({ question, docs, profile, llm, prompts, agent = null }) {
  const forAI = llm.mode !== 'mock'; // AI nélkül a tartalom nem hagyja el a rendszert, így a tiltott dokumentum is használható
  const { talalatok, kizart_ai } = await docs.search(question, { agent, forAI, limit: 6 });
  const note = kizart_ai ? ` (${kizart_ai} találat „nem küldhető AI-nak” jelölésű dokumentumban van; ezeket nem használtam.)` : '';
  if (!talalatok.length) return { valasz: `A feltöltött dokumentumokban nem találtam erre vonatkozó információt.${note}`, forrasok: [] };

  const labels = new Map();
  for (const t of talalatok) if (!labels.has(t.dokumentum_id)) labels.set(t.dokumentum_id, labels.size + 1);
  const forrasok = talalatok.map(t => ({ ref: `D${labels.get(t.dokumentum_id)} §${t.sorszam}`, dokumentum_id: t.dokumentum_id, dokumentum_cim: t.dokumentum_cim, szakasz_cim: t.szakasz_cim, sorszam: t.sorszam, szoveg: t.szoveg }));

  if (llm.mode === 'mock') {
    const lines = forrasok.map(f => `[${f.ref}] ${f.dokumentum_cim}${f.szakasz_cim ? ` – ${f.szakasz_cim}` : ''}: ${f.szoveg.replace(/\s+/g, ' ').slice(0, 280)}${f.szoveg.length > 280 ? '…' : ''}`);
    return { valasz: `Ezeket a részleteket találtam a dokumentumokban (szabályalapú keresés, nem AI):\n${lines.join('\n')}`, forrasok: forrasok.map(({ szoveg, ...f }) => f) };
  }

  const { system, user } = loadPrompt(prompts.docqa, { megnevezes: profile.megnevezes, kerdes: question });
  const data = forrasok.map(f => ({ jelolés: `[${f.ref}]`, dokumentum: f.dokumentum_cim, szakasz: f.szakasz_cim, szöveg: f.szoveg }));
  let answer = (await llm.complete({ task: 'classify', system, user: `${user}\n\n## Adatok\n${JSON.stringify(data, null, 1)}`, maxTokens: 700 })).trim();
  const valid = new Set(forrasok.map(f => f.ref.replace(/\s+/g, ' ')));
  let invalid = 0;
  answer = answer.replace(REF, (m, d, s) => { if (valid.has(`D${d} §${s}`)) return m; invalid++; return ''; });
  if (invalid) answer += '\n(Figyelem: a válasz nem létező forrásra is hivatkozott, ezeket a jelöléseket töröltem; ellenőrizze az állításokat a dokumentumokban.)';
  return { valasz: answer + note, forrasok: forrasok.map(({ szoveg, ...f }) => f) };
}

// ---- kulcsszójavaslat
const STOP = new Set(['minden', 'azonban', 'valamint', 'szerint', 'mindig', 'amely', 'amelyek', 'között', 'mellett', 'alapelv', 'alapelvek', 'ugyanaz', 'ezeket', 'tehát', 'vagyis', 'illetve', 'hiszen', 'mivel', 'ezért', 'soha', 'olyan', 'minden', 'bármely', 'másik', 'tavalyi', 'következő', 'közlésben', 'között', 'többek', 'egyéb', 'gyakori', 'kérdések', 'átlagos', 'tavalyi', 'időpontja', 'jegyzet', 'dokumentum', 'szervezet', 'szükséges']);
const ORG = /\b([A-ZÁÉÍÓÖŐÚÜŰ][\p{L}-]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][\p{L}-]+){0,4}\s+(?:Zrt\.|Kft\.|Nyrt\.|Bt\.|Egyesület|Alapítvány|Intézet|Kórházak|Kórház|Főigazgatóság|Minisztérium|Hivatal))/gu;
// A két szó közt csak szóköz lehet (sortörés vagy táblázatcella-határ nem): különben szomszédos cellákat is névnek vennénk.
const PERSON = /(?<![\p{L}.])([A-ZÁÉÍÓÖŐÚÜŰ][\p{Ll}]{2,})[ \u00a0]+([A-ZÁÉÍÓÖŐÚÜŰ][\p{Ll}]{2,})(?![\p{L}])/gu;

export function mockSuggest(szakaszok, profile) {
  const text = szakaszok.map(s => `${s.szakasz_cim || ''}\n${s.szoveg}`).join('\n\n'); // a címsorok is: ott áll gyakran a szervezet neve
  const have = new Set([...profile.kulcsszavak.szervezet, ...profile.kulcsszavak.szemelyek, ...profile.kulcsszavak.temak].map(norm));
  const out = [], seen = new Set();
  const add = (csoport, ertek, forras) => { const k = norm(ertek); if (!k || have.has(k) || seen.has(k)) return; seen.add(k); out.push({ csoport, ertek, forras }); };
  const where = (needle) => { const s = szakaszok.find(x => x.szoveg.includes(needle) || (x.szakasz_cim || '').includes(needle)); return s ? `${s.dokumentum_cim}, ${s.sorszam}. szakasz` : ''; };
  const orgWords = new Set();
  for (const m of text.matchAll(ORG)) { add('szervezet', m[1], where(m[1])); m[1].split(/\s+/).forEach(w => orgWords.add(w)); }
  const people = new Map();
  for (const m of text.matchAll(PERSON)) { if (orgWords.has(m[1]) || orgWords.has(m[2])) continue; const n = `${m[1]} ${m[2]}`; people.set(n, (people.get(n) || 0) + 1); }
  for (const [n] of [...people.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) add('szemelyek', n, where(n));
  const freq = new Map();
  for (const w of norm(text).match(/[a-z]{7,}/g) || []) freq.set(w, (freq.get(w) || 0) + 1);
  const original = new Map();
  for (const w of text.toLowerCase().match(/[\p{Ll}]{7,}/gu) || []) original.set(norm(w), w);
  for (const [w, n] of [...freq.entries()].sort((a, b) => b[1] - a[1])) {
    if (n < 2 || out.filter(t => t.csoport === 'temak').length >= 8) continue;
    const o = original.get(w); if (o && !STOP.has(o)) add('temak', o, where(o));
  }
  return out;
}

const GROUPS = new Set(['szervezet', 'szemelyek', 'temak']);
export function validateSuggestions(obj, profile) {
  const have = new Set([...profile.kulcsszavak.szervezet, ...profile.kulcsszavak.szemelyek, ...profile.kulcsszavak.temak, ...profile.kulcsszavak.kizaro].map(norm));
  const seen = new Set(), out = [], per = {};
  for (const t of Array.isArray(obj?.tetelek) ? obj.tetelek : []) {
    const ertek = String(t?.ertek ?? '').trim().slice(0, 120), k = norm(ertek);
    if (!GROUPS.has(t?.csoport) || !ertek || have.has(k) || seen.has(k)) continue;
    per[t.csoport] = (per[t.csoport] || 0) + 1;
    if (per[t.csoport] > 10) continue;
    seen.add(k); out.push({ csoport: t.csoport, ertek, forras: String(t.forras ?? '').slice(0, 200) });
  }
  return out;
}

export async function suggestKeywords({ docs, profile, llm, prompts, agent = 'monitoring' }) {
  const forAI = llm.mode !== 'mock';
  const { szakaszok, kizart_ai } = await docs.sectionsFor({ agent, forAI, limit: 40 });
  if (!szakaszok.length) return { tetelek: [], kizart_ai, uresTar: true };
  if (llm.mode === 'mock') return { tetelek: mockSuggest(szakaszok, profile), kizart_ai };
  const { system, user } = loadPrompt(prompts.keywords, { megnevezes: profile.megnevezes, szervezet: profile.kulcsszavak.szervezet, szemelyek: profile.kulcsszavak.szemelyek, temak: profile.kulcsszavak.temak });
  const data = szakaszok.map(s => ({ dokumentum: s.dokumentum_cim, szakasz: `${s.sorszam}. szakasz${s.szakasz_cim ? ` (${s.szakasz_cim})` : ''}`, szöveg: s.szoveg.slice(0, 2500) }));
  const raw = await llm.complete({ task: 'classify', system, user: `${user}\n\n## Adatok\n${JSON.stringify(data, null, 1)}`, maxTokens: 1200 });
  return { tetelek: validateSuggestions(extractJson(raw), profile), kizart_ai };
}
