# Levélhíd (iCloud és általános IMAP)

Az iCloud-postafiókot csak IMAP-on át lehet olvasni, ezt pedig a Cloudflare Workerből nem próbáltuk. A levélhíd egy kis program, amely **a saját gépén** (vagy egy olcsó szerveren) fut, IMAP-pal **csak olvassa** a sajtós mappát, és HTTPS-en továbbadja a leveleket az irodának. Nem töröl, nem helyez át, nem küld levelet.

```
iCloud (IMAP, csak olvasás)  →  levélhíd (az Ön gépén)  →  HTTPS + titok  →  az iroda (POST /hid/<ügyfél>/levelek)
```

## Egyszeri beállítás

1. **Külön sajtós cím vagy mappa.** Az iCloud Levelezésben (icloud.com/mail) hozzon létre egy „Sajtó” mappát, és szabállyal (Beállítások → Szabályok) irányítsa oda a sajtóleveleket. Az iroda **csak ezt a mappát** olvassa, a személyes levelezése nem kerül a rendszerbe.
2. **Alkalmazás-specifikus jelszó.** appleid.apple.com → Bejelentkezés és biztonság → Alkalmazásspecifikus jelszavak → új jelszó „levélhíd” néven. (Ehhez kétlépcsős azonosítás kell.) A fő Apple-jelszavát soha ne adja meg sehová. A jelszó bármikor visszavonható ugyanott.
3. **Híd-titok.** Egy hosszú, véletlen jelszó, amelyet a híd és az iroda közösen ismer: `openssl rand -hex 32`. Az iroda oldalán Workers-titokként: `npx wrangler secret put ICLOUD_HID_TITOK` (a titok neve a profil `postafiok.titok` mezőjében szerepel, az értéke nem).
4. **Az iroda profiljában** (üzemeltetőként, Beállítások → Postafiók): szolgáltató `iCloud`, cím, mappa `Sajtó`, titok neve `ICLOUD_HID_TITOK`.
5. **Cloudflare Access:** a `/hid/*` útvonalra „Bypass” (kihagyás) szabály kell, mert a híd nem ember, és nem tud e-mailes kóddal belépni. A fogadót a híd-titok védi (minden hibára egyformán 401-et ad). Minden más útvonal az Access mögött marad.
6. **Telepítés:** `cd tools/levelhid && npm install`.

## Futtatás

Környezeti változók (érdemes egy `0600` jogú `levelhid.env` fájlba írni, a tárba ne kerüljön):

```
IMAP_FELHASZNALO=az.on.cime@icloud.com
IMAP_JELSZO=az-alkalmazasspecifikus-jelszo
IMAP_MAPPA=Sajtó
IRODA_URL=https://iroda.pelda.hu
UGYFEL_ID=az-ugyfel-azonositoja
HID_TITOK=a-hosszu-veletlen-titok
INTERVALLUM=120          # másodperc; alapértelmezés: 2 perc
```

```bash
set -a; . ./levelhid.env; set +a; node levelhid.mjs          # folyamatosan fut
EGYSZER=1 node levelhid.mjs                                   # egyetlen kör, próbához
```

Ubuntun háttérszolgáltatásként (`~/.config/systemd/user/levelhid.service`):

```ini
[Unit]
Description=AI-sajtóiroda levélhíd
After=network-online.target

[Service]
WorkingDirectory=%h/ai-sajtoiroda/tools/levelhid
EnvironmentFile=%h/levelhid.env
ExecStart=/usr/bin/node levelhid.mjs
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
```

`systemctl --user enable --now levelhid`; naplója: `journalctl --user -u levelhid`. Ha a gép ki van kapcsolva, a levelek nem vesznek el: a híd a következő indításkor a megjegyzett utolsó levél után folytatja (`levelhid-allapot.json`), az iroda pedig a duplikátumot kiszűri.

## Mit nem próbáltunk ki

A híd logikáját (a levél átalakítása, kötegelt küldés, titokkezelés, az iroda fogadója) automatikus tesztek fedik. **A valódi iCloud-kapcsolatot nem próbáltuk**: ehhez az Ön fiókja és alkalmazásjelszava kell. Az első éles körnél érdemes `EGYSZER=1`-gyel indítani, és megnézni az iroda Bejövő nézetét.
