// Igény szerinti jelentés a már tárolt cikkekből (olvasó művelet: nem módosít, nem küld ki semmit).
import { buildStats, orderItems, synthesize, renderDigest } from './digest.js';
import { norm, dayKey } from '../../core/text.js';
import { platformLine } from './social.js';

// `csatorna`: 'sajto' (alapértelmezett, a közösségi bejegyzések nélkül) vagy 'kozossegi' (csak a közösségi csatornák bejegyzései).
export async function buildReport({ tema, napok, articles, profile, llm, prompts, now, csatorna = 'sajto' }) {
  const since = now.getTime() - napok * 86400000;
  const wanted = tema ? norm(tema) : null;
  const pool = articles.filter(a => {
    const t = Date.parse(a.published || a.fetchedAt);
    if (!(t >= since)) return false;
    if ((a.csatorna === 'kozossegi') !== (csatorna === 'kozossegi')) return false;
    if (!wanted) return true;
    return (a.matches || []).some(m => norm(m.term).includes(wanted) || wanted.includes(norm(m.term))) || norm(`${a.title} ${a.summary}`).includes(wanted);
  });
  const items = orderItems(pool);
  const stats = buildStats(items);
  let synth;
  try { synth = await synthesize({ items, stats, trends: [], profile, llm, prompts }); }
  catch { synth = await synthesize({ items, stats, trends: [], profile, llm: { mode: 'mock' }, prompts }); }
  const label = `${tema ? `„${tema}”, ` : ''}elmúlt ${napok} nap`;
  const social = csatorna === 'kozossegi';
  const rendered = renderDigest({ profile, dateLabel: `${label} (${dayKey(now, profile.utemezes.idozona)})`, items, stats, trends: [], synthesis: synth.synthesis, errors: [], cim: social ? 'Közösségi jelentés' : 'Sajtószemle', extra: social ? platformLine(items) : null });
  return {
    cim: `${social ? 'Közösségi jelentés' : 'Jelentés'} – ${label}`,
    text: rendered.text,
    html: rendered.html,
    meta: { cikkek: items.map(a => ({ n: a.n, id: a.id, title: a.title, url: a.url, medium: a.medium, platform: a.platform || undefined, hangnem: a.cls.hangnem, indoklas: a.cls.indoklas })) },
    darab: items.length,
  };
}
