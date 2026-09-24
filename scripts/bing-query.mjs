#!/usr/bin/env node
// Read Bing Webmaster Tools for fileconcat.com: traffic, index, queries, pages,
// and what Bing knows about each URL. Bing is where IndexNow submissions land
// (apps/web/scripts/indexnow.mjs), and Bing's index is what ChatGPT search and
// Copilot answer from, so this is the Bing half of what gsc-query.mjs is for
// Google.
//
// Zero dependencies. The API key comes from BING_API_KEY in the environment and
// is never printed: every line this script writes has it masked. Load it from
// the gitignored env file at the repo root with Node's own flag:
//
//   node --env-file=.env scripts/bing-query.mjs            # report, URLs from the live sitemap
//   node --env-file=.env scripts/bing-query.mjs <url>...   # report, only these URLs
//   node --env-file=.env scripts/bing-query.mjs --save     # report, and docs/reviews/bing/<date>.json
//
// `--save` is what a reading needs: the pulse skill reads the newest file in
// docs/reviews/bing/ rather than calling Bing, because the key is kept out of
// the agent's reach. Run it before a reading.
//
// Bing reports traffic about two days behind. GetUrlInfo answers ThrottleHost
// after roughly fifteen quick calls, so URL lookups are paced and retried.
//
// Bing's figures are private: they go into the gitignored docs/, never into a
// public file, a commit message or a PR body.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://ssl.bing.com/webmaster/api.svc/json/";
const HOST = "fileconcat.com";
const KEY = process.env.BING_API_KEY;
if (!KEY) {
  console.error("BING_API_KEY is not set. Run with node --env-file=.env scripts/bing-query.mjs");
  process.exit(1);
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const SAVE = args.includes("--save");
const argUrls = args.filter((a) => a.startsWith("http"));

const mask = (text) => String(text).split(KEY).join("<key>");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, params = {}) {
  const query = new URLSearchParams({ ...params, apikey: KEY });
  for (const wait of [5_000, 20_000, 60_000, null]) {
    const res = await fetch(`${API}${method}?${query}`);
    const text = await res.text();
    if (res.ok) return JSON.parse(text).d;
    if (wait === null || !text.includes("ThrottleHost")) {
      throw new Error(`${method}: HTTP ${res.status} ${mask(text).slice(0, 300)}`);
    }
    await pause(wait);
  }
}

// WCF dates: "/Date(1727136000000-0700)/". The day is taken in UTC.
const day = (wcf) => {
  const ms = Number(/\((-?\d+)/.exec(wcf ?? "")?.[1]);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : null;
};

// Monday of the UTC week a day falls in, so weeks line up with gsc-daily.mjs.
const weekOf = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

// Query and page rows come one per key per period; sum them per key.
function rollUp(rows) {
  const by = new Map();
  for (const r of rows ?? []) {
    const cur = by.get(r.Query) ?? { key: r.Query, clicks: 0, impressions: 0, last: null };
    cur.clicks += r.Clicks ?? 0;
    cur.impressions += r.Impressions ?? 0;
    const d = day(r.Date);
    if (d && (!cur.last || d > cur.last)) cur.last = d;
    by.set(r.Query, cur);
  }
  return [...by.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

async function sitemapUrls() {
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  const sites = await call("GetUserSites");
  const site = (sites ?? []).find((s) => new URL(s.Url).hostname.replace(/^www\./, "") === HOST);
  if (!site)
    throw new Error(
      `${HOST} is not among this key's sites: ${(sites ?? []).map((s) => s.Url).join(", ")}`,
    );
  const siteUrl = site.Url;

  const traffic = (await call("GetRankAndTrafficStats", { siteUrl })) ?? [];
  const daily = traffic.map((r) => ({
    day: day(r.Date),
    clicks: r.Clicks ?? 0,
    impressions: r.Impressions ?? 0,
  }));
  const weeks = new Map();
  for (const r of daily.filter((r) => r.day)) {
    const w = weekOf(r.day);
    const cur = weeks.get(w) ?? { week: w, clicks: 0, impressions: 0, days: 0 };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    cur.days += 1;
    weeks.set(w, cur);
  }

  const crawl = ((await call("GetCrawlStats", { siteUrl })) ?? []).map((r) => ({
    day: day(r.Date),
    in_index: r.InIndex ?? null,
    crawled: r.CrawledPages ?? null,
    errors: r.CrawlErrors ?? null,
  }));

  const queries = rollUp(await call("GetQueryStats", { siteUrl }));
  const pages = rollUp(await call("GetPageStats", { siteUrl }));

  const urls = [];
  for (const url of argUrls.length > 0 ? argUrls : await sitemapUrls()) {
    await pause(1_000);
    try {
      const u = await call("GetUrlInfo", { siteUrl, url });
      urls.push({
        url,
        // 0 is Bing's "no status recorded", not a response code.
        http: u?.HttpStatus || null,
        discovered: day(u?.DiscoveryDate),
        crawled: day(u?.LastCrawledDate),
      });
    } catch (err) {
      urls.push({ url, error: mask(err.message).slice(0, 120) });
    }
  }

  const report = {
    fetched: new Date().toISOString().slice(0, 10),
    site: siteUrl,
    verified: site.IsVerified ?? null,
    last_traffic_day:
      daily
        .map((r) => r.day)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    weeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    crawl: crawl.filter((r) => r.day).sort((a, b) => a.day.localeCompare(b.day)),
    queries,
    pages,
    urls,
  };

  if (SAVE) {
    const out = join(REPO_ROOT, "docs", "reviews", "bing", `${report.fetched}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`saved ${out.slice(REPO_ROOT.length + 1)}`);
  }

  const c = report.crawl.at(-1);
  console.log(
    `site ${report.site} verified=${report.verified} traffic through ${report.last_traffic_day ?? "no rows"}`,
  );
  console.log(
    `index: ${c ? `${c.in_index} in index, ${c.crawled} crawled, ${c.errors} errors on ${c.day}` : "no crawl rows"}`,
  );
  console.log("\nweek        clicks  impressions  days");
  for (const w of report.weeks.slice(-12)) {
    console.log(
      `${w.week}  ${String(w.clicks).padStart(6)}  ${String(w.impressions).padStart(11)}  ${w.days}`,
    );
  }
  console.log(`\ntop queries (${queries.length})`);
  for (const q of queries.slice(0, 20)) console.log(`  ${q.clicks}c ${q.impressions}i  ${q.key}`);
  console.log(`\ntop pages (${pages.length})`);
  for (const p of pages.slice(0, 20)) console.log(`  ${p.clicks}c ${p.impressions}i  ${p.key}`);
  const known = urls.filter((u) => u.discovered || u.crawled);
  console.log(`\nurls: ${known.length} of ${urls.length} known to Bing`);
  for (const u of urls) {
    const state =
      u.error ??
      (u.crawled
        ? `crawled ${u.crawled}`
        : u.discovered
          ? `discovered ${u.discovered}, not crawled`
          : "unknown to Bing");
    console.log(`  ${u.http ?? "-"}  ${state}  ${u.url}`);
  }
}

main().catch((err) => {
  console.error(mask(err.message));
  process.exit(1);
});
