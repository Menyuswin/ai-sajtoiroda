// A Monitoring közösségi csatornái: a profilban megadott nyilvános hírcsatornák (YouTube, Reddit, Mastodon, Bluesky stb.).
// FONTOS KORLÁT: az ügynök nem olvassa közvetlenül az X-et, a Facebookot, az Instagramot vagy a TikTokot (ezekhez fizetős API kell);
// csak azt látja, amit nyilvános RSS/Atom csatorna (vagy ilyet előállító szolgáltatás) közöl. A többit a vezető kézi digitális jelzéssel vihet fel.
// A közösségi szemle a Közösségi média ügynök asztalára kerül (nem megy külön levélben), és ugyanazt a program-írta szerkezetet használja, mint a sajtószemle.
import { buildStats, orderItems, synthesize, renderDigest } from './digest.js';
import { SOURCE_PLATFORMS } from '../../core/profile.js';

export const isSocial = (a) => a?.csatorna === 'kozossegi';
const AGENT = 'monitoring';
const WHO = `ugynok:${AGENT}`;

export function platformLine(items) {
  const by = new Map();
  for (const a of items) by.set(a.platform || 'egyeb', (by.get(a.platform || 'egyeb') || 0) + 1);
  return by.size ? `Csatornánként: ${[...by.entries()].sort((x, y) => y[1] - x[1]).map(([p, n]) => `${SOURCE_PLATFORMS[p] || p} ${n}`).join(', ')}.` : null;
}

// A közösségi szemle előállítása és az asztalra tétele. Üres, ha nincs közösségi forrás beállítva vagy nincs új bejegyzés.
export async function buildSocialDigest({ ctx, socialAll, socialTrends, dateLabel, errors }) {
  const { profile, llm, prompts, log } = ctx;
  if (!(profile.forrasok.kozossegi || []).length) return null;
  const items = orderItems(socialAll.filter(a => !a.reportedAt));
  if (!items.length) return null;
  const stats = buildStats(items);
  let synth;
  try { synth = await synthesize({ items, stats, trends: socialTrends, profile, llm, prompts }); }
  catch (e) {
    await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: `közösségi összefoglaló sikertelen: ${e.message}` } });
    synth = await synthesize({ items, stats, trends: socialTrends, profile, llm: { mode: 'mock' }, prompts });
  }
  const socialErrors = (errors || []).filter(e => (profile.forrasok.kozossegi || []).some(s => (s.nev || s.url) === e.forras));
  const rendered = renderDigest({ profile, dateLabel, items, stats, trends: socialTrends, synthesis: synth.synthesis, errors: socialErrors, cim: 'Közösségi szemle', extra: platformLine(items) });
  const cim = `Közösségi szemle – ${profile.megnevezes} – ${dateLabel}`;
  const id = await ctx.anyagok?.add({ ugynok: 'kozossegi', tipus: 'kozossegi_szemle', cim, szoveg: rendered.text, html: rendered.html, meta: { forras: AGENT, cikkek: items.map(a => ({ n: a.n, id: a.id, title: a.title, url: a.url, medium: a.medium, platform: a.platform || 'egyeb', hangnem: a.cls.hangnem, indoklas: a.cls.indoklas })) } });
  await log.append({ szereplo: WHO, tipus: 'szemle_elkuldve', hivatkozas: `kozossegi:${id}`, tartalom: { csatorna: 'kozossegi', bejegyzesek: items.length, trendjelzesek: socialTrends.filter(t => t.signal).length } });
  return { darab: items.length, id };
}
