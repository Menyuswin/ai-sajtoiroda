// Trendjelzés: a figyelt kifejezések mai említésszámát a megelőző napok átlagához és szórásához mérjük.
// Jelzés: mai szám >= minimum_emlites ÉS mai szám > átlag + szorzó * max(szórás, 1).
// Ha még nincs legalább 3 nap előzmény a tárban, nem jelzünk (különben minden „új” lenne).
import { dayKey } from '../../core/text.js';

const MIN_HISTORY_DAYS = 3;

export function computeTrends({ articles, profile, now }) {
  const tz = profile.utemezes.idozona;
  const today = dayKey(now, tz);
  const { alapido_nap: window, szoras_szorzo: k, minimum_emlites: min } = profile.trend;
  const dayOf = (a) => dayKey(a.published || a.fetchedAt, tz);

  const firstDay = articles.reduce((m, a) => { const d = dayKey(a.fetchedAt, tz); return !m || d < m ? d : m; }, null);
  const history = firstDay ? Math.round((Date.parse(today) - Date.parse(firstDay)) / 86400000) : 0;

  const terms = new Set();
  for (const a of articles) for (const m of a.matches || []) terms.add(m.term);

  const dayMs = 86400000;
  const baselineDays = [];
  for (let i = 1; i <= Math.min(window, history); i++) baselineDays.push(dayKey(Date.parse(today) - i * dayMs, tz));

  const out = [];
  for (const term of terms) {
    const perDay = new Map();
    for (const a of articles) {
      if (!(a.matches || []).some(m => m.term === term)) continue;
      const d = dayOf(a);
      perDay.set(d, (perDay.get(d) || 0) + 1);
    }
    const todayCount = perDay.get(today) || 0;
    if (!todayCount) continue;
    const xs = baselineDays.map(d => perDay.get(d) || 0);
    const mean = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
    const std = xs.length ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length) : 0;
    const enough = history >= MIN_HISTORY_DAYS;
    const signal = enough && todayCount >= min && todayCount > mean + k * Math.max(std, 1);
    out.push({ term, today: todayCount, mean: +mean.toFixed(2), std: +std.toFixed(2), signal, day: today, enough_history: enough });
  }
  return out.sort((a, b) => b.today - a.today);
}
