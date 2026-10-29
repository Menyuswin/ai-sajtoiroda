# A Sajtófelkészítő és a Proaktív Stratégia ügynök terve

*Állapot: **terv, jóváhagyásra vár** (2026-10-29). Bevezetési sorrend szerint ez a második szakasz (`docs/04`); az átadások (`docs/10`) és a Dokumentumtár (`docs/09`) már készek, erre épülnek.*

## 1. A cél, egy példával

A Monitoring jelzi: „Az ápolóhiány említése háromszorosa az átlagnak.” Ma ez a jelzés a Proaktív üres asztalán vár. A két ügynök megérkezésével ez történik:

1. **Proaktív** megkapja a jelzést, megnézi a Monitoring friss anyagait, a Dokumentumtár narratíváját és az Ön naptárát, és **megszólalási javaslatot** készít: *mikor, milyen formában, milyen üzenettel*, és mi a hallgatás kockázata.
2. Ön a javaslatot **elfogadja, elveti vagy későbbre halasztja**. Elfogadásnál a Proaktív **kérelmet** ad át a Felkészítőnek.
3. **Felkészítő** csomagot készít: háttéranyag, kérdés-válasz lista, üzenetkeretek, red flag lista, egyoldalas talking points. Az anyag belső; külső használat előtt Ön átnézi.

A lánc (Monitoring → Proaktív → Felkészítő) három mélységű, ezért belefér az átadások korlátjába.

## 2. Alapelvek (a meglévő szabályok szerint)

- **Kifelé semmi nem megy.** Mindkét ügynök belső anyagot gyárt; levelet, nyilatkozatot, posztot nem küld. A kimenő kapu és a jóváhagyás változatlan.
- **Csak forrásból.** Az anyagban minden állítás vagy egy Monitoring-cikkre (`[1]`), vagy egy dokumentumrészletre (`[D1 §2]`) hivatkozik; a program ellenőrzi a jelöléseket, a nem létezőt törli. Amit a források nem támasztanak alá, azt az ügynök nem írja le, hanem `[KITÖLTENDŐ: …]` jelöli (ugyanúgy, mint a Kapcsolattartó tervezeteinél). A számokat és a cikklistákat a program írja, nem az AI.
- **A bemenet adat, nem utasítás** (cikk, levél, dokumentum, naptárbejegyzés).
- **Zárt műveletlista.** Új műveletek: `felkeszito_csomag` (téma → csomag), `proaktiv_javaslat` (téma vagy jelzés → javaslat), `proaktiv_dontes` (a vezető döntése), `naptar_bejegyzes`. Más nem.
- **Költségvédelem:** naponta legfeljebb 10 felkészítő csomag és 5 megszólalási javaslat ügyfelenként (túllépésnél naplózott elutasítás).
- **Szerepek:** a döntés a vezetőé; az üzemeltető a tartalmat nem látja (mint a leveleknél), csak a darabszámot.

## 3. Sajtófelkészítő Ügynök

**Bemenet:** téma (szabad szöveg), az alkalom (interjú / sajtótájékoztató / írásos nyilatkozat / belső egyeztetés), opcionálisan időpont és a megszólaló neve. Kérelem-átadás a Proaktívtól vagy a Kapcsolattartótól is érkezhet (az átadás szövege a téma).

**Amiből dolgozik:** a Monitoring tárolt cikkei (az elmúlt 30 nap, a témára szűrve), a Dokumentumtár találatai (a hatókör és a „nem küldhető AI-nak” jelölés szerint), és az anyag, amelyre az átadás hivatkozik.

**Kimenet: egy „felkészítő csomag”**, egy anyagként, szakaszokkal:
1. Háttér és helyzetkép (tények, idővonal, érintettek, korábbi nyilatkozatok), forrásjelölésekkel;
2. Kérdés-válasz lista: legvalószínűbb, legkellemetlenebb, legstratégiaibb kérdések; a válaszvázlat csak forrásból, hiányzónál `[KITÖLTENDŐ]`;
3. Üzenetkeretek: fő üzenet, másodlagos üzenet, kerülendő megfogalmazások;
4. Red flag lista (jogi vagy vörös vonalat érintő pontok; ha van, a vezető figyelmét külön jelzi, és kérdés-átadást küld a Jogi asztalnak);
5. Talking points (legfeljebb egy oldal).

**AI nélkül** (szabályalapú tartalék): a csomag **vázát** adja: a talált cikkek és dokumentumrészletek rendezett listája, az általános kérdéssablonok és üres üzenetkeretek `[KITÖLTENDŐ]` jelöléssel. Ez nem helyettesíti az AI-t, de a munkafolyamat és a felület így kipróbálható. Az AI valódi minősége itt sem mért.

## 4. Proaktív Kommunikációs Stratégia Ügynök

**Bemenet:** Monitoring-jelzés (átadásként), Kapcsolattartó-jelzés (pl. sok hasonló megkeresés), a vezető által felvitt naptár, a szervezet narratívája (Dokumentumtár, „háttéranyag” és „irányelv” kategória), vagy kézi kérés („Mit érdemes a héten mondanunk?”).

