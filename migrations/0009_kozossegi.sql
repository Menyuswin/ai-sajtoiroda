-- A Közösségi média munkatárs (docs/16): posztjavaslatok és a vezető által felvitt digitális jelzések.
-- allapot: tervezet | jovahagyva | kiadva | elvetve | kesobb | megfigyelendo (csak megjegyzés, nincs szöveg)
CREATE TABLE IF NOT EXISTS poszt_javaslatok (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  cim         TEXT NOT NULL,
  tema        TEXT NOT NULL,
  tema_kulcs  TEXT NOT NULL,
  anyag_id    TEXT,
  forras_json TEXT,
  atadas_id   TEXT,
  level_id    TEXT,
  allapot     TEXT NOT NULL DEFAULT 'tervezet',
  kiadva_json TEXT,
  dontes_by   TEXT,
  dontes_ido  TEXT,
  ido         TEXT NOT NULL,
  frissitve   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_poszt_allapot ON poszt_javaslatok (tenant_id, allapot, ido);
CREATE INDEX IF NOT EXISTS idx_poszt_tema ON poszt_javaslatok (tenant_id, tema_kulcs, ido);

CREATE TABLE IF NOT EXISTS digitalis_jelzesek (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  platform    TEXT NOT NULL,
  osszefoglalo TEXT NOT NULL,
  hangulat    TEXT NOT NULL,
  elereles    TEXT NOT NULL,
  url         TEXT,
  javaslat_id TEXT,
  ido         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_digjelzes_ido ON digitalis_jelzesek (tenant_id, ido);
