CREATE TABLE IF NOT EXISTS periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  label TEXT,
  row_count INTEGER DEFAULT 0,
  uploaded_at TEXT DEFAULT (datetime('now')),
  UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL,
  channel TEXT,
  category TEXT,
  main_category TEXT,
  sub_category_raw TEXT,
  detail_sub_category TEXT,
  escalated INTEGER,
  date_start TEXT,
  date_open TEXT,
  date_end TEXT,
  phone TEXT,
  customer_category TEXT,
  company TEXT,
  raw_json TEXT,
  FOREIGN KEY(period_id) REFERENCES periods(id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_period ON tickets(period_id);
