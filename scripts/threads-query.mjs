#!/usr/bin/env node
// Find live threads asking the questions Search Console says people search for.
//
// The GSC data (scripts/gsc-query.mjs) says the demand is not "concat files",
// it is "chatgpt project sources limit" / "notebooklm source limit" / "claude
// project knowledge exceeds maximum". Those pages sit at position ~10 under
// OpenAI's and Google's own docs, so outranking them is not the play. Being the
// answer in the thread that ranks under them is. This script finds the threads;
// a human writes the answer.
//
// Zero dependencies, same as its siblings.
//
// Reddit needs credentials, and there is no usable way around it. The .json
// endpoints 403 without OAuth, and the .rss ones rate-limit non-deterministically:
// measured, 3 calls spaced 12s apart returned 429, 429, 200. A source that hands
// back a random third of its results each run cannot back a "new since last run"
// report, because the seen file would record a quiet week that never happened.
// So without credentials Reddit is skipped loudly rather than sampled badly.
// Register a "script" app at https://www.reddit.com/prefs/apps (2 minutes, free,
// 100 req/min) and export:
//
//   REDDIT_CLIENT_ID=...  REDDIT_CLIENT_SECRET=...
//
// Discourse (community.openai.com) needs no auth but its search ranks loosely:
// a query for the file limit returns every "Feature Request: ..." thread that
// mentions projects. PAIN/NOISE below is what keeps the output to people with a
// problem rather than people with a proposal.
//
// Usage:
//   node scripts/threads-query.mjs [--days N] [--group NAME] [--all|--top|--loose|--json]
//   --days N  look-back window, 0 for no cutoff (default 30)
//   --top     rank by reply count, not recency: the ranking thread over the new one
//   --all     ignore the seen file and re-print everything
//   --loose   skip the pain filter, to see what it is dropping
//
// Weekly pass:   node scripts/threads-query.mjs --days 14
// Ranking pass:  node scripts/threads-query.mjs --days 0 --top --all

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEEN_PATH = join(REPO_ROOT, "docs", "threads-seen.json");
const UA = "fileconcat-threads/0.1 (+https://fileconcat.com)";
const BACKOFF_MS = 4000;

// Each group is one landing page plus the phrasings people actually use for it.
// Keep them in the searcher's words, not ours: nobody types "concatenate".
const GROUPS = [
  {
    name: "chatgpt-projects",
    page: "https://fileconcat.com/for/chatgpt-projects",
    subs: ["ChatGPTPro", "ChatGPT", "OpenAI"],
    // The only group with a forum worth querying. Searching the OpenAI forum for
    // a NotebookLM or Claude limit returns Codex token threads and 429 errors.
    forums: ["community.openai.com"],
    queries: ["20 file limit", "file upload limit", "reached our limit of file uploads", "project file limit"],
  },
  {
    name: "notebooklm",
    page: "https://fileconcat.com/for/notebooklm",
    subs: ["notebooklm", "GoogleGeminiAI"],
    queries: ["50 source limit", "source limit", "too many sources"],
  },
  {
    name: "claude-projects",
    page: "https://fileconcat.com/for/claude-projects",
    subs: ["ClaudeAI", "Anthropic"],
    queries: ["project knowledge exceeds maximum", "project knowledge full", "knowledge base limit"],
  },
  {
    name: "codebase",
    page: "https://fileconcat.com/blog/feed-codebase-to-llm",
    subs: ["ChatGPTCoding", "ClaudeAI", "LocalLLaMA"],
    queries: ["share entire codebase", "paste whole repo"],
  },
];

// A thread worth answering describes a wall someone hit. A thread proposing a
// feature does not: nobody there is looking for a tool today.
const PAIN = /\b(limit|cap|max|maximum|exceed|exceeds|reached|too many|too large|full|can'?t|cannot|fail|error|stuck|workaround|how (do|can|to)|why|help)\b/i;
const NOISE = /^(feature (request|suggestion|proposal)|feature-request|proposal|idea|suggestion|announcing|introducing)\b/i;
// The OpenAI forum is mostly a developer board, so a search for a file limit
// returns vector stores, batch jobs and Whisper. Those people have an API key
// and a script already; they are not looking for a drag-and-drop tool.
const DEV_NOISE = /\b(vector ?store|batch|whisper|enqueued|assistants? api|\bapi\b|codex|custom ?gpts?|\bgpts\b|billing|fine[- ]tun|embedding|token limit)\b/i;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const DAYS = Number(flag("days", 30));
const ONLY = flag("group", null);
const SHOW_ALL = args.includes("--all");
const AS_JSON = args.includes("--json");
const LOOSE = args.includes("--loose");
// --top ranks by replies instead of recency. The thread Google sends people to
// is rarely the newest one: the canonical "20 file limit" thread is a year old
// and still ranks first, which makes it worth more than anything posted today.
const BY_REPLIES = args.includes("--top");
const CUTOFF = DAYS ? Date.now() - DAYS * 86400_000 : 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stats = { filtered: 0, tooOld: 0 };
const failures = [];

async function getText(url, headers, tries) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers });
    if (res.ok) return await res.text();
    if (res.status !== 429 && res.status !== 503) return null;
    await sleep(BACKOFF_MS * (i + 1));
  }
  return null;
}

