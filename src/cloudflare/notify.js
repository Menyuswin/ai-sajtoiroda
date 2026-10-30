// Belső értesítés (docs/18, A3): a riasztás (és kérésre a napi szemle) e-mailben is eljut a vezetőnek.
// SZŰK ÉS BIZTONSÁGOS: csak a profilban megadott vezetői címre mehet (a kimenő kapu ezt eleve kikényszeríti), a Cloudflare
// Email Workers `send_email` kötésén át, amely csak a fiókban igazolt címre küldhet. Sajtónak szóló levelezést NEM végez.
// Az értesítés általános: a címet (tárgyat) és egy hivatkozást tartalmaz, a cikkek és levelek részleteit nem.
export const NOTIFY_KINDS = new Set(['riasztas']);
export const DAILY_NOTIFY_LIMIT = 20;

const enc = new TextEncoder();
const b64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const wrap = (s) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();
const hdrWord = (text) => `=?UTF-8?B?${b64(enc.encode(String(text).replace(/[\r\n]+/g, ' ')))}?=`;
const bare = (addr) => String(addr).replace(/[\r\n<>]/g, '');

// RFC 5322 üzenet, UTF-8 szöveggel (base64 tartalomkódolás: ékezetekkel is biztonságos).
export function buildMime({ from, to, subject, body, messageId, date }) {
  return [
    `From: ${bare(from)}`, `To: ${bare(to)}`, `Subject: ${hdrWord(subject)}`, `Date: ${date.toUTCString()}`, `Message-ID: <${messageId}@${bare(from).split('@')[1] || 'iroda'}>`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(enc.encode(body))),
  ].join('\r\n');
}

// Mailer-burkoló: a meglévő (próba vagy éles) mailer után, ha be van kapcsolva és a kötés megvan, az értesítést is elküldi.
// Hiba esetén NEM akadályozza a rendszert: naplózza.
export function withNotifications({ base, env, profile, log, now }) {
  const on = env.SAJTOIRODA_BELSO_ERTESITES === '1' && !!env.SEND_EMAIL;
  if (!on) return base;
  const kinds = new Set(NOTIFY_KINDS);
  if (env.SAJTOIRODA_ERTESITES_SZEMLE === '1') kinds.add('belso_jelentes');
  return {
    ...base,
    async send(msg) {
      const result = await base.send(msg);
      if (!kinds.has(msg.kind) || String(msg.to).toLowerCase() !== profile.vezeto.email.toLowerCase()) return result;
      try {
        const today = now().toISOString().slice(0, 10);
        const sentToday = (await log.query({ tipus: 'ertesites' })).filter(e => String(e.ido).startsWith(today)).length;
        if (sentToday >= DAILY_NOTIFY_LIMIT) { await log.append({ szereplo: 'rendszer', tipus: 'hiba', tartalom: { hiba: `napi értesítési korlát (${DAILY_NOTIFY_LIMIT}) kimerült` } }); return result; }
        const Ctor = env.EMAIL_MESSAGE_CTOR || (await import('cloudflare:email')).EmailMessage;
        const from = env.SAJTOIRODA_ERTESITES_FELADO || 'iroda@manyai.hu';
        const url = env.SAJTOIRODA_URL || 'https://iroda.manyai.hu';
        const body = `Az iroda értesítést küld: ${msg.subject}\r\n\r\nA részletek az irodában olvashatók (belépés jelmondattal):\r\n${url}\r\n\r\nEz az üzenet automatikus; a részleteket szándékosan nem tartalmazza.`;
        const raw = buildMime({ from, to: profile.vezeto.email, subject: msg.subject, body, messageId: `${now().getTime()}.${Math.random().toString(36).slice(2, 10)}`, date: now() });
        await env.SEND_EMAIL.send(new Ctor(from, profile.vezeto.email, raw));
        await log.append({ szereplo: 'rendszer', tipus: 'ertesites', tartalom: { kind: msg.kind, eredmeny: 'elkuldve' } });
      } catch (e) {
        await log.append({ szereplo: 'rendszer', tipus: 'hiba', tartalom: { hiba: `az e-mail értesítés nem ment el: ${String(e.message || e).slice(0, 200)}` } }).catch(() => {});
      }
      return result;
    },
  };
}
