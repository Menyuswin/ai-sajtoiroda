// Ütemezés és futtatás Cloudflare-en. A Worker óránként (a 30. percben) lefut, és ügyfelenként dönt:
//  - a profilban megadott szemle-időpont (az ügyfél időzónájában) után, naponta egyszer: napi szemle;
//  - egyébként: csak ellenőrzés (riasztás, ha van). Így a téli/nyári időszámítás nem zavar be.
import { getConfig } from '../core/config.js';
import { agentActive } from '../core/profile.js';
import { createOutbox } from '../core/outbox.js';
import { createLlm } from '../core/llm.js';
import { createLiveMailer } from '../core/mailer.js';
import { dayKey } from '../core/text.js';
import { createD1Log, createD1Store, createD1DryMailer, createD1ProfileRepo } from './d1.js';
import { createDesk } from './desk.js';
import { monitoringAgent } from '../agents/monitoring/index.js';
import { defaultFetchText } from '../agents/monitoring/sources.js';

export function localTime(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (t) => parts.find(p => p.type === t).value;
  return `${get('hour')}:${get('minute')}`;
}

export function decideMode(profile, now, lastDigestDay) {
  const tz = profile.utemezes.idozona;
  const due = profile.utemezes.szemle || '07:30';
  return localTime(now, tz) >= due && lastDigestDay !== dayKey(now, tz) ? 'digest' : 'check';
}

export async function runScheduled(env, { now = () => new Date(), fetchText = defaultFetchText, prompts, llmFetch } = {}) {
  const config = getConfig(env);
  const repo = createD1ProfileRepo({ db: env.DB, now });
  const summary = [];
  for (const profile of await repo.list()) {
    const tenantId = profile.ugyfel_id;
    const log = createD1Log({ db: env.DB, tenantId, now });
    try {
      if (!agentActive(profile, 'monitoring', now())) { summary.push({ tenantId, skipped: true }); continue; }
      const store = createD1Store({ db: env.DB, tenantId });
      const mailer = config.live ? createLiveMailer(config.mailer) : createD1DryMailer({ db: env.DB, now });
      const outbox = createOutbox({ profile, mailer, log });
      const wantAi = env.SAJTOIRODA_LLM === 'anthropic';
      const llm = createLlm({ mode: wantAi ? 'anthropic' : 'mock', key: config.anthropicKey, models: config.models, ...(llmFetch ? { fetchImpl: llmFetch } : {}) });
      const sent = await log.query({ tipus: 'szemle_elkuldve' });
      const lastDigestDay = sent.length ? dayKey(sent[sent.length - 1].ido, profile.utemezes.idozona) : null;
      const mode = decideMode(profile, now(), lastDigestDay);
      const result = await monitoringAgent.run({ profile, log, store, outbox, llm, now, fetchText, prompts, models: config.models, anyagok: createDesk({ db: env.DB, tenantId, now }).anyagok }, { mode });
      if (mode === 'digest' && profile.megorzes?.nyers_cikk_honap) {
        const cutoff = new Date(now()); cutoff.setMonth(cutoff.getMonth() - profile.megorzes.nyers_cikk_honap);
        await store.purgeOlderThan(cutoff.toISOString());
      }
      summary.push({ tenantId, mode, ...result });
    } catch (e) {
      // Egy ügyfél hibája nem állíthatja le a többit.
      await log.append({ szereplo: 'rendszer', tipus: 'hiba', tartalom: { hiba: String(e.message || e) } }).catch(() => {});
      summary.push({ tenantId, error: String(e.message || e) });
    }
  }
  return summary;
}
