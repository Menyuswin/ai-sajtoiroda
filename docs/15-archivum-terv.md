# Az Archívum- és Tudásmenedzsment munkatárs terve

*Állapot: **jóváhagyva (2026-10-30), megépítve és tesztelve** (lásd a 8. fejezetet). Kiegészítő munkatárs (`agents/06-archivum.yaml`). A Dokumentumtárra (`docs/09`) épül, és a Kapcsolattartó, a Felkészítő és a Közösségi média használja majd (`docs/10`, felelősségi mátrix).*

## 1. A cél, egy példával

Három hónapja Ön azt közölte egy újságíróval: „A várólista 2027 végéig nem csökken.” Ma a Kapcsolattartó választervezetet ír egy hasonló kérdésre: „A várólista jövőre csökkenni fog.” Az Archívum **megmutatja a korábbi közlést** (mikor, kinek, mit, ki hagyta jóvá), és ha ellentmondást lát, **jelez**: „Ez ellentmond a 2026. júliusi közlésnek: »…«”.

Az Archívum a szervezet **intézményi emlékezete**: mit mondtunk ki, mikor, kinek, és hol található az irányelv, az interjú, a sajtóanyag.

## 2. Amit az Archívum tárol és keres

1. **Kiadott közlések nyilvántartása (új).** Minden, ami a vezető jóváhagyásával **tényleg kiment vagy kimenő mappába került**: a jóváhagyott levélválasz és a meghívó. A nyilvántartásban: dátum, fajta, tárgy, **teljes szöveg**, a címzett **médiuma és címtartománya** (nem a teljes e-mail-cím), a jóváhagyó, a forrás-anyag. A közlés innentől **nem módosítható**, csak a megőrzési idő után törölhető.
2. **Kézzel felvitt korábbi közlések:** a vezető bevihet régi nyilatkozatot, interjút, sajtóközleményt (cím, dátum, fajta, szöveg), hogy az előzmény meglegyen akkor is, ha nem ebben a rendszerben született.
3. **A Dokumentumtár** („nyilatkozat”, „irányelv”, „háttéranyag”, „sajtóanyag” kategóriák): az Archívum ezekben is keres, a meglévő hatókör- és „nem küldhető AI-nak” szabályok szerint.
4. **A munkatársak elkészült anyagai** (csomag, koncepció, utómunka, jogi vélemény) megmaradnak a Jelentésekben; az Archívum **nem másolja** őket, de a keresés megtalálja a címüket és a szövegüket, a bizalmas anyagtípusokra érvényes hozzáférési szabállyal.

## 3. Mit csinál

- **Keresés** témára, személyre, időszakra: egy keresőmező a közlések, a Dokumentumtár és az anyagok fölött; szó alapú, ragozás-tűrő (mint a Dokumentumtárban); szűrők: fajta, időszak. A találat mellett mindig a forrás (dátum, fajta, hol van).
- **Idővonal egy témához:** mit mondtunk a „várólistáról” időrendben (közlés, dátum, médium, kivonat).
- **Korábbi közlések a tervezet mellett (program, AI nélkül is):** amikor a Kapcsolattartó választervezetet vagy a Felkészítő csomagot készít, a program kikeresi a témához tartozó korábbi közléseket, és a Bejövő levélrészletén **„Korábbi közlések erről”** listaként mutatja. Ez olcsó, és az embernek ad támpontot.
- **Ellentmondás-ellenőrzés (AI-val):** ha vannak korábbi közlések, és az AI be van kapcsolva, az Archívum összeveti a tervezetet velük, és csak **szó szerinti idézetekkel** jelez ellentmondást: a tervezet egy részlete és a korábbi közlés egy részlete (a program ellenőrzi, hogy mindkét idézet valóban szerepel). Találatnál **jelzés a Kapcsolattartónak** (átadás), a levélrészleten kiemelt figyelmeztetés, és a vezető látja.
- **AI nélkül nem ítél ellentmondásról.** Szabályalapú tartalékként csak megmutatja a kapcsolódó korábbi közléseket, és ezt kimondja. (Az ellentmondás jelentéstani kérdés; kulcsszavakkal megbízhatatlan, és hamis nyugalmat adna.)
- **Kérdés az Archívumhoz:** a Kapcsolattartó, a Felkészítő vagy a Jogi munkatárs átadásban kérdezhet („mit közöltünk a várólistáról az elmúlt évben?”); a válasz forrásjelölt kivonat.
- **Megőrzés és törlés:** a közlések a profilban megadott ideig maradnak (javaslat: **36 hónap**), utána törlődnek; a vezető bármelyiket törölheti, az Archívum exportálható. A törlés naplózott.

