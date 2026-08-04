-- Product counters (ADR-0013).
--
-- One row per recorded event. `page` is a random id that lives for a single
-- page load and is never persisted on the device or reused, so rows from one
-- visit can be read as a sequence while nothing links a visit to a person or to
-- another visit. There is deliberately no IP, no user agent, and no file name
-- or content -- `value` carries a file extension, a source type, or a bucket
-- label, and the server rejects anything that is not one of those shapes.

CREATE TABLE IF NOT EXISTS events (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  ts    INTEGER NOT NULL,
  page  TEXT    NOT NULL,
  name  TEXT    NOT NULL,
  value TEXT
);

-- The roadmap query: "which extensions could we not read, how often".
CREATE INDEX IF NOT EXISTS idx_events_name_value ON events (name, value);

-- Time-window queries and retention pruning.
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);

-- Within-visit funnels: "of the pages that saw a drop, how many reached copy".
CREATE INDEX IF NOT EXISTS idx_events_page ON events (page);
