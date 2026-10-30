-- Életjel és forrásállapot (docs/18, A4): az utolsó futás és a figyelt források állapota ügyfelenként. Személyes adatot nem tartalmaz.
CREATE TABLE IF NOT EXISTS futas_allapot (
  tenant_id     TEXT PRIMARY KEY,
  kezdet        TEXT NOT NULL,
  vege          TEXT NOT NULL,
  siker         INTEGER NOT NULL,
  idotartam_ms  INTEGER,
  kulso_keres   INTEGER,
  cikk_lekert   INTEGER,
  cikk_uj       INTEGER,
  hiba          TEXT,
  proba_ido     TEXT
);
CREATE TABLE IF NOT EXISTS forras_allapot (
  tenant_id        TEXT NOT NULL,
  url              TEXT NOT NULL,
  nev              TEXT NOT NULL,
  tipus            TEXT NOT NULL,
  utolso_ido       TEXT NOT NULL,
  utolso_siker_ido TEXT,
  cikkek           INTEGER,
  hiba             TEXT,
  PRIMARY KEY (tenant_id, url)
);
