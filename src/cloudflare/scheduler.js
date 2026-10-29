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
import { createHandoffs } from '../core/handoff.js';
import { AGENTS } from '../api/catalogue.js';
import { monitoringAgent } from '../agents/monitoring/index.js';
import { defaultFetchText } from '../agents/monitoring/sources.js';
import { kapcsolattartoAgent } from '../agents/kapcsolattarto/index.js';
import { createMailStore } from '../mail/store.js';
import { createMailbox } from '../mail/providers.js';
import { createDocs } from '../docs/store.js';

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

// Az ügynök-azonosító → feldolgozó függvény térkép: az újabb ügynökök érkezésekor itt iratkoznak fel (docs/10).
export const handoffHandlers = new Map();

export async function runScheduled(env, { now = () => new Date(), fetchText = defaultFetchText, prompts, llmFetch, mailFetch, handlers = handoffHandlers } = {}) {
  const config = getConfig(env);
  const repo = createD1ProfileRepo({ db: env.DB, now });
  const summary = [];
  for (const profile of await repo.list()) {
    const tenantId = profile.ugyfel_id;
    const log = createD1Log({ db: env.DB, tenantId, now });
    try {
      const entry = { tenantId };
      const mailer = config.live ? createLiveMailer(config.mailer) : createD1DryMailer({ db: env.DB, now });
      const outbox = createOutbox({ profile, mailer, log });
      const desk = createDesk({ db: env.DB, tenantId, now });
      const handoffs = createHandoffs({ repo: desk.atadasok, log, agentIds: AGENTS.map(a => a.id), handlers, now, isAvailable: (id) => !!AGENTS.find(a => a.id === id)?.elerheto && agentActive(profile, id, now()) });
      await handoffs.flush(); // a megérkezett asztaloknak kézbesít, a lejártakat lezárja
      const wantAi = env.SAJTOIRODA_LLM === 'anthropic';
      const llm = createLlm({ mode: wantAi ? 'anthropic' : 'mock', key: config.anthropicKey, models: config.models, ...(llmFetch ? { fetchImpl: llmFetch } : {}) });

      if (!agentActive(profile, 'monitoring', now())) { entry.monitoring = { skipped: true }; entry.skipped = true; }
      else {
        const store = createD1Store({ db: env.DB, tenantId });
        const sent = await log.query({ tipus: 'szemle_elkuldve' });
        const lastDigestDay = sent.length ? dayKey(sent[sent.length - 1].ido, profile.utemezes.idozona) : null;
        const mode = decideMode(profile, now(), lastDigestDay);
        const result = await monitoringAgent.run({ profile, log, store, outbox, llm, now, fetchText, prompts, models: config.models, anyagok: desk.anyagok, atadasok: handoffs }, { mode });
        if (mode === 'digest' && profile.megorzes?.nyers_cikk_honap) {
          const cutoff = new Date(now()); cutoff.setMonth(cutoff.getMonth() - profile.megorzes.nyers_cikk_honap);
          await store.purgeOlderThan(cutoff.toISOString());
        }
        entry.monitoring = { mode, ...result };
        Object.assign(entry, { mode, ...result }); // a korábbi összegző alak (Monitoring) megmarad
      }

      // Kapcsolattartó: a postafiók lekérdezése (ha van lekérdezhető) és a levelek feldolgozása. Egyik ügynök hibája a másikat nem állítja le.
      if (profile.postafiok || (await createMailStore({ db: env.DB, tenantId, now }).pending(1)).length) {
        try {
          const levelek = createMailStore({ db: env.DB, tenantId, now });
          let mailbox = null;
          try { mailbox = createMailbox(profile.postafiok, { env, fetchImpl: mailFetch }); }
          catch (e) { await levelek.saveMailboxState({ kurzor: null, hiba: e.message }); await log.append({ szereplo: 'rendszer', tipus: 'hiba', tartalom: { hiba: `postafiók: ${e.message}` } }); }
          const docs = createDocs({ db: env.DB, bucket: env.DOCS || null, tenantId, now });
          entry.kapcsolattarto = await kapcsolattartoAgent.run({ profile, log, outbox, llm, now, prompts, models: config.models, anyagok: desk.anyagok, atadasok: handoffs, levelek, docs, mailbox });
          const keep = profile.megorzes?.level_nap ?? 90;
          if (keep) await levelek.purgeOlderThan(new Date(now().getTime() - keep * 86400000).toISOString());
        } catch (e) {
          await log.append({ szereplo: 'rendszer', tipus: 'hiba', tartalom: { hiba: `kapcsolattartó: ${String(e.message || e)}` } }).catch(() => {});
          entry.kapcsolattarto = { error: String(e.message || e) };
        }
      }
      summary.push(entry);
    } catch (e) {
      // Egy ügyfél hibája nem állíthatja le a többit.
      await log.append({ szereplo: 'rendszer', tipus: 'hiba', tartalom: { hiba: String(e.message || e) } }).catch(() => {});
      summary.push({ tenantId, error: String(e.message || e) });
    }
  }
  return summary;
}
