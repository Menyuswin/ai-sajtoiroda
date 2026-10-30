-- Saját belépés (jelmondat) próbálkozásainak számlálója: a találgatás lassítására (docs/17). Titkot nem tartalmaz.
CREATE TABLE IF NOT EXISTS belepes_proba (
  kulcs        TEXT PRIMARY KEY,
  hibak        INTEGER NOT NULL DEFAULT 0,
  ablak_kezdet TEXT NOT NULL,
  zarolva_ig   TEXT
);
