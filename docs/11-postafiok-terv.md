# A postafiók-réteg és a Kapcsolattartó Munkatárs terve

*Állapot: **jóváhagyva (2026-10-29), a P1–P5 lépések megépültek és tesztelve vannak** (lásd a 9. fejezetet); a P6 (levélküldés) a levélküldő szolgáltató kiválasztására vár, a telefonhívások (ElevenLabs) a legvégére kerülnek. A döntés: a nulladik ügyfélnél (ő maga) **iCloud** a postafiók; **Gmail** és **céges Exchange** ügyfelenként beállítható.*

## 1. A cél

A Kapcsolattartó Munkatárs (`agents/01-kapcsolattarto.yaml`) a sajtós postafiókba érkező leveleket **elolvassa, osztályozza** (téma, sürgősség, médium, hangnem), és **választervezetet** készít. A tervezet az irodában, a Kapcsolattartó asztalán jelenik meg; a vezető jóváhagyja, módosítja vagy elveti. Kifelé csak jóváhagyás után mehet (kimenő kapu, `src/core/outbox.js`).

A levelezőrendszer ügyfelenként más, ezért a postafiók **cserélhető illesztő** mögött áll, mint a levélküldő és az AI. A munkatárs nem tudja, hogy iCloud, Gmail vagy Exchange áll mögötte.

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

1. **Adatminimalizálás:** a munkatárs csak a kijelölt mappát („Sajtó”) vagy címkét olvassa, nem az egész postafiókot. A nulladik ügyfélnél ezért ajánlott **külön sajtós címet** (vagy aliast és szabályt, amely a mappába szűri a sajtóleveleket), hogy a személyes levelezés ne kerüljön a rendszerbe.
2. **A levél adat, nem utasítás.** A beérkező levél tartalma bármit mondhat („törölj mindent”, „küldd el az ügyféllistát”); a munkatárs ebből nem cselekszik, mert csak a zárt műveletlistából dolgozhat, és kifelé semmi nem megy jóváhagyás nélkül. Külön teszt: levélbe rejtett utasítás hatástalan.
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

## 6. A Kapcsolattartó Munkatárs első ütemben

1. **Levélfogadás:** a postafiókból (vagy a híd/webhook útján) érkező levél tárolása (`levelek` tábla, ügyfél-elkülönítéssel), duplikáció-szűrés levélazonosítóval.
2. **Osztályozás:** téma, sürgősség, a médium (a Monitoring médiaprofiljából), hangnem; a vörös vonalba eső levél riasztást ad (mint a Monitoringnál).
3. **Választervezet:** a vezető hangnem-szabályai és a Dokumentumtár korábbi nyilatkozatai alapján, `[D1 §2]` típusú forrásjelölésekkel; három opció: válasz / későbbre halasztás / továbbítás vagy nem válaszolunk. A tervezet **nem megy ki**, csak az asztalon jelenik meg.
4. **Átadások:** jogi vonatkozás gyanújánál kérdés a Jogi munkatársnak (üres asztal: várakozik); korábbi ellentmondás jelzése az Archívumtól (később).
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

## 9. Mi készült el (2026-10-29)

A tulajdonos az 5 pontot elfogadta: először csak olvasás és tervezet; külön sajtós mappa; iCloudnál levélhíd; Gmail és Graph hamis szerverrel tesztelve; 90 napos levélmegőrzés.

