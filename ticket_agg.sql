-- Agregat tiket per periode: dipakai /api/summary/insight supaya tidak
-- GROUP BY seluruh tabel `tickets` di setiap request.
CREATE TABLE IF NOT EXISTS ticket_agg (
  period_id INTEGER NOT NULL,
  sub TEXT, type TEXT, cat TEXT, company TEXT, custcat TEXT,
  n INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agg_period ON ticket_agg(period_id);

-- Penanda versi: agregat sebuah periode dianggap valid selama barisnya ada
-- dan cocok dengan versi periode. chunk.js menghapus barisnya saat upload tiket.
CREATE TABLE IF NOT EXISTS ticket_agg_ver (
  period_id INTEGER PRIMARY KEY,
  ver TEXT NOT NULL
);
