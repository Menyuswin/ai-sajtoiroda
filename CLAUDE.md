# AI-sajtóiroda – útmutató a munkamenetekhez

Egy AI-munkatársakra épülő, emberi vezető által irányított általános sajtóiroda modellje, ügyfeleknek szánt szolgáltatásként. A tulajdonos **Mányai Zoltán** (kommunikációs szakember, nem programozó; érdeklődési köre a „miért”, nem a „hova kattintsak”). Ez a fájl a munka teljes átadási pontja: aki (ember vagy Claude) innen folytatja, ebből mindent megtud.

## Munkamód (a tulajdonossal)

- **Válaszok magyarul**, irodalmi igényességgel, alapos, összefüggő szöveggel, példákkal; latin eredetű idegen szó megengedett. A fókuszt tartsuk: ne vigyen el a válasz a céltól.
- **Terv előbb.** Új vagy nagyobb feladatnál először terv (a `docs/`-ba), jóváhagyás után építés. Kétértelmű kérésnél ne ugorjunk bele; adjunk konkrét javaslatot vitaalapnak.
- **Konzisztencia.** Amiben megállapodtunk, az úgy van; ne kelljen kétszer elmondani.
- **Elnevezés (2026-10-30):** a nyolc AI-segítőt **„munkatárs”**-nak hívjuk (nem „ügynök”), minden felhasználónak szánt szövegben, a dokumentációban és a felületen (pl. „Kapcsolattartó Munkatárs”). A technikai azonosítók (`ugynok`, `agents/`, `src/agents/`, `ugynokok` a profilban) változatlanok maradnak. Magyar ragozásnál ügyeljünk a magánhangzó-illeszkedésre (munkatársnak, munkatársat) és a névelőre („a munkatárs”).
- **Biztonság.** Ami a nevében a közönsége elé menne (levél, poszt, automatizmus), azt óvatosan kell kezelni. A rendszer kifelé semmit nem küld jóváhagyás nélkül.
- **Szövegek a nevében** (poszt, levél, hírlevél, landing, prezi): tapasztalt barát hangja, nem guru, nem hype; konkrét példák, számok az általánosságok helyett.
- **Őszinteség:** ha valami nincs kipróbálva vagy nincs kész, azt ki kell mondani (lásd „Korlátok”).

## Állapot (2026-10-29)

Koncepció + működő, tesztelt **száraz módú** rendszer; **semmi nincs élesben telepítve**, és nem küld levelet.

