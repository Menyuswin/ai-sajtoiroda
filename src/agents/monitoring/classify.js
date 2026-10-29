// Cikkenkénti besorolás: téma, hangnem (a szervezet szemszögéből), fontosság, vörös vonal.
// 'anthropic' módban a monitoring/prompts/cikk-besorolas.md utasítása fut; 'mock' módban egy egyszerű,
// szabályalapú tartalék (CSAK a folyamat kipróbálására – a minősége messze elmarad az AI-étól).
import { loadPrompt, extractJson } from '../../core/llm.js';
import { norm } from '../../core/text.js';

const NEG = ['botrany', 'vizsgalat', 'lemond', 'hiany', 'valsag', 'tiltakoz', 'sztrajk', 'birsag', 'halal', 'baleset', 'kritika', 'visszaeles', 'csalas', 'leepit', 'felfuggeszt', 'panasz', 'hatosagi', 'per '];
const POS = ['dij', 'siker', 'nyert', 'fejlesztes', 'bovit', 'elismeres', 'megujul', 'tamogatas', 'beruhazas', 'uj '];
const RED_STEMS = ['hatosagi', 'nyomozas', 'perel', 'halal', 'baleset', 'feljelent'];

const TONES = new Set(['pozitiv', 'negativ', 'semleges']);

export function mockClassify(article, profile) {
  const text = ` ${norm(`${article.title} ${article.summary}`)} `;
  const neg = NEG.filter(w => text.includes(w)).length;
  const pos = POS.filter(w => text.includes(w)).length;
  const types = new Set(article.matches.map(m => m.type));
  const inTitle = article.matches.some(m => norm(article.title).includes(norm(m.term)));
  const topic = (article.matches.find(m => m.type === 'tema') || article.matches[0]).term;
  return {
    relevans: true,
    fontossag: Math.min(5, 2 + (types.has('szervezet') ? 1 : 0) + (types.has('szemely') ? 1 : 0) + (inTitle ? 1 : 0)),
    tema: topic,
    hangnem: neg > pos ? 'negativ' : pos > neg ? 'pozitiv' : 'semleges',
    erintett_szereplok: article.matches.filter(m => m.type !== 'tema').map(m => m.term),
    voros_vonal: profile.vorosvonalak.length > 0 && RED_STEMS.some(w => text.includes(w)),
    indoklas: 'Szabályalapú előbesorolás (nem AI): kulcsszó-egyezés és hangulatszó-számlálás alapján.',
    bizonytalan: neg === pos,
    modell: 'mock',
  };
}

export function normalizeClassification(obj, model) {
  const f = Math.round(Number(obj.fontossag));
  return {
    relevans: obj.relevans !== false,
    fontossag: Number.isFinite(f) ? Math.min(5, Math.max(1, f)) : 3,
    tema: String(obj.tema || '').slice(0, 80) || 'egyéb',
    hangnem: TONES.has(obj.hangnem) ? obj.hangnem : 'semleges',
    erintett_szereplok: Array.isArray(obj.erintett_szereplok) ? obj.erintett_szereplok.map(String).slice(0, 10) : [],
    voros_vonal: obj.voros_vonal === true,
    indoklas: String(obj.indoklas || '').slice(0, 300),
    bizonytalan: obj.bizonytalan === true || !TONES.has(obj.hangnem),
    modell: model,
  };
}

export async function classifyArticle(article, { profile, llm, prompts, models }) {
  if (llm.mode === 'mock') return mockClassify(article, profile);
  const { system, user } = loadPrompt(prompts.classify, {
    megnevezes: profile.megnevezes,
    szemelyek: profile.kulcsszavak.szemelyek,
    temak: profile.kulcsszavak.temak,
    vorosvonalak: profile.vorosvonalak.map(v => `„${v}”`),
    cim: article.title,
    medium: article.medium,
    ido: article.published || 'ismeretlen',
    reszlet: article.summary || '(nincs)',
  });
  const raw = await llm.complete({ task: 'classify', system, user, maxTokens: 500 });
  return normalizeClassification(extractJson(raw), models.classify);
}
