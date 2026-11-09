CREATE TABLE IF NOT EXISTS diagnostic_results (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, version TEXT NOT NULL, body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_diagnostic_results_created ON diagnostic_results(created_at);
