# Az ügynökök közötti átadások terve

*Állapot: **jóváhagyva és megépítve** (a tulajdonos 2026-10-29-én jóváhagyta; az A1–A3 lépések kész és tesztelt, az A4 az ügynökök érkezésével következik).*

## 1. A cél

Úgy kell kezdeni, mint egy irodát, ahol többféle munkatárs dolgozik a saját területén, és a feladatok sok helyen összeérnek: a sajtóválasz írásánál a Kapcsolattartó, az Archívum és a Jogi ügynök is érintett; a megszólalási javaslathoz a Monitoring jelzése kell. Az ügynökök ilyenkor **tudjanak egymással kommunikálni**, de úgy, hogy a vezető mindent lát és irányít, és semmi nem megy ki jóváhagyás nélkül.

## 2. Az alapelvek (jóváhagyott)

1. **Átadásokon keresztül kommunikálnak, nem közvetlen hívással.** Az átadás egy rögzített, naplózott üzenet két asztal között.
2. **Zárt típuslista:** *jelzés* (valami történt, érdemes tudni), *kérelem* (kérek egy munkát), *anyag-átadás* (kész anyagot adok tovább), *kérdés* (kérdezek egy szakmai kérdést).
3. **Minden átadás látszik a vezetőnek**: az érintett asztaloknál, az Átadások nézetben és a naplóban. A vezető bármelyiket megállíthatja.
4. **Minden kimenetnek egy felelős ügynöke van**; a többiek közreműködnek (véleményt adnak, adatot szolgáltatnak). A felelős adja be az eredményt a vezetőnek.
5. **Üres asztalnak is lehet címezni.** Az átadás *várakozik*, amíg az ügynök megérkezik (vagy a szünet véget ér), és csak akkor kézbesül.
6. **Kifelé semmi nem megy.** Az átadás belső; levelet, nyilatkozatot, posztot nem tud küldeni. A kimenő kapu és a jóváhagyás ettől független marad.

## 3. Az átadás

| Mező | Jelentés |
|------|----------|
| típus | jelzés / kérelem / anyag-átadás / kérdés |
| honnan, hova | az ügynökök azonosítói (az ügynök-katalógusból; önmagának nem küldhet) |
| tárgy, szöveg | rövid tárgy, részletek |
| anyag | opcionális hivatkozás egy elkészült anyagra (később: dokumentumra is) |
| szülő, mélység | melyik átadásra válaszul született; a lánc mélysége |
| állapot | *várakozik* → *kézbesítve* → *feldolgozva* → *lezárva*; vagy *megállítva* (vezető), *lejárt* |

**Védelem a láncok és a költség ellen:**
- a lánc mélysége legfeljebb **3** (egy átadásra válaszul született átadás mélysége eggyel nagyobb);
- napi keret: legfeljebb **50 átadás** ügyfelenként (a túllépés naplózódik, az átadás nem jön létre);
- lejárat: a 14 napig kézbesítetlen vagy lezáratlan átadás *lejárt* állapotba kerül;
- a megállított átadás sosem kézbesül.

## 4. Felelősségi mátrix (ki felel, ki működik közre)

| Kimenet | Felelős | Közreműködők |
|---------|---------|--------------|
| Napi sajtószemle, riasztás | Monitoring | Archívum (előzmények), Jogi (kockázatos tartalom jelzése) |
| Választervezet egy sajtómegkeresésre | Kapcsolattartó | Archívum (konzisztencia a korábbi nyilatkozatokkal), Jogi (kockázat), Felkészítő (üzenetkeret) |
| Háttéranyag, kérdés-válasz lista | Felkészítő | Monitoring (kontextus), Archívum (előzmények), Jogi (vörös zászlók) |
| Megszólalási javaslat, időzítés | Proaktív | Monitoring (jelzés), Közösségi (digitális jelzések), Jogi |
| Sajtóesemény és kommunikációs terve | Eseményszervező | Proaktív (üzenet), Felkészítő (anyagok), Jogi (kockázat), Közösségi (népszerűsítés) |
| Posztjavaslat | Közösségi | Jogi, Archívum |
| Jogi és reputációs kockázatvizsgálat | Jogi | (tanácsot ad, nem dönt: a döntés a vezetőé) |

## 5. Tipikus utak (példák)

- **Monitoring → Proaktív** (*jelzés*): „Az ápolóhiány említése háromszorosa az átlagnak.” A Proaktív erre megszólalási javaslatot készít.
- **Proaktív → Felkészítő** (*kérelem*): „Kérek kérdés-válasz listát erről.” A Felkészítő elkészíti, és *anyag-átadásban* visszaküldi.
- **Kapcsolattartó → Jogi** (*kérdés*): „Ez a válaszvázlat jogi szempontból rendben van-e?” A Jogi válaszol; a vezető látja a vázlatot és a véleményt is.
- **Archívum → Kapcsolattartó** (*jelzés*): „Három hónapja ennek ellenkezőjét közölték.”

## 6. A felületen

- Az **asztalnál**: „Átadások” szakasz (bejövő és kimenő, állapottal), „Megállít” gombbal.
- Az **iroda kártyáin**: jelzés, ha az asztalra átadás vár (üres asztalnál: „N átadás vár az érkezésére”).
- Új menüpont: **Átadások**: az összes átadás időrendben, szűrhetően.

## 7. Ütemezés

| # | Lépés | Ellenőrizhető eredmény |
|---|-------|------------------------|
| A1 | Adatmodell, átadás-szolgáltatás (típus, mélység, napi keret, lejárat, megállítás, várakozás üres asztalnál), napló | Tesztek: korlátok, lánc, várakozás és kézbesítés, ügyfél-elkülönítés |
| A2 | A Monitoring első valódi átadása: trendjelzés és vörös vonal → jelzés a Proaktív asztalnak | A riasztás mellett átadás születik, az üres asztalnál várakozik |
| A3 | API és felület: Átadások szakasz az asztalnál, iroda-jelzések, Átadások nézet, megállítás | Böngészős kipróbálás |
| A4 | (az ügynökök érkezésével) a többi átadási út, kapcsolat a dokumentumtárral | |

Az átadás-mechanizmus tesztelhető próba-ügynökkel már most; a valódi címzettek a Proaktív, a Felkészítő stb. érkezésével kapcsolódnak be.
