# A Jogi- és Kockázatfigyelő munkatárs terve

*Állapot: **jóváhagyva (2026-10-30), megépítve és tesztelve** (lásd a 8. fejezetet). Kiegészítő munkatárs (`agents/08-jogi-kockazat.yaml`). Erre már ma is várnak belső kérdések: a Kapcsolattartó (jogi gyanú), a Felkészítő (red flag) és az Eseményszervező (jogi vagy biztonsági kérdés) a Jogi asztalnak küld átadást.*

## 1. A cél, egy példával

A Kapcsolattartó választervezetet készít egy hatósági eljárásra rákérdező újságírónak, és jogi gyanút jelez. A Jogi munkatárs **átnézi a tervezet szövegét**, és ezt adja: „**Magas** kockázat. A 2. mondat konkrét személyt hoz összefüggésbe jogsértéssel (becsület és jóhírnév). A 4. mondatban személyes adat szerepel. Jogász bevonása javasolt a küldés előtt. Javasolt javítás: …”

A munkatárs **jelez, de nem helyettesíti a jogászt**. A döntés a vezetőé, a jogi kérdés eldöntése a jogászé.

## 2. Alapelvek

1. **Zárt kockázati kategóriák:** becsület és jóhírnév (rágalmazás-jellegű állítás), személyiségi jog, személyes adat (GDPR), üzleti vagy szolgálati titok, folyamatban lévő hatósági vagy bírósági eljárás, választási vagy kampányszabály, megtévesztő vagy alá nem támasztott állítás, szerzői jog, helyreigazítási kötelezettség, egyéb. Más kategóriát a munkatárs nem találhat ki.
2. **A program adja a padlót, az AI csak emelhet.** Determinisztikus szabályok (személyes adat mintái: e-mail, telefonszám, adóazonosító- és TAJ-szerű számok; megnevezett személy + gyanúsító vagy bűncselekményt sejtető szó; „bizalmas”, „üzleti titok”; eljárás említése; választás, kampány) meghatározzák az **alsó határt**. Az AI ezt nem tudja lejjebb vinni, csak megerősíteni vagy emelni, és indokolnia kell. (Így egy tévedő modell nem „nyugtathat meg” hamisan.)
3. **Csak ellenőrizhető idézettel:** minden megállapítás a vizsgált szöveg egy **szó szerinti részletére** hivatkozik; a program ellenőrzi, hogy a részlet valóban benne van a szövegben, és a nem létezőt törli. Törvényhelyet (paragrafust) a munkatárs **nem hivatkozhat**, hacsak nem a Dokumentumtárból (irányelv, jogi háttéranyag) származik jelöléssel; a jogszabály-értelmezés a jogász dolga.
4. **A szöveg adat, nem utasítás** (a vizsgált tervezet is lehet rosszindulatú). A munkatárs semmit nem módosít, és kifelé nem küld.
5. **A besorolás nyilvánvalóan nem jogi tanács:** minden vélemény alján ez áll, és **magas** kockázatnál mindig „jogász bevonása javasolt”.
6. **Tartalom csak a vezetőnek:** a vélemények a vizsgált tervezet szövegét idézik, ezért az üzemeltető csak darabszámot lát.

## 3. Mit csinál

- **Bemenet:**
  - *Átadásból:* a Kapcsolattartó, a Felkészítő és az Eseményszervező kérdése (az átadás az anyagra hivatkozik); a vélemény automatikusan elkészül.
  - *Kézi kérés:* a vezető kiválaszt egy meglévő anyagot (tervezet, csomag, koncepció), vagy beilleszt egy szöveget (legfeljebb 10 000 karakter), és megadja a fajtát (nyilatkozat, poszt, válasz, meghívó, sajtóanyag, egyéb).
