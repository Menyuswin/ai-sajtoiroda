# AI-sajtóiroda – útmutató a munkamenetekhez

Egy AI-ügynökökre épülő, emberi vezető által irányított általános sajtóiroda modellje, ügyfeleknek szánt szolgáltatásként. A tulajdonos **Mányai Zoltán** (kommunikációs szakember, nem programozó; érdeklődési köre a „miért”, nem a „hova kattintsak”). Ez a fájl a munka teljes átadási pontja: aki (ember vagy Claude) innen folytatja, ebből mindent megtud.

## Munkamód (a tulajdonossal)

- **Válaszok magyarul**, irodalmi igényességgel, alapos, összefüggő szöveggel, példákkal; latin eredetű idegen szó megengedett. A fókuszt tartsuk: ne vigyen el a válasz a céltól.
- **Terv előbb.** Új vagy nagyobb feladatnál először terv (a `docs/`-ba), jóváhagyás után építés. Kétértelmű kérésnél ne ugorjunk bele; adjunk konkrét javaslatot vitaalapnak.
- **Konzisztencia.** Amiben megállapodtunk, az úgy van; ne kelljen kétszer elmondani.
- **Biztonság.** Ami a nevében a közönsége elé menne (levél, poszt, automatizmus), azt óvatosan kell kezelni. A rendszer kifelé semmit nem küld jóváhagyás nélkül.
- **Szövegek a nevében** (poszt, levél, hírlevél, landing, prezi): tapasztalt barát hangja, nem guru, nem hype; konkrét példák, számok az általánosságok helyett.
- **Őszinteség:** ha valami nincs kipróbálva vagy nincs kész, azt ki kell mondani (lásd „Korlátok”).

## Állapot (2026-10-29)

Koncepció + működő, tesztelt **száraz módú** rendszer; **semmi nincs élesben telepítve**, és nem küld levelet.

| Elem | Állapot |
|------|---------|
| Modell, ügynök-specifikációk (`docs/01–05`, `agents/*.yaml`) | kész |
| Közös mag (`src/core/`) | kész, tesztelt |
| Monitoring Ügynök (`src/agents/monitoring/`) | kész, száraz módban, tesztelt |
| Cloudflare-réteg (`src/cloudflare/`, `src/worker/`, `migrations/`, `wrangler.toml`) | kész, a csomag szárazon összeáll; **nincs telepítve** |
| Az iroda felülete és API-ja (`ui/`, `src/api/`) | kész, tesztelt, böngészőben kipróbálva; **nincs telepítve** |
| Telepíthető weboldal (PWA): manifest, service worker (az API-t nem tárolja), ikonok | kész, tesztelt |
| Ügynökök közötti átadások (`docs/10`, `src/core/handoff.js`) | kész, tesztelt; az első valódi átadás: Monitoring riasztás → Proaktív (üres asztal, várakozik) |
| Dokumentumtár (`docs/09`, `src/docs/`) | kész, tesztelt (valódi docx/PDF fájlokon); R2 (az eredeti fájlok tárolása) nincs bekapcsolva |
| A többi 7 ügynök | csak specifikáció; az asztaluk az irodában üres |

81 automatikus teszt (`npm test`) átmegy. Böngészős végpontok közötti kipróbálás: `test/e2e/iroda.e2e.mjs`.

## Alapszabályok (a modellből, nem alkudhatók)

- Minden kimenő válasz, nyilatkozat, meghívó és poszt **csak a vezető jóváhagyásával** megy ki. Egyetlen ügynök sem küld önállóan semmit kifelé. (Kódban: `src/core/outbox.js`, tesztelt.)
- Minden javaslat és döntés naplóba kerül (hozzáfűzős, az adatbázis is védi).
- A vezető bármikor felülbírálhat, szüneteltethet vagy kikapcsolhat ügynököt.
- Bevezetési sorrend: Monitoring + Kapcsolattartó → Felkészítő + Proaktív → Eseményszervező; a kiegészítők (Archívum, Közösségi média, Jogi és kockázat) igény szerint.
- Az ügyfelek adata szigorúan elkülönül (`tenant_id` minden rétegben).
- Az ügynök csak **zárt műveletlistából** cselekedhet; a feltöltött vagy beérkezett szöveg adat, nem utasítás.

## Döntések (2026-10-29)

