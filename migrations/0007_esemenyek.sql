-- Az Eseményszervező munkatárs adatai (docs/13).
-- esemenyek.allapot: koncepcio | szervezes | lezajlott | utomunka | lezarva | elvetve | elhalasztva
-- meghivok.allapot: tervezet | elkuldve   (próbaüzemben az „elkuldve” a kimenő mappába kerülést jelenti)
-- meghivok.valasz / valasz_javaslat: nincs | reszt_vesz | nem_vesz_reszt | bizonytalan
CREATE TABLE IF NOT EXISTS esemenyek (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  cim            TEXT NOT NULL,
  tema           TEXT NOT NULL,
  formatum       TEXT NOT NULL,
  allapot        TEXT NOT NULL,
  idopont        TEXT,
  helyszin       TEXT,
  keret          INTEGER,
  javaslat_id    TEXT,
  koncepcio_anyag_id TEXT,
  utomunka_anyag_id  TEXT,
  ellenorzolista_json TEXT,
  meghivo_targy  TEXT,
  meghivo_szoveg TEXT,
  jovahagyva_by  TEXT,
  jovahagyva_ido TEXT,
  ido            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_esemenyek_allapot ON esemenyek (tenant_id, allapot, ido);

CREATE TABLE IF NOT EXISTS sajtolista (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  nev         TEXT NOT NULL,
  medium      TEXT,
  email       TEXT NOT NULL,
  tema        TEXT,
  prioritas   INTEGER NOT NULL DEFAULT 2,
  megjegyzes  TEXT,
  hozzajarulas INTEGER NOT NULL DEFAULT 0,
  ido         TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sajtolista_email ON sajtolista (tenant_id, email);

CREATE TABLE IF NOT EXISTS meghivok (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  esemeny_id  TEXT NOT NULL,
  kapcsolat_id TEXT NOT NULL,
  allapot     TEXT NOT NULL DEFAULT 'tervezet',
  valasz      TEXT NOT NULL DEFAULT 'nincs',
  valasz_javaslat TEXT,
  level_id    TEXT,
  kuldve      TEXT,
  ido         TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meghivok ON meghivok (tenant_id, esemeny_id, kapcsolat_id);
