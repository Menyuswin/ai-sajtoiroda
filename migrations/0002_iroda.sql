-- Az iroda: belépés, elrendezés, anyagok (a munkatársak munkái), rákérdezések, utasítások.

-- Ki melyik ügyfél irodáját láthatja, és milyen szerepben (a belépést a Cloudflare Access végzi, ez az engedély).
CREATE TABLE IF NOT EXISTS felhasznalok (
  email     TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  szerep    TEXT NOT NULL CHECK (szerep IN ('vezeto', 'uzemelteto')),
  PRIMARY KEY (email, tenant_id)
);

-- Külön domén → ügyfél.
CREATE TABLE IF NOT EXISTS domenek (
  host      TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL
);

-- Az asztalkártyák elrendezése, felhasználónként.
CREATE TABLE IF NOT EXISTS elrendezes (
  email     TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  json      TEXT NOT NULL,
  PRIMARY KEY (email, tenant_id)
);

-- A munkatársak munkái: szemle, riasztás, jelentés, később tervezet (választervezet, kommunikációs terv, …).
CREATE TABLE IF NOT EXISTS anyagok (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ugynok    TEXT NOT NULL,
  tipus     TEXT NOT NULL,
  cim       TEXT NOT NULL,
  szoveg    TEXT NOT NULL,
  html      TEXT,
  meta_json TEXT,
  allapot   TEXT NOT NULL DEFAULT 'kesz',
  ido       TEXT NOT NULL,
  olvasott  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_anyagok_tenant ON anyagok (tenant_id, ugynok, ido);

-- Rákérdezések egy anyagra és a munkatárs válaszai.
CREATE TABLE IF NOT EXISTS uzenetek (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  anyag_id  TEXT NOT NULL,
  szerep    TEXT NOT NULL CHECK (szerep IN ('vezeto', 'ugynok')),
  szoveg    TEXT NOT NULL,
  ido       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uzenetek_anyag ON uzenetek (tenant_id, anyag_id, ido);

-- A vezető utasításai (feladatai) a munkatársaknek.
-- allapot: javaslat | vegrehajtva | elvetve | kesz | visszakerdez | hiba
CREATE TABLE IF NOT EXISTS utasitasok (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  ugynok      TEXT NOT NULL,
  szoveg      TEXT NOT NULL,
  muvelet_json TEXT,
  allapot     TEXT NOT NULL,
  valasz      TEXT,
  anyag_id    TEXT,
  ido         TEXT NOT NULL,
  dontes_by   TEXT,
  dontes_ido  TEXT
);
CREATE INDEX IF NOT EXISTS idx_utasitasok_tenant ON utasitasok (tenant_id, ugynok, ido);
