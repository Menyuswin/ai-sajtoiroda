import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile } from '../src/core/profile.js';
import { buildContext } from '../src/cli.js';

const here = dirname(fileURLToPath(import.meta.url));
export const fixture = (n) => join(here, 'fixtures', n);
export const promptDir = join(here, '..', 'monitoring', 'prompts');
export const readPrompts = async () => ({
  classify: await readFile(join(promptDir, 'cikk-besorolas.md'), 'utf8'),
  synthesize: await readFile(join(promptDir, 'napi-szemle.md'), 'utf8'),
  instruct: await readFile(join(promptDir, 'utasitas-ertelmezes.md'), 'utf8'),
  qa: await readFile(join(promptDir, 'kerdes-valasz.md'), 'utf8'),
  docqa: await readFile(join(promptDir, 'dokumentum-kerdes.md'), 'utf8'),
  keywords: await readFile(join(promptDir, 'kulcsszo-javaslat.md'), 'utf8'),
  letterClassify: await readFile(join(promptDir, 'level-besorolas.md'), 'utf8'),
  letterReply: await readFile(join(promptDir, 'level-valasz.md'), 'utf8'),
  briefing: await readFile(join(promptDir, 'felkeszito-csomag.md'), 'utf8'),
  proposal: await readFile(join(promptDir, 'proaktiv-javaslat.md'), 'utf8'),
});

export async function makeCtx({ now = new Date('2026-10-29T06:30:00Z'), fetchText, llmMode = 'mock', profileMod, llmFetch } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sajto-'));
  let profile = await loadProfile(fixture('profil.yaml'));
  if (profileMod) profile = profileMod(profile);
  const feed = await readFile(fixture('feed.xml'), 'utf8');
  const config = { live: false, dataDir: join(dir, 'data'), outDir: join(dir, 'out'), anthropicKey: 'teszt', models: { classify: 'm-c', synthesize: 'm-s' } };
  const ctx = await buildContext({ profile, config, llmMode, fetchText: fetchText || (async () => feed), now: () => now, prompts: await readPrompts() });
  if (llmFetch) {
    const { createLlm } = await import('../src/core/llm.js');
    ctx.llm = createLlm({ mode: 'anthropic', key: 'teszt', models: config.models, fetchImpl: llmFetch });
  }
  return { ctx, dir, config, outFiles: async () => readdir(join(config.outDir, profile.ugyfel_id)).catch(() => []) };
}
