// Duplikátumok kiszűrése: azonos URL, azonos (normalizált) cím, vagy nagyon hasonló cím.
import { norm } from '../../core/text.js';

const tokens = (s) => new Set(norm(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2));
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function dedupe(incoming, known = [], threshold = 0.85) {
  const seenIds = new Set(known.map(a => a.id));
  const seenTitles = new Set(known.map(a => norm(a.title)));
  const kept = [];
  const keptTokens = [];
  for (const a of incoming) {
    if (seenIds.has(a.id)) continue;
    const t = norm(a.title);
    if (seenTitles.has(t)) continue;
    const tk = tokens(a.title);
    if (keptTokens.some(k => jaccard(k, tk) >= threshold)) continue;
    seenIds.add(a.id); seenTitles.add(t);
    kept.push(a); keptTokens.push(tk);
  }
  return kept;
}
