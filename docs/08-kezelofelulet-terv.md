# A kezelőfelület terve: az iroda és a munkatársak asztalai

*Állapot: **jóváhagyva az ajánlott beállításokkal (2026-10-29); az U1–U4 lépések megépültek és tesztelve vannak** (lásd a 8. fejezetet). A telepítés (U5) a tulajdonos Cloudflare-hozzáférésére vár.*

## 1. A cél

A megrendelő egy böngészőben, számítógépen, **egy irodát lát**: minden munkatársnak saját asztala van. Az asztalnál utasítást ad a munkatársnak, megnézi az elkészített munkáját, és elolvassa a jelentéseit, programozói tudás nélkül. A felület egy külön domént (például `sajtoiroda.ugyfel.hu`) kaphat, és később önálló alkalmazás is épülhet rá.

## 2. A nézetek (javaslat)

*Az „asztal” képletes (a tulajdonos pontosítása): minden AI-munkatárs egy-egy asztalnál „ül”, ott végzi a feladatát. A felületen ez a munkatárs saját munkaterülete: ide ad utasítást a vezető, itt látja a munkát és a jelentéseket.*

| Nézet | Mit lát és mit tud tenni |
|-------|--------------------------|
| **1. Az iroda** (főoldal) | A munkatársak kártyákként egy irodai alaprajzon. Állapotjelző fény (dolgozik / vár / szünetel / kikapcsolva), az utolsó tevékenység egy sorban, és egy ki-be kapcsoló. A kártyákat **húzással mozgathatja** és elrendezheti; az elrendezés mentődik. A még nem bevezetett munkatársak (Kapcsolattartó, Felkészítő, …) halványan, „zárt asztalként” látszanak, a bevezetési sorrend szerint. |
| **2. A munkatárs asztala** | Három sáv egy oldalon: **Utasítás** (üzenetablak: ide ír a munkatársnak, itt látja az előzményeket), **Munka** (amin a munkatárs épp dolgozik, a mai találatok, a trendek), **Jelentések** (a korábbi szemlék és riasztások listája, megnyitva ugyanúgy, ahogy a levélben megérkeztek). Az asztalhoz tartozik a **Beállítások** (kulcsszavak, források, vörös vonalak, időzítés, címzett) és az **munkatárs naplója**. |
| **3. Jelentések** (összesítő) | Az összes munkatárs jelentése egy helyen, időrendben, szűrhetően; letölthető. Ez az, amit a vezető reggel átfut. |

*Megjegyzés:* a tulajdonos leírásában szerepelt egy „három oldal” kifejezés, amelynek jelentése nem tisztázott. Ez a fejezet ezért egy javaslat az oldalak szétosztására; a darabszám nem kötött. A „mozgatni a munkatársakat” pontosítása (2026-10-29): az **irányítást** jelenti: feladatot adni a munkatársaknek, beszámoltatni őket, és rákérdezni egy adott anyagra (például egy sajtóválasz-tervezetre vagy egy esemény kommunikációs tervére). Ez az asztal alapműködése; az asztalkártyák húzogatása ezen felül kényelmi funkció.

## 3. Az utasítások működése (az alapszabályok szerint)

Az üzenetablakba természetes magyar nyelven lehet írni. A munkatárs **nem hajt végre közvetlenül semmit**, hanem javaslatot készít, amit a vezető jóváhagy:

1. A vezető ír: *„Figyeld a várólista témát is, és a péntek esti szemlét hagyd ki.”*
2. A munkatárs értelmezi, és **javaslatot** mutat: „Hozzáadom a »várólista« témát a figyelt kifejezésekhez; a péntek esti szemle kimarad. Jóváhagyod?”
3. A vezető jóváhagy vagy elvet; az eredmény **naplóba** kerül (javaslat + döntés).

Az utasítások **csak egy zárt, ellenőrzött műveletlistából** hajthatók végre: kifejezés hozzáadása / elvétele, forrás hozzáadása / elvétele, szünet kezdete és vége, időpont módosítása, „készíts jelentést erről az időszakról / témáról” (csak olvasó művelet a tárolt cikkeken). Amit a munkatárs nem ért, arra visszakérdez; amit nem tud (például levelet küldeni valakinek), azt megmondja. Kifelé szóló üzenet ezen a csatornán **nem** küldhető: azt a kimenő kapu és a jóváhagyás védi.

Példák a Monitoring asztalán:
- *„Mi történt a héten az ápolóhiány körül?”* → olvasó jelentés a tárolt cikkekből, hivatkozásokkal.
- *„A Magyar Nemzetet ne figyeld.”* → javaslat: forrás elvétele.
- *„Szóljon azonnal, ha a vezérigazgató nevét említik.”* → javaslat: vörös vonal felvétele.

## 4. Felépítés: API az alapja, a felület csak egy kliens

