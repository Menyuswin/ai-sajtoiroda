-- Dokumentumtár (docs/09). Minden tábla ügyfél-azonosítóval (tenant_id) szűrt.
CREATE TABLE IF NOT EXISTS dokumentumok (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  cim           TEXT NOT NULL,
  kategoria     TEXT NOT NULL,
  fajlnev       TEXT NOT NULL,
  tipus         TEXT NOT NULL,
  meret         INTEGER NOT NULL,
  karakterek    INTEGER NOT NULL,
  szakaszok     INTEGER NOT NULL,
  hatokor_json  TEXT,                       -- az ügynökök azonosítóinak listája; NULL = mindegyik
  ai_tiltott    INTEGER NOT NULL DEFAULT 0, -- 1 = a tartalom nem adható át AI-szolgáltatónak
  eredeti_kulcs TEXT,                       -- R2-kulcs; NULL, ha az eredeti nem őrződik meg
  feltolto      TEXT NOT NULL,
  ido           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dokumentumok_tenant ON dokumentumok (tenant_id, ido);

CREATE TABLE IF NOT EXISTS doksi_szakaszok (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  dokumentum_id TEXT NOT NULL,
  sorszam       INTEGER NOT NULL,
  cim           TEXT NOT NULL,
  szoveg        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doksi_szakaszok ON doksi_szakaszok (tenant_id, dokumentum_id, sorszam);

-- Szó alapú keresés: ékezet- és kisbetű-független (a ragozott alakokat az előtagkeresés fogja meg).
CREATE VIRTUAL TABLE IF NOT EXISTS doksi_kereso USING fts5(
  szoveg, cim,
  tenant_id UNINDEXED, dokumentum_id UNINDEXED, szakasz_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
