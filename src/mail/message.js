// A beérkező levél közös alakja. Minden illesztő (Gmail, Graph, levélhíd, kézi felvitel) ezt adja vissza.
// A levél szövege ADAT: itt csak megtisztítjuk és korlátozzuk, értelmezni (utasításként) soha nem fogjuk.
export const MAIL_LIMITS = { textChars: 20000, subjectChars: 300, perBatch: 50, bodyBytes: 1048576 };
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&apos;': "'" };

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, m => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => (n > 31 && n < 65536 ? String.fromCharCode(Number(n)) : ' '))
    .replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// "Kiss Éva <eva@pelda.hu>" → { nev, cim }
export function parseAddress(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(?:"?([^"<]*?)"?\s*)?<([^>]+)>$/);
  const cim = (m ? m[2] : s).trim().toLowerCase();
  return { nev: (m?.[1] || '').trim().slice(0, 120), cim };
}

// Érvényes, tárolható levelet ad, vagy null-t (hibás, címzett nélküli vagy üres levelet nem fogadunk be).
export function normalizeMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const azonosito = String(raw.azonosito ?? '').trim().slice(0, 300);
  const from = raw.felado && typeof raw.felado === 'object' ? { nev: raw.felado.nev || '', cim: String(raw.felado.cim || '').toLowerCase() } : parseAddress(raw.felado);
  if (!azonosito || !EMAIL_RE.test(from.cim)) return null;
  const nev = String(raw.felado_nev || from.nev || '').trim().slice(0, 120);
  const textRaw = raw.szoveg != null ? String(raw.szoveg) : htmlToText(raw.html);
  const szoveg = textRaw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, MAIL_LIMITS.textChars);
  const targy = String(raw.targy ?? '').replace(/\s+/g, ' ').trim().slice(0, MAIL_LIMITS.subjectChars) || '(nincs tárgy)';
  if (!szoveg && targy === '(nincs tárgy)') return null;
  const t = Date.parse(raw.ido);
  return { azonosito, felado: from.cim, felado_nev: nev, targy, szoveg: szoveg || '(a levélnek nincs szövege)', ido: Number.isFinite(t) ? new Date(t).toISOString() : null };
}
