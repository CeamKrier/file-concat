-- Exact quantities, scoped to a run (ADR-0014).
--
-- Buckets were replaced by exact integers: an exact number can be bucketed
-- inside a query, a stored bucket can never be recovered. `run` is a counter
-- that restarts at 1 on every page load, so the events of one drop group
-- together without introducing any identifier that outlives the page.
--
-- Rows written before this migration carry NULL in all three columns, which is
-- what tells them apart from the new shape. Their `value` still holds the old
-- bucket label for batch_size / ingest_ms / bundle_size; nothing reads it.

ALTER TABLE events ADD COLUMN run INTEGER;
ALTER TABLE events ADD COLUMN n INTEGER;
ALTER TABLE events ADD COLUMN b INTEGER;

-- The unit of analysis: "one drop and everything that followed it".
CREATE INDEX IF NOT EXISTS idx_events_page_run ON events (page, run);
