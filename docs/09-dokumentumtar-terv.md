# A dokumentumtár terve

*Állapot: **jóváhagyva az ajánlott beállításokkal (2026-10-29), a D1–D3 lépések megépültek és tesztelve vannak**; a D4 (telepítés, R2 bekapcsolása) a tulajdonos Cloudflare-hozzáférésére vár. Lásd a 8. fejezetet.*

## 1. A cél

A megrendelő dokumentumokat tölt fel (sajtóanyagok, korábbi nyilatkozatok, belső irányelvek, háttéranyagok, kérdés-válasz listák, eseménytervek), és **a munkatársak ezekből dolgoznak**. Példák:

- A Kapcsolattartó választervezetet ír, és figyel rá, hogy ne mondjon ellent a korábbi nyilatkozatoknak.
- A Felkészítő háttéranyagot és kérdés-válasz listát készít a feltöltött anyagokból.
- A Monitoring a szervezet saját dokumentumaiból javaslatot tesz a figyelt kulcsszavakra (a vezető jóváhagyja).
- Bármelyik munkatársnél rá lehet kérdezni: „Mit mond a sajtóirányelvünk erről?”

Ez lényegében az **Archívum- és Tudásmenedzsment Munkatárs** alapja (`agents/06-archivum.yaml`), de közös szolgáltatásként épül meg: az Archívum munkatárs később erre ül rá, a többi munkatárs pedig már most használhatja.

## 2. Hogyan néz ki a felületen

- **Új menüpont: „Dokumentumtár”** az irodában (az iratszekrény). Fájl behúzásával vagy kiválasztásával tölthető fel. A lista kereshető; minden dokumentumnál látszik a cím, a kategória, a feltöltő, a dátum és hogy mely munkatársak használhatják.
- **Kategóriák:** korábbi nyilatkozat, belső irányelv, háttéranyag, sajtóanyag, kérdés-válasz, egyéb.
- **Hatókör:** dokumentumonként megadható, mely munkatársak használhatják (alapértelmezés: mindegyik).
- **„Nem küldhető AI-nak” jelölés:** az ilyen dokumentumot a rendszer csak tárolja és kereshetővé teszi, de a tartalmát nem adja át AI-szolgáltatónak.
- **Az asztalnál:** az utasításhoz dokumentum csatolható („A *sajtóirányelv* alapján…”), és minden elkészült anyag alatt látszik, mely dokumentumok részleteire támaszkodott, hivatkozással a pontos helyre.

## 3. Felépítés

| Elem | Javaslat |
|------|----------|
| Eredeti fájl tárolása | Cloudflare R2 (objektumtár), ügyfél-azonosítóval kezdődő kulccsal; letöltéskor mindig „csatolmányként”, soha nem a felületen belül megnyitva |
| Szöveg kinyerése | Első ütemben: txt, md, csv, **docx** és **szöveges PDF**. Később: beolvasott (szkennelt) PDF és képek (felismerés AI-val), xlsx, pptx |
| Keresés | Első ütemben: szó alapú keresés a D1 beépített szövegindexével (ékezet-független, ragozott alakot is találó előtagkereséssel). Később: jelentés szerinti keresés (vektorindex), mert a magyar ragozás ott jobban kezelhető |
| Darabolás | A szöveg ~500 szavas, szakaszcímekhez kötött részekre (chunk) bomlik; minden rész tudja, melyik dokumentum hányadik szakasza |
| Használat a munkatársaknél | A munkatárs a kérdéshez a legrelevánsabb részeket kapja meg, és **minden állítás mellé hivatkozást tesz** (például [D3, 2. szakasz]). A hivatkozásokat a program ellenőrzi, nem létezőt töröl (ugyanúgy, ahogy a cikkszámoknál) |

## 4. Biztonság és adatvédelem

A feltöltött dokumentumok bizalmas, személyes adatot is tartalmazhatnak, ezért:

