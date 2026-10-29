#!/usr/bin/env node
// Használat:
//   node src/cli.js monitoring run --profile <profil.yaml> [--mode digest|check] [--llm mock|anthropic] [--offline-feed <feed.xml>]
// Alapértelmezés: száraz (dry) mód – a levél fájlba kerül (out/), nem megy ki. Éles mód: SAJTOIRODA_LIVE=1.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadProfile } from './core/profile.js';
import { getConfig } from './core/config.js';
import { createFileLog } from './core/log.js';
import { createFileStore } from './core/store.js';
import { createFileMailer, createLiveMailer } from './core/mailer.js';
import { createOutbox } from './core/outbox.js';
import { createLlm } from './core/llm.js';
import { registerAgent, getAgent } from './core/registry.js';
import { monitoringAgent } from './agents/monitoring/index.js';
import { defaultFetchText } from './agents/monitoring/sources.js';

registerAgent(monitoringAgent);

function parseArgs(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, flags };
}

export async function buildContext({ profile, config, llmMode = 'mock', fetchText = defaultFetchText, now = () => new Date(), promptDir }) {
  const log = createFileLog({ dir: config.dataDir, tenantId: profile.ugyfel_id, now });
  const store = createFileStore({ dir: config.dataDir, tenantId: profile.ugyfel_id });
  const mailer = config.live ? createLiveMailer(config.mailer) : createFileMailer({ outDir: config.outDir, now });
  const outbox = createOutbox({ profile, mailer, log });
  const llm = createLlm({ mode: llmMode, key: config.anthropicKey, models: config.models });
  return { profile, log, store, outbox, llm, now, fetchText, promptDir, models: config.models };
}

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [agentId, command] = pos;
  if (!agentId || command !== 'run' || !flags.profile) {
    console.error('Használat: node src/cli.js <ügynök> run --profile <profil.yaml> [--mode digest|check] [--llm mock|anthropic] [--offline-feed <feed.xml>]');
    process.exit(2);
  }
  const config = getConfig();
  const profile = await loadProfile(flags.profile);
  const here = dirname(fileURLToPath(import.meta.url));
  const fetchText = flags['offline-feed'] ? async () => readFile(flags['offline-feed'], 'utf8') : defaultFetchText;
  const ctx = await buildContext({ profile, config, llmMode: flags.llm || 'mock', fetchText, promptDir: join(here, '..', 'monitoring', 'prompts') });
  console.error(`[${config.live ? 'ÉLES' : 'száraz'} mód] ügyfél: ${profile.ugyfel_id}, AI: ${ctx.llm.mode}`);
  const result = await getAgent(agentId).run(ctx, { mode: flags.mode || 'digest' });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