| Elem | Állapot |
|------|---------|
| Modell, munkatárs-specifikációk (`docs/01–05`, `agents/*.yaml`) | kész |
| Közös mag (`src/core/`) | kész, tesztelt |
| Monitoring Munkatárs (`src/agents/monitoring/`) | kész, száraz módban, tesztelt |
| Cloudflare-réteg (`src/cloudflare/`, `src/worker/`, `migrations/`, `wrangler.toml`) | kész, a csomag szárazon összeáll; **nincs telepítve** |
| Az iroda felülete és API-ja (`ui/`, `src/api/`) | kész, tesztelt, böngészőben kipróbálva; **nincs telepítve** |
| Telepíthető weboldal (PWA): manifest, service worker (az API-t nem tárolja), ikonok | kész, tesztelt |
| Munkatársak közötti átadások (`docs/10`, `src/core/handoff.js`) | kész, tesztelt; az első valódi átadás: Monitoring riasztás → Proaktív (üres asztal, várakozik) |
| Dokumentumtár (`docs/09`, `src/docs/`) | kész, tesztelt (valódi docx/PDF fájlokon); R2 (az eredeti fájlok tárolása) nincs bekapcsolva |
| Kapcsolattartó Munkatárs (`docs/11`, `src/agents/kapcsolattarto/`, `src/mail/`) | kész, tesztelt: levelek fogadása (Gmail API, Exchange/Graph, levélhíd az iCloudhoz, kézi felvitel), besorolás, választervezet, vezetői döntés a kimenő kapun át; a levélküldés (P6) és a telefon (ElevenLabs) hátra van |
| Levélhíd (`tools/levelhid/`) | kész, a logikája tesztelt; **valódi iCloud-kapcsolattal nem próbáltuk** |
| Felkészítő és Proaktív Munkatárs (`docs/12`, `src/agents/felkeszito/`, `src/agents/proaktiv/`) | kész, tesztelt: felkészítő csomag (háttér, Q&A, üzenetkeretek, red flagek, talking points), megszólalási javaslat (időzítést a program számolja, a naptár alapján), vezetői döntés, kézi naptár; a lánc Monitoring → Proaktív → Felkészítő működik; AI nélkül csak váz (`[KITÖLTENDŐ]`) |
| Eseményszervező Munkatárs (`docs/13`, `src/agents/esemenyszervezo/`) | kész, tesztelt: koncepció (program számolta időpont és költség), vezetői jóváhagyás, sajtólista (CSV), meghívók a kimenő kapun át (próbaüzemben nem mennek ki), ellenőrzőlista, visszajelzés-javaslat, utómunka; AI nélkül váz |
| Jogi és kockázat Munkatárs (`docs/14`, `src/agents/jogi/`) | kész, tesztelt: szabályalapú alsó határ + AI, ami csak emelhet, szó szerinti idézet, törvényhely-tilalom, automatikus vélemény az átadásokra, riasztás magasnál, tudomásulvétel a levél jóváhagyásánál; a bizalmas anyagokat csak a vezető látja |
| Archívum Munkatárs (`docs/15`, `src/agents/archivum/`) | kész, tesztelt: a kiadott közlések változtathatatlan nyilvántartása (e-mail-cím nélkül), egységes keresés, idővonal, korábbi közlések a tervezet mellett, AI-s ellentmondás-jelzés szó szerinti idézettel (AI nélkül nem ítél), megőrzés |
| Közösségi média Munkatárs (`docs/16`, `src/agents/kozossegi/`) | kész, tesztelt: posztjavaslat platformonként (Facebook, LinkedIn, Instagram, X), kommentkezelési útmutató, program által ellenőrzött platform-szabályok, automatikus jogi vélemény és Archívum-összevetés, „Másolás” és „Kiadtam” (→ Archívum „poszt”); jelzés a Monitoringtól, a Kapcsolattartótól (ismétlődő/feszült/vörös vonalas megkeresés + Bejövő-gomb), a Proaktívtól és kézi digitális jelzésből; **a Monitoring közösségi csatornái** (nyilvános RSS/Atom, a szakterületi kulcsszavak szerint) külön közösségi szemlét és igény szerinti jelentést adnak; semmit nem tesz közzé; X/Facebook/Instagram/TikTok közvetlen olvasása nincs |

168 automatikus teszt (`npm test`) átmegy. Böngészős végpontok közötti kipróbálás: `test/e2e/iroda.e2e.mjs`.

## Alapszabályok (a modellből, nem alkudhatók)

- Minden kimenő válasz, nyilatkozat, meghívó és poszt **csak a vezető jóváhagyásával** megy ki. Egyetlen munkatárs sem küld önállóan semmit kifelé. (Kódban: `src/core/outbox.js`, tesztelt.)
- Minden javaslat és döntés naplóba kerül (hozzáfűzős, az adatbázis is védi).
- A vezető bármikor felülbírálhat, szüneteltethet vagy kikapcsolhat munkatársat.
- Bevezetési sorrend: Monitoring + Kapcsolattartó → Felkészítő + Proaktív → Eseményszervező; a kiegészítők (Archívum, Közösségi média, Jogi és kockázat) igény szerint.
- Az ügyfelek adata szigorúan elkülönül (`tenant_id` minden rétegben).
- A munkatárs csak **zárt műveletlistából** cselekedhet; a feltöltött vagy beérkezett szöveg adat, nem utasítás.

## Döntések (2026-10-29)

