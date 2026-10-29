# A megrendelői kezelőfelület terve (HTML oldal)

*Állapot: **jóváhagyásra vár** (2026-10-29). Kód még nincs; a mögötte lévő Cloudflare-réteg (D1-tár, ütemező) kész, a Worker `fetch` belépője pedig erre vár.*

## 1. A cél

A megrendelő egy böngészőben, számítógépen, egy HTML oldalon kezelje a saját sajtófigyelőjét, **programozói tudás nélkül**: állítsa be a kulcsszavakat, a forrásokat, a címzettet és az időzítést, lássa, mit küldött a rendszer, és kapcsolhassa ki-be. Ez az, amit az értékesítéskor az ügyfél kap a kezébe.

## 2. Hogyan néz ki, mit lát az ügyfél

Egy oldal, négy fül, magyar nyelven:

| Fül | Tartalom | Példa |
|-----|----------|-------|
| **Áttekintés** | Az ügynök állapota (fut / szünetel), az utolsó szemle ideje, a nyitott riasztások száma, és egy jól látható sáv, ha **próbaüzem** van („levél nem megy ki”). Egy „Szünet” kapcsoló. | „Utolsó szemle: ma 07:30, 14 cikk, 1 riasztás.” |
| **Beállítások** | Szervezet neve; kulcsszavak három csoportban (szervezet, személyek, témák) és kizáró szavak; források (hírportálok, kulcsszavas keresések); vörös vonalak; szemle időpontja; a jelentések címzettje. Címkés (tag) beviteli mezők, nem szövegfájl. | A „várólista” szó beírása Entert nyom, és megjelenik címkeként. |
| **Szemlék** | A korábbi szemlék és riasztások listája, megnyitva ugyanúgy, ahogy a levélben megérkeztek. Próbaüzemben itt olvasható, mit küldött volna a rendszer. | „2026-10-29 – Sajtószemle – 14 cikk” |
| **Napló** | Ki mit javasolt és mit döntött (az ügynök javaslatai, az ügyfél módosításai), szűrhetően, CSV-ként letölthetően. | „10-29 09:12 – profil módosítva: kulcsszavak” |

A második ütemben (nem része az elsőnek): **mentés előtti előnézet** („ezekkel a szavakkal ma ennyi cikket találna”), és cikkenkénti **visszajelzés** („releváns / nem releváns”), amely a besorolást javítja.

## 3. Hogyan épül fel

- **Egy Worker szolgálja ki** az oldalt és egy kis API-t (`/api/profil`, `/api/szemlek`, `/api/naplo`). Ugyanaz a Worker, amely az ütemezett futást végzi; külön tárhely vagy szerver nem kell.
- **Az oldal egyetlen HTML + egy JS-fájl**, építési lépés és külső könyvtár nélkül, a manyai.hu-n használt szigorú tartalombiztonsági szabállyal (nincs beágyazott script, minden kimenet `textContent`-tel kerül az oldalra).
- **A beállítás ugyanazon a profilon dolgozik**, amit a motor olvas (`src/cloudflare/d1.js`, `createD1ProfileRepo`). Mentéskor a szerver újra ellenőriz, verziót emel, és naplóz. Érvénytelen profil nem menthető.
- **Leválasztható:** az oldal és az API a csomag része. Ha az ügyfél leválik, a saját Cloudflare-fiókjába telepíti, saját belépéssel.
- **Megjelenés:** semleges, letisztult; a név és az akcentusszín a profilból jön (`megjelenes` blokk), így az ügyfél a saját arculatára igazíthatja.

## 4. Belépés és jogosultság (a legfontosabb döntés)

Ez az oldal dönti el, **kihez megy a jelentés**, tehát aki bejut, az a sajtófigyelés tartalmához fér hozzá. Ezért:

1. **Belépés: Cloudflare Access** (e-mailben kapott egyszeri kód, jelszó nélkül). A Worker a kérésben érkező aláírt azonosítót ellenőrzi, és egy `felhasznalok` táblából (e-mail → ügyfél, szerep) dönti el, ki melyik ügyfél adatát látja. Ügyfél csak a sajátját láthatja. (Saját belépési rendszert nem javaslok építeni: a hozzá kellő levélküldő még nincs kiválasztva, és a hibalehetőség sok.)
2. **Két szerep:**
   - *Vezető* (az ügyfél): szerkeszti a kulcsszavakat, forrásokat, vörös vonalakat, időzítést, szüneteltet.
   - *Üzemeltető* (Ön): ezen felül a címzett-listát, a korlátokat, az AI-módot, és több ügyfelet lát.
3. **Ami az ügyfélnek nem szerkeszthető:** az AI-jelzés törlése (az átláthatóság miatt; legfeljebb kiegészíthető), a promptok, a modellek és a megőrzési szabályok. Ezeket az Ön üzemeltetői szerepe állítja.
4. **A jelentés címzettjének módosítása védett:** a változás naplózódik, a **régi címre értesítés** megy, és az új cím csak megerősítés után lép életbe. (Amíg nincs éles levélküldő, a címzettet csak az üzemeltető szerepkör módosíthatja.)
5. **Korlátok:** legfeljebb 100 kulcsszó és 30 forrás ügyfelenként, csak `https://` forrás-cím. A korlát költségvédelem (minden cikk AI-hívás), és véd a visszaélés ellen, hiszen a Worker az ügyfél által megadott címeket kérdezi le.
6. **Biztonsági minimum:** szerveroldali ellenőrzés minden mentésnél, a kérés eredetének ellenőrzése (CSRF), a bejövő szövegek kimenetkori escape-elése.

## 5. Ütemezés (mérföldkövek)

| # | Lépés | Ellenőrizhető eredmény |
|---|-------|------------------------|
| U1 | API a profilra, szerepekkel és korlátokkal | Tesztek: ügyfél csak a sajátját látja, érvénytelen mentés elutasítva, a címzett-váltás védett |
| U2 | Az oldal: Beállítások és Áttekintés fül | Böngészőben (automatikus képernyőfelvétellel is ellenőrizve) szerkeszthető és menthető a nulladik ügyfél profilja |
| U3 | Szemlék és Napló fül | A próbalevelek olvashatók, a napló szűrhető és exportálható |
| U4 | Cloudflare Access bekötése és első telepítés | **Az Ön Cloudflare-fiókjában**, az Ön jóváhagyásával; élő oldal próbaüzemben |
| U5 | (második ütem) előnézet és cikk-visszajelzés | |

Az U1–U3 a mostani környezetben megépíthető és tesztelhető. Az U4-hez az Ön Cloudflare-hozzáférése kell.

## 6. Amit jóvá kell hagynia

1. **Belépés:** Cloudflare Access (ajánlott), vagy saját belépés később.
2. **Szerepek és ami az ügyfélnek nem szerkeszthető:** a 4. pont szerint? (Különösen: az AI-jelzés nem törölhető, és a címzett-váltás védett.)
3. **A négy fül és az első ütem tartalma:** elég az Áttekintés, Beállítások, Szemlék, Napló; az előnézet és a visszajelzés a második ütemben jön?
4. **Megjelenés:** semleges, a névvel és színnel testreszabható (ajánlott), vagy a manyai.hu arculata?
5. **Nyelv:** először csak magyar?
