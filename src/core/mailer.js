// Levélküldő illesztők. Csak az outbox hívja – az ügynökök közvetlenül nem küldhetnek.
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Száraz mód: a levél fájlba kerül (out/<ügyfél>/), nem megy ki sehová.
export function createFileMailer({ outDir, now = () => new Date() }) {
  return {
    name: 'fajl',
    async send(msg) {
      const dir = join(outDir, msg.tenantId);
      await mkdir(dir, { recursive: true });
      const stamp = now().toISOString().replace(/[:.]/g, '-');
      const base = join(dir, `${stamp}-${msg.kind}`);
      await writeFile(base + '.txt', `Címzett: ${msg.to}\nTárgy: ${msg.subject}\n\n${msg.text}\n`);
      await writeFile(base + '.html', msg.html);
      return { id: base, delivered: false };
    },
  };
}

// Éles küldő: a szolgáltatás kiválasztása még nyitott döntés (docs/06, 7. fejezet).
export function createLiveMailer(name) {
  throw new Error(`Éles levélküldő nincs bekötve (SAJTOIRODA_MAILER=${name || 'nincs megadva'}). A levélküldő szolgáltatás kiválasztása jóváhagyásra vár.`);
}