- **Kinek:** ügyfeleknek. A szakmai területet az ügyfél adja meg; a rendszer több, egymástól elválasztott ügyfelet kezel. A kulcsszavak ügyfelenként igazíthatók.
- **Felület:** az „iroda” egy weboldal: minden munkatársnak saját asztala van (képletesen: ott „ül” és dolgozik), ahol utasítást kap, ahol látszik a munkája, és ahol a jelentéseit olvasni lehet; anyagra rá lehet kérdezni. Mellette e-mailben is működjön (később). Külön domént kaphat, és később önálló app is épülhet ugyanarra az API-ra.
- **Platform: vegyes.** A motor Cloudflare-en (Workers + D1), a Make-lehetőség megmarad (levélréteg / leválasztott ügyfélpéldány). A Make Free csomagja (2 forgatókönyv, 1000 művelet/hó) foglalt és kevés; fizetős csomag nincs beállítva.
- **Nulladik ügyfél:** a tulajdonos maga (`monitoring/nulladik-ugyfel.yaml`, a jelentések a `zoltan.manyai@icloud.com` címre mennének; a címzett ügyfelenként állítható).
- **Leválaszthatóság:** a motor általános, minden ügyfélfüggő dolog a profilban van; a kiadható csomag = motor + profilsablon + promptok + naplóséma (`docs/06`, 4.8). Az ügyfél felhasználási jogot kaphat, és a saját területéhez igazíthatja.
- **Belépés:** Cloudflare Access (e-mailes egyszeri kód) *vagy*, ha az Access nincs beállítva (az ingyenes csomag bankkártyát kér, a tulajdonos nem kívánja), **saját jelmondatos belépés** (`src/api/session.js`, `docs/17` 2. fejezet: egyetlen felhasználó, 12 órás aláírt süti, 5 hibás próba után 15 perc zár, naplózott); szerepek: vezető, üzemeltető. A címzettet és az AI-jelzést csak az üzemeltető módosíthatja.
- **Commit-azonosság:** `ClaudeMZ <noreply@anthropic.com>` (a repóban beállítva: `git config user.name ClaudeMZ`, `git config user.email noreply@anthropic.com`). Az első két commit `Menyuswin` szerzővel maradt.

## Függő jóváhagyások és nyitott kérdések (ezekre vár a tulajdonos)

1. ~~PWA~~ **Jóváhagyva (2026-10-29):** a webes felület telepíthető weboldal (PWA); a natív program csak később, ha egy ügyfél kéri. Kész.
2. ~~Átadás-modell~~ **Jóváhagyva és megépítve** (`docs/10`).
3. ~~Dokumentumtár~~ **Jóváhagyva az ajánlott beállításokkal** (`docs/09`): txt/md/csv/docx/szöveges PDF; az eredeti is megmarad (R2); szó alapú keresés; 10 MB / fájl, 200 dokumentum, 100 MB / ügyfél; „Nem küldhető AI-nak” jelölés; az Archívum erre épül.
4. **Levélküldő szolgáltatás kiválasztása** (nincs javaslat; szempontok: költség, adatkezelés, magyar levelek). Nélküle az éles mód szándékosan megáll.
5. ~~Postafiók~~ **Eldőlt és megépítve (2026-10-29):** nulladik ügyfél = iCloud (levélhíd); Gmail és céges Exchange ügyfelenként beállítható (`docs/11`). **Telefonhívások:** ElevenLabs, a fejlesztés legvégén (`docs/11`, 10. fejezet). Nyitott még: **GDPR** (7.), **EU AI Act** (8.), **napló tárolása és hozzáférése** (9.), **felhasználási jog szerződése** és a Make felhasználási feltételei az átadásra: jogász bevonásával.
6. **Cloudflare-telepítés** a tulajdonos fiókjában, **domén**, **AI-kulcs** (`ANTHROPIC_API_KEY`).
7. **Push-szabály:** a push jelenleg minden alkalommal a tulajdonos jóváhagyásával megy. Ha ezt tartósan megengedi, ide kell írni.

## Következő lépések (javasolt sorrend)

