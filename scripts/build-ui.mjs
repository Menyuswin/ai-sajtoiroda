// A felület fájljait (ui/) egyetlen modulba csomagolja a Worker számára. Telepítéskor a wrangler futtatja.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildAssets } from '../src/api/assets.js';
const ui = (f) => new URL(`../ui/${f}`, import.meta.url);
const assets = buildAssets((f) => readFileSync(ui(f), 'utf8'), (f) => readFileSync(ui(f)));
writeFileSync(new URL('../src/worker/ui-assets.js', import.meta.url), `// GENERÁLT FÁJL (scripts/build-ui.mjs) – ne szerkessze.\nexport const ASSETS = ${JSON.stringify(assets)};\n`);
console.log('ui-assets.js elkészült');
