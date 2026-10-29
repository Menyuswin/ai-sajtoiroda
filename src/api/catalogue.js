// Az iroda ügynökei. A tartalom az agents/*.yaml specifikációkkal egyezik (teszt őrzi).
// `elerheto`: van-e már működő ügynök az asztalnál. A többi asztal üres, a bevezetési sorrend szerint kerül betöltésre.
export const AGENTS = [
  { id: 'kapcsolattarto', fajl: '01-kapcsolattarto', nev: 'Kommunikációs Kapcsolattartó Ügynök', munkanev: 'Inbox & Call Agent', szakasz: 1, elerheto: false },
  { id: 'felkeszito', fajl: '02-felkeszito', nev: 'Sajtófelkészítő Ügynök', munkanev: 'Briefing Agent', szakasz: 2, elerheto: false },
  { id: 'monitoring', fajl: '03-monitoring', nev: 'Sajtószemle- és Monitoring Ügynök', munkanev: 'Media Monitoring Agent', szakasz: 1, elerheto: true },
  { id: 'proaktiv', fajl: '04-proaktiv-strategia', nev: 'Proaktív Kommunikációs Stratégia Ügynök', munkanev: 'Agenda & Opportunity Agent', szakasz: 2, elerheto: false },
  { id: 'esemenyszervezo', fajl: '05-esemenyszervezo', nev: 'Eseményszervező Ügynök', munkanev: 'Event & Logistics Agent', szakasz: 3, elerheto: false },
  { id: 'archivum', fajl: '06-archivum', nev: 'Archívum- és Tudásmenedzsment Ügynök', munkanev: 'Archive & Knowledge Agent', szakasz: 'kiegészítő', elerheto: false },
  { id: 'kozossegi', fajl: '07-kozossegi-media', nev: 'Közösségimédia- és Digitális Narratíva Ügynök', munkanev: 'Social & Digital Agent', szakasz: 'kiegészítő', elerheto: false },
  { id: 'jogi', fajl: '08-jogi-kockazat', nev: 'Jogi- és Kockázatfigyelő Ügynök', munkanev: 'Legal & Risk Agent', szakasz: 'kiegészítő', elerheto: false },
];

// Alapértelmezett elrendezés: rács, a felhasználó húzással átrendezheti.
export function defaultLayout() {
  const out = {};
  AGENTS.forEach((a, i) => { out[a.id] = { x: 24 + (i % 4) * 255, y: 24 + Math.floor(i / 4) * 235 }; });
  return out;
}

export const agentById = (id) => AGENTS.find(a => a.id === id) || null;
