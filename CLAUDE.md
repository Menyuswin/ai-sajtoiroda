# AI-sajtóiroda – útmutató a munkamenetekhez

Egy AI-ügynökökre épülő, emberi vezető által irányított általános sajtóiroda modellje. A tulajdonos Mányai Zoltán (kommunikációs szakember, nem programozó). Válaszok magyarul, irodalmi igényességgel, példákkal; nagyobb feladat előtt terv, és csak jóváhagyás után megvalósítás.

## Állapot

A `docs/` a modell leírása (a tulajdonos szövegéből szerkesztve), az `agents/*.yaml` ügynökönként egy szerepkör-specifikáció. 2026-10-29-től van futtatható kód: a `src/core/` közös mag és a `src/agents/monitoring/` (Node 22, `npm test`, 29 teszt) és a `src/cloudflare/` + `src/worker/` (D1, ütemező, Worker; nincs telepítve), **csak száraz módban**: nem küld levelet, fizetős szolgáltatást nem használ. Éles üzemhez a tulajdonos döntése kell (platform, levélküldő, AI-kulcs, jogi kérdések); ezek a `docs/06` 7. fejezetében és a `docs/07`-ben vannak. A kód leírása: `docs/07-rendszer-felepites.md`.

## Döntések (2026-10-29)

- **Kinek:** ügyfeleknek készül. A tulajdonos felkészíti őket a rendszer működtetésére; a szakmai területet az ügyfél határozza meg. Ezért a rendszernek több, egymástól elválasztott ügyfelet (szervezetet) kell kezelnie, saját paraméterekkel és forrásokkal.
- **Felület:** a vezető csevegőfelületen ad utasítást és hagy jóvá; emellett e-mailben is tudjon dolgozni vele (összefoglaló érkezik, válaszban jóváhagy vagy utasít).
- **Első lépés:** a Monitoring Ügynök prototípusa. A többi ügynök később, a bevezetési sorrend szerint.

**Platform (2026-10-29): vegyes.** A motor Cloudflare-en fut majd, a Make-lehetőség megmarad (levélréteg / leválasztott ügyfélpéldány). **Nulladik ügyfél:** a tulajdonos maga (`monitoring/nulladik-ugyfel.yaml`). **Kezelőfelület:** a megrendelő egy HTML oldalon, számítógépen kezeli a profilt; terve: `docs/08-kezelofelulet-terv.md` (iroda ügynök-asztalokkal, utasítás → javaslat → jóváhagyás; jóváhagyásra vár, kód még nincs).

A prototípus terve: `docs/06-monitoring-prototipus-terv.md`. A tulajdonos 2026-10-29-én az építést elindította, de a Make fizetős csomagja és az éles üzem egyelőre nincs beállítva: a rendszert úgy kell tartani, hogy egy döntéssel elindítható legyen.

## Alapszabályok (a modellből, nem alkudhatók)

- Minden kimenő válasz, nyilatkozat, meghívó és poszt csak a vezető jóváhagyásával megy ki. Egyetlen ügynök sem küld önállóan semmit kifelé.
- Minden javaslat és döntés naplóba kerül.
- A vezető bármikor felülbírálhat vagy kikapcsolhat ügynököt.
- Bevezetési sorrend: Monitoring + Kapcsolattartó → Felkészítő + Proaktív → Eseményszervező; a kiegészítők igény szerint.

## Kapcsolódó repók

- `Menyuswin/manyai-zoltan`: a manyai.hu oldal, benne a sajtófigyelő (`functions/api/press.js`), amelyre a Monitoring Ügynök prototípusa építhet, és a Szolgáltatások szekció („AI-alapú médiafigyelés”).

## Git

Commit a `ClaudeMZ <noreply@anthropic.com>` azonossággal (2026-10-29-i döntés; a repó-szintű `git config user.name/user.email` ezt adja). A korábbi, már pusholt commitok `Menyuswin` szerzővel maradnak (az átírásukhoz erőltetett push kellene). Push a tulajdonos jóváhagyásával.
