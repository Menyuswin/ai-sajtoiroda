-- Cloudflare D1 séma. Minden tábla ügyfél-azonosítóval (tenant_id) kezdődik, a lekérdezések mindig ezzel szűrnek.

CREATE TABLE IF NOT EXISTS profiles (
  tenant_id    TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  tenant_id   TEXT NOT NULL,
  id          TEXT NOT NULL,
  data_json   TEXT NOT NULL,
  fetched_at  TEXT NOT NULL,
  reported_at TEXT,
  PRIMARY KEY (tenant_id, id)
);

-- Hozzáfűzős napló: módosítani nem lehet (a megőrzési idő lejárta utáni törlés külön, szándékos művelet).
CREATE TABLE IF NOT EXISTS naplo (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  ido           TEXT NOT NULL,
  szereplo      TEXT NOT NULL,
  tipus         TEXT NOT NULL,
  hivatkozas    TEXT,
  tartalom_json TEXT,
  dontes_ref    TEXT
);
CREATE INDEX IF NOT EXISTS idx_naplo_tenant_tipus ON naplo (tenant_id, tipus, ido);
CREATE TRIGGER IF NOT EXISTS naplo_no_update BEFORE UPDATE ON naplo
BEGIN SELECT RAISE(ABORT, 'a napló hozzáfűzős, sor nem módosítható'); END;

-- Száraz mód: a „kiküldött” levelek ide kerülnek, nem mennek ki sehová.
CREATE TABLE IF NOT EXISTS proba_levelek (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ido       TEXT NOT NULL,
  kind      TEXT NOT NULL,
  cimzett   TEXT NOT NULL,
  targy     TEXT NOT NULL,
  szoveg    TEXT NOT NULL,
  html      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proba_levelek_tenant ON proba_levelek (tenant_id, ido);
