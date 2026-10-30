# A rendszer felépítése (a kód)

*Állapot: 2026-10-29. Az első ügynök, a Monitoring, szárazon (dry-run) működik, és a Cloudflare-réteg (D1-tár, ütemező, Worker) kész, de **nincs telepítve**. Éles üzembe helyezés nincs, és nem is lesz addig, amíg a tulajdonos el nem indítja (lásd lent).*

## Az alapgondolat

A sajtóirodának lesz még hat-hét további ügynöke a Monitoring mellett. Ezért nem „egy programot” építettünk, hanem egy **közös magot**, amelyre az ügynökök egymás után ráülnek:

```
src/
  core/                 közös mag – minden ügynök ugyanezt kapja
    profile.js          ügyfélprofil beolvasása és ellenőrzése
    log.js              hozzáfűzős napló, ügyfelenként külön
    store.js            cikktár, ügyfelenként külön
    outbox.js           a kimenő kapu: az alapszabály kódba öntve
    mailer.js           levélküldő illesztők (most: fájlba ír)
    llm.js              AI-illesztő (mock / Claude API) és promptbetöltő
    registry.js         ügynök-nyilvántartás
    config.js           száraz / éles mód
  cloudflare/
    d1.js               D1-illesztők: napló, cikktár, profiltár, próbalevelek
    scheduler.js        ütemezés és ügyfelenkénti futtatás
  api/                  az iroda API-ja (router, belépés, ügynök-katalógus, felület-csomagolás)
  docs/                 dokumentumtár: kinyerés, tárolás és keresés, válasz forrásjelöléssel, kulcsszójavaslat
  worker/index.js       Cloudflare Worker belépő (vékony)
  dev/                  helyi bemutató (D1-helyettesítő, kiszolgáló)
ui/                     az iroda felülete (egy HTML, egy JS, egy CSS)
scripts/build-ui.mjs    a felületet a Worker számára csomagolja
  agents/
    monitoring/         az első ügynök
  cli.js                parancssori belépő
monitoring/             profilsablon, nulladik ügyfél profilja, promptok, naplóséma (ügyfél által igazítható rész)
migrations/             D1 adatbázis-séma
wrangler.toml           Cloudflare beállítás (nincs telepítve)
test/                   automatikus tesztek (hálózat nélkül futnak)
```

**Az alapszabályok a kódban vannak, nem csak a leírásban:**
- Az ügynökök közvetlenül nem küldhetnek levelet; minden az `outbox.js`-en megy át. Belső jelentés és riasztás **csak** a profilban megadott vezetői címre mehet. Minden más (kimenő válasz, meghívó, poszt) vezetői jóváhagyás nélkül elutasításra kerül, és az elutasítás naplózódik. Ez tesztelt.
- Minden javaslat és döntés naplóba kerül (`monitoring/naplo-sema.md`).
- A vezető a profilban bármikor kikapcsolhat egy ügynököt (`ugynokok: { monitoring: { aktiv: false } }`).
- Az ügyfelek adata külön könyvtárban él (`data/<ügyfél-id>/`), és minden naplósor hordozza a `tenant_id`-t.

## Kipróbálás (száraz mód, költség és küldés nélkül)

```bash
npm install
npm test                                  # 81 automatikus teszt
node src/cli.js monitoring run \
  --profile test/fixtures/profil.yaml \
  --offline-feed test/fixtures/feed.xml   # a kimenet: out/pelda-korhazak/
```

Száraz módban a levelek az `out/` mappába kerülnek, nem mennek ki sehová, és az AI egy szabályalapú tartalék (`mock`), ami csak a folyamat kipróbálására jó. Az `--llm anthropic` kapcsolóhoz `ANTHROPIC_API_KEY` kell, és az API használata költséggel jár.

## Mi van kész, és mi nincs

