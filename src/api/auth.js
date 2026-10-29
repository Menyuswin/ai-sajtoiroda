// Belépés: Cloudflare Access aláírt azonosítójának (JWT) ellenőrzése. Zárt alapértelmezés:
// ha sem az Access, sem a (kizárólag fejlesztői) próbabelépés nincs beállítva, senki nem lép be.
const keyCache = new Map(); // teamDomain → { at, keys }
const KEY_TTL_MS = 60 * 60 * 1000;

const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(teamDomain, fetchImpl, nowMs) {
  const hit = keyCache.get(teamDomain);
  if (hit && nowMs - hit.at < KEY_TTL_MS) return hit.keys;
  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Access-kulcsok nem érhetők el');
  const keys = (await res.json()).keys || [];
  keyCache.set(teamDomain, { at: nowMs, keys });
  return keys;
}

export function clearKeyCache() { keyCache.clear(); }

// Visszaadja a kisbetűs e-mail-címet, vagy null-t, ha az azonosító érvénytelen.
export async function verifyAccessJwt(token, { teamDomain, aud, fetchImpl = fetch, nowMs = Date.now() }) {
  try {
    const [h, p, sig] = String(token || '').split('.');
    if (!h || !p || !sig) return null;
    const header = b64urlToJson(h);
    const payload = b64urlToJson(p);
    if (header.alg !== 'RS256') return null;
    const jwk = (await getKeys(teamDomain, fetchImpl, nowMs)).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const auds = [].concat(payload.aud || []);
    if (!auds.includes(aud)) return null;
    if (payload.iss !== `https://${teamDomain}`) return null;
    const nowS = nowMs / 1000;
    if (typeof payload.exp !== 'number' || payload.exp < nowS) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > nowS + 60) return null;
    return payload.email ? String(payload.email).toLowerCase() : null;
  } catch { return null; }
}

// { email } | { status, hiba }
export async function identify(request, env, { fetchImpl, nowMs } = {}) {
  if (env.SAJTOIRODA_DEV_AUTH === '1' && env.SAJTOIRODA_DEV_USER) return { email: String(env.SAJTOIRODA_DEV_USER).toLowerCase() };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return { status: 503, hiba: 'A belépés nincs beállítva, ezért az oldal zárva van.' };
  const email = await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, fetchImpl, nowMs });
  return email ? { email } : { status: 401, hiba: 'Belépés szükséges.' };
}
