# A postafiók-réteg és a Kapcsolattartó Ügynök terve

*Állapot: **terv, jóváhagyásra vár.** A döntés (2026-10-29, a tulajdonos): a nulladik ügyfélnél (ő maga) **iCloud** a postafiók; **Gmail** és **céges Exchange** ügyfelenként beállítható legyen.*

## 1. A cél

A Kapcsolattartó Ügynök (`agents/01-kapcsolattarto.yaml`) a sajtós postafiókba érkező leveleket **elolvassa, osztályozza** (téma, sürgősség, médium, hangnem), és **választervezetet** készít. A tervezet az irodában, a Kapcsolattartó asztalán jelenik meg; a vezető jóváhagyja, módosítja vagy elveti. Kifelé csak jóváhagyás után mehet (kimenő kapu, `src/core/outbox.js`).

A levelezőrendszer ügyfelenként más, ezért a postafiók **cserélhető illesztő** mögött áll, mint a levélküldő és az AI. Az ügynök nem tudja, hogy iCloud, Gmail vagy Exchange áll mögötte.

## 2. Az illesztők

| Illesztő | Hogyan kapcsolódik | Hitelesítés | Megjegyzés |
|----------|-------------------|-------------|------------|
| **iCloud** (nulladik ügyfél) | IMAP: `imap.mail.me.com:993` (TLS); küldés később SMTP `smtp.mail.me.com:587` | Az Apple-fiókhoz létrehozott **alkalmazás-specifikus jelszó** (kétlépcsős azonosítás kell hozzá); OAuth nincs | A legegyszerűbb, de a legnagyobb a jelszó kezelésének felelőssége |
| **Gmail** | Gmail API (olvasás, piszkozat); vagy IMAP | OAuth 2.0 (ügyfél adja meg a hozzáférést); IMAP-nál alkalmazásjelszó | Az OAuth „korlátozott” hatókörökhöz Google-ellenőrzés kell, ha sok külső ügyfelet szolgálunk ki; egy-két ügyfélnél a próbaüzemi mód elég. Kerülendő a teljes postafiók-hatókör, elég az olvasás és a piszkozat |
| **Exchange / Microsoft 365** | Microsoft Graph API | OAuth 2.0 alkalmazás-regisztrációval; az ügyfél IT-adminja adja meg a hozzájárulást, lehet egyetlen postafiókra korlátozni | Az Exchange Online az egyszerű jelszavas IMAP-ot kivezette, ezért Graph kell. Helyi (on-premises) Exchange: EWS vagy IMAP, ügyfélenként egyedi, csak igény esetén |
| **Általános IMAP** | IMAP + TLS | Alkalmazásjelszó | Tartalék minden más szolgáltatóra |
| **Próba-postafiók** | Fájlból olvas (`test/fixtures/`) | nincs | A tesztek és a bemutató ezt használják; semmi sem hagyja el a gépet |

**Közös felület (kódban):** `listNew(utolsoAzonosito)`, `getMessage(id)`, `saveDraft(valasz)` (később), `send(valasz)` (később, csak a kimenő kapun át). Az első ütemben csak **olvasás** van; a levélküldés a levélküldő szolgáltató kiválasztása után (nyitott döntés, `docs/05`).

## 3. Beállítás ügyfelenként

A profilban (`monitoring/profil-sablon.yaml`) új szakasz:

```yaml
postafiok:
  szolgaltato: icloud        # icloud | gmail | exchange | imap | proba
  cim: sajto@pelda.hu
  mappa: "Sajtó"            # csak ezt a mappát/címkét olvassa
  titok: postafiok_nulladik  # a jelszó vagy token NEM a profilban van, hanem a titokkezelőben
```

- **A titok sosem kerül a profilba, a naplóba vagy az AI elé.** Cloudflare Workers-titokként (`wrangler secret`) tárolódik, a profil csak a nevére hivatkozik. Az üzemeltető állítja be, a vezető nem látja.
- A szolgáltató és a cím csak az **üzemeltető** módosíthatja (mint a jelentés címzettje).
- Az iroda Beállítások nézetében a vezető látja, melyik postafiók van bekötve és mikor olvasott utoljára (a titkot nem).

## 4. Adatvédelem és biztonság

1. **Adatminimalizálás:** az ügynök csak a kijelölt mappát („Sajtó”) vagy címkét olvassa, nem az egész postafiókot. A nulladik ügyfélnél ezért ajánlott **külön sajtós címet** (vagy aliast és szabályt, amely a mappába szűri a sajtóleveleket), hogy a személyes levelezés ne kerüljön a rendszerbe.
2. **A levél adat, nem utasítás.** A beérkező levél tartalma bármit mondhat („törölj mindent”, „küldd el az ügyféllistát”); az ügynök ebből nem cselekszik, mert csak a zárt műveletlistából dolgozhat, és kifelé semmi nem megy jóváhagyás nélkül. Külön teszt: levélbe rejtett utasítás hatástalan.
3. **A levélből nem jöhet automatikus válasz.** Automatikus nyugtázás sincs; minden kimenő levél a vezetőn át megy.
4. **Személyes adat:** a levelek személyes adatot tartalmaznak (név, telefonszám). Megőrzési idő a profilban (javaslat: 90 nap a levélszöveg, a napló marad); a törlés a levélmásolatot és a szövegrészeket is törli. A GDPR-kérdések (`docs/05`, 7. kérdés) jogásszal tisztázandók.
5. **AI felé:** a levélszöveg az AI-szolgáltatóhoz kerülhet; a felületen jelezni kell. A „Nem küldhető AI-nak” elv itt is érvényes (feladó- vagy mappaszinten).
6. **Csak olvasás az első ütemben:** a rendszernek kezdetben nincs joga törölni, áthelyezni vagy elküldeni levelet. Ez az OAuth-hatókörökkel és a jelszó jogaival is korlátozható (Gmail: csak olvasás; Graph: `Mail.Read`).

