# Az Eseményszervező ügynök terve

*Állapot: **terv, jóváhagyásra vár** (2026-10-29). A bevezetési sorrend szerint a harmadik szakasz (`docs/04`). Az átadások, a Dokumentumtár, a naptár (`docs/12`) és a kimenő kapu (`docs/11`) már készek, erre épül.*

## 1. A cél, egy példával

A Proaktív javaslata: „Sajtótájékoztató a várólista-csökkentésről.” Ön elfogadja. Az Eseményszervező ebből **eseménykoncepciót** készít (cél, célközönség, formátum, időpont, helyszín, költségbecslés). **Ön a koncepciót jóváhagyja.** Csak ezután készül meghívólista és meghívószöveg, logisztikai ellenőrzőlista, a visszajelzések követése, majd az esemény után az utómunka (sajtóanyag, résztvevői lista, megjelenések összefoglalója).

Az esemény **csak jóváhagyott koncepcióval indul**, és **minden meghívó csak az Ön jóváhagyásával megy ki**.

## 2. Az esemény élete (állapotok)

`javaslat` → **`koncepcio`** (az ügynök elkészíti) → **jóváhagyva** (Ön) → `szervezes` (meghívók, ellenőrzőlista) → `lezajlott` → `utomunka` → `lezarva`; bármikor `elvetve` vagy `elhalasztva`.

Minden állapotváltás és döntés naplózott; a döntések az Öné.

## 3. Mit csinál az ügynök

1. **Koncepció** (téma + alkalom + költségkeret + időablak alapján): cél, célközönség, formátum, időpont-javaslat (a naptárból a program számolja, mint a Proaktívnál), helyszín-szempontok, költség- és erőforrásbecslés tételesen. Forrásjelöléssel; ami nem támasztható alá, `[KITÖLTENDŐ]`. A **költségkeret túllépése** és **a helyszínnel kapcsolatos jogi vagy biztonsági kérdés** külön, kiemelt jelzés (a Jogi asztalnak belső kérdés).
2. **Meghívólista:** a **sajtólistából** (új, ügyfelenként kezelt névjegytár: név, médium, e-mail, téma, prioritás) prioritási sorrendben; a lista és a **meghívószöveg** tervezet, az Ön jóváhagyására vár. Tételenként kijelölhető, kit hívunk (mint a kulcsszójavaslatnál).
3. **Meghívók kiküldése:** csak jóváhagyás után, a **kimenő kapun át** (`kind: meghivo`, vezetői jóváhagyás kell); próbaüzemben a kimenő mappába kerül. A levélküldő szolgáltató kiválasztásáig nem megy ki semmi (P6).
4. **Visszajelzések követése:** a beérkező válaszok (a Kapcsolattartó Bejövőjében) összekapcsolhatók az eseménnyel; az ügynök a „részt vesz / nem vesz részt / bizonytalan” állapotot **javaslatként** jelöli, Ön véglegesíti.
5. **Logisztikai ellenőrzőlista:** helyszín, technika, étkeztetés, akkreditáció, hozzáférhetőség, sajtóanyag-csomag, felelősök és határidők (hátrafelé a naptárból). A pipák az Öné.
6. **Utómunka:** sajtóanyag-tervezet, résztvevői lista, megjelenések összefoglalója (a Monitoring eseményhez köthető cikkeiből), tanulságok.
7. **Átadások:** a Felkészítőtől csomagot kér (a megszólalóknak), a Proaktívtól üzenetet, a Jogi asztaltól véleményt.

## 4. Új adatok

- **Események** (`esemenyek`): cím, állapot, koncepció (anyag), időpont, költségkeret, jóváhagyás, kapcsolt javaslat.
- **Sajtólista** (`sajtolista`): név, médium, e-mail, téma, prioritás (1–3), megjegyzés, **hozzájárulás-jelölés** (GDPR: a személyes adatok kezelése jogász által átnézendő; a lista törölhető és exportálható). Kézi felvitel és CSV-feltöltés; ügyfél-elkülönítés; korlát (pl. 2000 kapcsolat).
- **Meghívók és visszajelzések** (`meghivok`): esemény, kapcsolat, állapot (tervezet / jóváhagyva / elküldve-próba / válaszolt), válasz-jelölés.

