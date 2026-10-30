// Saját belépés (jelmondat) a Cloudflare Access helyett, egyetlen felhasználóra (ha az Access nincs beállítva).
// A jelmondat Workers-titok (SAJTOIRODA_JELMONDAT, legalább 20 karakter), a felhasználó e-mail-címe beállítás (SAJTOIRODA_BELEPES_EMAIL),
// amelynek szerepét az iroda táblája adja. A munkamenet aláírt, böngészőből nem olvasható süti; a jelmondat cseréje minden munkamenetet érvénytelenít.
export const COOKIE = 'iroda_session';
export const SESSION_TTL_S = 12 * 3600;
export const MIN_PASSPHRASE = 20;
export const MAX_FAILS = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
const equal = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export const sessionLogin = (env) => !!env.SAJTOIRODA_JELMONDAT && !!env.SAJTOIRODA_BELEPES_EMAIL;
export const passphraseUsable = (env) => String(env.SAJTOIRODA_JELMONDAT || '').length >= MIN_PASSPHRASE;

// A megadott jelmondat egyezése, állandó idejű összehasonlítással.
export async function passphraseOk(given, secret) {
  return equal(await hmac(secret, `jelmondat|${String(given ?? '')}`), await hmac(secret, `jelmondat|${secret}`));
}

export async function issueSession({ secret, email, nowMs }) {
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_S;
  return `${exp}.${await hmac(secret, `munkamenet|${String(email).toLowerCase()}|${exp}`)}`;
}

export function readCookie(header, name = COOKIE) {
  for (const part of String(header || '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return v.join('='); }
  return null;
}

// A beállított e-mail-cím, ha a süti érvényes; különben null.
export async function verifySession(cookieHeader, { secret, email, nowMs }) {
  const v = readCookie(cookieHeader);
  const m = v && v.match(/^(\d{9,11})\.([A-Za-z0-9_-]{20,})$/);
  if (!m || Number(m[1]) < nowMs / 1000) return null;
  return equal(await hmac(secret, `munkamenet|${String(email).toLowerCase()}|${m[1]}`), m[2]) ? String(email).toLowerCase() : null;
}

export const setCookie = (value, maxAge = SESSION_TTL_S) => `${COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
export const clearCookie = () => `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;

// Találgatás elleni lassítás: 15 percen belül 5 hibás kísérlet után 15 percre zár (az egész belépésre, mert egyetlen felhasználó van).
export function createThrottle(db, now = () => new Date()) {
  const KEY = 'jelmondat';
  return {
    async locked() {
      const r = await db.prepare('SELECT zarolva_ig FROM belepes_proba WHERE kulcs = ?').bind(KEY).first();
      return r?.zarolva_ig && r.zarolva_ig > now().toISOString() ? Math.ceil((Date.parse(r.zarolva_ig) - now().getTime()) / 60000) : 0;
    },
    async fail() {
      const t = now(), r = await db.prepare('SELECT * FROM belepes_proba WHERE kulcs = ?').bind(KEY).first();
      const fresh = !r || t.getTime() - Date.parse(r.ablak_kezdet) > WINDOW_MS;
      const hibak = fresh ? 1 : r.hibak + 1;
      const lock = hibak >= MAX_FAILS ? new Date(t.getTime() + LOCK_MS).toISOString() : null;
      await db.prepare('INSERT INTO belepes_proba (kulcs, hibak, ablak_kezdet, zarolva_ig) VALUES (?, ?, ?, ?) ON CONFLICT (kulcs) DO UPDATE SET hibak = excluded.hibak, ablak_kezdet = excluded.ablak_kezdet, zarolva_ig = excluded.zarolva_ig')
        .bind(KEY, lock ? 0 : hibak, fresh || lock ? t.toISOString() : r.ablak_kezdet, lock).run();
      return { hibak, zarolva: !!lock };
    },
    async ok() { await db.prepare('DELETE FROM belepes_proba WHERE kulcs = ?').bind(KEY).run(); },
  };
}
