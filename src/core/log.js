// Hozzáfűzős napló, ügyfelenként külön fájl (JSON Lines). A séma: monitoring/naplo-sema.md.
// A tár cserélhető (D1, Make-adattár): az interfész append / query.
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const EVENT_TYPES = new Set([
  'cikk_besorolas', 'trendjelzes', 'voros_vonal_jelzes', 'riasztas_elkuldve', 'szemle_elkuldve',
  'vezeto_visszajelzes', 'utasitas', 'javaslat', 'level', 'valasz_tervezet', 'csomag', 'naptar_modositas', 'kozles', 'atadas', 'dokumentum', 'dontes', 'kerdes', 'profil_modositas', 'ugynok_ki_be_kapcsolas', 'hiba', 'kimeno_elutasitva', 'futas',
]);

export function createFileLog({ dir, tenantId, now = () => new Date() }) {
  const file = join(dir, tenantId, 'naplo.jsonl');
  let seq = 0;
  return {
    async append({ szereplo, tipus, hivatkozas = null, tartalom = null, dontes_ref = null }) {
      if (!EVENT_TYPES.has(tipus)) throw new Error(`Ismeretlen naplótípus: ${tipus}`);
      const ido = now().toISOString();
      const entry = { id: `${ido}-${String(++seq).padStart(4, '0')}`, ido, tenant_id: tenantId, szereplo, tipus, hivatkozas, tartalom, dontes_ref };
      await mkdir(join(dir, tenantId), { recursive: true });
      await appendFile(file, JSON.stringify(entry) + '\n');
      return entry;
    },
    async query(filter = {}) {
      let text = '';
      try { text = await readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      return text.split('\n').filter(Boolean).map(l => JSON.parse(l))
        .filter(e => Object.entries(filter).every(([k, v]) => e[k] === v));
    },
  };
}
