-- A Proaktív munkatárs: a vezető által felvitt naptár és a megszólalási javaslatok (docs/12).
-- tipus: kulso | sajat | vezetoi;  allapot (javaslat): nyitott | elfogadva | elvetve | halasztva
CREATE TABLE IF NOT EXISTS naptar (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  datum      TEXT NOT NULL,
  cim        TEXT NOT NULL,
  megjegyzes TEXT,
  tipus      TEXT NOT NULL,
  ido        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_naptar_datum ON naptar (tenant_id, datum);

CREATE TABLE IF NOT EXISTS javaslatok (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  cim         TEXT NOT NULL,
  tema        TEXT NOT NULL,
  anyag_id    TEXT,
  forras_json TEXT,
  atadas_id   TEXT,
  allapot     TEXT NOT NULL DEFAULT 'nyitott',
  csomag_atadas_id TEXT,
  dontes_by   TEXT,
  dontes_ido  TEXT,
  ido         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_javaslatok_allapot ON javaslatok (tenant_id, allapot, ido);
