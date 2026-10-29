// Forrásgyűjtés a Felkészítő és a Proaktív ügynöknek: a Monitoring tárolt cikkei és a Dokumentumtár részletei egy témához.
// Minden forrás sorszámot kap ([1], [D1 §2]); az ügynök csak ezekre hivatkozhat, a program ellenőrzi.
import { norm } from '../../core/text.js';

// A rendszer saját címkéi (pl. „Felerősödő téma: …”) nem keresőszavak.
const STOP = new Set(['tema', 'felerosodo', 'voros', 'vonalba', 'eso', 'cikk', 'jelzes', 'kerelem', 'felkeszito', 'csomag', 'kerese', 'tovabbitott', 'level']);
const words = (s) => [...new Set(norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)))];

export async function gatherSources({ articles, docs, topic, agent, forAI, now, days = 30, maxArticles = 8, maxDocs = 5 }) {
  const ws = words(topic);
  const since = now.getTime() - days * 86400000;
  const score = (a) => {
    const text = norm(`${a.title} ${a.summary || ''} ${(a.matches || []).map(m => m.term).join(' ')}`);
    return ws.filter(w => text.includes(w.slice(0, Math.max(4, w.length - 2)))).length;
  };
  const cikkek = articles.filter(a => Date.parse(a.published || a.fetchedAt) >= since).map(a => ({ a, s: score(a) })).filter(x => x.s > 0)
    .sort((x, y) => y.s - x.s || String(y.a.published || y.a.fetchedAt).localeCompare(String(x.a.published || x.a.fetchedAt))).slice(0, maxArticles)
    .map(({ a }, i) => ({ n: i + 1, id: a.id, title: a.title, url: a.url, medium: a.medium, hangnem: a.cls?.hangnem || 'semleges', indoklas: a.cls?.indoklas || '', voros_vonal: !!a.cls?.voros_vonal, published: a.published || null }));
  let reszletek = [], kizart_ai = 0;
  if (docs) {
    const found = await docs.search(topic, { agent, forAI, limit: maxDocs });
    kizart_ai = found.kizart_ai;
    const labels = new Map();
    for (const t of found.talalatok) if (!labels.has(t.dokumentum_id)) labels.set(t.dokumentum_id, labels.size + 1);
    reszletek = found.talalatok.map(t => ({ ref: `D${labels.get(t.dokumentum_id)} §${t.sorszam}`, dokumentum_id: t.dokumentum_id, dokumentum_cim: t.dokumentum_cim, kategoria: t.kategoria, szakasz_cim: t.szakasz_cim, sorszam: t.sorszam, szoveg: t.szoveg }));
  }
  return { cikkek, reszletek, kizart_ai };
}

// A szövegből törli a nem létező forrásokra hivatkozó jelöléseket. A `[KITÖLTENDŐ: …]` és más szöveg érintetlen.
export function stripInvalidRefs(text, sources) {
  const validN = new Set(sources.cikkek.map(c => c.n));
  const validD = new Set(sources.reszletek.map(r => r.ref));
  let removed = 0;
  const out = String(text ?? '')
    .replace(/\[(\d{1,3})\]/g, (m, n) => (validN.has(Number(n)) ? m : (removed++, '')))
    .replace(/\[(D\d+)\s*§(\d+)\]/g, (m, d, s) => (validD.has(`${d} §${s}`) ? m : (removed++, '')))
    .replace(/[ \t]{2,}/g, ' ').trim();
  return { text: out, removed };
}

export const startOfDayIso = (now) => `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
export const AI_NOTE = 'Ezt az anyagot mesterséges intelligencia készítette elő; belső használatra szól, külső felhasználás előtt a vezető átnézi, és a hivatkozott források ellenőrzése is az ő feladata.';