## 5. Alapelvek

- **Kifelé semmi nem megy** a koncepció és a meghívólista jóváhagyása nélkül, és a levélküldő kiválasztásáig egyáltalán semmi.
- **Csak forrásból:** a költség és az időpont a bevitt adatokból; amit nem tudunk, az `[KITÖLTENDŐ]`. A számokat és a tételeket a program összegzi, nem az AI.
- **Adat, nem utasítás:** a sajtólista, a naptár és a visszajelzések szövege nem hajt végre műveletet.
- **Korlátok:** naponta legfeljebb 3 új koncepció és 50 meghívótervezet; meghívó-tömeg: egy eseményre legfeljebb 200 meghívó.
- **Szerepek:** a tartalmat és a döntéseket csak a vezető látja és hozza; az üzemeltető csak a darabszámot.
- **Adatvédelem:** a sajtólista személyes adat; a „nem küldhető AI-nak” elv itt is érvényes (a lista az AI-nak csak a médium és a téma szintjén megy át, e-mail-cím és név nem).

## 6. A felületen

Az Eseményszervező asztala: **Események** (állapotokkal), **Új esemény** (koncepció kérése űrlappal), az esemény részlete (koncepció, költségtáblázat, meghívólista kijelöléssel, meghívószöveg-szerkesztő, ellenőrzőlista pipákkal, visszajelzések, utómunka), **Sajtólista** (felvitel, CSV, szűrés), átadások. A Proaktív elfogadott javaslatához „Esemény szervezése” gomb.

## 7. Ütemezés

| # | Lépés | Ellenőrizhető eredmény |
|---|-------|------------------------|
| E1 | Adatmodell (események, sajtólista, meghívók), sajtólista-kezelés és CSV | Tesztek: ügyfél-elkülönítés, érvénytelen sor kiesik, törlés/export |
| E2 | Koncepció-készítés (program számolta időpont és költségösszeg, AI-ág forrásjelöléssel, váz AI nélkül), jóváhagyás-állapotgép | Tesztek: jóváhagyás nélkül nem indul, költségkeret-túllépés jelzett |
| E3 | Meghívólista, meghívószöveg, tételes kijelölés, jóváhagyás, kimenő kapun át (próba) | Tesztek: jóváhagyás nélkül nincs meghívó, címzett csak a listából, korlát |
| E4 | Visszajelzések, ellenőrzőlista, utómunka, átadások (Jogi, Felkészítő) | Tesztek: lánc mélysége, utómunka a Monitoring cikkeiből |
| E5 | Asztal, sajtólista nézet, Proaktív-gomb, e2e | Böngészős kipróbálás |

## 8. Amit jóvá kell hagynia

1. **Az állapotmenet** (koncepció → jóváhagyás → szervezés → utómunka) és hogy a koncepció jóváhagyása nélkül semmi nem indul? (Ajánlott.)
2. **Sajtólista** az irodán belül (kézi felvitel és CSV), nem külső CRM-ből? (Ajánlott első ütemben.)
3. **Meghívó csak a kimenő kapun át**, tételes kijelöléssel, a levélküldő kiválasztásáig próbaüzemben? (Ajánlott.)
4. **Korlátok:** napi 3 koncepció, 50 meghívótervezet, eseményenként 200 meghívó?
5. **A visszajelzés-követés javaslat-alapú** (az ügynök jelöl, Ön véglegesít)? (Ajánlott.)
6. A **sajtólista személyes adatai** (név, e-mail) az AI-nak nem mennek át, csak médium és téma szintjén? (Ajánlott; GDPR miatt jogász átnézése javasolt.)