1. **Levélküldő szolgáltató kiválasztása** (P6): ezzel a jóváhagyott válaszok ténylegesen elmehetnek; addig a kimenő mappába kerülnek. Rövid összehasonlítás kell hozzá (költség, adatkezelés, magyar levelek, küldés az ügyfél saját címéről).
2. Az éles telepítés előkészítése a tulajdonossal (Cloudflare-fiók, D1, R2, Access, domén; `docs/08` 9. fejezet), az iCloud-híd első valódi próbája (`tools/levelhid/README.md`), AI-kulcs és a besorolás minőségének mérése 30 cikkes kézi ellenőrzéssel (`docs/06`, 2. mérföldkő), kéthetes próba a nulladik ügyféllel.
3. **Mind a nyolc munkatárs elkészült** (a Közösségi média is, `docs/16`, a Monitoring közösségi szemléjével együtt). A tulajdonos sorrendje: az összes munkatárs megvan, **következik az éles telepítés** (Cloudflare-fiók, AI-kulcs, iCloud-híd első próbája, 30 cikkes minőségpróba), végül a részletek (a levélküldő szolgáltató, a telefon).
4. **A legvégén: telefonhívások ElevenLabs-szal** (a tulajdonos döntése; a megvalósítás előtt eldöntendő szempontok: `docs/11`, 10. fejezet).

## Legközelebbi teendők (2026-10-30 este; a tulajdonos fejlesztési kerete szűk, ezért csak a legfontosabbak)

Élesben fut: `https://iroda.manyai.hu` (jelmondatos belépés, próbaüzem, AI nélkül). **Kész:** A4 (életjel, forrásállapot-panel, források próbája, `/api/egeszseg`), A5 (a napló nem őriz e-mail-címet, feladónevet, levéltárgyat; csak címtartományt és karakterszámot), a hírkereső szolgáltatója (Google/Bing) állítható. **A3 (e-mail értesítés a riasztásról) megírva és tesztelt, de a bekapcsolása a tulajdonos teendője** (`src/cloudflare/notify.js`; a `wrangler.toml`-ban kikommentezett `[[send_email]]` kötés és `SAJTOIRODA_BELSO_ERTESITES`): Email Routing bekapcsolása a manyai.hu-n, a címzett igazolása, a kötés kikommentezése, a kapcsoló `"1"`, deploy. **Hátravan a `docs/18` szerint:** A2 (kötegelt besorolás, külső kérési keret; csak AI bekapcsolásakor sürgős). **Tulajdonosi lépések, amelyekhez nem kell kód:** a Bing-keresés próbája (Beállítások → Források), az Infostart helyes RSS-címe vagy törlése, AI-kulcs (`wrangler secret put ANTHROPIC_API_KEY`, `SAJTOIRODA_LLM=anthropic`, havi költségkerettel) és a 30 cikkes minőségpróba, iCloud-levélhíd (`tools/levelhid/README.md`, `docs/17` 5. szakasz). **Később:** a lekérés `User-Agent`-jének őszinte cseréje, több felhasználós belépés (passkey), adattörlési parancs, levélküldő szolgáltató, telefon.

## Hol tartunk, és hol folytassuk (2026-10-30)

**Ott folytatjuk:** mind a nyolc munkatárs elkészült és tesztelt (utolsóként a Közösségi média, a Monitoring közösségi szemléjével). **A tulajdonos sorrendje: az éles telepítés következik (Cloudflare-fiók, AI-kulcs, iCloud-híd első próbája), végül a részletek (a levélküldő szolgáltató kiválasztása, a telefon / ElevenLabs).**