- **Minden funkció egy API-n át érhető el** (`/api/...`: iroda, munkatársak, utasítások, javaslatok, jelentések, napló). A HTML oldal ennek az egyik kliense. Ezért később külön alkalmazás ugyanazt az API-t használhatja változtatás nélkül.
- **Az alkalmazás útja:** először a HTML oldal telepíthető alkalmazásként (PWA) viselkedik, ez további fejlesztés nélkül adja az „app” érzetet; a natív mobilalkalmazás később ugyanerre az API-ra épül.
- **Külön domén:** az oldal és az API ugyanabból a Workerből szolgálódik ki, ezért az ügyfél saját doménje egyszerűen rámutat. A kérés `Host` fejléce alapján dől el, melyik ügyfél irodáját látja (`domenek` tábla: domén → ügyfél). Az Access-szabály doménenként külön. *Ellenőrizendő a megvalósításkor:* a Cloudflare saját doménhez csatolás feltételei (a domén DNS-e jellemzően a Cloudflare-nél kell legyen).
- **Az oldal egyetlen HTML + JS, építési lépés nélkül**, szigorú tartalombiztonsági szabállyal (nincs beágyazott script, minden kimenet `textContent`-tel kerül az oldalra). Az irodai elrendezés egyszerű CSS-rács, a húzás a böngésző beépített képességeivel (külső könyvtár nélkül) működik.
- **Megjelenés:** semleges; a név, a logó és az akcentusszín a profil `megjelenes` blokkjából jön, hogy az ügyfél a saját arculatára igazíthassa.
- **Leválasztható:** az oldal, az API és a Worker a kiadható csomag része (docs/06, 4.8).

## 5. Belépés és jogosultság

Az oldal dönti el, kihez megy a jelentés, tehát aki bejut, az a sajtófigyelés tartalmához fér hozzá.

1. **Belépés: Cloudflare Access** (e-mailben kapott egyszeri kód, jelszó nélkül). A Worker az aláírt azonosítót ellenőrzi, és a `felhasznalok` táblából (e-mail → ügyfél, szerep) dönti el, ki mit lát. Ügyfél csak a sajátját láthatja.
2. **Két szerep:** *Vezető* (az ügyfél): utasít, jóváhagy, beállít, szüneteltet. *Üzemeltető* (Ön): ezen felül a címzett-listát, a korlátokat, az AI-módot állítja, és több ügyfelet lát.
3. **Az ügyfélnek nem szerkeszthető:** az AI-jelzés törlése (az átláthatóság miatt legfeljebb kiegészíthető), a promptok, a modellek, a megőrzési szabályok.
4. **A jelentések címzettjének módosítása védett:** naplózódik, a régi címre értesítés megy, az új cím megerősítés után lép életbe. (Amíg nincs éles levélküldő, csak az üzemeltető módosíthatja.)
5. **Korlátok:** legfeljebb 100 kulcsszó és 30 forrás ügyfelenként, csak `https://` forráscím. Költségvédelem és visszaélés elleni védelem.
6. **Biztonsági minimum:** szerveroldali ellenőrzés minden mentésnél, a kérés eredetének ellenőrzése (CSRF), a bejövő szövegek escape-elése, az utasítások csak a zárt műveletlistára képezhetők le.

## 6. Ütemezés (mérföldkövek)

| # | Lépés | Ellenőrizhető eredmény |
|---|-------|------------------------|
| U1 | API: iroda, munkatársak, profil, jelentések, napló, szerepek, korlátok | Tesztek: ügyfél csak a sajátját látja, érvénytelen mentés elutasítva, címzett-váltás védett |
| U2 | Az iroda és a Monitoring asztala: Munka, Jelentések, Beállítások (utasítás még nélkül) | Böngészőben (automatikus képernyőfelvétellel is ellenőrizve) a nulladik ügyfél irodája, mozgatható kártyákkal, olvasható szemlékkel |
| U3 | Az utasítás-üzenetablak: javaslat → jóváhagyás → végrehajtás → napló, a zárt műveletlistával | Tesztek: minden műveletre javaslat, jóváhagyás nélkül nincs változás, ismeretlen utasításra visszakérdezés |
| U4 | Összesítő jelentések nézet, napló-export | |
| U5 | Cloudflare Access, első telepítés, külön domén | **Az Ön Cloudflare-fiókjában**, az Ön jóváhagyásával; élő iroda próbaüzemben |
| U6 | (későbbi) telepíthető alkalmazás (PWA), majd natív app | Ugyanazon az API-n |

Az U1–U4 a mostani környezetben megépíthető és tesztelhető. Az U5-höz az Ön Cloudflare-hozzáférése és a domén kell.

## 7. Amit jóvá kell hagynia

1. **A nézetek felosztása** (2. fejezet), és hogy a „mozgatás” az elrendezés húzogatása-e.
2. **Az utasítások modellje:** javaslat → vezetői jóváhagyás → végrehajtás, zárt műveletlistával (3. fejezet). Ez egyben a korábbi „csevegőfelület” döntésnek a megvalósítása.
3. **Belépés:** Cloudflare Access (ajánlott).
4. **Szerepek és a nem szerkeszthető elemek** (5. fejezet), különösen: az AI-jelzés nem törölhető, és a címzett-váltás védett.
5. **Megjelenés:** semleges, a névvel, logóval és színnel testreszabható (ajánlott), vagy a manyai.hu arculata?
6. **Nyelv:** először csak magyar?
7. **A domén:** van-e már kiválasztott doménje a nulladik ügyfélhez, vagy aldomént használjunk (például a manyai.hu alatt)?