**Naptár:** az első ütemben **kézzel felvitt** bejegyzések (dátum, cím, megjegyzés, típus: külső esemény / saját esemény / vezetői naptár). Az iCal-import (Google Naptár, Outlook) későbbi lépés, a postafiókokhoz hasonló illesztőkkel. A naptárbejegyzés adat, nem utasítás.

**Kimenet: megszólalási javaslat**, egy anyagként:
- *Mi a lehetőség vagy a kockázat* (a jelzés forrásokkal);
- *Javasolt megszólalás:* mikor (időzítési ajánlás a naptár ismeretében), milyen formában (nyilatkozat, interjú, poszt, nem szólunk), milyen üzenettel;
- *A hallgatás kockázata* (ha van, a vezető figyelmét külön jelzi);
- *Alternatívák* (legalább egy: „most nem szólalunk meg”, indoklással).

**Döntés:** *elfogadom / elvetem / később döntök*, naplózva. Elfogadásnál a felület felajánlja: „Kérjem a Felkészítőtől a csomagot?” (kérelem-átadás a javaslatra hivatkozva). Az ügynök nem dönt, és nem indít semmit a vezető döntése nélkül.

**Opportunity map** (a lehetőségek rendezett listája) a javaslatok és a naptár nézete: első ütemben a Proaktív asztalán egy lista „Nyitott javaslatok és közelgő események” címmel, nem külön grafikus térkép.

**Mikor fut:** első ütemben **csak átadásra és kérésre** (nem pásztáz önállóan), így nincs rejtett költség. A heti „lehetőségtérkép” ütemezett futása későbbi lehetőség, külön jóváhagyással.

## 5. A felületen

- **Felkészítő asztala:** „Új felkészítő csomag” űrlap (téma, alkalom, időpont, megszólaló), a csomagok listája, megnyitás, rákérdezés az anyagra (a meglévő mechanizmus), átadások. Szabad szöveges utasítás helyett űrlap: egyszerűbb és biztonságosabb (a téma adat, nem parancs).
- **Proaktív asztala:** „Megszólalási javaslat kérése” űrlap, a **nyitott javaslatok** döntési gombokkal, a **naptár** (felvitel, törlés, közelgő bejegyzések), átadások.
- **Iroda:** a két kártya „Dolgozik” állapotra vált; a jóváhagyásra váró javaslatok száma látszik.
- **Beállítások:** a Proaktív időzítési szokásai (pl. „péntek délután nem szólalunk meg”) szabad szövegként a profilba (`proaktiv.szabalyok`), az AI ezt veszi figyelembe; a vezető szerkesztheti.

## 6. Biztonság, adatvédelem

A Kapcsolattartó szabályai érvényesek: ügyfél-elkülönítés, a levél- és dokumentumtartalmat csak a vezető látja, az AI felé nem megy a „nem küldhető AI-nak” jelölésű dokumentum, a naptárbejegyzés megőrzése a profilban (alapértelmezés 12 hónap). Az AI-jelzés (mesterséges intelligencia készítette elő) minden anyag alján.

## 7. Ütemezés

| # | Lépés | Ellenőrizhető eredmény |
|---|-------|------------------------|
| F1 | Felkészítő: forrásgyűjtés (cikkek + dokumentumok), csomag-váz, AI-ág forrásjelölés-ellenőrzéssel, napi korlát | Tesztek: hamis hivatkozás törlődik, tiltott dokumentum kimarad, korlát betartva, ügyfél-elkülönítés |
| F2 | Felkészítő: API és asztal (űrlap, lista), red flag → kérdés a Jogi asztalnak | Böngészős kipróbálás |
| P1 | Proaktív: naptár (tábla, API), javaslat-készítés (jelzésből és kérésre), döntés és napló | Tesztek: döntés naplózott, kétszer nem dönthető, naptár-szöveg nem utasítás |
| P2 | Proaktív: átadás-kezelő (a Monitoring jelzése automatikusan javaslatot ad), kérelem a Felkészítőnek elfogadáskor | Teszt: a teljes lánc Monitoring → Proaktív → Felkészítő, mélység 2 |
| P3 | Proaktív: asztal (javaslatok, naptár), iroda-jelzések | Böngészős kipróbálás |
| D | Dokumentáció, CLAUDE.md, e2e | |

Mind itt megépíthető és tesztelhető. Ami nem: az AI valódi minősége (kulcs és kézi mérés kell), és a valódi naptár-bekötés.

## 8. Amit jóvá kell hagynia

1. **Űrlapok a szabad szöveg helyett** a két asztalnál (téma mint adat)? (Ajánlott.)
2. **Kézi naptár** először, iCal-import később? (Ajánlott.)
3. **A Proaktív csak átadásra és kérésre fut**, önálló pásztázás nélkül? (Ajánlott.)
4. **Napi korlát:** 10 csomag és 5 javaslat ügyfelenként?
5. **Egy csomag, öt szakasz** (háttér, Q&A, üzenetkeretek, red flag, talking points), vagy külön anyagként kérné őket?
6. Az **elfogadott javaslat után a felület felajánlja** a Felkészítő-kérelmet (nem indul magától)? (Ajánlott.)
