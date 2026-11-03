-- Versi data untuk cache respons di Worker (lihat functions/_lib/cache.js).
CREATE TABLE IF NOT EXISTS data_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  v INTEGER NOT NULL
);
INSERT OR IGNORE INTO data_version (id, v) VALUES (1, 1);