1. **Ügyfél-elkülönítés:** minden tárolt elem és lekérdezés az ügyfél-azonosítóval szűr; egy ügyfél dokumentuma semmilyen módon nem kerülhet másik ügyfél munkatárséhez (külön teszt).
2. **A dokumentum adat, nem utasítás.** A feltöltött szövegben szereplő „utasításokat” a munkatárs nem követi. Ezt a promptok kimondják, de a valódi védelem szerkezeti: a munkatársak csak a zárt műveletlistából tudnak cselekedni, és kifelé semmi nem megy jóváhagyás nélkül, így egy rosszindulatú dokumentum sem tud mellékhatást kiváltani.
3. **Fájlellenőrzés:** csak engedélyezett típus (a tartalom első bájtjai szerint ellenőrizve, nem csak a kiterjesztés), méretkorlát, és a fájl soha nem fut le, csak szövegként feldolgozódik.
4. **Korlátok:** javaslat: legfeljebb 10 MB / fájl, 200 dokumentum és 100 MB / ügyfél (költségvédelem).
5. **Törlés:** a dokumentum törlése az eredetit, a szövegrészeket és a keresési indexet is törli; a törlés és a feltöltés naplózódik (ki, mikor, mit).
6. **Jogosultság:** feltölteni és törölni a vezető és az üzemeltető tud.
7. **AI-szolgáltató felé küldött részletek:** a felületen jelezni kell, hogy a dokumentumrészletek az AI-szolgáltatóhoz kerülhetnek (kivéve a „Nem küldhető AI-nak” jelölésűeket). Ez az adatkezelési tájékoztató és az adatfeldolgozói megállapodás része, jogász átnézése javasolt (docs/05, 7–8. kérdés).
8. **Megőrzés:** a dokumentumokat az ügyfél törli, vagy a szerződés megszűnésekor az üzemeltető; a megőrzési szabály a profilban rögzített.

## 5. Mit kapnak a munkatársak az első ütemben

Mivel jelenleg a Monitoring az egyetlen működő munkatárs, az első ütem három dolgot tesz lehetővé:

1. **Feltöltés, böngészés, keresés, törlés** a Dokumentumtárban.
2. **Kérdés a dokumentumokhoz** (a Monitoring asztalán és a Dokumentumtárban): a válasz csak a feltöltött anyagokból származik, hivatkozással; ami nincs bennük, azt kimondja.
3. **Kulcsszójavaslat dokumentumból:** „Javasolj kulcsszavakat a feltöltött sajtóanyagok alapján” → a Monitoring javaslatot tesz (szervezetnevek, személyek, témák), a vezető tételenként jóváhagyja. Ez a meglévő javaslat → jóváhagyás menetet használja.

A többi munkatárs (Felkészítő, Kapcsolattartó, …) az érkezésükkor kapják meg ugyanezt a szolgáltatást.

## 6. Ütemezés

| # | Lépés | Ellenőrizhető eredmény |
|---|-------|------------------------|
| D1 | Adatmodell, feltöltés-fogadás, típus- és méretellenőrzés, szövegkinyerés (txt, md, csv, docx, szöveges PDF), darabolás, keresés | Tesztek: ügyfélelkülönítés, hibás vagy túl nagy fájl elutasítva, törlés mindent töröl |
| D2 | Felület: Dokumentumtár menüpont, feltöltés, lista, keresés, törlés, hatókör és AI-jelölés | Böngészős kipróbálás képernyőképpel |
| D3 | Kérdés a dokumentumokhoz hivatkozásokkal; kulcsszójavaslat dokumentumból | Tesztek: hivatkozás-ellenőrzés, „nem küldhető AI-nak” jelölés betartva |
| D4 | Telepítés az Ön Cloudflare-fiókjában (R2 bekapcsolása) | Az Ön hozzáférésével és jóváhagyásával |
| D5 | (későbbi) beolvasott PDF és képek, xlsx, pptx, jelentés szerinti keresés | |

D1–D3 itt megépíthető és tesztelhető, a D4-hez az Ön Cloudflare-fiókja kell (az objektumtár bekapcsolása).

## 7. Amit jóvá kell hagynia

