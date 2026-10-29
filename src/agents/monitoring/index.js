// A Monitoring Ügynök folyamata.
//   mode 'digest': gyűjtés → szűrés → besorolás → trend → riasztás (ha van) → napi szemle a vezetőnek
//   mode 'check' : ugyanez, de CSAK riasztás (óránkénti ellenőrzéshez); szemle nem készül
// Az ügynök kifelé nem kommunikál: egyetlen kimenete a vezetőnek szóló belső jelentés / riasztás.
import { dedupe } from './dedupe.js';
import { filterArticles } from './filter.js';
import { classifyArticle } from './classify.js';
import { collectArticles } from './sources.js';
import { computeTrends } from './trend.js';
import { buildStats, orderItems, synthesize, renderDigest } from './digest.js';
import { agentActive } from '../../core/profile.js';
import { dayKey, escapeHtml } from '../../core/text.js';

const AGENT = 'monitoring';
const WHO = `ugynok:${AGENT}`;
const MAX_CLASSIFY_PER_RUN = 80; // költségkorlát futásonként

export async function run(ctx, { mode = 'digest' } = {}) {
  const { profile, log, store, outbox, llm, now, fetchText, prompts, models } = ctx;
  if (!agentActive(profile, AGENT)) {
    await log.append({ szereplo: 'rendszer', tipus: 'futas', tartalom: { mode, kimenet: 'kihagyva: az ügynök ki van kapcsolva' } });
    return { skipped: true };
  }

  // 1. gyűjtés, duplikátumok és nem releváns cikkek kiszűrése
  const { articles: fetched, errors } = await collectArticles(profile, { fetchText, now });
  for (const e of errors) await log.append({ szereplo: WHO, tipus: 'hiba', hivatkozas: e.forras, tartalom: { hiba: e.hiba } });
  const known = await store.load();
  const fresh = filterArticles(dedupe(fetched, known), profile);

  // 2. besorolás
  const todo = fresh.slice(0, MAX_CLASSIFY_PER_RUN);
  if (fresh.length > todo.length) {
    await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: `futásonkénti korlát: ${fresh.length - todo.length} cikk a következő futásra marad` } });
  }
  const classified = [];
  for (const a of todo) {
    let cls;
    try {
      cls = await classifyArticle(a, { profile, llm, prompts, models });
    } catch (e) {
      await log.append({ szereplo: WHO, tipus: 'hiba', hivatkozas: a.url, tartalom: { hiba: `besorolás sikertelen: ${e.message}` } });
      cls = { relevans: true, fontossag: 3, tema: a.matches[0].term, hangnem: 'semleges', erintett_szereplok: [], voros_vonal: false, indoklas: 'A besorolás nem sikerült; kézi ellenőrzés javasolt.', bizonytalan: true, modell: 'hiba' };
    }
    await log.append({ szereplo: WHO, tipus: 'cikk_besorolas', hivatkozas: a.url, tartalom: cls });
    classified.push({ ...a, cls, reportedAt: null });
  }
  const all = [...known, ...classified.filter(a => a.cls.relevans)];
  await store.save(all);

  // 3. trend és riasztások (azonos jelzés ugyanazon a napon csak egyszer megy ki)
  const trends = computeTrends({ articles: all, profile, now: now() });
  const sentAlerts = new Set((await log.query({ tipus: 'riasztas_elkuldve' })).map(e => e.hivatkozas));
  const alerts = [];
  for (const a of classified.filter(x => x.cls.voros_vonal)) {
    const key = `voros:${a.id}`;
    if (!sentAlerts.has(key)) alerts.push({ key, line: `Vörös vonalba eső cikk: ${a.title} (${a.medium}) – ${a.url}` });
  }
  for (const t of trends.filter(x => x.signal)) {
    const key = `trend:${t.term}:${t.day}`;
    if (!sentAlerts.has(key)) alerts.push({ key, line: `Hirtelen felerősödő téma: „${t.term}” – ma ${t.today} említés, az előző napok átlaga ${t.mean}.` });
  }
  if (alerts.length) {
    const subject = `Riasztás – ${profile.megnevezes}`;
    const note = 'Ezt a jelzést mesterséges intelligencia készítette elő; a hivatkozott cikk ellenőrzése a vezető feladata.';
    const text = `${alerts.map(a => `- ${a.line}`).join('\n')}\n\n${note}`;
    const html = `<body style="font-family:sans-serif"><h3>${escapeHtml(subject)}</h3><ul>${alerts.map(a => `<li>${escapeHtml(a.line)}</li>`).join('')}</ul><p><em>${escapeHtml(note)}</em></p></body>`;
    await outbox.send({ agent: AGENT, kind: 'riasztas', to: profile.vezeto.email, subject, text, html });
    for (const a of alerts) await log.append({ szereplo: WHO, tipus: 'riasztas_elkuldve', hivatkozas: a.key, tartalom: { sor: a.line } });
  }

  const result = { fetched: fetched.length, fresh: fresh.length, classified: classified.length, alerts: alerts.length, errors: errors.length, digest: false };
  if (mode !== 'digest') {
    await log.append({ szereplo: WHO, tipus: 'futas', tartalom: { mode, ...result } });
    return result;
  }

  // 4. napi szemle: minden eddig nem jelentett releváns cikk
  const unreported = all.filter(a => !a.reportedAt);
  const items = orderItems(unreported);
  const stats = buildStats(items);
  let synth;
  try {
    synth = await synthesize({ items, stats, trends, profile, llm, prompts });
  } catch (e) {
    await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: `összefoglaló sikertelen: ${e.message}` } });
    synth = await synthesize({ items, stats, trends, profile, llm: { mode: 'mock' }, prompts });
  }
  for (const d of synth.dropped) await log.append({ szereplo: WHO, tipus: 'hiba', tartalom: { hiba: 'ellenőrizhetetlen narratíva elvetve', szoveg: d } });

  const dateLabel = dayKey(now(), profile.utemezes.idozona);
  const rendered = renderDigest({ profile, dateLabel, items, stats, trends, synthesis: synth.synthesis, errors });
  const subject = `Sajtószemle – ${profile.megnevezes} – ${dateLabel}`;
  const sent = await outbox.send({ agent: AGENT, kind: 'belso_jelentes', to: profile.vezeto.email, subject, text: rendered.text, html: rendered.html });
  const stamp = now().toISOString();
  await store.save(all.map(a => (a.reportedAt ? a : { ...a, reportedAt: stamp })));
  await log.append({ szereplo: WHO, tipus: 'szemle_elkuldve', hivatkozas: sent.id, tartalom: { cikkek: items.length, trendjelzesek: trends.filter(t => t.signal).length, ai_mod: llm.mode } });
  Object.assign(result, { digest: true, articles: items.length });
  await log.append({ szereplo: WHO, tipus: 'futas', tartalom: { mode, ...result } });
  return result;
}

export const monitoringAgent = { id: AGENT, modes: ['digest', 'check'], run };
