// Átadások az ügynökök között (docs/10). Belső üzenetek: kifelé semmit nem küldenek.
// A szolgáltatás tárfüggetlen: a `repo` az átadás-tár (D1: desk.atadasok), a `log` a napló.
//  - `agentIds`: a létező asztalok azonosítói;
//  - `isAvailable(id)`: dolgozik-e az ügynök (van-e ott valaki, és nem szünetel);
//  - `handlers`: ügynök-azonosító → async (átadás) => { valasz? } ; a feldolgozó ügynökök ide iratkoznak fel.
export const HANDOFF_TYPES = new Set(['jelzes', 'kerelem', 'anyag_atadas', 'kerdes']);
export const HANDOFF_LIMITS = { maxDepth: 3, dailyQuota: 50, ttlDays: 14 };

export function createHandoffs({ repo, log, agentIds, isAvailable, handlers = new Map(), now = () => new Date() }) {
  const ids = new Set(agentIds);
  const startOfDay = () => `${now().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const reject = async (from, reason, extra = {}) => {
    await log.append({ szereplo: `ugynok:${from}`, tipus: 'hiba', tartalom: { hiba: `átadás elutasítva: ${reason}`, ...extra } });
    return { ok: false, ok_reason: reason };
  };

  async function deliver(h) {
    const handler = handlers.get(h.hova);
    const stamp = now().toISOString();
    await repo.setState(h.id, { allapot: 'kezbesitve', kezbesitve: stamp });
    await log.append({ szereplo: 'rendszer', tipus: 'atadas', hivatkozas: h.id, tartalom: { esemeny: 'kezbesitve', honnan: h.honnan, hova: h.hova } });
    if (!handler) return 'kezbesitve';
    try {
      const out = (await handler({ ...h, allapot: 'kezbesitve' })) || {};
      await repo.setState(h.id, { allapot: 'feldolgozva', valasz: out.valasz || null, lezarva: now().toISOString() });
      await log.append({ szereplo: `ugynok:${h.hova}`, tipus: 'atadas', hivatkozas: h.id, tartalom: { esemeny: 'feldolgozva' } });
      return 'feldolgozva';
    } catch (e) {
      await log.append({ szereplo: `ugynok:${h.hova}`, tipus: 'hiba', hivatkozas: h.id, tartalom: { hiba: `átadás feldolgozása sikertelen: ${e.message}` } });
      return 'kezbesitve';
    }
  }

  return {
    async send({ from, to, tipus, targy, szoveg, anyagId = null, parentId = null }) {
      if (!ids.has(from) || !ids.has(to)) return reject(from, 'ismeretlen ügynök');
      if (from === to) return reject(from, 'önmagának nem küldhet átadást');
      if (!HANDOFF_TYPES.has(tipus)) return reject(from, `ismeretlen átadás-típus: ${tipus}`);
      if (!String(targy || '').trim() || !String(szoveg || '').trim()) return reject(from, 'a tárgy és a szöveg kötelező');
      let melyseg = 0;
      if (parentId) {
        const parent = await repo.get(parentId);
        if (!parent) return reject(from, 'ismeretlen szülő-átadás');
        melyseg = parent.melyseg + 1;
        if (melyseg > HANDOFF_LIMITS.maxDepth) return reject(from, `a lánc mélysége a megengedett ${HANDOFF_LIMITS.maxDepth} fölé menne`, { szulo: parentId });
      }
      if ((await repo.countSince(startOfDay())) >= HANDOFF_LIMITS.dailyQuota) return reject(from, 'a napi átadás-keret kimerült');
      const id = await repo.add({ tipus, honnan: from, hova: to, targy: String(targy).slice(0, 200), szoveg: String(szoveg).slice(0, 2000), anyag_id: anyagId, szulo_id: parentId, melyseg, allapot: 'varakozik' });
      await log.append({ szereplo: `ugynok:${from}`, tipus: 'atadas', hivatkozas: id, tartalom: { esemeny: 'elkuldve', tipus, honnan: from, hova: to, targy, melyseg } });
      const h = await repo.get(id);
      const allapot = (await isAvailable(to)) ? await deliver(h) : 'varakozik'; // üres vagy szüneteltetett asztalnál vár
      return { ok: true, id, allapot };
    },

    // Várakozó átadások kézbesítése azoknak, akik már dolgoznak; lejárt átadások lezárása. Ütemezett futáskor hívandó.
    async flush() {
      const cutoff = new Date(now().getTime() - HANDOFF_LIMITS.ttlDays * 86400000).toISOString();
      const expired = await repo.expireBefore(cutoff, now().toISOString());
      if (expired) await log.append({ szereplo: 'rendszer', tipus: 'atadas', tartalom: { esemeny: 'lejart', darab: expired } });
      let delivered = 0;
      for (const h of (await repo.list({ allapot: 'varakozik', limit: 500 })).reverse()) {
        if (await isAvailable(h.hova)) { await deliver(h); delivered++; }
      }
      return { delivered, expired };
    },

    // A vezető megállítja: soha nem kézbesül, és nem is dolgozható fel.
    async stop(id, by) {
      const h = await repo.get(id);
      if (!h) return { ok: false, ok_reason: 'nincs ilyen átadás' };
      if (!['varakozik', 'kezbesitve'].includes(h.allapot)) return { ok: false, ok_reason: 'ez az átadás már lezárult' };
      await repo.setState(id, { allapot: 'megallitva', lezarva: now().toISOString() });
      await log.append({ szereplo: by, tipus: 'atadas', hivatkozas: id, tartalom: { esemeny: 'megallitva' } });
      return { ok: true };
    },

    async close(id, by, valasz = null) {
      const h = await repo.get(id);
      if (!h) return { ok: false, ok_reason: 'nincs ilyen átadás' };
      if (!['kezbesitve', 'feldolgozva'].includes(h.allapot)) return { ok: false, ok_reason: 'csak kézbesített átadás zárható le' };
      await repo.setState(id, { allapot: 'lezarva', valasz, lezarva: now().toISOString() });
      await log.append({ szereplo: by, tipus: 'atadas', hivatkozas: id, tartalom: { esemeny: 'lezarva' } });
      return { ok: true };
    },
  };
}