**A 2026-10-29/30-i munkamenet döntései és eredményei** (mind fel van töltve, a `main` naprakész, 143 teszt zöld az akkori állapotban; a Közösségi média után 155):
- Postafiók: nulladik ügyfél iCloud (levélhíddal), Gmail és Exchange beállítható; először csak olvasás és tervezet; külön „Sajtó” mappa; 90 napos levélmegőrzés. Kész: `docs/11`.
- Felkészítő és Proaktív: űrlapok, kézi naptár, csak átadásra és kérésre fut, napi 10 csomag és 5 javaslat, egy csomag öt szakasszal, a csomagkérést a felület ajánlja fel. Kész: `docs/12`.
- Eseményszervező: az állapotmenet (koncepció jóváhagyása nélkül semmi nem indul), belső sajtólista (kézi és CSV), meghívó csak a kimenő kapun át és tételes kijelöléssel, korlátok (napi 3 koncepció, 50 meghívótervezet, eseményenként 200 meghívó), javaslat-alapú visszajelzés-követés, a személyes adatok nem mennek az AI-nak. Kész: `docs/13`.
- Jogi és kockázat: zárt kategóriák, a program adja az alsó határt (az AI csak emelhet), szó szerinti idézet, törvényhely-tilalom, magasnál riasztás és tudomásulvétel (nem tilt), automatikus vélemény átadásra és kézi kérés (napi 10), az üzemeltető csak darabszámot lát. Kész: `docs/14`.
- Archívum: automatikus közlés-nyilvántartás (a jóváhagyott válasz és a kiküldött meghívó; médium és címtartomány, nem e-mail), egy keresés a közlések, a Dokumentumtár és az anyagok fölött, az ellentmondás-ítélet csak AI-val és idézettel, 36 hónapos megőrzés, a tartalmat csak a vezető látja. Kész: `docs/15`.
- Telefonhívások: ElevenLabs, a legvégén (`docs/11`, 10. fejezet).

**Az architektúra, amit érdemes tudni (hogy ne kelljen újra felfedezni):**
- Minden munkatárs közös környezete: `src/cloudflare/agentctx.js` (`buildAgentCtx`): napló, asztal, átadások, kimenő kapu, AI, levéltár, dokumentumtár, naptár. Az ütemező, az API és a levélhíd-fogadó is ezt használja. Az **átadás-feldolgozók** (melyik munkatárs mit csinál egy neki küldött átadással) is itt vannak, ügyfélenként; a `handoffHandlers` map csak a tesztek felülírására való.
- Új munkatárs: katalógus (`src/api/catalogue.js`, `elerheto: true`) + munkatárs-mappa (`src/agents/<id>/`) + feldolgozó az `agentctx.js`-ben + API-végpontok a `src/api/router.js`-ben + asztal a `ui/app.js`-ben (a `viewAsztal` a `munka.tipus` alapján dönt) + prompt(ok) a `monitoring/prompts/`-ban.
- **Promptok:** a `prompts` objektum kulcsai: `classify`, `synthesize`, `instruct`, `qa`, `docqa`, `keywords`, `letterClassify`, `letterReply`, `briefing`, `proposal`, `eventConcept`, `legal`, `consistency`, `social`. Új prompt három helyre kell: `src/worker/index.js` (import), `src/dev/serve.js`, `test/helpers.js` (`readPrompts`). Ha valahol hiányzik, a hívás csendben tartalékra esik, ezért teszt kell hozzá.
- **Bizalmas anyag:** a `src/api/router.js` `SENSITIVE_TYPES` listája (valasz_tervezet, felkeszito_csomag, megszolalasi_javaslat, esemeny_koncepcio, esemeny_utomunka, jogi_velemeny, poszt_javaslat): az itt szereplő anyagtípusokat csak a vezető olvashatja; új, bizalmas anyagtípust ide is fel kell venni.
- **Közös védelmek, amelyeket minden új munkatársnak át kell vennie:** napi korlát (a `countSince` mintára), a tartalmat csak a vezető látja (az üzemeltető csak darabszámot), a forrásjelölés-ellenőrzés (`src/agents/common/sources.js`: `stripInvalidRefs`), `[KITÖLTENDŐ]` a nem alátámasztott részre, a „nem küldhető AI-nak” szűrés a dokumentumkeresésnél, a bemenet adat és nem utasítás (zárt műveletlista), minden döntés a naplóba.
- **Migrációk:** `migrations/0001`–`0011` (init, iroda, átadások, dokumentumok, levelek, proaktív, események, archívum, közösségi, belépés, életjel és forrásállapot). Új migráció: következő sorszám; a `d1-shim` és a `wrangler d1 migrations apply` is ezt olvassa.
- **Tesztelés:** `npm test` (168, hálózat nélkül); `test/levelezes.test.js` a levelekre, `test/felkeszito-proaktiv.test.js` a Felkészítőre és a Proaktívra, `test/esemenyszervezo.test.js` az Eseményszervezőre, `test/jogi.test.js` a Jogira, `test/archivum.test.js` az Archívumra, `test/kozossegi.test.js` a Közösségi médiára és a Monitoring közösségi csatornáira; e2e: `NODE_PATH=/opt/node22/lib/node_modules node test/e2e/iroda.e2e.mjs` (képernyőképek: `out/e2e/`); a Worker-csomag próbája: `npx wrangler deploy --dry-run --outdir /tmp/wr`.
- **Felhőmunkamenet apróságai:** a Playwright előre telepített (helyi `npm install playwright` elrontja, nem kell); `tools/levelhid` külön csomag (saját `npm install`); a Playwrightnál a `has-text` kis-nagybetű-független részszövegre illeszt (pl. „Felvétel” a „felvétele” gombra is): pontos illesztéshez `:text-is(...)`.

