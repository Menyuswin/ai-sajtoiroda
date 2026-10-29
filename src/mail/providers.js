// Postafiók-illesztők. Közös felület:  mailbox.pull({ since }) → { messages: [nyers levelek], cursor }
// Csak OLVASÁS: az illesztő nem töröl, nem helyez át és nem küld levelet.
//   proba    – nincs hálózat; a levelek kézzel vagy a próbákban érkeznek
//   gmail    – Gmail API (OAuth, gmail.readonly hatókör)
//   exchange – Microsoft Graph (Exchange Online, Mail.Read)
//   icloud, imap – az IMAP-ot a levélhíd olvassa (tools/levelhid), és HTTPS-en küldi be a leveleket; itt nincs lekérdezés
// A titok (token, kulcs) a környezetből jön a profil `postafiok.titok` neve alapján, JSON szövegként; sosem kerül naplóba.
import { htmlToText } from './message.js';

export class MailboxError extends Error {}

const b64url = (s) => { const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };

function readSecret(env, name) {
  const raw = env?.[name];
  if (!raw) throw new MailboxError(`A postafiók titka (${name}) nincs beállítva.`);
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new MailboxError(`A postafiók titka (${name}) nem érvényes JSON.`); }
}

async function json(fetchImpl, url, init, what) {
  let res;
  try { res = await fetchImpl(url, init); } catch { throw new MailboxError(`${what}: a szolgáltató nem érhető el.`); }
  if (!res.ok) throw new MailboxError(`${what}: HTTP ${res.status}`); // a válasz törzse nem kerül az üzenetbe (token vagy személyes adat lehet benne)
  return res.json();
}

// ---- Gmail
function gmailBody(payload) {
  const parts = [];
  (function walk(p) { if (!p) return; if (p.parts) p.parts.forEach(walk); else if (p.body?.data) parts.push({ mime: p.mimeType, data: p.body.data }); })(payload);
  const plain = parts.find(x => x.mime === 'text/plain');
  if (plain) return b64url(plain.data);
  const html = parts.find(x => x.mime === 'text/html');
  return html ? htmlToText(b64url(html.data)) : '';
}
const header = (payload, name) => (payload?.headers || []).find(x => x.name.toLowerCase() === name)?.value || '';

export function createGmailMailbox({ config, secret, fetchImpl = fetch, limit = 25 }) {
  return {
    name: 'gmail',
    async pull({ since = null } = {}) {
      const tok = await json(fetchImpl, 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: secret.client_id, client_secret: secret.client_secret, refresh_token: secret.refresh_token, grant_type: 'refresh_token' }) }, 'Gmail-belépés');
      const auth = { headers: { authorization: `Bearer ${tok.access_token}` } };
      const after = since ? ` after:${Math.floor(Date.parse(since) / 1000)}` : ' newer_than:7d';
      const q = `label:"${config.mappa.replace(/"/g, '')}"${after}`;
      const list = await json(fetchImpl, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${encodeURIComponent(q)}`, auth, 'Gmail-lista');
      const messages = [];
      for (const m of list.messages || []) {
        const g = await json(fetchImpl, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=full`, auth, 'Gmail-levél');
        messages.push({ azonosito: `gmail:${g.id}`, felado: header(g.payload, 'from'), targy: header(g.payload, 'subject'), szoveg: gmailBody(g.payload), ido: new Date(Number(g.internalDate)).toISOString() });
      }
      const newest = messages.map(x => x.ido).sort().pop();
      return { messages, cursor: newest || since };
    },
  };
}

// ---- Exchange Online (Microsoft Graph)
export function createGraphMailbox({ config, secret, fetchImpl = fetch, limit = 25 }) {
  return {
    name: 'exchange',
    async pull({ since = null } = {}) {
      const tok = await json(fetchImpl, `https://login.microsoftonline.com/${encodeURIComponent(secret.tenant)}/oauth2/v2.0/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: secret.client_id, client_secret: secret.client_secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }) }, 'Exchange-belépés');
      const auth = { headers: { authorization: `Bearer ${tok.access_token}`, prefer: 'outlook.body-content-type="text"' } };
      const user = encodeURIComponent(config.cim);
      const folders = await json(fetchImpl, `https://graph.microsoft.com/v1.0/users/${user}/mailFolders?$filter=${encodeURIComponent(`displayName eq '${config.mappa.replace(/'/g, "''")}'`)}&$select=id`, auth, 'Exchange-mappák');
      const folder = folders.value?.[0]?.id;
      if (!folder) throw new MailboxError(`Az Exchange-fiókban nincs „${config.mappa}” nevű mappa.`);
      const filter = since ? `&$filter=${encodeURIComponent(`receivedDateTime gt ${since}`)}` : '';
      const res = await json(fetchImpl, `https://graph.microsoft.com/v1.0/users/${user}/mailFolders/${encodeURIComponent(folder)}/messages?$top=${limit}&$orderby=receivedDateTime asc&$select=id,subject,from,receivedDateTime,body${filter}`, auth, 'Exchange-levelek');
      const messages = (res.value || []).map(m => ({ azonosito: `exchange:${m.id}`, felado: m.from?.emailAddress ? `${m.from.emailAddress.name || ''} <${m.from.emailAddress.address}>` : '', targy: m.subject, szoveg: m.body?.contentType === 'html' ? htmlToText(m.body.content) : m.body?.content || '', ido: m.receivedDateTime }));
      return { messages, cursor: messages.length ? messages[messages.length - 1].ido : since };
    },
  };
}

// A levélhíd-szolgáltatók nem kérdezhetők le a Workerből: a híd küldi a leveleket (POST /hid/<ügyfél>/levelek).
const BRIDGED = new Set(['icloud', 'imap']);
export const isBridged = (config) => !!config && BRIDGED.has(config.szolgaltato);

// A profil beállításából illesztő. Ha a szolgáltató híd- vagy próba-típusú, null (nincs lekérdezés).
export function createMailbox(config, { env = {}, fetchImpl = fetch } = {}) {
  if (!config || config.szolgaltato === 'proba' || BRIDGED.has(config.szolgaltato)) return null;
  const secret = readSecret(env, config.titok);
  if (config.szolgaltato === 'gmail') {
    for (const k of ['client_id', 'client_secret', 'refresh_token']) if (!secret[k]) throw new MailboxError(`A Gmail-titokból hiányzik: ${k}`);
    return createGmailMailbox({ config, secret, fetchImpl });
  }
  if (config.szolgaltato === 'exchange') {
    for (const k of ['tenant', 'client_id', 'client_secret']) if (!secret[k]) throw new MailboxError(`Az Exchange-titokból hiányzik: ${k}`);
    return createGraphMailbox({ config, secret, fetchImpl });
  }
  throw new MailboxError(`Ismeretlen postafiók-szolgáltató: ${config.szolgaltato}`);
}
