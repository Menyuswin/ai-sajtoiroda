// A levélhíd magja: IMAP-ból kiolvasott leveleket HTTPS-en továbbít az irodának (POST /hid/<ügyfél>/levelek).
// Függőség nélküli, hogy tesztelhető legyen; az IMAP-kapcsolatot a levelhid.mjs adja hozzá.
export const BATCH = 25;

// A mailparser által adott levélből az iroda levélformátuma. Az azonosítót a postafiók+mappa+UID adja, így ugyanaz a levél kétszer nem kerül be.
export function toPayload(parsed, { account, mailbox, uid, uidValidity }) {
  const from = parsed.from?.value?.[0];
  return {
    azonosito: `imap:${account}:${mailbox}:${uidValidity}:${uid}`,
    felado: from ? `${from.name || ''} <${from.address}>` : '',
    targy: parsed.subject || '',
    szoveg: parsed.text || (parsed.html ? String(parsed.html) : ''),
    ido: parsed.date ? new Date(parsed.date).toISOString() : null,
  };
}

// Kötegekben küldi a leveleket. Hibánál kivételt dob, és a hívó NEM léptetheti előre a kurzort.
export async function sendBatches(levelek, { url, tenant, token, fetchImpl = fetch }) {
  const out = { fogadott: 0, duplikatum: 0, ervenytelen: 0, feldolgozva: 0 };
  for (let i = 0; i < levelek.length; i += BATCH) {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/hid/${encodeURIComponent(tenant)}/levelek`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ levelek: levelek.slice(i, i + BATCH) }),
    });
    if (!res.ok) throw new Error(`Az iroda elutasította a küldést: HTTP ${res.status}${res.status === 401 ? ' (hibás titok vagy ügyfélazonosító)' : ''}`);
    const r = await res.json();
    for (const k of Object.keys(out)) out[k] += r[k] || 0;
  }
  return out;
}
