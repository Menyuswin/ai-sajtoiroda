// Munkatárs-nyilvántartás. Minden új munkatárs (Kapcsolattartó, Felkészítő, …) ide iratkozik fel,
// és ugyanazt a közös magot kapja: profil, napló, tár, AI, kimenő kapu.
//
// Munkatárs-szerződés:  { id: 'monitoring', modes: ['digest', 'check'], run(ctx, { mode }) }
const agents = new Map();

export function registerAgent(agent) {
  if (!agent.id || typeof agent.run !== 'function') throw new Error('Érvénytelen munkatárs');
  agents.set(agent.id, agent);
}
export function getAgent(id) {
  const a = agents.get(id);
  if (!a) throw new Error(`Ismeretlen munkatárs: ${id} (elérhető: ${[...agents.keys()].join(', ') || 'nincs'})`);
  return a;
}