## 5. Hol fut (az őszinte rész)

- A Cloudflare Worker TCP-kapcsolatot nyithat, de az IMAP-könyvtárak többsége Node-ra épül, és ezt **még nem próbáltuk** Workerben. A Gmail API és a Microsoft Graph sima HTTPS, ezek biztosan működnek Workerből.
- Az **iCloud** csak IMAP-pal érhető el. Két út:
  - **A) Make** (ez a „vegyes” döntés lényege): Make-forgatókönyv figyeli az iCloud-fiókot (a Make-nek IMAP-modulja van), és a leveleket webhookon át adja a Workernek. A Make fizetős csomagja nélkül ez korlátozott (1000 művelet/hó), ezért ez csak később, előfizetéssel.
  - **B) Kis levélhíd** (egy Node-folyamat bárhol, pl. a tulajdonos gépén vagy olcsó szerveren), amely IMAP-pal olvas, és a Workernek HTTPS-en küldi a leveleket. Független a Make-től és a Cloudflare korlátaitól.
- Javaslat: az **illesztő felületét és a próba-postafiókot** építjük meg most (ez hálózat nélkül tesztelhető), a **Gmail API**-t és a **Graph**-ot HTTPS-illesztőként (hamis szerverrel tesztelve), az iCloudhoz pedig a **levélhidat** (B), mert az az Ön esete, és nem függ fizetős előfizetéstől. A Make-es út (A) ugyanarra a webhook-felületre csatlakozik, így később bekapcsolható.

## 6. A Kapcsolattartó Ügynök első ütemben

1. **Levélfogadás:** a postafiókból (vagy a híd/webhook útján) érkező levél tárolása (`levelek` tábla, ügyfél-elkülönítéssel), duplikáció-szűrés levélazonosítóval.
2. **Osztályozás:** téma, sürgősség, a médium (a Monitoring médiaprofiljából), hangnem; a vörös vonalba eső levél riasztást ad (mint a Monitoringnál).
3. **Választervezet:** a vezető hangnem-szabályai és a Dokumentumtár korábbi nyilatkozatai alapján, `[D1 §2]` típusú forrásjelölésekkel; három opció: válasz / későbbre halasztás / továbbítás vagy nem válaszolunk. A tervezet **nem megy ki**, csak az asztalon jelenik meg.
4. **Átadások:** jogi vonatkozás gyanújánál kérdés a Jogi ügynöknek (üres asztal: várakozik); korábbi ellentmondás jelzése az Archívumtól (később).
5. **Felület:** a Kapcsolattartó asztala: bejövő levelek listája (állapottal: új / tervezet kész / jóváhagyva / elvetve), levél megnyitása, tervezet szerkesztése, jóváhagyás. A jóváhagyott tervezet egyelőre **a kimenő mappába** kerül (száraz mód), amíg a levélküldő szolgáltató nincs kiválasztva.
6. **Telefonhívások:** külön döntés (`docs/05`, 6. kérdés); első ütemben csak kézi jegyzet vagy átirat felvétele az asztalon.

## 7. Ütemezés

| # | Lépés | Ellenőrizhető eredmény |
|---|-------|------------------------|
| P1 | Postafiók-illesztő felület, próba-postafiók, profil-szakasz, titokhivatkozás, `levelek` tábla | Tesztek: ügyfél-elkülönítés, duplikáció, titok nem kerül naplóba |
| P2 | Kapcsolattartó: osztályozás és választervezet (szabályalapú tartalék + AI-ág), forrásjelölés | Tesztek: levélbe rejtett utasítás hatástalan, hamis hivatkozás törlődik |
| P3 | Asztal és API a felületen: bejövő, tervezet, jóváhagyás (száraz mód) | Böngészős kipróbálás |
| P4 | Gmail API és Microsoft Graph illesztő (HTTPS, hamis szerverrel tesztelve) | Tesztek hamis szerverrel |
| P5 | iCloud levélhíd (IMAP → HTTPS), beállítási útmutató | Ellenőrzés valódi iCloud-fiókkal csak az Ön hozzáférésével |
| P6 | (levélküldő kiválasztása után) a jóváhagyott válasz tényleges küldése | |

P1–P4 itt megépíthető; P5 a valódi iCloud-fiókhoz a tulajdonos közreműködését kéri (alkalmazásjelszó), P6 a levélküldő döntésére vár.

## 8. Amit jóvá kell hagynia

1. **Először csak olvasás és tervezet**, kimenő levél nélkül (P1–P3)? (Ajánlott.)
2. **Külön sajtós cím vagy mappa** a nulladik ügyfélnél, hogy a személyes levelezés ne kerüljön be? (Ajánlott.)
3. **iCloud: levélhíd (B)** az első út, a Make-es út később? (Ajánlott.)
4. **Gmail API és Graph** előbb a próba-illesztővel és hamis szerverrel, valódi fiókkal csak ügyfél érkezésekor?
5. **Megőrzési idő:** a levélszöveg 90 nap, a napló marad?