1. **Első ütem típusai:** txt, md, csv, docx, szöveges PDF (a beolvasott PDF és a képek később)? (Ajánlott.)
2. **Az eredeti fájl is megmaradjon** a szöveg mellett (R2-ben), hogy letölthető legyen? (Ajánlott; ehhez az R2-t be kell kapcsolni.)
3. **Keresés:** először szó alapú, jelentés szerinti később? (Ajánlott.)
4. **Korlátok:** 10 MB / fájl, 200 dokumentum, 100 MB / ügyfél?
5. **A „Nem küldhető AI-nak” jelölés** legyen meg az első ütemben?
6. **A kategóriák** rendben vannak, vagy kell más?
7. **Az Archívum munkatárs** később erre a közös szolgáltatásra épüljön (ahogy az 1. fejezet írja)?

## 8. Mi készült el (2026-10-29)

- **Feltöltés és kinyerés:** txt, md, csv, docx (címsorok és táblázatsorok megőrzésével), szöveges PDF; a régi, nem UTF-8 kódolású szövegfájlok is helyesen jelennek meg (ő, ű). A fájl típusát a **tartalom** dönti el, nem a kiterjesztés: átnevezett PDF, hamis docx, program, bináris fájl, üres vagy túl nagy fájl elutasítva magyar üzenettel. Valódi, LibreOffice-szal és python-docx-szel készült fájlokon tesztelve.
- **Tárolás:** metaadat, szakaszok és keresési index a D1-ben; az eredeti fájl R2-ben (ha be van kapcsolva; nélküle csak a kinyert szöveg marad meg, és a felület ezt jelzi). Az R2-hiba visszavonja a feltöltést, nem marad félkész dokumentum.
- **Keresés:** szó alapú, ékezet- és kisbetű-független, ragozás-tűrő (a „ápolóhiányról” megtalálja az „ápolóhiány”-t); a rövid szavak pontosan keresődnek.
- **Hatókör és AI-jelölés:** dokumentumonként megadható, mely munkatárs használhatja; a „Nem küldhető AI-nak” jelölésű dokumentum részletei AI-hívásba nem kerülnek, és a válasz jelzi, ha ilyen miatt hagyott ki találatot. AI nélkül (a bemutató módban) a tartalom nem hagyja el a rendszert, ezért ott használható.
- **Kérdés a dokumentumokhoz:** minden állítás mellett `[D1 §2]` típusú forrásjelölés; a nem létezőre hivatkozó jelölést a program törli, és jelzi.
- **Kulcsszójavaslat dokumentumból:** a Monitoring asztalán az utasítás („Javasolj kulcsszavakat a feltöltött dokumentumok alapján”) javaslatot készít szervezetnevekből, személyekből és témákból; a vezető **tételenként** jelöli ki, mit vegyen fel. Jóváhagyás nélkül nem változik semmi; a kijelölés nélküli jóváhagyás hibát ad.
- **Biztonság:** ügyfél-elkülönítés minden lépésben (lista, keresés, megnyitás, letöltés, törlés, módosítás tesztelve); letöltés csak csatolmányként (`nosniff`, `sandbox`); szigorú méret- és darabszám-korlát; a dokumentum adat, nem utasítás (a zárt műveletlista miatt szerkezetileg is); a törlés az eredetit, a szakaszokat és az indexet is törli (tesztelve); minden feltöltés, módosítás és törlés naplózott.
- **Felület:** Dokumentumtár menüpont (behúzható feltöltés, kategória, hatókör, AI-jelölés, kérdés, keresés, megnyitás és beállítások, letöltés, törlés).

**Korlátok:**
- A PDF-kinyerés a `unpdf` könyvtárral történik; helyben, valódi PDF-fájlon működik, de a **Cloudflare Workerben nem futtattuk** (a csomag összeáll: 681 KiB tömörítve).
- Beolvasott (szkennelt) PDF és kép: a rendszer felismeri, hogy nincs szövege, és ezt megmondja; a felismerés AI-val a D5 lépés.
- A keresés a közös tárban az összes ügyfél indexén fut, az ügyfélre szűrés után; sok ügyfélnél (több száz) érdemes ügyfelenként külön indexre váltani.
- A bemutató módban a kulcsszójavaslat szabályalapú (nagybetűs nevek és gyakori szavak), a minősége korlátozott; az AI-s ág hamis API-val tesztelt.
- Az R2 bekapcsolása a tulajdonos fiókjában történik; a `wrangler.toml`-ban a kötés kikommentezve áll.
