-- Notes sent from the result screen's feedback panel.
--
-- Written only when someone presses Send. `page` and `run` are the same
-- page-load id and Run counter the events table carries, so a note can be read
-- beside the drop it was written about (which extensions failed, how big the
-- bundle was) without anything new leaving the browser. `origin` is a closed
-- label: yes | no | empty | link. The one-tap yes/no answer itself is a counter
-- (`feedback` in events), not a row here. `email` is set only when someone
-- typed an address into the panel to get a reply.
--
-- Pruned on the same nightly window as the counters (metrics-retention.ts).

CREATE TABLE IF NOT EXISTS feedback (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  page    TEXT    NOT NULL,
  run     INTEGER,
  origin  TEXT    NOT NULL,
  message TEXT    NOT NULL,
  email   TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback (ts);