**Mi nincs még kipróbálva élesben (összefoglalva):** valódi hírforrások, valódi AI-minőség, Cloudflare Worker/D1/Access/R2 élesben, valódi iCloud/Gmail/Exchange, levélküldés, telefon. A részletek a „Korlátok” szakaszban.

## Korlátok (őszintén)

- A **valódi hírforrásokat** (RSS, Google News keresés) a fejlesztői környezetből nem tudtuk lekérni; az értelmező csak mintaadaton van kipróbálva (alapja a manyai.hu-n működő `press.js`). Az első éles futás előtt valódi csatornákon ellenőrizni kell, és a Google News RSS felhasználási feltételeit is.
- Az **AI valódi minősége** nem mért. A Claude-hívások hamis API-val teszteltek. A bemutatóban az utasításértelmezés, a besorolás és a rákérdezés **szabályalapú tartalék** (nem AI).
- A Cloudflare **Worker éles futását** nem próbáltuk; D1-ből csak egy `node:sqlite`-alapú, D1-kompatibilis helyettesítővel teszteltünk.
- A **PDF-kinyerés** (`unpdf`) helyben, valódi PDF-en működik, a Cloudflare Workerben nem futtattuk; beolvasott (szkennelt) PDF és kép felismerése még nincs (a rendszer megmondja, hogy nincs szöveg). Az R2 (eredeti fájlok) kötése a `wrangler.toml`-ban kikommentezve; nélküle csak a kinyert szöveg marad meg.
- A **postafiókok** (iCloud, Gmail, Exchange) valódi fiókkal nem kipróbáltak: a Gmail/Graph illesztők és a levélhíd fogadója hamis szerverrel tesztelt, a híd IMAP-része (`tools/levelhid/levelhid.mjs`) csak szintaktikailag és a hibaágon. A levélküldés nincs bekötve. Részletek: `docs/11`, 9. fejezet.
- A **Felkészítő és a Proaktív** AI nélkül csak vázat ad (a tartalmi részek `[KITÖLTENDŐ]`); az AI-ág hamis API-val tesztelt, a minősége nem mért. A naptár kézi (iCal-import nincs). Részletek: `docs/12`, 9. fejezet.
- Az **Eseményszervező** AI nélkül vázat ad, a sajtóanyag szövegét nem írja; a meghívó tényleges kiküldése a levélküldő kiválasztására vár; a sajtólista GDPR-ját jogász nézze át. Részletek: `docs/13`, 9. fejezet.
- A **Jogi munkatárs** szabályalapú rétege kulcsszavas és mintaalapú (tévedhet mindkét irányba), az AI-minőség nem mért, és nem jogi tanács: a jogász nem pótolható. Részletek: `docs/14`, 8. fejezet.
- Az **Archívum** ellentmondás-ellenőrzésének minősége nem mért; az idézet-ellenőrzés a hamis jelzést kiszűri, a kihagyottat nem; a keresés szó alapú. Részletek: `docs/15`, 8. fejezet.
- A **Közösségi média** AI-s szövegeinek minősége és hangneme nem mért (hamis API-val tesztelt); AI nélkül csak váz. **Az X-et, a Facebookot, az Instagramot és a TikTokot az iroda nem olvassa közvetlenül** (fizetős API kell): a Monitoring közösségi csatornái csak nyilvános RSS/Atom hírcsatornákat (YouTube, Reddit, Mastodon, Bluesky stb.) látnak, a többit a vezető kézi digitális jelzésként viszi fel; valódi csatornákon nem próbáltuk. A hosszkorlátok ajánlott határok; az automatikus indítás küszöbei (3 megkeresés/7 nap, negatív és nagy elérésű jelzés, minden Monitoring-riasztás) kiindulóértékek: az első éles heteken a zajt ellenőrizni kell. Részletek: `docs/16`, 10. fejezet.
- **Élő hírforrások (2026-10-30 tapasztalat):** az első éles futáson a Google News keresések 503-at, a Telex 403-at, az Infostart 404-et adtak (a Worker címéről); a névkeresések tehát jelenleg nem működnek. A forrásállapot-panel (`docs/18`) mutatja, mi működik. A lekérés böngésző-azonosítóval (`User-Agent`) megy (`src/agents/monitoring/sources.js`): ezt őszintén azonosítható értékre kellene cserélni, amit a tulajdonossal egyeztetni kell, mert egyes források ezután blokkolhatnak.
- A **jelmondatos belépés** védelme a jelmondat erősségén múlik (nincs e-mailes kód); külső ügyfeleknek nem elég. Valódi Cloudflare-en még nem próbáltuk.
- A **Cloudflare Access** aláírás-ellenőrzése helyben generált kulccsal tesztelt, valódi Access-szel nem.
- Cloudflare ingyenes csomagján a külső kérések száma (invokációnként) szűk lehet; több hírforrásnál fizetős Workers ajánlott.

