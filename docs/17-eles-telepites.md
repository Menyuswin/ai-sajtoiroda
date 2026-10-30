# Az éles telepítés lépésről lépésre

*Állapot: **útmutató, a tulajdonossal együtt végzendő** (2026-10-30). A telepítés az Ön Cloudflare-fiókjában történik, az Ön jóváhagyásával; én a fiókhoz nem férek hozzá, ezért a parancsokat Ön futtatja a saját gépén (Ubuntu), és a kimenetüket nekem is megmutathatja, ha elakad.*

## A logika: hat szakasz, mindegyik után megállunk

A telepítést azért bontjuk szakaszokra, mert minden szakasz **önállóan ellenőrizhető**, és az elsők semmit nem küldenek ki és nem fogyasztanak. Ha valami elromlik, tudjuk, melyik lépésnél.

| # | Szakasz | Mit bizonyít | Kockázat |
|---|---------|--------------|----------|
| 1 | Cloudflare-fiók, adatbázis, első telepítés **zárva** | a Worker és a D1 él | nincs (az oldal zárva marad) |
| 2 | Belépés (saját jelmondat) és saját domén | csak Ön léphet be | alacsony |
| 3 | Nulladik ügyfél betöltése, ingyenes „mock” üzemmód | az iroda éles tárhelyen működik, AI nélkül | nincs |
| 4 | AI-kulcs és minőségpróba (30 cikk) | az AI tényleg jól dolgozik-e | kis költség |
| 5 | iCloud-levélhíd | a levelek beérkeznek (csak olvasás) | alacsony |
| 6 | Kéthetes próba a nulladik ügyféllel | a zaj, a költség, a minőség valós képe | közepes, ezért figyeljük |

**A levélküldés (`SAJTOIRODA_LIVE=1`) nincs a listán**: addig, amíg a levélküldő szolgáltatót ki nem választottuk, a jóváhagyott válaszok a „kimenő” mappába kerülnek, és semmi nem megy ki. Ez szándékos védelem.

## 0. Előkészület a gépén (egyszer)

```bash
git clone https://github.com/Menyuswin/ai-sajtoiroda.git && cd ai-sajtoiroda   # ha még nincs meg
git pull
npm install
npm test            # 155 teszt: ha ez zöld, a kód rendben van
npx wrangler login  # megnyílik a böngésző; a Cloudflare-fiókjával lépjen be
npx wrangler whoami # ellenőrzés: a helyes fiókot mutatja-e
```

## 1. Adatbázis és első telepítés (zárva)

```bash
npx wrangler d1 create ai-sajtoiroda
```
A parancs kiír egy `database_id` értéket. **Ezt írja be** a `wrangler.toml`-ba az `IDE-KERUL-A-D1-AZONOSITO` helyére (vagy küldje el nekem, és beírom).

```bash
npx wrangler d1 migrations apply ai-sajtoiroda --remote   # a 9 migráció (táblák)
npx wrangler deploy                                        # első telepítés
```
A kimenet egy `https://ai-sajtoiroda.<fiók>.workers.dev` címet ad. Ha megnyitja, **szándékosan zárva van** (az `ACCESS_TEAM_DOMAIN` üres): ez a jó jel. Az `SAJTOIRODA_DEV_AUTH` maradjon `0`, különben bárki beléphetne.

**Miért így:** először az üres, zárt váz kerül fel. Így az adatbázis és a Worker működését az éles adatok nélkül ellenőrizzük.

## 2. Belépés: saját jelmondatos belépés (Access nélkül)

A Cloudflare Access ingyenes csomagja bankkártya megadását kéri, ezért a tulajdonos döntése szerint **saját belépés** készült (`src/api/session.js`). Működése: egyetlen felhasználó, egy hosszú **jelmondat** (Workers-titok), a belépés után aláírt, böngészőből nem olvasható (HttpOnly, Secure, SameSite=Strict) süti, 12 óráig érvényes. A jelmondat cseréje minden munkamenetet érvénytelenít. **5 hibás próba után 15 percre zárol** (az egész belépésre, mert egyetlen felhasználó van: a támadó így legfeljebb kizárhatja Önt 15 percre, bejutni nem tud). Minden belépési kísérlet a naplóba kerül (`belepes`).

