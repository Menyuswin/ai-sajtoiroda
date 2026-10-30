// Az iroda munkatársai. A tartalom az agents/*.yaml specifikációkkal egyezik (teszt őrzi).
// `elerheto`: van-e már működő munkatárs az asztalnál. A többi asztal üres, a bevezetési sorrend szerint kerül betöltésre.
export const AGENTS = [
  { id: 'kapcsolattarto', fajl: '01-kapcsolattarto', nev: 'Kommunikációs Kapcsolattartó Munkatárs', munkanev: 'Inbox & Call Agent', szakasz: 1, elerheto: true },
  { id: 'felkeszito', fajl: '02-felkeszito', nev: 'Sajtófelkészítő Munkatárs', munkanev: 'Briefing Agent', szakasz: 2, elerheto: true },
  { id: 'monitoring', fajl: '03-monitoring', nev: 'Sajtószemle- és Monitoring Munkatárs', munkanev: 'Media Monitoring Agent', szakasz: 1, elerheto: true },
  { id: 'proaktiv', fajl: '04-proaktiv-strategia', nev: 'Proaktív Kommunikációs Stratégia Munkatárs', munkanev: 'Agenda & Opportunity Agent', szakasz: 2, elerheto: true },
  { id: 'esemenyszervezo', fajl: '05-esemenyszervezo', nev: 'Eseményszervező Munkatárs', munkanev: 'Event & Logistics Agent', szakasz: 3, elerheto: true },
  { id: 'archivum', fajl: '06-archivum', nev: 'Archívum- és Tudásmenedzsment Munkatárs', munkanev: 'Archive & Knowledge Agent', szakasz: 'kiegészítő', elerheto: true },
  { id: 'kozossegi', fajl: '07-kozossegi-media', nev: 'Közösségimédia- és Digitális Narratíva Munkatárs', munkanev: 'Social & Digital Agent', szakasz: 'kiegészítő', elerheto: true },
  { id: 'jogi', fajl: '08-jogi-kockazat', nev: 'Jogi- és Kockázatfigyelő Munkatárs', munkanev: 'Legal & Risk Agent', szakasz: 'kiegészítő', elerheto: true },
];

// Alapértelmezett elrendezés: rács, a felhasználó húzással átrendezheti.
export function defaultLayout() {
  const out = {};
  AGENTS.forEach((a, i) => { out[a.id] = { x: 24 + (i % 4) * 255, y: 24 + Math.floor(i / 4) * 235 }; });
  return out;
}

export const agentById = (id) => AGENTS.find(a => a.id === id) || null;
