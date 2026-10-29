# AI-sajtóiroda

Egy általános, szakmai területhez még nem kötött sajtóiroda szervezeti és működési modellje. Az irodát öt AI-alapügynök (és három kiegészítő ügynök) működteti, egy élő emberi vezető irányítása alatt.

A modell a klasszikus sajtóirodai funkciókat valósítja meg mesterséges intelligenciával:

- reaktív válaszadás,
- proaktív napirend-formálás,
- tartalom-előállítás,
- monitoring,
- eseményszervezés.

A végső felelősség, a stratégiai döntés és a humán kontroll a vezető kezében marad. Ez nem „teljesen autonóm” sajtóiroda, hanem egy jól koordinált támogatórendszer, amely a vezető idejét a stratégiai döntésekre és a személyes kapcsolatokra szabadítja fel.

## Állapot

**Koncepció.** A repó jelenleg a modell leírását és az ügynökök szerepkör-specifikációit tartalmazza. Futtatható kód még nincs: a megvalósítás terve a következő lépés (lásd [docs/05-nyitott-kerdesek.md](docs/05-nyitott-kerdesek.md)).

## Az ügynökök

| # | Ügynök | Angol munkanév | Fő feladat | Bevezetési szakasz |
|---|--------|----------------|------------|--------------------|
| 1 | Kommunikációs Kapcsolattartó | Inbox & Call Agent | Beérkező e-mailek és hívások kezelése, választervezetek | 1. |
| 2 | Sajtófelkészítő | Briefing Agent | Háttéranyag, Q&A, talking points a vezetőnek | 2. |
| 3 | Sajtószemle és Monitoring | Media Monitoring Agent | Sajtószemle, narratívák, trendjelzés | 1. |
| 4 | Proaktív Kommunikációs Stratégia | Agenda & Opportunity Agent | Megszólalási lehetőségek, időzítés | 2. |
| 5 | Eseményszervező | Event & Logistics Agent | Sajtóesemények teljes szervezése | 3. |
| 6 | Archívum és Tudásmenedzsment | Archive & Knowledge Agent | Korábbi nyilatkozatok, konzisztencia | kiegészítő |
| 7 | Közösségi média és Digitális Narratíva | Social & Digital Agent | Közösségi platformok figyelése, posztjavaslatok | kiegészítő |
| 8 | Jogi és Kockázatfigyelő | Legal & Risk Agent | Jogi és reputációs kockázatvizsgálat | kiegészítő |

## Tartalom

- [docs/01-alapugynokok.md](docs/01-alapugynokok.md): az öt alapügynök részletes feladatköre
- [docs/02-kiegeszito-ugynokok.md](docs/02-kiegeszito-ugynokok.md): a három javasolt kiegészítő ügynök
- [docs/03-mukodesi-modell.md](docs/03-mukodesi-modell.md): napi ciklus, együttműködés, emberi kontrollpontok, heti és havi ritmus
- [docs/04-bevezetes.md](docs/04-bevezetes.md): fokozatos bevezetés és összegző megfontolások
- [docs/05-nyitott-kerdesek.md](docs/05-nyitott-kerdesek.md): a megvalósítás előtt eldöntendő kérdések
- [agents/](agents/): ügynökönként egy szerepkör-specifikáció (bemenet, kimenet, eszkaláció, jóváhagyás)

## Alapelv

Minden kimenő válasz, nyilatkozat és meghívó a vezető (vagy az általa kijelölt helyettes) jóváhagyásával megy ki. Az ügynökök javasolnak, elemeznek és előkészítenek; dönteni a vezető dönt.
