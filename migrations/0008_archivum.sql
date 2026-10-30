-- Az Archívum: a kiadott közlések változtathatatlan nyilvántartása (docs/15). A teljes e-mail-cím nem kerül ide: csak a médium és a címtartomány.
-- forras_tipus: level_valasz | meghivo | kezi;  fajta: valasz | meghivo | nyilatkozat | interju | sajtokozlemeny | egyeb
CREATE TABLE IF NOT EXISTS kozlesek (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  forras_tipus   TEXT NOT NULL,
  forras_id      TEXT NOT NULL,
  fajta          TEXT NOT NULL,
  cim            TEXT NOT NULL,
  szoveg         TEXT NOT NULL,
  cimzett_medium TEXT,
  cimzett_domain TEXT,
  jovahagyta     TEXT,
  kiment         INTEGER NOT NULL DEFAULT 0,
  kiadva         TEXT NOT NULL,
  ido            TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kozlesek_forras ON kozlesek (tenant_id, forras_tipus, forras_id);
CREATE INDEX IF NOT EXISTS idx_kozlesek_kiadva ON kozlesek (tenant_id, kiadva);
-- Egy közlés nem módosítható (törölni csak a vezető vagy a megőrzési idő lejárta után lehet).
CREATE TRIGGER IF NOT EXISTS kozlesek_no_update BEFORE UPDATE ON kozlesek
BEGIN SELECT RAISE(ABORT, 'a közlés nem módosítható'); END;

CREATE VIRTUAL TABLE IF NOT EXISTS kozles_kereso USING fts5(
  szoveg, cim,
  tenant_id UNINDEXED, kozles_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Az AI-s ellentmondás-ellenőrzések napi számlálásához.
CREATE TABLE IF NOT EXISTS archivum_ellenorzesek (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ido       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arch_ell ON archivum_ellenorzesek (tenant_id, ido);
