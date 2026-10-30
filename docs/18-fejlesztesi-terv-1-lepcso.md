# Fejlesztési terv, 1. lépcső: megbízható működés a levélhíd előtt

*Állapot: **folyamatban**: az A4 elkészült (2026-10-30), a többi jóváhagyott sorrendben következik (A5, A2, A3). A tulajdonos jóváhagyta az 1. lépcső irányát („futási korlátok, értesítés, életjel, napló-adattakarékosság”); ez a dokumentum a megvalósítás pontos terve. Az egyes pontok alatt a döntésre váró kérdések állnak.*

## 0. Miért ez a négy dolog, és miért ebben a sorrendben

Az éles rendszer ma látszólag működik, de négy hiány miatt **csendben is elromolhat**: a futás az ingyenes csomag korlátain megbukhat anélkül, hogy bárki észrevenné; a riasztás csak azt éri el, aki éppen az irodát nézi; ha leáll az ütemező, nincs, aki szóljon; és a napló olyan személyes adatot őriz, amit a levelek már rég elfeledtek volna. Sorrend (a kockázat és a méret szerint): **A5 → A4 → A2 → A3**. Az A5 kicsi, és most olcsó, mert éles levél még nincs a naplóban; az A4 mutatja meg, mi történik valójában; az A2 ennek mérésére épül; az A3 kívülről érinti a rendszert, ezért utolsó.

## A5. Személyes adat a naplóban

**Mi a baj:** a „levél fogadva” bejegyzés a feladó e-mail-címét és a levél tárgyát tárolja 36 hónapig, miközben a levél maga 90 nap után törlődik. A napló hozzáfűzős és az adatbázis védi a módosítástól, ezért *utólag nem tisztítható*; a hibát tehát most kell kijavítani, amíg élesben még nincs levél.

**Megoldás:**
- A napló a levélről csak ezt tárolja: **azonosító, a feladó címtartománya (domain), a tárgy és a szöveg karakterszáma, a forrás**. A teljes cím és a tárgy a levéltárban él, amely a 90 napos megőrzést követi.
- Ugyanez az elv a többi bejegyzésre: egy átnézés (a `log.append` hívások és a `tartalom` mezők), hogy nincs-e még személyes adat (név, e-mail, telefon, a levél szövege) a naplóban. Ahol van, azonosítóra cseréljük.
- **Teszt:** egy teszt, amely feldolgoz egy levelet, és ellenőrzi, hogy a napló egyetlen bejegyzése sem tartalmazza a feladó teljes címét, nevét vagy tárgyát.

**Döntés:** nincs, ez egyértelmű.

## A4. Életjel és forrásállapot

**Cél:** egy pillantással látszódjon, hogy él-e a rendszer, és mi a baja, ha valami nem megy.

**Megoldás:**
- Új tábla (`0011`): `futas_allapot` ügyfelenként: utolsó futás kezdete és vége, sikeres volt-e, hány másodpercig tartott, hány külső kérést indított, hány cikket dolgozott fel, és **forrásonként** az utolsó sikeres lekérés ideje, a kapott cikkek száma és az utolsó hiba.
- **Iroda nézet:** a fejlécben egy kis jelvény: „Utolsó futás: 12 perce, rendben” (zöld) vagy „Utolsó futás: 5 órája” (piros). A Beállításokban új **„Források állapota”** táblázat: melyik hírportál működik, melyik nem, mióta.
- **Egészség-végpont** (`/api/egeszseg`, belépés nélkül, **semmi tartalom, csak „ok” vagy „késik” és a futás kora percben**): hogy egy külső, ingyenes figyelő (pl. UptimeRobot) kívülről is jelezhessen, ha az ütemező leáll. Ennek **nincs adatkiszivárgási kockázata**: a hivatkozás nem árul el ügyfélnevet.
- **Őszinte korlát:** ha maga az ütemező áll le teljesen, belülről nem lehet szólni; erre való a külső figyelő és az életjel az oldalon.
- **Teszt:** futás után az állapot rögzül; hibás forrás megjelenik; a végpont „késik”-et ad 3 óra csend után.

