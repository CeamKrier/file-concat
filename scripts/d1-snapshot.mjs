// One read of the `events` table, then every question answered locally.
//
// D1 bills rows scanned, and an analytic statement over this table scans it:
// every CTE join and self-join in a reader rescans the whole window per
// statement. Before this file existed one reading ran a few dozen such
// statements remotely and read tens of millions of rows out of a table
// holding a few tens of thousands. Now the only remote statement is a single
// range scan over `idx_events_ts`, and the rows answer every query through
// `node:sqlite`, which is the same engine D1 runs, so the SQL is unchanged.
//
// Two side effects are the point rather than a bonus. Every statement in a
// reading cuts exactly the same rows, which a batched remote call never
// guaranteed because the table is live underneath it. And a saved snapshot
// answers a hand query for free, on the rows the reading actually saw.
//
// Zero dependencies: wrangler holds the auth, `node:sqlite` ships with node.
//
//   import { openEvents } from "./d1-snapshot.mjs";
//   const db = openEvents({ days: 90 });              // pulls remote, once
//   const db = openEvents({ days: 90, local: true }); // pulls the local D1
//   const db = openEvents({ file: "snap.json" });     // reuses a saved pull
//   db.query("SELECT ... FROM events WHERE ...");     // one statement
//   db.save("snap.json");
//   db.meta   // { source, pulled_at, since_ts, rows, rows_read }

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = join(REPO_ROOT, "apps", "web");
const CONFIG = join(WEB_DIR, "wrangler.jsonc");
const DB = "fileconcat-metrics";

// The live schema, minus nothing: the four indexes are what keep the join-heavy
// readers fast on the in-memory copy too.
const SCHEMA = `
  CREATE TABLE events (
    id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, page TEXT NOT NULL,
    name TEXT NOT NULL, value TEXT, run INTEGER, n INTEGER, b INTEGER);
  CREATE INDEX idx_events_name_value ON events (name, value);
  CREATE INDEX idx_events_ts ON events (ts);
  CREATE INDEX idx_events_page ON events (page);
  CREATE INDEX idx_events_page_run ON events (page, run);`;
const COLUMNS = ["id", "ts", "page", "name", "value", "run", "n", "b"];

function pull({ days, local }) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  // The --config flag is not optional: D1 state is keyed by the config file
  // path, so querying without it hits a different database and reports zero.
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      DB,
      local ? "--local" : "--remote",
      "--config",
      CONFIG,
      "--json",
      "--command",
      `SELECT ${COLUMNS.join(", ")} FROM events WHERE ts >= ${since} ORDER BY id;`,
    ],
    { cwd: WEB_DIR, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  // Some wrangler versions print a banner before the JSON payload.
  const start = out.indexOf("[");
  if (start === -1) throw new Error(`no JSON in wrangler output:\n${out.slice(0, 400)}`);
  const [set] = JSON.parse(out.slice(start));
  return {
    meta: {
      source: local ? "local" : "remote",
      pulled_at: new Date().toISOString(),
      since_ts: since,
      rows: set.results.length,
      rows_read: set.meta?.rows_read ?? null,
    },
    rows: set.results.map((r) => COLUMNS.map((c) => r[c] ?? null)),
  };
}

export function openEvents({ days = 90, local = false, file = null } = {}) {
  const snap = file ? JSON.parse(readFileSync(file, "utf8")) : pull({ days, local });
  if (file) snap.meta.source = `snapshot ${file}`;

  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const insert = db.prepare(
    `INSERT INTO events (${COLUMNS.join(", ")}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec("BEGIN");
  for (const row of snap.rows) insert.run(...row);
  db.exec("COMMIT");

  return {
    meta: snap.meta,
    query: (sql) => db.prepare(sql).all(),
    save: (path) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ meta: snap.meta, columns: COLUMNS, rows: snap.rows }));
    },
  };
}
