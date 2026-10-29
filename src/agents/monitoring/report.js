// Igény szerinti jelentés a már tárolt cikkekből (olvasó művelet: nem módosít, nem küld ki semmit).
import { buildStats, orderItems, synthesize, renderDigest } from './digest.js';
import { norm, dayKey } from '../../core/text.js';

export async function buildReport({ tema, napok, articles, profile, llm, prompts, now }) {
  const since = now.getTime() - napok * 86400000;
  const wanted = tema ? norm(tema) : null;
  const pool = articles.filter(a => {
    const t = Date.parse(a.published || a.fetchedAt);
    if (!(t >= since)) return false;
    if (!wanted) return true;
    return (a.matches || []).some(m => norm(m.term).includes(wanted) || wanted.includes(norm(m.term))) || norm(`${a.title} ${a.summary}`).includes(wanted);
  });
  const items = orderItems(pool);
  const stats = buildStats(items);
  let synth;
  try { synth = await synthesize({ items, stats, trends: [], profile, llm, prompts }); }
  catch { synth = await synthesize({ items, stats, trends: [], profile, llm: { mode: 'mock' }, prompts }); }
  const label = `${tema ? `„${tema}”, ` : ''}elmúlt ${napok} nap`;
  const rendered = renderDigest({ profile, dateLabel: `${label} (${dayKey(now, profile.utemezes.idozona)})`, items, stats, trends: [], synthesis: synth.synthesis, errors: [] });
  return {
    cim: `Jelentés – ${label}`,
    text: rendered.text,
    html: rendered.html,
    meta: { cikkek: items.map(a => ({ n: a.n, id: a.id, title: a.title, url: a.url, medium: a.medium, hangnem: a.cls.hangnem, indoklas: a.cls.indoklas })) },
    darab: items.length,
  };
}