**Döntés (Öné):** szeretné a külső figyelőt (ingyenes, de külső szolgáltatás)? Az ajánlásom: igen, a végpont semmit nem árul el.

## A2. Futási korlátok védelme

**Mi a baj (és amit még nem tudunk):** az ingyenes Workers csomagnak futásonként szigorú korlátai vannak a külső kérések számára és a CPU-időre (az aktuális értékeket a Cloudflare dokumentációjában kell ellenőrizni, és az A4 mérése mutatja meg a valóságot). Ma AI-val minden cikk külön AI-hívást jelentene, legfeljebb 80-at futásonként, plusz a hírforrások lekérései.

**Megoldás három rétegben:**
1. **Mérés előbb:** az A4 futásnaplója megmutatja a tényleges külső kérésszámot és időt (ezek nélkül találgatnánk).
2. **Kötegelt besorolás:** egy AI-hívás **8 cikket** sorol be (új prompt-változat, a hibás válasz esetén a hiányzó cikkek egyenként újra). Ez a hívások számát nagyjából nyolcadára csökkenti, és az AI-költséget is mérsékli. A besorolás eredménye és ellenőrzése (idézet, vörös vonal) változatlan.
3. **Keret és szeletelés:** egy beállítható **külső kérési keret** futásonként (alapérték: a csomag korlátánál kisebb); ha elfogy, a futás tisztán leáll, naplózza, mi maradt, és a következő óra folytatja (a rendszer ma is így kezeli a 80 cikkes határt). Semmi nem vész el, és semmi nem marad félbe.
- **Ha ez sem elég:** a döntés a **Workers Paid** csomag (kb. 5 USD/hó) lesz, amelynek korlátjai sokkal tágabbak; ezt a mérés alapján, nem előre javaslom.
- **Teszt:** kötegelés hibás AI-válasszal; a keret betartása; a félbehagyott futás folytatása.

**Döntés (Öné):** egyetért-e azzal, hogy előbb mérünk, és csak szükség esetén váltunk fizetős csomagra?

## A3. Értesítés a riasztásokról

**Mi a baj:** a vörös vonalas riasztás ma a kimenő kapun át menne a vezetőnek, de levélküldő nincs, ezért **csak az irodában látszik**. Ez a legnagyobb hiány az éles használatban.

**Amit szándékosan nem teszünk:** nem kötünk be általános levélküldést. A sajtónak szóló levelek küldése (a levélküldő szolgáltató kiválasztása) külön, későbbi döntés marad. Itt egy **sokkal szűkebb, biztonságosabb dologról** van szó: az iroda értesítést küld **kizárólag a vezetőnek, a saját, igazolt címére**.

**Megoldás (javaslat):** a **Cloudflare Email Routing / Email Workers** küldési lehetősége: a Worker egy `send_email` kötéssel levelet küldhet olyan címre, amelyet előbb igazolt a fiókban. Nem kell külső szolgáltató, nem kér kártyát, és *technikailag sem tud másnak küldeni*, mint az igazolt címnek.
- A kimenő kapu szabálya változatlan: belső jelentés és riasztás csak a vezető címére mehet; minden más jóváhagyást kér.
- Új beállítás: `SAJTOIRODA_BELSO_ERTESITES=1`, független az éles küldés kapcsolójától (`SAJTOIRODA_LIVE`), amely továbbra is `0` marad.
- Mi megy: **riasztás** (mindig), és kérésre a **napi szemle**. Napi korlát (pl. legfeljebb 20 értesítés), hogy hiba vagy zajos nap esetén se árassza el.
- Tartalom: a riasztás szövege és egy hivatkozás az irodára; **a cikkek részletei és a levelek tartalma nem kerülnek az értesítésbe**, hogy a postafiókban se legyen bizalmas adat.
- **Alternatíva:** PWA-értesítés (Web Push). Androidon és asztali gépen jó; iPhone-on csak a kezdőképernyőre telepített weboldalnál (iOS 16.4 fölött) működik, és több a megvalósítási munka. Ajánlásom: először az e-mail, később a Web Push kiegészítésként.
- **Teszt:** csak a vezető címére küld; idegen címre megtagadja; a napi korlát betartása; a kikapcsolt kapcsoló nem küld.

