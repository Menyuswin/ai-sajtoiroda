-- A Kapcsolattartó Munkatárs levelei (docs/11). A levélszöveg személyes adatot tartalmazhat: a megőrzési idő után törlődik.
-- allapot: uj | tervezet_kesz | jovahagyva | elvetve | halasztva | tovabbitva | hiba
-- forras: postafiok (lekérdezéssel) | hid (a levélhíd küldte) | kezi (a vezető vitte fel)
CREATE TABLE IF NOT EXISTS levelek (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  azonosito     TEXT NOT NULL,
  forras        TEXT NOT NULL,
  felado        TEXT NOT NULL,
  felado_nev    TEXT,
  targy         TEXT NOT NULL,
  szoveg        TEXT NOT NULL,
  ido           TEXT NOT NULL,
  fogadva       TEXT NOT NULL,
  allapot       TEXT NOT NULL DEFAULT 'uj',
  besorolas_json TEXT,
  anyag_id      TEXT,
  valasz_json   TEXT,
  dontes_by     TEXT,
  dontes_ido    TEXT,
  olvasott      INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_levelek_azonosito ON levelek (tenant_id, azonosito);
CREATE INDEX IF NOT EXISTS idx_levelek_allapot ON levelek (tenant_id, allapot, fogadva);

-- A postafiók lekérdezésének állapota ügyfelenként (kurzor, utolsó siker, utolsó hiba). Titkot nem tartalmaz.
CREATE TABLE IF NOT EXISTS postafiok_allapot (
  tenant_id      TEXT PRIMARY KEY,
  kurzor         TEXT,
  utolso_siker   TEXT,
  utolso_hiba    TEXT,
  utolso_hiba_ido TEXT
);
