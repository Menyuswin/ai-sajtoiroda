// Ügyfélprofil beolvasása és ellenőrzése. A profil az egyetlen hely, ahol ügyfélfüggő adat él.
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAILBOX_PROVIDERS = ['proba', 'icloud', 'gmail', 'exchange', 'imap'];
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{2,63}$/;

// A postafiók beállítása. A jelszó vagy token NEM a profilban van: csak a titok neve (környezeti változó / Workers-titok).
export function validateMailbox(m) {
  if (m == null) return null;
  const errors = [];
  if (!MAILBOX_PROVIDERS.includes(m.szolgaltato)) errors.push(`postafiok.szolgaltato: ${MAILBOX_PROVIDERS.join(' | ')}`);
  if (!EMAIL_RE.test(m.cim || '')) errors.push('postafiok.cim érvénytelen');
  if (m.szolgaltato !== 'proba' && !SECRET_NAME_RE.test(m.titok || '')) errors.push('postafiok.titok: a titok NEVE kell (nagybetű, szám, aláhúzás), nem maga a jelszó');
  if (m.mappa != null && (typeof m.mappa !== 'string' || !m.mappa.trim() || m.mappa.length > 100)) errors.push('postafiok.mappa: 1–100 karakter');
  if (errors.length) throw new Error('Érvénytelen ügyfélprofil:\n- ' + errors.join('\n- '));
  return { szolgaltato: m.szolgaltato, cim: m.cim.trim(), mappa: (m.mappa || 'Sajtó').trim(), titok: m.titok || null };
}

export function validateProfile(raw) {
  const errors = [];
  const p = raw || {};
  if (p.schema_verzio !== 1) errors.push('schema_verzio: 1 szükséges');
  if (!ID_RE.test(p.ugyfel_id || '')) errors.push('ugyfel_id: kisbetű, szám és kötőjel, 2–63 karakter');
  if (!p.megnevezes) errors.push('megnevezes hiányzik');
  if (!p.vezeto || !EMAIL_RE.test(p.vezeto.email || '')) errors.push('vezeto.email hiányzik vagy érvénytelen');
  const k = p.kulcsszavak || {};
  const terms = [...(k.szervezet || []), ...(k.szemelyek || []), ...(k.temak || [])];
  if (!terms.length) errors.push('kulcsszavak: legalább egy szervezet, személy vagy téma kell');
  const f = p.forrasok || {};
  if (!((f.rss || []).length + (f.hirkereso || []).length + (f.sajat || []).length)) errors.push('forrasok: legalább egy forrás kell');
  for (const s of [...(f.rss || []), ...(f.sajat || [])]) {
    if (!s || !/^https?:\/\//.test(s.url || '')) errors.push(`forrás URL érvénytelen: ${JSON.stringify(s)}`);
  }
  if (errors.length) throw new Error('Érvénytelen ügyfélprofil:\n- ' + errors.join('\n- '));
  const mailbox = validateMailbox(p.postafiok);

  const trend = { alapido_nap: 14, szoras_szorzo: 2, minimum_emlites: 5, ...(p.trend || {}) };
  return {
    ...p,
    nyelv: p.nyelv || 'hu',
    kulcsszavak: { szervezet: [], szemelyek: [], temak: [], kizaro: [], ...k },
    forrasok: { rss: [], hirkereso: [], sajat: [], ...f },
    vorosvonalak: p.vorosvonalak || [],
    trend,
    utemezes: { idozona: 'Europe/Budapest', ...(p.utemezes || {}) },
    ugynokok: p.ugynokok || {},
    ...(mailbox ? { postafiok: mailbox } : {}),
    kapcsolattarto: { alairas: '', hangnem: '', ...(p.kapcsolattarto || {}) },
    ai_jelzes: p.ai_jelzes || 'Ezt a szemlét mesterséges intelligencia készítette elő; a hivatkozott cikkek ellenőrzése a vezető feladata.',
  };
}

export async function loadProfile(path) {
  return validateProfile(parse(await readFile(path, 'utf8')));
}

// A vezető bármikor kikapcsolhat vagy szüneteltethet egy ügynököt a profilban:
//   ugynokok.<id>.aktiv: false            – kikapcsolva, amíg vissza nem kapcsolják
//   ugynokok.<id>.szunet_ig: "ÉÉÉÉ-HH-NN" – szünet a megadott nap végéig
export function agentActive(profile, agentId, now = new Date()) {
  const a = profile.ugynokok?.[agentId];
  if (a?.aktiv === false) return false;
  if (a?.szunet_ig && now.getTime() <= Date.parse(`${a.szunet_ig}T23:59:59Z`)) return false;
  return true;
}

// Korlátok (költségvédelem és visszaélés elleni védelem): a kezelőfelületen át történő módosításra érvényesek.
export const LIMITS = { kifejezes: 100, forras: 30 };

export function checkLimits(profile) {
  const k = profile.kulcsszavak;
  const n = k.szervezet.length + k.szemelyek.length + k.temak.length + k.kizaro.length;
  if (n > LIMITS.kifejezes) throw new Error(`Legfeljebb ${LIMITS.kifejezes} kulcsszó adható meg (most: ${n})`);
  const sources = [...profile.forrasok.rss, ...profile.forrasok.sajat];
  if (sources.length + profile.forrasok.hirkereso.length > LIMITS.forras) throw new Error(`Legfeljebb ${LIMITS.forras} forrás adható meg`);
  for (const s of sources) if (!/^https:\/\//.test(s.url)) throw new Error(`Csak https:// forráscím adható meg: ${s.url}`);
  return profile;
}