- **Kinek:** ügyfeleknek. A szakmai területet az ügyfél adja meg; a rendszer több, egymástól elválasztott ügyfelet kezel. A kulcsszavak ügyfelenként igazíthatók.
- **Felület:** az „iroda” egy weboldal: minden ügynöknek saját asztala van (képletesen: ott „ül” és dolgozik), ahol utasítást kap, ahol látszik a munkája, és ahol a jelentéseit olvasni lehet; anyagra rá lehet kérdezni. Mellette e-mailben is működjön (később). Külön domént kaphat, és később önálló app is épülhet ugyanarra az API-ra.
- **Platform: vegyes.** A motor Cloudflare-en (Workers + D1), a Make-lehetőség megmarad (levélréteg / leválasztott ügyfélpéldány). A Make Free csomagja (2 forgatókönyv, 1000 művelet/hó) foglalt és kevés; fizetős csomag nincs beállítva.
- **Nulladik ügyfél:** a tulajdonos maga (`monitoring/nulladik-ugyfel.yaml`, a jelentések a `zoltan.manyai@icloud.com` címre mennének; a címzett ügyfelenként állítható).
- **Leválaszthatóság:** a motor általános, minden ügyfélfüggő dolog a profilban van; a kiadható csomag = motor + profilsablon + promptok + naplóséma (`docs/06`, 4.8). Az ügyfél felhasználási jogot kaphat, és a saját területéhez igazíthatja.
- **Belépés:** Cloudflare Access (e-mailes egyszeri kód); szerepek: vezető, üzemeltető. A címzettet és az AI-jelzést csak az üzemeltető módosíthatja.
- **Commit-azonosság:** `ClaudeMZ <noreply@anthropic.com>` (a repóban beállítva: `git config user.name ClaudeMZ`, `git config user.email noreply@anthropic.com`). Az első két commit `Menyuswin` szerzővel maradt.

## Függő jóváhagyások és nyitott kérdések (ezekre vár a tulajdonos)

1. ~~PWA~~ **Jóváhagyva (2026-10-29):** a webes felület telepíthető weboldal (PWA); a natív program csak később, ha egy ügyfél kéri. Kész.
2. ~~Átadás-modell~~ **Jóváhagyva és megépítve** (`docs/10`).
3. ~~Dokumentumtár~~ **Jóváhagyva az ajánlott beállításokkal** (`docs/09`): txt/md/csv/docx/szöveges PDF; az eredeti is megmarad (R2); szó alapú keresés; 10 MB / fájl, 200 dokumentum, 100 MB / ügyfél; „Nem küldhető AI-nak” jelölés; az Archívum erre épül.
4. **Levélküldő szolgáltatás kiválasztása** (nincs javaslat; szempontok: költség, adatkezelés, magyar levelek). Nélküle az éles mód szándékosan megáll.
5. **Postafiók** a Kapcsolattartó ügynöknek (`docs/05`, 5. kérdés), **telefonhívások kezelése** (6.), **GDPR** (7.), **EU AI Act** (8.), **napló tárolása és hozzáférése** (9.), **felhasználási jog szerződése** és a Make felhasználási feltételei az átadásra: jogász bevonásával.
6. **Cloudflare-telepítés** a tulajdonos fiókjában, **domén**, **AI-kulcs** (`ANTHROPIC_API_KEY`).
7. **Push-szabály:** a push jelenleg minden alkalommal a tulajdonos jóváhagyásával megy. Ha ezt tartósan megengedi, ide kell írni.

## Következő lépések (javasolt sorrend)

1. Az éles telepítés előkészítése a tulajdonossal (Cloudflare-fiók, D1, R2, Access, domén; `docs/08` 9. fejezet), vagy a Kapcsolattartó Ügynök (postafiók-döntés kell hozzá). A dokumentumokra hivatkozó átadások (A4) a következő ügynök érkezésével.
2. A Kapcsolattartó Ügynök (a postafiók-döntés után), mint a Monitoring mellé a bevezetési sorrend szerinti második.
3. Éles telepítés (`docs/08`, 9. fejezet), AI bekapcsolása, a besorolás minőségének mérése 30 cikkes kézi ellenőrzéssel (`docs/06`, 2. mérföldkő), kéthetes próba a nulladik ügyféllel.

