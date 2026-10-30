// A vezető utasításainak értelmezése és végrehajtása – ZÁRT műveletlistából.
//  - módosító művelet: csak javaslat, a vezető jóváhagyása után hajtódik végre;
//  - olvasó művelet (jelentes_keres): azonnal fut, mert semmit nem változtat és nem megy ki sehová.
// Amit a munkatárs nem ért vagy nem tud (például levelet küldeni), arra visszakérdez / megmondja.
import { loadPrompt, extractJson } from '../../core/llm.js';
import { norm } from '../../core/text.js';
import { checkLimits } from '../../core/profile.js';

const GROUPS = new Set(['szervezet', 'szemelyek', 'temak', 'kizaro']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const READ_ONLY = new Set(['jelentes_keres']);
export const OPERATIONS = new Set(['kifejezes_hozzaad', 'kifejezes_elvesz', 'forras_elvesz', 'vorosvonal_hozzaad', 'szunet', 'szunet_vege', 'jelentes_keres', 'kulcsszo_javaslat', 'kifejezesek_hozzaad']);

const str = (v, max = 120) => String(v ?? '').trim().slice(0, max);

// A művelet és paramétereinek szigorú ellenőrzése – az AI válasza is ezen megy át.
export function validateOperation(op) {
  const m = op?.muvelet;
  const p = op?.parameterek || {};
  if (m === 'ismeretlen' || !OPERATIONS.has(m)) return { muvelet: 'ismeretlen', parameterek: {}, magyarazat: str(op?.magyarazat, 300) || 'Ezt az utasítást nem értem pontosan.' };
  const magyarazat = str(op.magyarazat, 300);
  switch (m) {
    case 'kifejezes_hozzaad': {
      const ertek = str(p.ertek);
      if (!ertek || !GROUPS.has(p.csoport)) throw new Error('kifejezes_hozzaad: hiányzó kifejezés vagy ismeretlen csoport');
      return { muvelet: m, parameterek: { csoport: p.csoport, ertek }, magyarazat };
    }
    case 'kifejezes_elvesz': { const ertek = str(p.ertek); if (!ertek) throw new Error('kifejezes_elvesz: hiányzó kifejezés'); return { muvelet: m, parameterek: { ertek }, magyarazat }; }
    case 'forras_elvesz': { const nev = str(p.nev); if (!nev) throw new Error('forras_elvesz: hiányzó forrásnév'); return { muvelet: m, parameterek: { nev }, magyarazat }; }
    case 'vorosvonal_hozzaad': { const szoveg = str(p.szoveg, 200); if (!szoveg) throw new Error('vorosvonal_hozzaad: hiányzó szöveg'); return { muvelet: m, parameterek: { szoveg }, magyarazat }; }
    case 'szunet': {
      const ig = p.ig == null || p.ig === '' ? null : String(p.ig);
      if (ig && (!DATE.test(ig) || Number.isNaN(Date.parse(ig)))) throw new Error('szunet: a dátum ÉÉÉÉ-HH-NN alakú legyen');
      return { muvelet: m, parameterek: { ig }, magyarazat };
    }
    case 'szunet_vege': return { muvelet: m, parameterek: {}, magyarazat };
    case 'kulcsszo_javaslat': return { muvelet: m, parameterek: {}, magyarazat };
    case 'kifejezesek_hozzaad': {
      const tetelek = (Array.isArray(p.tetelek) ? p.tetelek : []).map(t => ({ csoport: t?.csoport, ertek: str(t?.ertek), forras: str(t?.forras, 200) }));
      if (!tetelek.length || tetelek.length > 30 || tetelek.some(t => !t.ertek || !GROUPS.has(t.csoport))) throw new Error('kifejezesek_hozzaad: érvénytelen tételek');
      return { muvelet: m, parameterek: { tetelek }, magyarazat };
    }
    case 'jelentes_keres': {
      const napok = Math.min(90, Math.max(1, Math.round(Number(p.napok) || 7)));
      return { muvelet: m, parameterek: { tema: p.tema ? str(p.tema) : null, napok }, magyarazat };
    }
  }
}

// Szabályalapú értelmező (nincs AI-hívás): a gyakori magyar fordulatokat ismeri; ami másképp szól, arra visszakérdez.
export function mockInterpret(text, profile) {
  const raw = String(text).trim().replace(/[.!?\s]+$/g, '');
  const t = norm(raw);
  const orig = (cap) => { const i = t.indexOf(cap); return i >= 0 && t.length === raw.length ? raw.slice(i, i + cap.length) : cap; };
  const clean = (s) => {
    let v = s.replace(/^(a|az)\s+/, '');
    for (let i = 0; i < 3; i++) v = v.replace(/\s+(temat|temakat|kifejezest|szot|nevet|szemelyt|forrast|is)$/, '');
    return orig(v.trim());
  };
  let m;

  const removal = t.match(/^(ne figyeld|ne kovesd|hagyd ki|vedd ki|ne foglalkozz)\s+(.+)$/) || t.match(/^(.+?)\s+(ne figyeld|ne kovesd|hagyd ki)$/);
  if (removal) {
    const target = removal[1].match(/^(ne figyeld|ne kovesd|hagyd ki|vedd ki|ne foglalkozz)$/) ? removal[2] : removal[1];
    const v = clean(target);
    // a ragozott forrásnév („a Telexet”) is egyezik: a név a beírt alak elején áll
    const src = profile.forrasok.rss.concat(profile.forrasok.sajat).find(s => { const a = norm(v), b = norm(s.nev); return a === b || a.startsWith(b); });
    return validateOperation(src ? { muvelet: 'forras_elvesz', parameterek: { nev: src.nev } } : { muvelet: 'kifejezes_elvesz', parameterek: { ertek: v } });
  }
  if ((m = t.match(/^(szoljon|szolj|jelezz|riassz)\b.*\b(azonnal|rogton)\b.*\b(ha|amikor)\s+(.+)$/))) {
    return validateOperation({ muvelet: 'vorosvonal_hozzaad', parameterek: { szoveg: orig(m[4]) } });
  }
  if ((m = t.match(/^(figyeld|figyelj|kovesd|vedd fel)\s+(.+)$/))) {
    const v = clean(m[2]);
    const person = /\b(nevet|szemelyt)\b/.test(m[2]);
    return validateOperation({ muvelet: 'kifejezes_hozzaad', parameterek: { csoport: person ? 'szemelyek' : 'temak', ertek: v } });
  }
  if (/^(javasolj|ajanlj|keress|gyujts)\b.*(kulcssz|kifejezes|temat|nevet)/.test(t)) return validateOperation({ muvelet: 'kulcsszo_javaslat' });
  if (/^(folytasd|indulj ujra|kapcsold be|vege a szunetnek|szunet vege)/.test(t)) return validateOperation({ muvelet: 'szunet_vege' });
  if (/^(szuneteltesd|allj le|szunet)\b/.test(t)) return validateOperation({ muvelet: 'szunet', parameterek: { ig: (t.match(/\d{4}-\d{2}-\d{2}/) || [null])[0] } });
  if (/^(mi tortent|keszits|kerek|foglald ossze|osszegezd|mutasd)\b/.test(t)) {
    const terms = [...profile.kulcsszavak.temak, ...profile.kulcsszavak.szemelyek, ...profile.kulcsszavak.szervezet];
    const hit = terms.find(x => t.includes(norm(x)));
    const napok = /\bhonap/.test(t) ? 30 : /\btegnap\b/.test(t) ? 1 : /\bhet/.test(t) ? 7 : 7;
    return validateOperation({ muvelet: 'jelentes_keres', parameterek: { tema: hit || null, napok } });
  }
  return { muvelet: 'ismeretlen', parameterek: {}, magyarazat: 'Ezt az utasítást nem értem pontosan. Megpróbálhatod így: „Figyeld a várólista témát is”, „A Telexet ne figyeld”, „Szólj azonnal, ha a nevemet említik”, „Mi történt a héten az ápolóhiány körül?”, „Szüneteltesd 2026-11-05-ig”.' };
}

export async function interpret({ text, profile, llm, prompts, now = new Date() }) {
  if (llm.mode === 'mock') return mockInterpret(text, profile);
  const { system, user } = loadPrompt(prompts.instruct, {
    megnevezes: profile.megnevezes, temak: profile.kulcsszavak.temak, szemelyek: profile.kulcsszavak.szemelyek,
    forrasok: profile.forrasok.rss.concat(profile.forrasok.sajat).map(s => s.nev), ma: now.toISOString().slice(0, 10), szoveg: text,
  });
  return validateOperation(extractJson(await llm.complete({ task: 'classify', system, user, maxTokens: 400 })));
}

// A javaslat magyar mondata a vezetőnek.
export function describeOperation(op) {
  const p = op.parameterek;
  const g = { szervezet: 'szervezeti nevek', szemelyek: 'személyek', temak: 'témák', kizaro: 'kizáró szavak' };
  switch (op.muvelet) {
    case 'kifejezes_hozzaad': return `Felveszem a(z) „${p.ertek}” kifejezést a figyelt ${g[p.csoport]} közé.`;
    case 'kifejezes_elvesz': return `Kiveszem a(z) „${p.ertek}” kifejezést a figyeltek közül.`;
    case 'forras_elvesz': return `Kiveszem a(z) „${p.nev}” forrást a figyeltek közül.`;
    case 'vorosvonal_hozzaad': return `Új vörös vonal: azonnal szólok, ha ${p.szoveg}.`;
    case 'szunet': return p.ig ? `Szünetelek ${p.ig} végéig.` : 'Szünetelek, amíg vissza nem kapcsolsz.';
    case 'szunet_vege': return 'Folytatom a munkát (a szünetnek vége).';
    case 'jelentes_keres': return `Összefoglaló jelentést készítek${p.tema ? ` a(z) „${p.tema}” témáról` : ''} az elmúlt ${p.napok} napról.`;
    case 'kulcsszo_javaslat': return 'Kulcsszavakat keresek a feltöltött dokumentumokban.';
    case 'kifejezesek_hozzaad': return `Felvehetem ezeket a figyelt kifejezések közé (jelölje ki, melyiket): ${p.tetelek.map(t => `„${t.ertek}”`).join(', ')}.`;
    default: return op.magyarazat;
  }
}

// A módosító műveletek hatása a profilra (tiszta függvény; a mentés és a naplózás a hívó dolga).
export function applyOperation(op, profile, selected = null) {
  const p = op.parameterek;
  const next = structuredClone(profile);
  const same = (a, b) => norm(a) === norm(b);
  switch (op.muvelet) {
    case 'kifejezes_hozzaad':
      if (!next.kulcsszavak[p.csoport].some(x => same(x, p.ertek))) next.kulcsszavak[p.csoport].push(p.ertek);
      break;
    case 'kifejezes_elvesz': {
      let removed = 0;
      for (const g of GROUPS) { const before = next.kulcsszavak[g].length; next.kulcsszavak[g] = next.kulcsszavak[g].filter(x => !same(x, p.ertek)); removed += before - next.kulcsszavak[g].length; }
      if (!removed) throw new Error(`Nincs ilyen figyelt kifejezés: „${p.ertek}”`);
      break;
    }
    case 'kifejezesek_hozzaad': {
      const picked = selected === null ? p.tetelek : p.tetelek.filter((_, i) => selected.includes(i));
      if (!picked.length) throw new Error('Nincs kijelölt kifejezés.');
      for (const t of picked) if (!next.kulcsszavak[t.csoport].some(x => same(x, t.ertek))) next.kulcsszavak[t.csoport].push(t.ertek);
      break;
    }
    case 'forras_elvesz': {
      const before = next.forrasok.rss.length + next.forrasok.sajat.length;
      next.forrasok.rss = next.forrasok.rss.filter(s => !same(s.nev, p.nev));
      next.forrasok.sajat = next.forrasok.sajat.filter(s => !same(s.nev, p.nev));
      if (before === next.forrasok.rss.length + next.forrasok.sajat.length) throw new Error(`Nincs ilyen forrás: „${p.nev}”`);
      break;
    }
    case 'vorosvonal_hozzaad':
      if (!next.vorosvonalak.some(x => same(x, p.szoveg))) next.vorosvonalak.push(p.szoveg);
      break;
    case 'szunet':
      next.ugynokok = { ...next.ugynokok, monitoring: { ...next.ugynokok.monitoring, aktiv: p.ig ? true : false, szunet_ig: p.ig || null } };
      break;
    case 'szunet_vege':
      next.ugynokok = { ...next.ugynokok, monitoring: { ...next.ugynokok.monitoring, aktiv: true, szunet_ig: null } };
      break;
    default: throw new Error(`Ez a művelet nem módosít: ${op.muvelet}`);
  }
  return checkLimits(next);
}