**Döntések (Öné):**
1. Be van-e kapcsolva az **Email Routing** a manyai.hu doménen a Cloudflare-ben (Domains → manyai.hu → Email → Email Routing)? Ha nincs, bekapcsolom a lépéseit leírom; ingyenes.
2. Melyik cím legyen a feladó (javaslat: `iroda@manyai.hu`), és melyik a címzett (az igazolt `zoltan.manyai@icloud.com`)? A címzettnek egyszeri megerősítő levelet kell jóváhagynia.
3. A napi szemle is menjen-e e-mailben, vagy csak a riasztás?

## Munkaterv és ellenőrzés

| Lépés | Tartalom | Ellenőrzés |
|-------|----------|------------|
| 1 | A5: napló-adattakarékosság + teszt | `npm test`, a napló átnézése |
| 2 | A4: `0011` migráció, futásállapot, életjel, forrásállapot, `/api/egeszseg` | Tesztek + az Iroda és a Beállítások nézet böngészős próbája |
| 3 | A2: kötegelt besorolás, külső kérési keret | Tesztek hamis AI-val; az éles futás mérése |
| 4 | A3: belső értesítés (Email Workers) | Tesztek; **éles próba egy saját címre küldött riasztással** |
| 5 | Dokumentáció: `CLAUDE.md`, `docs/17`, a két PDF frissítése | — |

**Telepítés:** minden lépés után `git pull`, `npx wrangler d1 migrations apply ai-sajtoiroda --remote` (az A4 miatt), `npx wrangler deploy`; az A3-nál a `wrangler.toml` és az Email Routing beállítása Önnel közösen.

**Nem változik:** a „semmi nem megy ki jóváhagyás nélkül” szabály; a próbaüzem (`SAJTOIRODA_LIVE=0`); az AI kikapcsolt állapota (az AI-kulcs külön lépés).

## Mi készült el: A4 (2026-10-30)

A sorrendet az éles első futás naplója módosította (a Google News 503-at, a Telex 403-at, az Infostart 404-et adott), ezért az A4 került előre.
- **Életjel:** minden Monitoring-futás rögzíti az idejét, időtartamát, a külső kérések számát, a lekért és az új cikkek számát (`migrations/0011_allapot.sql`, `src/cloudflare/allapot-store.js`). Az Iroda fejlécében jelvény: „Futás: 12 perce” (zöld), „Késik” (180 perc csend után) vagy „Hiba a futásban” (piros); a jelvényre kattintva a Beállításokra jut.
- **Forrásállapot:** a Beállításokban új „Források állapota” kártya: forrásonként rendben/hiba, a cikkek száma, az utolsó sikeres idő, és hiba esetén **érthető magyarázat** (pl. „A portál elutasítja az automatikus lekérést (403)”).
- **Források próbája:** gomb, amely a Cloudflare-ből kéri le az összes forrást (azt mutatja, amit az ütemező is lát); percenként egyszer kérhető. Az üzemeltető is látja és használhatja (a hírforrások nem bizalmasak).
- **Egészség-végpont:** `GET /api/egeszseg` belépés nélkül; csak `ok` / `kesik` / `indul` és a futás kora percben, ügyfélnév és tartalom nélkül; késésnél 503, hogy külső figyelő (pl. UptimeRobot) jelezhessen.
- **Tesztek:** `test/allapot.test.js` (5 teszt). **Nem része:** a külső figyelő beállítása (az Ön döntése), a mérés eredményére épülő A2 (kötegelés, keret).
