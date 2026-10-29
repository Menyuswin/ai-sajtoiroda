# A kezelőfelület terve: az iroda és az ügynökök asztalai

*Állapot: **jóváhagyásra vár** (2026-10-29, átdolgozva a tulajdonos második leírása után). Kód még nincs; a mögötte lévő Cloudflare-réteg (D1-tár, ütemező) kész.*

## 1. A cél

A megrendelő egy böngészőben, számítógépen, **egy irodát lát**: minden ügynöknek saját asztala van. Az asztalnál utasítást ad az ügynöknek, megnézi az elkészített munkáját, és elolvassa a jelentéseit, programozói tudás nélkül. A felület egy külön domént (például `sajtoiroda.ugyfel.hu`) kaphat, és később önálló alkalmazás is épülhet rá.

## 2. A nézetek (javaslat)

| Nézet | Mit lát és mit tud tenni |
|-------|--------------------------|
| **1. Az iroda** (főoldal) | Az ügynökök kártyákként egy irodai alaprajzon. Állapotjelző fény (dolgozik / vár / szünetel / kikapcsolva), az utolsó tevékenység egy sorban, és egy ki-be kapcsoló. A kártyákat **húzással mozgathatja** és elrendezheti; az elrendezés mentődik. A még nem bevezetett ügynökök (Kapcsolattartó, Felkészítő, …) halványan, „zárt asztalként” látszanak, a bevezetési sorrend szerint. |
| **2. Az ügynök asztala** | Három sáv egy oldalon: **Utasítás** (üzenetablak: ide ír az ügynöknek, itt látja az előzményeket), **Munka** (amin az ügynök épp dolgozik, a mai találatok, a trendek), **Jelentések** (a korábbi szemlék és riasztások listája, megnyitva ugyanúgy, ahogy a levélben megérkeztek). Az asztalhoz tartozik a **Beállítások** (kulcsszavak, források, vörös vonalak, időzítés, címzett) és az **ügynök naplója**. |
| **3. Jelentések** (összesítő) | Az összes ügynök jelentése egy helyen, időrendben, szűrhetően; letölthető. Ez az, amit a vezető reggel átfut. |

*Megjegyzés:* a tulajdonos leírásában szerepelt egy „három oldal” kifejezés, amelynek jelentése nem tisztázott. Ez a fejezet ezért egy javaslat az oldalak szétosztására (iroda, asztal, összesítő jelentések); a darabszám nem kötött, és bármikor módosítható. Ugyanígy nyitott, hogy a „mozgatni az ügynököket” az elrendezés húzogatását jelenti-e (ahogy fent leírtam).

## 3. Az utasítások működése (az alapszabályok szerint)

Az üzenetablakba természetes magyar nyelven lehet írni. Az ügynök **nem hajt végre közvetlenül semmit**, hanem javaslatot készít, amit a vezető jóváhagy:

1. A vezető ír: *„Figyeld a várólista témát is, és a péntek esti szemlét hagyd ki.”*
2. Az ügynök értelmezi, és **javaslatot** mutat: „Hozzáadom a »várólista« témát a figyelt kifejezésekhez; a péntek esti szemle kimarad. Jóváhagyod?”
3. A vezető jóváhagy vagy elvet; az eredmény **naplóba** kerül (javaslat + döntés).

Az utasítások **csak egy zárt, ellenőrzött műveletlistából** hajthatók végre: kifejezés hozzáadása / elvétele, forrás hozzáadása / elvétele, szünet kezdete és vége, időpont módosítása, „készíts jelentést erről az időszakról / témáról” (csak olvasó művelet a tárolt cikkeken). Amit az ügynök nem ért, arra visszakérdez; amit nem tud (például levelet küldeni valakinek), azt megmondja. Kifelé szóló üzenet ezen a csatornán **nem** küldhető: azt a kimenő kapu és a jóváhagyás védi.

Példák a Monitoring asztalán:
- *„Mi történt a héten az ápolóhiány körül?”* → olvasó jelentés a tárolt cikkekből, hivatkozásokkal.
- *„A Magyar Nemzetet ne figyeld.”* → javaslat: forrás elvétele.
- *„Szóljon azonnal, ha a vezérigazgató nevét említik.”* → javaslat: vörös vonal felvétele.

## 4. Felépítés: API az alapja, a felület csak egy kliens

- **Minden funkció egy API-n át érhető el** (`/api/...`: iroda, ügynökök, utasítások, javaslatok, jelentések, napló). A HTML oldal ennek az egyik kliense. Ezért később külön alkalmazás ugyanazt az API-t használhatja változtatás nélkül.
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
| U1 | API: iroda, ügynökök, profil, jelentések, napló, szerepek, korlátok | Tesztek: ügyfél csak a sajátját látja, érvénytelen mentés elutasítva, címzett-váltás védett |
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
