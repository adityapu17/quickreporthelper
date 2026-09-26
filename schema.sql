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
  customer_email TEXT,
  customer_category TEXT,
  company TEXT,
  raw_json TEXT,
  FOREIGN KEY(period_id) REFERENCES periods(id)
);
CREATE INDEX IF NOT EXISTS idx_tickets_period ON tickets(period_id);

-- Response-time gaps, one row per IN->OUT reply pair, from the "Detail
-- Interaction (non-voice)" file. Powers the Response Time (Email/WhatsApp)
-- calculations when loading a saved period from the database.
CREATE TABLE IF NOT EXISTS response_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL,
  channel TEXT,
  gap_min REAL,
  gap_date TEXT,
  FOREIGN KEY(period_id) REFERENCES periods(id)
);
CREATE INDEX IF NOT EXISTS idx_gaps_period ON response_gaps(period_id);

-- Voice call records from the "Detail Interaction Voice" (CDR) file. Powers
-- AHT / Call Offered / Abandoned / N-FCR for the Voice channel when loading
-- a saved period from the database.
CREATE TABLE IF NOT EXISTS voice_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL,
  event TEXT,
  talktime_min REAL,
  call_date TEXT,
  FOREIGN KEY(period_id) REFERENCES periods(id)
);
CREATE INDEX IF NOT EXISTS idx_voice_period ON voice_records(period_id);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
