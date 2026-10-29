// Ügynök-nyilvántartás. Minden új ügynök (Kapcsolattartó, Felkészítő, …) ide iratkozik fel,
// és ugyanazt a közös magot kapja: profil, napló, tár, AI, kimenő kapu.
//
// Ügynök-szerződés:  { id: 'monitoring', modes: ['digest', 'check'], run(ctx, { mode }) }
const agents = new Map();

export function registerAgent(agent) {
  if (!agent.id || typeof agent.run !== 'function') throw new Error('Érvénytelen ügynök');
  agents.set(agent.id, agent);
}
export function getAgent(id) {
  const a = agents.get(id);
  if (!a) throw new Error(`Ismeretlen ügynök: ${id} (elérhető: ${[...agents.keys()].join(', ') || 'nincs'})`);
  return a;
}