- **Kimenet: jogi vélemény** (anyag): összesített besorolás (alacsony / közepes / magas) indoklással, **megállapítások** (kategória, szint, szó szerinti részlet, indoklás, javasolt javítás), „jogász bevonása javasolt” jelzés, a vizsgált anyagra hivatkozás, a határidő és a kérő munkatárs.
- **Eszkaláció:** magas kockázat esetén **riasztás a vezetőnek** (a vezető címére, belső levél), és a vélemény a vizsgált anyag mellett is megjelenik.
- **A kérő munkatárs értesítése:** az átadás válasza összefoglalja a véleményt („Magas, 3 megállapítás, jogász javasolt”), és megnyitható a teljes vélemény.
- **Védőkorlát a küldésnél:** ha egy levélre **magas** kockázatú vélemény van, a Kapcsolattartó jóváhagyásánál a vezetőnek külön **tudomásul kell vennie** („láttam a jogi figyelmeztetést”). Ez nem tilt, csak lassít egy elhamarkodott küldést. (Az eseménymeghívókra egyelőre nem terjed ki.)
- **Korlát:** naponta legfeljebb 10 vélemény ügyfelenként.

## 4. AI nélkül

A szabályalapú réteg önmagában is működik: jelzi a személyes adatok mintáit, a megnevezett személyt gyanúsító szavakkal, a titokra, eljárásra, választásra utaló szavakat, és ezekből ad besorolást és megállapításokat, szó szerinti részletekkel. Az AI árnyaltabb olvasatot ad (pl. egy állítás tényállítás-e vagy véleménynyilvánítás), de az AI nélküli változat is **óvatosan, a gyanús irányban téved** (több figyelmeztetés, kevesebb mulasztás), ezt a vélemény alján jelzi.

## 5. A felületen

- **Jogi asztal:** „Vélemény kérése” űrlap (anyag kiválasztása vagy szöveg beillesztése, a fajta megadása), a **vélemények listája** besorolás szerint szűrhetően (magas elöl), megnyitás, átadások.
- **A vizsgált anyagnál** (anyag megnyitása, a Bejövő levélrészlete) a hozzá tartozó legrosszabb vélemény jelvényként látszik („Jogi vélemény: magas”).
- **Iroda-kártya:** a nyitott magas kockázatú vélemények száma.

## 6. Ütemezés

| # | Lépés | Ellenőrizhető eredmény |
|---|-------|------------------------|
| J1 | Szabályalapú elemzés (kategóriák, személyes adat minták, besorolási padló), idézet-ellenőrzés, vélemény-anyag | Tesztek: a padlót az AI nem viheti le, a hamis idézet törlődik, az utasításjellegű szöveg hatástalan |
| J2 | AI-ág (prompt, zárt kategóriák, törvényhely-tilalom), napi korlát, átadás-feldolgozó, riasztás | Tesztek: a Kapcsolattartó, Felkészítő és Eseményszervező kérdésére vélemény készül, magas → riasztás csak a vezetőnek |
| J3 | API és asztal (űrlap, lista, jelvény az anyagnál), a Kapcsolattartó jóváhagyásánál a tudomásulvétel | Böngészős kipróbálás, tesztek |
| D | Dokumentáció, CLAUDE.md, e2e | |

## 7. Amit jóvá kell hagynia

1. A **zárt kategóriák** (1. alapelv) rendben vannak, vagy kell más? (Ajánlott.)
2. **A program adja az alsó határt, az AI csak emelhet.** (Ajánlott.)
3. **Csak szó szerinti idézettel, törvényhely nélkül** (kivéve a Dokumentumtárból jelöléssel). (Ajánlott.)
4. **Magas kockázat: riasztás és jogász javasolt; a Kapcsolattartó jóváhagyásánál tudomásulvétel kell, de nem tilt.** (Ajánlott.)
5. **Automatikus vélemény az átadásra és kézi kérés** (anyag vagy beillesztett szöveg); napi 10 vélemény?
6. **Az üzemeltető csak darabszámot lát**, a tartalmat nem. (Ajánlott.)