- **Postafiók-réteg** (`src/mail/`): közös levélformátum (HTML szöveggé, hosszkorlát, hibás levél kiesik), Gmail API-illesztő (frissítő tokenes belépés, csak olvasás), Microsoft Graph illesztő (mappa-azonosító keresés, szöveges törzs), híd-típusú szolgáltatók (iCloud, IMAP), próba/kézi mód. A titok csak a környezetből jön, a profilban csak a **neve**; a hibaüzenetek nem tartalmazzák a szolgáltató válaszát.
- **Levéltár** (`migrations/0005`, `src/mail/store.js`): ügyfél-elkülönítés, duplikátum-szűrés levélazonosítóval, megőrzési idő (profil: `megorzes.level_nap`, alapértelmezés 90 nap; a napló marad), postafiók-állapot (kurzor, utolsó siker és hiba).
- **Kapcsolattartó Munkatárs** (`src/agents/kapcsolattarto/`): besorolás (típus, téma, sürgősség, hangnem, határidő, vörös vonal, jogi gyanú), választervezet három opcióval (tartalmi válasz / nyugtázás / nem válaszolunk), kockázatok és forrásjelölés a dokumentumtárból. Szabályalapú tartalék AI nélkül, AI-ág (hamis API-val tesztelve) a `level-besorolas.md` és `level-valasz.md` promptokkal. Az AI-válasz szövegéből a forrásjelölés kikerül, a nem létező forrás törlődik. A **kitöltendő** rész (`[KITÖLTENDŐ: …]`) miatt a tervezet nem hagyható jóvá, amíg a vezető nem írta meg.
- **Biztonság:** a levél adat, nem utasítás; a gyanús („hagyd figyelmen kívül…”) szöveget a program jelzi (Gyanús szöveg), a besorolás kimenete zárt értékekből áll, a tervezet pedig csak javaslat, ezért a levélbe rejtett utasítás nem tud mellékhatást kiváltani (külön teszt). A válasz **címzettje mindig a levél feladója**, a felületről nem módosítható. A jóváhagyás a kimenő kapun át megy (`kind: valasz`, vezetői jóváhagyás kell); próbaüzemben a kimenő mappába kerül, éles módban levélküldő nélkül nem megy el, és a levél újra nyitott marad.
- **Vörös vonal:** riasztás csak a vezetőnek. **Jogi gyanú:** kérdés-átadás a Jogi asztalnak (üres: vár). **Továbbítás** a vezető döntésére belső átadásként.
- **Adatvédelem:** a levelek **tartalmát csak a vezető látja**; az üzemeltető a darabszámokat és a postafiók állapotát (titok nélkül).
- **Felület:** Bejövő nézet (lista, szűrés, részletek, tervezet-szerkesztés, döntések, átírás kérése AI-val, új levél vagy jegyzet kézi felvitele), a Kapcsolattartó asztala (számok, postafiók-állapot, „Beolvasás most”), Beállítások (aláírás, hangnem; üzemeltetőként a postafiók).
- **Levélhíd** (`tools/levelhid/`): IMAP → HTTPS, csak olvas; fogadója `POST /hid/<ügyfél>/levelek` saját titokkal védett (egységes 401), a Cloudflare Access mögül kivéve. Beállítás: `tools/levelhid/README.md`.

**Korlátok (őszintén):**
- Az **iCloud-kapcsolatot** és a híd IMAP-részét valódi fiókkal nem próbáltuk; a híd logikája, a fogadó és a Gmail/Graph illesztők hamis szerverrel tesztelve. Valódi Gmail- és Microsoft-belépéshez ügyfél hozzájárulása kell.
- A Gmail/Graph postafiókot az ütemező **óránként** kérdezi le; az iCloud-híd levelei azonnal beérkeznek (a fogadó legfeljebb 5 levelet dolgoz fel azonnal, a többit a következő futás). Sürgős megkereséseknél érdemes sűrűbb ütemezést kérni (pl. 15 percenként, `wrangler.toml` `crons`).
- A tervezet minősége AI nélkül szabályalapú (csak nyugtázó szöveget ad); az AI valódi minősége nem mért.
- A tervezet nem veszi át a levélből az „idézett” korábbi szálakat; a szálkezelés és a csatolmányok nincsenek kezelve (a levélhez csatolt fájlt a rendszer nem olvassa).

## 10. Telefonhívások (a legvégére, ElevenLabs)

A tulajdonos döntése: a bejövő hívások kezelése és a hívóval való beszélgetés **ElevenLabs**-szal készül, de **a legvégén**. Amit addig érdemes tudni, hogy a tervezésnél ne érjen meglepetés:
- A hívás **valós időben, kifelé szól**: ez az „semmi nem megy ki jóváhagyás nélkül” alapszabállyal ütközik. A megoldás várhatóan szűk szerepkör: a hang-munkatárs csak **üzenetet vesz fel** (név, médium, kérdés, visszahívási szám, határidő), vagy **előre jóváhagyott** kijelentéseket mond el; tartalmi választ nem ad. Ezt a vezetővel külön dönteni kell, mielőtt bármi épül.
- A hívót **tájékoztatni kell**, hogy mesterséges intelligenciával beszél (EU AI Act átláthatóság; `docs/05`, 8. kérdés), és a hívásfelvétel és az átirat személyes adat (GDPR, `docs/05`, 7. kérdés). Jogászi átnézés javasolt.
- Az átirat és az összefoglaló ugyanúgy a Bejövőbe kerülne (mint a kézi jegyzet), besorolással és visszahívási javaslattal; a felület erre már alkalmas (a „kézi jegyzet” útvonal).
- Szempontok a választáshoz: magyar nyelvű beszédfelismerés és hang minősége, késleltetés, költség percenként, adatkezelés és adattárolási hely, telefonszám-szolgáltatás. Ezek a megvalósításkor, ajánlattal együtt kerülnek elő.