## 8. Mi készült el (2026-10-29)

- **Az iroda:** nyolc asztal (a Monitoring dolgozik, a többi üres, a bevezetési sorrend szerint), húzható és billentyűvel mozgatható kártyák, felhasználónként mentett elrendezés; keskeny képernyőn lista.
- **Az asztal:** Utasítás (üzenetablak), Munka (mai cikkek, hangnem, trendek, legutóbbi találatok), Jelentések (anyagok, olvasatlanság jelzéssel); szüneteltetés kapcsolóval.
- **Feladat – anyag – rákérdezés:** az utasítás zárt műveletlistából fut (javaslat → jóváhagyás → végrehajtás → napló; az olvasó „jelentést kérek” művelet azonnal fut). Minden elkészült anyag megnyitható, és rá lehet kérdezni; a válasz csak az anyag cikkeiből jöhet, a nem létező hivatkozást a rendszer törli.
- **Beállítások:** címkés kulcsszavak, források, vörös vonalak, időzítés; szerepek (vezető / üzemeltető), korlátok, csak `https://` forrás; a címzett és az AI-jelzés csak az üzemeltetőnek módosítható, minden változás naplózott.
- **Napló:** szűrhető, CSV-ben letölthető (képletinjekció ellen védve).
- **Belépés:** Cloudflare Access aláírásának ellenőrzése (tesztelve helyben generált kulccsal); zárt alapértelmezés: beállítás nélkül senki nem lép be. Külön domén: a `Host` alapján ügyfélhez rendelve.
- **Biztonság:** szigorú tartalombiztonsági szabály (nincs beágyazott script), CSRF-védelem, ügyfél-elkülönítés tesztelve, minden szöveg `textContent`-tel kerül az oldalra.
- **Ellenőrzés:** 51 automatikus teszt, plusz a böngészős végpontok közötti kipróbálás (`test/e2e/iroda.e2e.mjs`, Chromium): betöltés, húzás és mentés, utasítás, jóváhagyás, rákérdezés, beállítások mentése, napló, mobil nézet; konzolhiba és szabálysértés nélkül.
- **Kipróbálható helyben:** `npm run iroda` (kitalált adatokkal, memóriában; `--uzemelteto` az üzemeltetői nézethez).

**Őszinte korlátok:**
- A bemutatóban az utasításértelmezés és a rákérdezés **szabályalapú**, nem AI; az AI-s ág (zárt műveletlistára kényszerítve, hamis API-val tesztelve) a Claude-kulcs megadása után kapcsolható be, és a valódi minőségét még nem mértük.
- A többi hét munkatárs asztala üres; az általános modell (anyag, állapot, rákérdezés) már kész, de a tervezet-típusú anyagok jóváhagyási folyamata (például választervezet) az adott munkatárssal együtt készül.
- Az éles Cloudflare-telepítés és a Cloudflare Access bekötése nem történt meg (U5); a Worker csomagja szárazon összeáll.
- A böngészőben a időmező a gép nyelvi beállítása szerint jelenik meg (például „AM/PM”).

## 9. A telepítés lépései (U5, az Ön hozzáférésével)

1. `wrangler d1 create ai-sajtoiroda`, az azonosítót a `wrangler.toml`-ba; `wrangler d1 migrations apply ai-sajtoiroda`.
2. A nulladik ügyfél profilja és hozzáférése: `node src/cli.js profil-sql --profile monitoring/nulladik-ugyfel.yaml`, `node src/cli.js hozzaferes-sql --email … --ugyfel manyai-zoltan --szerep uzemelteto`; a kimenő SQL-ek futtatása `wrangler d1 execute`-tal.
3. Cloudflare Access alkalmazás a doménre; a `ACCESS_TEAM_DOMAIN` és `ACCESS_AUD` értékét a `wrangler.toml`-ba.
4. `wrangler deploy`. Az `SAJTOIRODA_DEV_AUTH` maradjon `0`.
5. Ha levélhidat használ (iCloud, IMAP; `tools/levelhid/README.md`): a Cloudflare Access alkalmazáson a `/hid/*` útvonalra „Bypass” szabály kell, és a híd-titok Workers-titokként: `wrangler secret put <a profil postafiok.titok neve>`. A fogadó saját titokkal védett; minden más útvonal az Access mögött marad.
6. Gmail vagy Exchange postafiók esetén a titok (JSON) is Workers-titok: Gmail `{client_id, client_secret, refresh_token}` (csak olvasási hatókör), Exchange `{tenant, client_id, client_secret}` (alkalmazásregisztráció `Mail.Read` joggal, lehetőleg egyetlen postafiókra korlátozva). A címzett postafiók és a mappa az iroda Beállításaiban adható meg (üzemeltetőként).
7. Külön domén esetén: `node src/cli.js domen-sql --domen … --ugyfel …`.
