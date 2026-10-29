# AI-sajtóiroda – útmutató a munkamenetekhez

Egy AI-ügynökökre épülő, emberi vezető által irányított általános sajtóiroda modellje. A tulajdonos Mányai Zoltán (kommunikációs szakember, nem programozó). Válaszok magyarul, irodalmi igényességgel, példákkal; nagyobb feladat előtt terv, és csak jóváhagyás után megvalósítás.

## Állapot

Koncepció. A `docs/` a modell leírása (a tulajdonos szövegéből szerkesztve), az `agents/*.yaml` ügynökönként egy szerepkör-specifikáció. Futtatható kód még nincs. A következő lépés a `docs/05-nyitott-kerdesek.md` kérdéseinek eldöntése, utána a Monitoring Ügynök prototípusa.

## Alapszabályok (a modellből, nem alkudhatók)

- Minden kimenő válasz, nyilatkozat, meghívó és poszt csak a vezető jóváhagyásával megy ki. Egyetlen ügynök sem küld önállóan semmit kifelé.
- Minden javaslat és döntés naplóba kerül.
- A vezető bármikor felülbírálhat vagy kikapcsolhat ügynököt.
- Bevezetési sorrend: Monitoring + Kapcsolattartó → Felkészítő + Proaktív → Eseményszervező; a kiegészítők igény szerint.

## Kapcsolódó repók

- `Menyuswin/manyai-zoltan`: a manyai.hu oldal, benne a sajtófigyelő (`functions/api/press.js`), amelyre a Monitoring Ügynök prototípusa építhet, és a Szolgáltatások szekció („AI-alapú médiafigyelés”).

## Git

Commit a `Menyuswin` azonossággal (`git -c user.name=... -c user.email=...`). Push a tulajdonos jóváhagyásával.