## Korlátok (őszintén)

- A **valódi hírforrásokat** (RSS, Google News keresés) a fejlesztői környezetből nem tudtuk lekérni; az értelmező csak mintaadaton van kipróbálva (alapja a manyai.hu-n működő `press.js`). Az első éles futás előtt valódi csatornákon ellenőrizni kell, és a Google News RSS felhasználási feltételeit is.
- Az **AI valódi minősége** nem mért. A Claude-hívások hamis API-val teszteltek. A bemutatóban az utasításértelmezés, a besorolás és a rákérdezés **szabályalapú tartalék** (nem AI).
- A Cloudflare **Worker éles futását** nem próbáltuk; D1-ből csak egy `node:sqlite`-alapú, D1-kompatibilis helyettesítővel teszteltünk.
- A **PDF-kinyerés** (`unpdf`) helyben, valódi PDF-en működik, a Cloudflare Workerben nem futtattuk; beolvasott (szkennelt) PDF és kép felismerése még nincs (a rendszer megmondja, hogy nincs szöveg). Az R2 (eredeti fájlok) kötése a `wrangler.toml`-ban kikommentezve; nélküle csak a kinyert szöveg marad meg.
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
npm test                      # 81 teszt, hálózat nélkül

# 4. Az iroda kipróbálása a böngészőben (kitalált adatokkal, memóriában)
npm run iroda                 # http://127.0.0.1:8787/ ;  --uzemelteto: üzemeltetői nézet

# 5. Parancssori szemle a tesztadatokon (száraz mód: a levelek az out/ mappába kerülnek)
node src/cli.js monitoring run --profile test/fixtures/profil.yaml --offline-feed test/fixtures/feed.xml

# 6. Böngészős végpontok közötti kipróbálás (egyszer: npm install --no-save playwright && npx playwright install chromium)
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
docs/01–04                a modell: ügynökök, működés, bevezetés
docs/05                   nyitott kérdések
docs/06                   a Monitoring prototípus terve és döntései
docs/07                   a kód felépítése, kipróbálás, új ügynök hozzáadása
docs/08                   az iroda (felület) terve, mi készült el, telepítés lépései
docs/09                   a dokumentumtár terve és állapota (kész)
docs/10                   az ügynökök közötti átadások terve és felelősségi mátrixa (kész)
agents/*.yaml             ügynökönként egy szerepkör-specifikáció
src/core/                 közös mag (profil, napló, kimenő kapu, AI- és levélillesztő)
src/agents/monitoring/    a Monitoring Ügynök
src/cloudflare/           D1-illesztők, asztalok adatai, ütemező
src/docs/                 dokumentumtár: kinyerés (txt, md, csv, docx, PDF), tár, keresés, válasz, kulcsszójavaslat
src/api/                  az iroda API-ja, belépés, ügynök-katalógus
src/worker/               a Cloudflare Worker belépője
src/dev/                  helyi bemutató és D1-helyettesítő
ui/                       az iroda felülete (egy HTML, egy JS, egy CSS)
monitoring/               profilsablon, a nulladik ügyfél profilja, promptok, naplóséma
migrations/               D1 adatbázis-séma
test/                     automatikus tesztek és a böngészős kipróbálás
```

Új ügynök hozzáadása: `docs/07`, „Új ügynök hozzáadása”. Új ügyfél: profil (`monitoring/profil-sablon.yaml`) + hozzáférés (`hozzaferes-sql`) + opcionális domén (`domen-sql`).

## Git

Commit a `ClaudeMZ <noreply@anthropic.com>` azonossággal. **Push a tulajdonos jóváhagyásával**; a 2026-10-29-i fejlesztési munkamenetben a tulajdonos kifejezetten kérte: „Pusholj amint tudsz”, ezért a munkamenet commitjai folyamatosan feltöltődtek. Tartós, minden jövőbeli munkamenetre szóló engedély nincs, ha ide nem kerül. A felhőmunkamenetek stop hookja minden pusholatlan commitnál push-ot kér; ez a jóváhagyást nem pótolja. Erőltetett push (force-push) a `main`-re tilos.

A tár GitHub-címe: `Menyuswin/ai-sajtoiroda` (privát). Kapcsolódó tár: `Menyuswin/manyai-zoltan` (a manyai.hu oldal és a sajtófigyelő).
