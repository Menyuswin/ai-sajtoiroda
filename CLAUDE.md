# AI-sajtóiroda – útmutató a munkamenetekhez

Egy AI-ügynökökre épülő, emberi vezető által irányított általános sajtóiroda modellje. A tulajdonos Mányai Zoltán (kommunikációs szakember, nem programozó). Válaszok magyarul, irodalmi igényességgel, példákkal; nagyobb feladat előtt terv, és csak jóváhagyás után megvalósítás.

## Állapot

Koncepció. A `docs/` a modell leírása (a tulajdonos szövegéből szerkesztve), az `agents/*.yaml` ügynökönként egy szerepkör-specifikáció. Futtatható kód még nincs. Az alapdöntések megvannak (lent); a következő lépés a Monitoring Ügynök prototípusának terve. A `docs/05-nyitott-kerdesek.md` 4–9. kérdése a terv része.

## Döntések (2026-10-29)

- **Kinek:** ügyfeleknek készül. A tulajdonos felkészíti őket a rendszer működtetésére; a szakmai területet az ügyfél határozza meg. Ezért a rendszernek több, egymástól elválasztott ügyfelet (szervezetet) kell kezelnie, saját paraméterekkel és forrásokkal.
- **Felület:** a vezető csevegőfelületen ad utasítást és hagy jóvá; emellett e-mailben is tudjon dolgozni vele (összefoglaló érkezik, válaszban jóváhagy vagy utasít).
- **Első lépés:** a Monitoring Ügynök prototípusa. A többi ügynök később, a bevezetési sorrend szerint.

A prototípus tervét (mielőtt bármi épül) a következő munkamenet készíti el, és a tulajdonos hagyja jóvá.

## Alapszabályok (a modellből, nem alkudhatók)

- Minden kimenő válasz, nyilatkozat, meghívó és poszt csak a vezető jóváhagyásával megy ki. Egyetlen ügynök sem küld önállóan semmit kifelé.
- Minden javaslat és döntés naplóba kerül.
- A vezető bármikor felülbírálhat vagy kikapcsolhat ügynököt.
- Bevezetési sorrend: Monitoring + Kapcsolattartó → Felkészítő + Proaktív → Eseményszervező; a kiegészítők igény szerint.

## Kapcsolódó repók

- `Menyuswin/manyai-zoltan`: a manyai.hu oldal, benne a sajtófigyelő (`functions/api/press.js`), amelyre a Monitoring Ügynök prototípusa építhet, és a Szolgáltatások szekció („AI-alapú médiafigyelés”).

## Git

Commit a `Menyuswin` azonossággal (`git -c user.name=... -c user.email=...`). Push a tulajdonos jóváhagyásával.