**Fontos különbség az Accesshez képest:** nincs e-mailes kód, a védelem a jelmondat erősségén múlik. Ezért **legalább 20 karakter** kell (rövidebbel a belépés nem engedi magát bekapcsolni), és legyen **6–8 véletlen szó** (pl. „korte-alma-szel-kert-nyar-hold-…”, de ne ez), amit sehol máshol nem használ. A jelmondatot jelszókezelőben tárolja. Külső ügyfeleknél később az Access vagy valódi ügyfél-azonosítás kell.

Beállítás (a `wrangler.toml` `[vars]` része már tartalmazza a `SAJTOIRODA_BELEPES_EMAIL` helyét: írja be az e-mail-címét, ennek a szerepét a 3. lépés SQL-je adja):

```bash
npx wrangler secret put SAJTOIRODA_JELMONDAT     # a jelmondat beillesztése, Enter
npx wrangler deploy
```

Ha a jövőben mégis az Access-t használja, az `ACCESS_TEAM_DOMAIN` és `ACCESS_AUD` kitöltésekor a jelmondatos belépés automatikusan kikapcsol.

## 3. A nulladik ügyfél betöltése

A profil a `monitoring/nulladik-ugyfel.yaml` (ügyfél-azonosító: `manyai-zoltan`). **Mielőtt feltölti, nézze át**: a kulcsszavak, a források, a vörös vonalak az Ön szakterületéhez igazodjanak, és a `vezeto.email` (`zoltan.manyai@icloud.com`) helyes legyen. Szerkessze, vagy mondja meg, mit írjak át.

```bash
node src/cli.js profil-sql --profile monitoring/nulladik-ugyfel.yaml > /tmp/profil.sql
npx wrangler d1 execute ai-sajtoiroda --remote --file /tmp/profil.sql

node src/cli.js hozzaferes-sql --email zoltan.manyai@icloud.com --ugyfel manyai-zoltan --szerep vezeto > /tmp/hozzaferes.sql
npx wrangler d1 execute ai-sajtoiroda --remote --file /tmp/hozzaferes.sql

node src/cli.js domen-sql --domen iroda.manyai.hu --ugyfel manyai-zoltan > /tmp/domen.sql
npx wrangler d1 execute ai-sajtoiroda --remote --file /tmp/domen.sql
```
(Ha a SQL-t a `--file` nem fogadná, a `--command "$(…)"` forma is jó.) Ezután nyissa meg az irodát: be kell tudnia lépni, és látnia kell a nyolc asztalt. **Még mock üzemmódban vagyunk** (`SAJTOIRODA_LLM = "mock"`): a besorolás és az összefoglaló szabályalapú, a szövegek váz. Az ütemező óránként fut (`30 * * * *`); a Beállításokban megadott időpontban készül a napi szemle, a Cloudflare-ben pedig a Worker naplójában (Workers → ai-sajtoiroda → Logs) látszik a futás.

**Ellenőrzőlista (3. szakasz vége):**
- belép a jelmondattal, a saját ügyfelét látja;
- a Beállításokban látszanak a kulcsszavak és a források;
- legkésőbb a következő óra 30. percében a Monitoring fut (Napló nézet: „futás”);
- a jelentések a „kimenő” (próba-) mappába kerülnek, **nem mennek ki**; a Jelentések nézetben olvashatók.

Ha a valódi hírforrások (RSS) elérhetetlenek vagy tiltják a lekérést, a Napló „hiba” sorai megmutatják; ezt itt derítjük ki először, mert a fejlesztői környezetből nem tudtuk kipróbálni.

## 4. AI-kulcs és minőségpróba

1. Kulcs: console.anthropic.com → API Keys → új kulcs; **állítson be havi költségkeretet** (Billing → Limits), pl. 20 USD-t, hogy semmi ne szaladhasson el.
2. A kulcs titokként kerül fel (soha nem a fájlba):
```bash
npx wrangler secret put ANTHROPIC_API_KEY      # beillesztés, Enter
```
3. A `wrangler.toml`-ban `SAJTOIRODA_LLM = "anthropic"`, majd `npx wrangler deploy`.
4. **A minőségpróba** (`docs/06`, 2. mérföldkő): vegyen 30 valódi cikket a figyelt témákból, nézze át az iroda besorolását (hangnem, fontosság, vörös vonal), és számolja, hány helyes. Ha 80% alatt van, a promptokat és a kulcsszavakat igazítjuk, mielőtt továbbmegyünk. Ugyanígy érdemes kipróbálni két-három választervezetet és posztjavaslatot a hangnemére (a Beállításokban megadható a hangnem).