## A munka folytatása a saját gépen (Ubuntu)

```bash
# 1. Eszközök: Node 22+, git, (a telepítéshez) wrangler az npx-szel
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs git

# 2. A tár letöltése (privát; GitHub-bejelentkezés kell: gh auth login, vagy SSH-kulcs)
git clone https://github.com/Menyuswin/ai-sajtoiroda.git && cd ai-sajtoiroda
git config user.name ClaudeMZ && git config user.email noreply@anthropic.com

# 3. Függőségek és tesztek
npm install
npm test                      # 168 teszt, hálózat nélkül

# 4. Az iroda kipróbálása a böngészőben (kitalált adatokkal, memóriában)
npm run iroda                 # http://127.0.0.1:8787/ ;  --uzemelteto: üzemeltetői nézet

# 5. Parancssori szemle a tesztadatokon (száraz mód: a levelek az out/ mappába kerülnek)
node src/cli.js monitoring run --profile test/fixtures/profil.yaml --offline-feed test/fixtures/feed.xml

# 6. Böngészős végpontok közötti kipróbálás (egyszer: npm install --no-save playwright && npx playwright install chromium;
#    a felhőmunkamenetben a Playwright előre telepített: NODE_PATH=/opt/node22/lib/node_modules, helyi telepítés NEM kell)
node test/e2e/iroda.e2e.mjs
```