| Kész és tesztelt | Nincs kész / nem ellenőrzött |
|------------------|------------------------------|
| Profil, napló, tár, kimenő kapu, ügynök-nyilvántartás | **Valódi hírforrások lekérése**: a fejlesztői környezetből a híroldalak nem érhetők el, ezért az értelmezőt csak minta-adaton próbáltuk ki. Az alapja a manyai.hu-n már működő `press.js`, de az első éles futás előtt valódi csatornákon ellenőrizni kell |
| Gyűjtés, duplikátum-szűrés, kulcsszavas szűrés | A kulcsszavas hírkereső-csatorna (Google News RSS) működése és felhasználási feltételei |
| Besorolás, trendjelzés, riasztás, napi szemle | Az **AI valódi minősége**: a Claude-hívás hamis API-val tesztelt; a magyar hangnembesorolás pontosságát 30 cikkes kézi ellenőrzéssel kell megmérni (docs/06, 2. mérföldkő) |
| Hibatűrés (rossz forrás, AI-hiba nem állítja le a futást) | **Éles levélküldő**: a szolgáltatás kiválasztása nyitott döntés; addig az éles mód szándékosan megáll |
| Hallucináció-védelem (a cikklistát és a számokat a program írja, a narratíva csak létező cikkszámra hivatkozhat) | **A telepítés és az első futás Cloudflare-en**: a fiók, az adatbázis létrehozása és az ütemezés bekapcsolása az Ön hozzáférésével és jóváhagyásával lehetséges. A Worker éles futását nem próbáltuk; a csomag szárazon összeállt |
| Cloudflare-réteg: D1-séma (módosíthatatlan napló), ügyfél-elkülönített tár, óránkénti ütemező (a szemle-időpont ügyfelenként, nyári/téli idővel), próbalevelek | **Az AI valódi használata** az utasításértelmezésben és a rákérdezésben (hamis API-val tesztelt) |
| Az iroda: API, felület, szerepek, belépés-ellenőrzés, utasítás → javaslat → jóváhagyás, anyagok és rákérdezés (docs/08) | **A többi ügynök** (a Kapcsolattartón és a Monitoringon kívül) asztala üres; az éles Access-belépés bekötése |
| Archívum Ügynök: közlés-nyilvántartás, keresés, idővonal, ellentmondás-jelzés (docs/15) | Az **AI valódi minősége**; a keresés szó alapú, a kihagyott ellentmondást nem látja |
| Jogi és kockázat Ügynök: szabályalapú alsó határ + AI, idézet-ellenőrzés, riasztás, tudomásulvétel (docs/14) | Az **AI valódi minősége**; a szabályalapú réteg kulcsszavas, a jogász nem pótolható |
| Eseményszervező Ügynök: koncepció, jóváhagyás, sajtólista, meghívók, ellenőrzőlista, utómunka (docs/13) | Az **AI valódi minősége**; a meghívók tényleges kiküldése (levélküldő) |
| Felkészítő és Proaktív Ügynök: csomag, megszólalási javaslat, kézi naptár, döntés, átadás-feldolgozók (docs/12) | Az **AI valódi minősége**; a naptár automatikus bekötése (iCal) |
| Kapcsolattartó Ügynök: levelek fogadása (Gmail, Exchange/Graph, levélhíd, kézi), besorolás, választervezet, vezetői döntés a kimenő kapun át (docs/11) | **Valódi postafiókok** (iCloud, Gmail, Exchange): hamis szerverrel tesztelve, valódi fiókkal nem; a levélküldés a levélküldő kiválasztására vár; a telefonhívások (ElevenLabs) a legvégére |
| | Válaszlevél feldolgozása (vezetői visszajelzés e-mailben): a 4. mérföldkő része |
| | Trendjelzés új szereplők / szempontok felismerésére (csak a figyelt kifejezések említésszámát követi) |

## A „Make” és az indítás

A Make Free csomagja (2 forgatókönyv, havi 1000 művelet) mind a két helyét a meglévő automatizmusok foglalják, és a Monitoring műveletigénye is meghaladná, ezért **a Make-ben nem hoztunk létre semmit**. A rendszer ettől még indításra kész, mert a motor nem a Make-hez van kötve:

- A kód, a profilsablon, a promptok és a naplóséma a repóban van, platformfüggetlenül (docs/06, 4.8).
- Az **indítás helye** egyetlen, szándékosan szűk illesztési pont: egy időzített (ütemezett) hívás, amely lefuttatja a `monitoring run`-t. A döntés (2026-10-29): **vegyes**. A motor Cloudflare Workers időzítőn és D1 tárban fut majd (ez a következő építési lépés: a Worker-belépő és a D1-illesztők még nincsenek meg), a Make pedig opcionális marad levélrétegnek vagy leválasztott ügyfélpéldánynak, fizetős csomaggal.
- Az éles mód három feltétele: `SAJTOIRODA_LIVE=1`, a kiválasztott levélküldő beállítása (`SAJTOIRODA_MAILER` és az ahhoz tartozó kulcs), valamint az AI-kulcs (`ANTHROPIC_API_KEY`). Amíg ezek nincsenek meg, a rendszer nem küld ki és nem fogyaszt semmit.

## Új ügynök hozzáadása

1. `src/agents/<név>/index.js`: exportál egy `{ id, modes, run(ctx, { mode }) }` objektumot (a `ctx` a közös magot adja: `profile`, `log`, `store`, `llm`, `outbox`).
2. Regisztrálás a `src/cli.js`-ben (`registerAgent(...)`).
3. Az ügynök spec (`agents/NN-….yaml`) a kiindulás; a promptjai a `monitoring/prompts/` mintájára külön fájlokban éljenek.
4. Ami kifelé szólna, azt **mindig** az `outbox`-on át, `approval` nélkül ugyanis elutasítja a kapu.
5. Az irodába kötéshez: katalógus (`src/api/catalogue.js`, `elerheto: true`), átadás-feldolgozó az `agentctx.js`-ben, API-végpontok a `router.js`-ben, asztal a `ui/app.js`-ben, prompt három helyre (`src/worker/index.js`, `src/dev/serve.js`, `test/helpers.js`), bizalmas anyagtípus a `SENSITIVE_TYPES`-ba. Példa a teljes láncra: a Közösségi média ügynök (`docs/16`, `src/agents/kozossegi/`).
