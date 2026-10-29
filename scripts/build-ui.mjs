// A felület fájljait (ui/) egyetlen modulba csomagolja a Worker számára. Telepítéskor a wrangler futtatja.
import { readFileSync, writeFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../ui/${f}`, import.meta.url), 'utf8');
const assets = {
  '/index.html': { type: 'html', body: read('index.html') },
  '/app.js': { type: 'js', body: read('app.js') },
  '/app.css': { type: 'css', body: read('app.css') },
};
writeFileSync(new URL('../src/worker/ui-assets.js', import.meta.url), `// GENERÁLT FÁJL (scripts/build-ui.mjs) – ne szerkessze.\nexport const ASSETS = ${JSON.stringify(assets)};\n`);
console.log('ui-assets.js elkészült');
