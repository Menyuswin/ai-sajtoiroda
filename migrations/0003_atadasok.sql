-- Átadások az ügynökök között. allapot: varakozik | kezbesitve | feldolgozva | lezarva | megallitva | lejart
CREATE TABLE IF NOT EXISTS atadasok (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  tipus      TEXT NOT NULL CHECK (tipus IN ('jelzes', 'kerelem', 'anyag_atadas', 'kerdes')),
  honnan     TEXT NOT NULL,
  hova       TEXT NOT NULL,
  targy      TEXT NOT NULL,
  szoveg     TEXT NOT NULL,
  anyag_id   TEXT,
  szulo_id   TEXT,
  melyseg    INTEGER NOT NULL DEFAULT 0,
  allapot    TEXT NOT NULL,
  ido        TEXT NOT NULL,
  kezbesitve TEXT,
  lezarva    TEXT,
  valasz     TEXT
);
CREATE INDEX IF NOT EXISTS idx_atadasok_hova ON atadasok (tenant_id, hova, allapot);
CREATE INDEX IF NOT EXISTS idx_atadasok_ido ON atadasok (tenant_id, ido);