// --- reddit, authenticated ------------------------------------------------
let tokenPromise = null;
function redditToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  tokenPromise ||= fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
  })
    .then((r) => r.json())
    .then((j) => j.access_token || null)
    .catch(() => null);
  return tokenPromise;
}

async function redditOAuth(query, sub, token) {
  const url = `https://oauth.reddit.com/r/${sub}/search?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=year&limit=25`;
  const body = await getText(url, { Authorization: `bearer ${token}`, "User-Agent": UA }, 2);
  if (body === null) return null;
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  return (json.data?.children || []).map((c) => ({
    id: c.data.name,
    title: c.data.title,
    url: `https://www.reddit.com${c.data.permalink}`,
    site: `r/${c.data.subreddit}`,
    ts: c.data.created_utc * 1000,
    replies: c.data.num_comments,
  }));
}

// --- discourse ------------------------------------------------------------
async function discourse(query, host) {
  const body = await getText(`https://${host}/search.json?q=${encodeURIComponent(query)}`, { "User-Agent": UA }, 2);
  if (body === null) return null;
  let topics;
  try {
    topics = JSON.parse(body).topics || [];
  } catch {
    return null;
  }
  return topics.map((t) => ({
    id: `${host}_${t.id}`,
    title: t.title,
    url: `https://${host}/t/${t.slug}/${t.id}`,
    site: host.replace("community.", ""),
    ts: Date.parse(t.last_posted_at || t.created_at),
    replies: t.posts_count,
  }));
}

function keep(row) {
  if (!row.url || !Number.isFinite(row.ts)) return false;
  if (row.ts < CUTOFF) {
    stats.tooOld++;
    return false;
  }
  if (LOOSE) return true;
  const title = row.title.replace(/^[[(\s]+/, ""); // "[Feature Proposal] ..." must still hit NOISE
  if (NOISE.test(title) || DEV_NOISE.test(title) || !PAIN.test(title)) {
    stats.filtered++;
    return false;
  }
  return true;
}

// --- run ------------------------------------------------------------------
let seen = {};
try {
  seen = JSON.parse(readFileSync(SEEN_PATH, "utf8"));
} catch {
  seen = {};
}

const token = await redditToken();
if (!token) {
  console.error(
    "! REDDIT_CLIENT_ID/SECRET not set, so Reddit is SKIPPED, not searched.\n" +
      "! Only the forums below are covered, which means notebooklm and claude-projects\n" +
      "! return nothing at all. Register a script app: https://www.reddit.com/prefs/apps\n",
  );
}

const found = [];
for (const group of GROUPS) {
  if (ONLY && group.name !== ONLY) continue;
  for (const query of group.queries) {
    const calls = token
      ? group.subs.map((sub) => ({ label: `r/${sub} "${query}"`, run: () => redditOAuth(query, sub, token) }))
      : [];
    for (const host of group.forums || []) {
      calls.push({ label: `${host} "${query}"`, run: () => discourse(query, host) });
    }
    for (const call of calls) {
      const rows = await call.run();
      if (rows === null) {
        failures.push(call.label);
        continue;
      }
      for (const row of rows) {
        if (!keep(row)) continue;
        if (found.some((f) => f.id === row.id)) continue;
        if (!SHOW_ALL && seen[row.id]) continue;
        found.push({ ...row, group: group.name, page: group.page, query });
      }
    }
  }
}

const order = GROUPS.map((g) => g.name);
found.sort(
  (a, b) =>
    order.indexOf(a.group) - order.indexOf(b.group) ||
    (BY_REPLIES ? (b.replies || 0) - (a.replies || 0) : 0) ||
    b.ts - a.ts,
);

if (AS_JSON) {
  console.log(JSON.stringify(found, null, 2));
} else {
  const age = (ts) => `${Math.round((Date.now() - ts) / 86400_000)}d`;
  console.log(`\n${found.length} thread(s), last ${DAYS} days${SHOW_ALL ? "" : ", new since last run"}`);
  let current = "";
  for (const row of found) {
    if (row.group !== current) {
      current = row.group;
      console.log(`\n=== ${current}  ->  ${row.page}\n`);
    }
    const replies = row.replies == null ? "" : ` (${row.replies} replies)`;
    console.log(`  ${age(row.ts).padStart(4)}  ${row.site.padEnd(14)} ${row.title.slice(0, 76)}${replies}`);
    console.log(`        ${row.url}`);
  }
  console.log(`\ndropped: ${stats.filtered} off-intent, ${stats.tooOld} older than ${DAYS}d`);
  if (failures.length) console.log(`no answer from: ${failures.join(", ")}`);
}

mkdirSync(dirname(SEEN_PATH), { recursive: true });
for (const row of found) seen[row.id] = row.ts;
writeFileSync(SEEN_PATH, JSON.stringify(seen, null, 0));