**Miért külön lépés:** eddig az AI-minőség nem mért; ez az első pont, ahol számok alapján dönthetünk.

## 5. Az iCloud-levélhíd

A részletes leírás a `tools/levelhid/README.md`. Dióhéjban (a miérttel):
1. iCloud Levelezésben **„Sajtó” mappa** + szabály, amely oda tereli a sajtóleveleket. *Miért:* az iroda csak ezt a mappát olvassa, a személyes levelezése nem kerül a rendszerbe.
2. appleid.apple.com → **alkalmazásspecifikus jelszó** „levélhíd” néven. *Miért:* a fő Apple-jelszavát nem adja meg sehová, és ez bármikor visszavonható.
3. Híd-titok: `openssl rand -hex 32`; felkerül titokként: `npx wrangler secret put ICLOUD_HID_TITOK`.
4. Az iroda **Beállítások → Postafiók** részén (üzemeltetői nézetben; ez a szerep a saját fiókjának külön „üzemeltető” jogot igényel, ezt a 3. lépés `hozzaferes-sql`-jével adhatja meg `--szerep uzemelteto` kapcsolóval, ha nem látja a mezőt): szolgáltató *iCloud*, a cím, mappa *Sajtó*, titok neve `ICLOUD_HID_TITOK`.
5. Access: a `/hid/*` útvonalra **Bypass** szabály (a híd nem ember, kódot nem tud beírni; a fogadót a híd-titok védi).
6. A híd a saját gépén (vagy egy kis szerveren) fut: `cd tools/levelhid && npm install`, majd `EGYSZER=1 node levelhid.mjs` próbának, utána systemd-szolgáltatásként (a README tartalmazza).

**Első próba:** küldjön magának egy levelet a Sajtó mappába (pl. „Interjúkérés a várólistáról”), futtassa a hidat egyszer, és nézze meg a Bejövőben: megjelent-e, besorolta-e, készült-e választervezet. A híd IMAP-része valódi fiókkal még **nem volt kipróbálva**, ezért itt számítsunk egy-két javításra.

## 6. Kéthetes próba

Hagyja futni, és naponta 5 percet szánjon rá: a szemle hasznos-e, a riasztások nem zajosak-e (különösen a **Közösségi média automatikus javaslatai**: minden Monitoring-riasztás javaslatot indít), a tervezetek használhatók-e. A havi AI-költséget az Anthropic Console-on látja. A két hét végén együtt döntünk a küszöbökről (riasztás, napi korlátok), és csak ezután jön a levélküldő kiválasztása.

## Ami nélkülem is a kezében van (és mire figyeljen)

- **Titkok** (AI-kulcs, híd-titok, alkalmazás-jelszó) csak a `wrangler secret put` parancson át kerülnek fel, **nekem soha ne küldje el őket**, és a tárba sem kerülhetnek.
- **Visszalépés:** az ügynökök a felületen szüneteltethetők; a Workert a Cloudflare-ben egy kattintással ki lehet kapcsolni; az alkalmazás-jelszó az Apple-nél visszavonható.
- **Költség:** a Cloudflare Workers + D1 + Access ingyenes csomagon elindítható; az óránkénti ütemező és a hírforrás-lekérések miatt később fizetős Workers (kb. 5 USD/hó) lehet indokolt. A fő változó költség az AI-használat.
- **Jogi nyitott kérdések** (GDPR, EU AI Act, naplótárolás, ügyfélszerződés) nem a nulladik ügyfélnél, hanem az első külső ügyfél előtt kell, hogy lezáruljanak (`docs/11`, 7–9.).

## Mit kérek Öntől, hogy menjünk tovább

1. A domén neve (`iroda.manyai.hu` jó-e?).
2. Átnézett nulladik ügyfél profil (kulcsszavak, források, vörös vonalak).
3. Az 1. szakasz kimenete (a `database_id` és a `wrangler deploy` üzenete).
