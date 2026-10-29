// A felület fájljai (ui/) egy térképben: a Worker csomagjához és a helyi bemutatóhoz közösen.
import { createHash } from 'node:crypto';

const TEXT = { '/index.html': ['index.html', 'html'], '/app.js': ['app.js', 'js'], '/app.css': ['app.css', 'css'], '/manifest.webmanifest': ['manifest.webmanifest', 'webmanifest'], '/icons/icon.svg': ['icons/icon.svg', 'svg'] };
const BINARY = { '/icons/icon-192.png': 'icons/icon-192.png', '/icons/icon-512.png': 'icons/icon-512.png', '/icons/icon-maskable-512.png': 'icons/icon-maskable-512.png', '/icons/apple-touch-icon.png': 'icons/apple-touch-icon.png' };

// readText(rel) → szöveg, readBinary(rel) → Buffer
export function buildAssets(readText, readBinary) {
  const assets = {};
  const hash = createHash('sha1');
  for (const [path, [file, type]] of Object.entries(TEXT)) { const body = readText(file); assets[path] = { type, body }; hash.update(body); }
  for (const [path, file] of Object.entries(BINARY)) { const buf = readBinary(file); assets[path] = { type: 'png', body: buf.toString('base64'), base64: true }; hash.update(buf); }
  const version = hash.digest('hex').slice(0, 10);
  // A service worker gyorsítótára a tartalom ujjlenyomatához kötött: új verziónál a régi törlődik.
  assets['/sw.js'] = { type: 'js', body: readText('sw.js').replace('__VERSION__', version), noCache: true };
  return assets;
}