## 4. Alapelvek

- **Csak belső tudásbázis:** az Archívum **semmit nem küld ki**, nem módosít és nem dönt; jelez.
- **A közlés a jóváhagyás után kerül be**, és csak az, ami ténylegesen kiment vagy a kimenő mappába került; tervezet és elvetett anyag nem.
- **Személyes adatok minimuma:** a teljes e-mail-cím nem kerül az archívumba (csak a médium és a címtartomány); a közlés szövege viszont személyes adatot tartalmazhat, ezért csak a vezető látja, és a megőrzési idő után törlődik. A GDPR-kérdéseket jogász nézze át (`docs/05`, 7. kérdés).
- **Ellenőrizhető idézet** mindenhol: a program ellenőrzi, hogy az idézet szó szerint szerepel a forrásban; a nem létezőt törli.
- **Korlátok:** naponta legfeljebb 10 AI-s ellentmondás-ellenőrzés ügyfelenként; legfeljebb 5000 közlés ügyfelenként.
- **Szerepek:** a tartalmat csak a vezető látja; az üzemeltető csak darabszámot.

## 5. A felületen

- **Archívum asztala:** keresőmező (szűrőkkel), a **közlések listája**, **idővonal egy témához**, „Régi közlés felvitele” űrlap, export és törlés, az ellentmondás-jelzések.
- **Bejövő levélrészlet:** „Korábbi közlések erről” szakasz (a program találatai), és ellentmondás esetén figyelmeztetés a két idézettel.
- **Iroda-kártya:** a nyitott ellentmondás-jelzések száma.

## 6. Ütemezés

| # | Lépés | Ellenőrizhető eredmény |
|---|-------|------------------------|
| A1 | Közlés-nyilvántartás (tábla, keresőindex), automatikus bejegyzés a jóváhagyott válaszból és a kiküldött meghívóból, kézi felvitel, megőrzés, export, törlés | Tesztek: csak a ténylegesen kimentek kerülnek be, a teljes e-mail-cím nem, változtathatatlan, ügyfél-elkülönítés |
| A2 | Egységes keresés (közlések + Dokumentumtár + anyagok), idővonal, hozzáférési szabályok | Tesztek: bizalmas anyag csak a vezetőnek, „nem küldhető AI-nak” tiszteletben tartva |
| A3 | Korábbi közlések a tervezet mellett (program), AI-s ellentmondás-ellenőrzés idézet-ellenőrzéssel, átadás-feldolgozó (kérdés), jelzés a Kapcsolattartónak | Tesztek: hamis idézet törlődik, AI nélkül nincs ellentmondás-ítélet, napi korlát, a lánc mélysége |
| A4 | Asztal, a Bejövő bővítése, iroda-jelzés, e2e | Böngészős kipróbálás |

## 7. Amit jóvá kell hagynia

1. A **kiadott közlések automatikus nyilvántartása** (jóváhagyott válasz, kiküldött meghívó), a címzettnek csak a médiuma és a címtartománya? (Ajánlott.)
2. **Egy keresés** a közlések, a Dokumentumtár és az anyagok fölött, szó alapú? (Ajánlott.)
3. **A korábbi közlések mindig látszanak a tervezet mellett (program); az ellentmondás-ítélet csak AI-val, idézettel; AI nélkül nem ítél.** (Ajánlott.)
4. **Régi közlések kézi felvitele** (cím, dátum, fajta, szöveg)? (Ajánlott.)
5. **Megőrzés: 36 hónap**, bármikor törölhető és exportálható; legfeljebb 5000 közlés?
6. **A tartalmat csak a vezető látja**, az üzemeltető csak darabszámot; napi 10 AI-s ellenőrzés? (Ajánlott.)