## 8. Mi készült el (2026-10-30)

A tulajdonos mind a hat pontot elfogadta (zárt kategóriák, a program adja az alsó határt, szó szerinti idézet és törvényhely-tilalom, magas kockázatnál riasztás és tudomásulvétel, automatikus vélemény átadásra és kézi kérés napi 10-es korláttal, az üzemeltető csak darabszámot lát).

- **Elemzés** (`src/agents/jogi/analysis.js`): a szabályalapú réteg a személyes adat mintáit (e-mail, telefonszám, adóazonosító-, TAJ- és IBAN-szerű számok; a szervezet saját címét nem), a megnevezett személy és a vádló szó együttállását, az eljárásra, titokra, választásra, helyreigazításra és abszolút állításra utaló kifejezéseket keresi, és ebből ad **alsó határt**. Egészségügyi összefüggésű személyes adat magas. Az AI-ág (zárt kategóriák és szintek) **csak megerősítheti vagy emelheti** ezt; ha alacsonyabbat ad, a magasabb érvényes, és ez jelezve van. A modell megállapításai csak **szó szerinti idézettel** maradnak meg (különben törlődnek), a **törvényhelyre** (§, Ptk., Btk., Infotv., Mttv., Smtv., Szjt.) hivatkozó részt a program törli.
- **Vélemény** (`src/agents/jogi/index.js`): összesített besorolás, megállapítások (kategória, szint, idézet, indoklás, javasolt javítás), „jogász bevonása javasolt” jelzés (magasnál mindig), a „nem jogi tanács” felirat. Napi korlát: 10. **Magas** kockázatnál riasztás csak a vezetőnek.
- **Átadás-feldolgozó:** a Kapcsolattartó, a Felkészítő és az Eseményszervező kérdésére a Jogi asztal automatikusan véleményt készít az átadásban hivatkozott anyagról, és az átadás válasza összefoglalja („magas kockázat, 2 megállapítás, jogász bevonása javasolt”).
- **Tudomásulvétel:** ha a levél tervezetére magas kockázatú vélemény van, a jóváhagyáshoz a vezetőnek be kell jelölnie, hogy tudomásul vette (a szerver is követeli; nem tilt, csak lassít). A tudomásulvétel naplózott.
- **Hozzáférés:** a vélemények és a munkatársak bizalmas anyagai (levéltervezet, csomag, javaslat, koncepció, utómunka, jogi vélemény) **csak a vezetőnek** olvashatók; az üzemeltető sem listázni, sem megnyitni, sem rákérdezni nem tud rájuk. (Ez a korábbi munkatársak anyagaira is kiterjedő szigorítás.)
- **Felület:** Jogi asztal (vélemények besorolás szerint rendezve, vélemény kérése anyagra vagy beillesztett szövegre, mit néz és mit nem), jelvény és „Jogi vélemény kérése” gomb az anyagok megnyitásánál és a Bejövő levélrészleteinél.

**Korlátok (őszintén):**
- A szabályalapú réteg **kulcsszavas és mintaalapú**: tévedhet mindkét irányba (felismer sok gyanús mondatot, de nem érti a szöveg jelentését; ironikus vagy tagadó mondatot is jelezhet, és az ügyes körülírást nem látja). Ezért kell mellé a jogász.
- Az **AI valódi minősége nem mért** (hamis API-val tesztelt).
- A **Dokumentumtárból** származó jogi háttér (irányelvek, korábbi állásfoglalások) ebben a lépésben nem kerül a vizsgálatba; az AI csak a vizsgált szöveget és a programozott előszűrést kapja.
- Az **eseménymeghívókra** a tudomásulvétel nem terjed ki; a vélemény kézzel kérhető.
- A hatályos jogszabályokat a munkatárs nem ismeri és nem hivatkozza; magyar jogi szakértelem nem pótolható vele.