- **Claude Code** a gépen: a tár mappájában `claude` indításával ez a fájl automatikusan betöltődik. A tulajdonos felhasználói beállításai (hangnem, munkamód) a fiókhoz kötöttek; a fenti „Munkamód” szakasz ezek lényegét tartalmazza.
- A **manyai.hu** tár (`Menyuswin/manyai-zoltan`, privát) külön klónozandó, ha a sajtófigyelő kódját kell nézni (`functions/api/press.js`).
- **Éles telepítés** (Cloudflare): lépései a `docs/08` 9. fejezetében (D1 létrehozása, migrációk, profil és hozzáférés SQL-ek: `node src/cli.js profil-sql|hozzaferes-sql|domen-sql`, Access, `wrangler deploy`). A telepítés a tulajdonos fiókjában, az ő jóváhagyásával történik; `SAJTOIRODA_DEV_AUTH` élesben mindig `0`.
- **Éles mód** három feltétele: `SAJTOIRODA_LIVE=1`, a kiválasztott levélküldő beállítása, AI-kulcs. Amíg ezek nincsenek meg, a rendszer nem küld és nem fogyaszt semmit.

## A tár felépítése

```
CLAUDE.md                 ez a fájl
README.md                 áttekintés
docs/01–04                a modell: munkatársak, működés, bevezetés
docs/05                   nyitott kérdések
docs/06                   a Monitoring prototípus terve és döntései
docs/07                   a kód felépítése, kipróbálás, új munkatárs hozzáadása
docs/08                   az iroda (felület) terve, mi készült el, telepítés lépései
docs/09                   a dokumentumtár terve és állapota (kész)
docs/10                   a munkatársak közötti átadások terve és felelősségi mátrixa (kész)
docs/11                   a postafiók-réteg és a Kapcsolattartó Munkatárs terve és állapota (kész, telefon nélkül)
docs/12                   a Felkészítő és a Proaktív munkatárs terve és állapota (kész)
docs/13                   az Eseményszervező munkatárs terve és állapota (kész)
docs/14                   a Jogi és kockázat munkatárs terve és állapota (kész)
docs/15                   az Archívum munkatárs terve és állapota (kész)
docs/16                   a Közösségi média munkatárs terve és állapota (kész)
agents/*.yaml             munkatársanként egy szerepkör-specifikáció
src/core/                 közös mag (profil, napló, kimenő kapu, AI- és levélillesztő)
src/agents/monitoring/    a Monitoring Munkatárs
src/agents/kapcsolattarto/ a Kapcsolattartó Munkatárs (besorolás, tervezet, döntés)
src/mail/                 postafiók-illesztők (Gmail, Graph, híd), levélformátum, levéltár
tools/levelhid/           IMAP → HTTPS levélhíd (iCloud); külön csomag, saját README
src/cloudflare/           D1-illesztők, asztalok adatai, ütemező
src/docs/                 dokumentumtár: kinyerés (txt, md, csv, docx, PDF), tár, keresés, válasz, kulcsszójavaslat
src/api/                  az iroda API-ja, belépés, munkatárs-katalógus
src/worker/               a Cloudflare Worker belépője
src/dev/                  helyi bemutató és D1-helyettesítő
ui/                       az iroda felülete (egy HTML, egy JS, egy CSS)
monitoring/               profilsablon, a nulladik ügyfél profilja, promptok, naplóséma
migrations/               D1 adatbázis-séma
test/                     automatikus tesztek és a böngészős kipróbálás
```

Új munkatárs hozzáadása: `docs/07`, „Új munkatárs hozzáadása”. Új ügyfél: profil (`monitoring/profil-sablon.yaml`) + hozzáférés (`hozzaferes-sql`) + opcionális domén (`domen-sql`).

## Git

Commit a `ClaudeMZ <noreply@anthropic.com>` azonossággal. **Push a tulajdonos jóváhagyásával**; a 2026-10-29-i fejlesztési munkamenetben a tulajdonos kifejezetten kérte: „Pusholj amint tudsz”, ezért a munkamenet commitjai folyamatosan feltöltődtek. Tartós, minden jövőbeli munkamenetre szóló engedély nincs, ha ide nem kerül. A felhőmunkamenetek stop hookja minden pusholatlan commitnál push-ot kér; ez a jóváhagyást nem pótolja. Erőltetett push (force-push) a `main`-re tilos.

A tár GitHub-címe: `Menyuswin/ai-sajtoiroda` (privát). Kapcsolódó tár: `Menyuswin/manyai-zoltan` (a manyai.hu oldal és a sajtófigyelő).