## 8. Mi készült el (2026-10-30)

A tulajdonos mind a hat pontot elfogadta (automatikus nyilvántartás médium és címtartomány nélküli e-mail-címmel, egy keresés, az ellentmondás-ítélet csak AI-val és idézettel, kézi felvitel, 36 hónapos megőrzés, a tartalmat csak a vezető látja).

- **Közlés-nyilvántartás** (`migrations/0008`, `src/cloudflare/archivum-store.js`): a jóváhagyott levélválasz és a kiküldött meghívó **a küldés után automatikusan** bekerül (a tervezet, az elvetett és a még jóváhagyásra váró nem). A címzettnek csak a **médiuma és a címtartománya** tárolódik, a teljes e-mail-cím nem. A közlés az adatbázis szintjén **nem módosítható** (törölni csak a vezető vagy a megőrzési idő lejárta után lehet). Ugyanaz a forrás kétszer nem kerül be; a meghívószöveg ugyanahhoz az eseményhez egyszer, a megváltozott szöveg új közlésként. Korlát: 5000 közlés; megőrzés: `megorzes.kozles_honap` (alapértelmezés 36 hónap), az ütemező törli a lejártakat.
- **Keresés:** egy keresőmező a közlések, a Dokumentumtár és a munkatársak anyagai fölött (szó alapú, ragozás-tűrő), szűrés fajtára és időszakra; **idővonal** egy témához; kézi felvitel (ellenőrzött dátum, nem lehet jövőbeli); export CSV-ben (képletkarakter-védelemmel); törlés (naplózott, a keresőindexből is).
- **Korábbi közlések a tervezet mellett:** a Bejövő levélrészletén „Korábbi közlések erről” (a program találatai, AI nélkül is).
- **Ellentmondás-jelzés (AI-val):** a tervezetet és a találatként előkerült korábbi közléseket a modell veti össze; a jelzés csak akkor marad meg, ha **mindkét idézet szó szerint** szerepel (a tervezetben, illetve a megadott közlésben), különben törlődik. Találatnál kiemelt figyelmeztetés a levélrészleten, és jelzés-átadás az Archívumtól a Kapcsolattartónak. **AI nélkül az Archívum nem ítél ellentmondásról**, ezt kimondja. Napi korlát: 10 ellenőrzés; hibánál vagy a korlát elérésekor az előzmények megmaradnak.
- **Átadás-feldolgozó:** az Archívumnak szóló kérdésre kivonatos összefoglalót ad a találatokról.
- **Hozzáférés:** a közlések és az archívum tartalma csak a vezetőnek; az üzemeltető a darabszámot látja.
- **Felület:** Archívum asztal (keresés, régi közlés felvitele, idővonal, legutóbbi közlések, export), a közlés megnyitása törlési lehetőséggel, „Korábbi közlések erről” és az ellentmondás-figyelmeztetés a Bejövőben.

**Korlátok (őszintén):**
- Az ellentmondás-ellenőrzés **minősége nem mért** (hamis API-val tesztelt). Az idézet-ellenőrzés a hamis jelzéseket kiszűri, a **kihagyott** ellentmondásokat viszont nem: a nyugalom nem garancia.
- A keresés **szó alapú**: a jelentés szerint hasonló, de más szavakat használó közlést nem biztos, hogy megtalálja.
- A Felkészítő csomag és a Közösségi média még nem használja a közléseket forrásként (következő lépés); az eseménymeghívók ellentmondás-vizsgálata nincs.
- A **nem ebben a rendszerben** kiadott közlések csak akkor vannak meg, ha a vezető felviszi őket; a visszamenőleges feltöltés kézi munka.
- A közlések személyes adatot tartalmazhatnak (a szöveg): a megőrzési idő és a GDPR-kérdések jogászi átnézése javasolt.
