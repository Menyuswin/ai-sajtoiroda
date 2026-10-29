// Cikktár ügyfelenként (JSON-fájl). A tár cserélhető; az interfész load / save.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export function createFileStore({ dir, tenantId }) {
  const file = join(dir, tenantId, 'cikkek.json');
  return {
    async load() {
      try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    },
    async save(articles) {
      await mkdir(join(dir, tenantId), { recursive: true });
      await writeFile(file, JSON.stringify(articles, null, 1));
    },
  };
}
