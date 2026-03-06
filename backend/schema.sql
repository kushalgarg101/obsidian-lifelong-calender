CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  timezone TEXT NOT NULL,
  reminder_time_local TEXT NOT NULL,
  reminders_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_status (
  email TEXT NOT NULL,
  date TEXT NOT NULL,
  complete INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (email, date)
);

CREATE TABLE IF NOT EXISTS daily_status_sources (
  email TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  complete INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (email, date, source)
);

CREATE TABLE IF NOT EXISTS deliveries (
  email TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (email, date)
);
