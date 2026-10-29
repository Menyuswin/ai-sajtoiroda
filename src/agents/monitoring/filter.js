// Kulcsszavas szűrés. Ékezet- és kisbetű-független, és a ragozott alakokat is megfogja
// (az „ápolóhiány” az „ápolóhiányról”-t is), mert részszó-egyezést néz.
import { norm } from '../../core/text.js';

export function termList(profile) {
  const k = profile.kulcsszavak;
  return [
    ...k.szervezet.map(t => ({ type: 'szervezet', term: t })),
    ...k.szemelyek.map(t => ({ type: 'szemely', term: t })),
    ...k.temak.map(t => ({ type: 'tema', term: t })),
  ];
}

// Visszaad: { match: [...] } vagy null, ha nem releváns / kizárt.
export function matchArticle(article, profile) {
  const text = norm(`${article.title} ${article.summary}`);
  if (profile.kulcsszavak.kizaro.some(x => text.includes(norm(x)))) return null;
  const matches = termList(profile).filter(({ term }) => text.includes(norm(term)));
  return matches.length ? matches : null;
}

export function filterArticles(articles, profile) {
  const out = [];
  for (const a of articles) {
    const matches = matchArticle(a, profile);
    if (matches) out.push({ ...a, matches });
  }
  return out;
}
