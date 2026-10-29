#!/usr/bin/env node
// Levélhíd: IMAP-postafiók (pl. iCloud) → AI-sajtóiroda. Csak OLVAS: nem töröl, nem helyez át, nem küld levelet.
// Beállítás környezeti változókkal (lásd README.md). Futtatás: node levelhid.mjs   (folyamatosan, INTERVALLUM másodpercenként)
import { readFile, writeFile } from 'node:fs/promises';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { toPayload, sendBatches } from './core.mjs';

const env = process.env;
const need = (k) => { if (!env[k]) { console.error(`Hiányzik a(z) ${k} beállítás.`); process.exit(2); } return env[k]; };
const cfg = {
  host: env.IMAP_HOST || 'imap.mail.me.com', port: Number(env.IMAP_PORT || 993), user: need('IMAP_FELHASZNALO'), pass: need('IMAP_JELSZO'),
  mailbox: env.IMAP_MAPPA || 'Sajtó', url: need('IRODA_URL'), tenant: need('UGYFEL_ID'), token: need('HID_TITOK'),
  interval: Number(env.INTERVALLUM || 120), state: env.ALLAPOT_FAJL || './levelhid-allapot.json',
};
if (!cfg.url.startsWith('https://')) { console.error('Az IRODA_URL csak https:// lehet.'); process.exit(2); }

const readState = async () => { try { return JSON.parse(await readFile(cfg.state, 'utf8')); } catch { return {}; } };

async function once() {
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
  await client.connect();
  const lock = await client.getMailboxLock(cfg.mailbox, { readOnly: true });
  try {
    const st = await readState();
    const uidValidity = String(client.mailbox.uidValidity);
    const last = st.uidValidity === uidValidity ? st.lastUid || 0 : 0; // új UID-világ: elölről, a duplikátumot az iroda szűri
    const since = last ? undefined : new Date(Date.now() - 7 * 86400000); // első futás: az elmúlt 7 nap
    const levelek = []; let maxUid = last;
    for await (const msg of client.fetch(last ? { uid: `${last + 1}:*` } : { since }, { uid: true, source: true }, { uid: true })) {
      if (msg.uid <= last) continue; // a `N:*` tartomány az utolsó levelet mindig visszaadja
      maxUid = Math.max(maxUid, msg.uid);
      levelek.push(toPayload(await simpleParser(msg.source), { account: cfg.user, mailbox: cfg.mailbox, uid: msg.uid, uidValidity }));
    }
    if (levelek.length) {
      const r = await sendBatches(levelek, cfg);
      console.log(new Date().toISOString(), `elküldve: ${levelek.length} levél`, JSON.stringify(r));
    }
    await writeFile(cfg.state, JSON.stringify({ uidValidity, lastUid: maxUid }));
  } finally { lock.release(); await client.logout(); }
}

for (;;) {
  try { await once(); } catch (e) { console.error(new Date().toISOString(), 'hiba:', e.message); } // a hibaüzenet nem tartalmaz jelszót
  if (env.EGYSZER === '1') break;
  await new Promise(r => setTimeout(r, cfg.interval * 1000));
}
