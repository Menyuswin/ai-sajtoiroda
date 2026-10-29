# Nyitott kérdések a megvalósítás előtt

A modell leírása kész. Mielőtt bármi futtatható készül, ezeket kell eldönteni. A sorrend a bevezetési szakaszokat követi.

## Alapdöntések

> **Eldöntve 2026-10-29:** ügyfeleknek készül, a szakmai területet az ügyfél adja meg; a vezető csevegőfelületen és e-mailben dolgozik a rendszerrel; az első lépés a Monitoring Ügynök prototípusa.

1. **Szakmai terület.** Egyelőre általános. A specializáció a promptokat, a forráslistát és a prioritási szabályokat érinti.
2. **Ki a felhasználó?** Saját használatra készül (a vezető Ön), vagy ügyfeleknek kínált szolgáltatás alapja lesz? Ez dönti el, hány szervezet adatait kell egymástól elválasztani.
3. **Felület.** Hol dolgozik a vezető a rendszerrel: e-mailben kapott összefoglalókkal, egy webes irányítópulton, vagy egy csevegőfelületen?

## Az 1. szakasz (Monitoring, Kapcsolattartó) kérdései

4. **Források a monitoringhoz.** RSS-csatornák (ahogy a manyai.hu sajtófigyelője), hírkereső szolgáltatás, közösségi média? A fizetős médiafigyelő adatbázisok jobbak, de költségesek.
5. **Postafiók-hozzáférés.** A Kapcsolattartó Ügynöknek olvasnia kell a sajtós postafiókot, és tervezetet kell írnia. Melyik postafiókról van szó (Gmail, iCloud, céges Exchange)? **Döntés (2026-10-29):** a nulladik ügyfélnél iCloud; Gmail és céges Exchange ügyfelenként beállítható. Terv: `docs/11`.
6. **Telefonhívások.** A valós idejű jegyzőkönyvhöz hívásrögzítés és átirat kell. Ehhez a hívó fél tájékoztatása jogi kötelezettség. Az első szakaszban érdemes a hívások utáni, kézi összefoglalóval kezdeni. **Döntés (2026-10-29):** a bejövő hívások kezelése és a hívóval való beszélgetés **ElevenLabs**-szal készül, a fejlesztés **legvégén**; addig a kézi jegyzet útvonal működik (docs/11, 10. fejezet: ott a megvalósítás előtt eldöntendő szempontok).

## Adatvédelem és felelősség

7. **GDPR.** Az újságírók neve, elérhetősége és a kapcsolattartási napló személyes adat. Kell adatkezelési tájékoztató, megőrzési idő és törlési rend.
8. **EU AI Act.** Ha a rendszer ügyfeleknek szolgáltat, át kell nézni, milyen átláthatósági kötelezettségek vonatkoznak rá (például annak jelzése, hogy egy szöveget AI készített elő).
9. **Napló.** Hol tárolódik az ügynökök javaslatainak és a vezető döntéseinek naplója, és ki fér hozzá?

## Javasolt első lépés

Egy kis, működő prototípus csak a Monitoring Ügynökkel: napi sajtószemle e-mailben a megadott kulcsszavakra, értelmező összefoglalóval. Ez a manyai.hu-n már futó sajtófigyelőre építhet, és egyben bemutató anyag a „AI-alapú médiafigyelés” szolgáltatáshoz.
