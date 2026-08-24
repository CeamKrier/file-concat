#!/usr/bin/env node
// Query Google Search Console Search Analytics for fileconcat.com.
//
// Zero dependencies: signs a service-account JWT with Node's crypto, exchanges
// it for an access token, then calls the Search Console REST API. Reads the
// service-account key from GSC_KEY (default ./google-search-console-api.json,
// which is gitignored).
//
// Usage:  node scripts/gsc-query.mjs [days]   (default 90)

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY_PATH = process.env.GSC_KEY || join(REPO_ROOT, "google-search-console-api.json");
// First arg selects the mode: `inspect` runs URL index-coverage inspection,
// anything else (a number) is the analytics look-back window in days.
const ARG = process.argv[2];
const MODE = ARG === "inspect" ? "inspect" : ARG === "page" ? "page" : "analytics";
// `page` mode: every query one URL draws, not just the ones the leak filter keeps.
// The default report answers "which pages leak clicks"; this answers the next
// question, "what is a page on the second results page actually ranking for",
// which the leak filter structurally cannot show because a tail query never
// reaches its 12-impression floor.
const PAGE = MODE === "page" ? process.argv[3] : null;
const DAYS = Number(
  (MODE === "inspect" ? process.argv[3] : MODE === "page" ? process.argv[4] : process.argv[2]) || 90,
);

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(key.private_key);
  const jwt = `${signingInput}.${b64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token exchange failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function api(token, path, body) {
  const res = await fetch(`https://searchconsole.googleapis.com${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || JSON.stringify(json);
    throw new Error(`${path} -> ${res.status}: ${msg}`);
  }
  return json;
}

function isoDaysAgo(n) {
  const d = new Date(Date.now() - n * 86400_000);
  return d.toISOString().slice(0, 10);
}

async function query(token, siteUrl, dimensions, rowLimit = 250, filters) {
  const json = await api(token, `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    startDate: isoDaysAgo(DAYS),
    endDate: isoDaysAgo(1),
    dimensions,
    rowLimit,
    dataState: "final",
    ...(filters ? { dimensionFilterGroups: [{ filters }] } : {}),
  });
  return json.rows || [];
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

function table(rows, keyLen = 40) {
  console.log(`${pad("key", keyLen)}${rpad("clk", 5)}${rpad("impr", 7)}${rpad("CTR", 7)}${rpad("pos", 6)}`);
  for (const r of rows) {
    console.log(
      `${pad(r.keys.join(" | "), keyLen)}${rpad(r.clicks, 5)}${rpad(r.impressions, 7)}${rpad(pct(r.ctr), 7)}${rpad(r.position.toFixed(1), 6)}`,
    );
  }
}

// --- URL index-coverage inspection ---------------------------------------

async function sitemapUrls() {
  const res = await fetch("https://fileconcat.com/sitemap.xml");
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function inspect(token, siteUrl, url) {
  const json = await api(token, "/v1/urlInspection/index:inspect", {
    inspectionUrl: url,
    siteUrl,
  });
  return json.inspectionResult?.indexStatusResult || {};
}

async function sitemapStatus(token, siteUrl) {
  try {
    const json = await api(token, `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`);
    const maps = json.sitemap || [];
    if (!maps.length) {
      console.log("SITEMAP: none submitted to this property ⚠️\n");
      return;
    }
    for (const m of maps) {
      const last = m.lastDownloaded ? m.lastDownloaded.slice(0, 10) : "never";
      const submitted = (m.contents || []).reduce((a, c) => a + Number(c.submitted || 0), 0);
      console.log(
        `SITEMAP: ${m.path}  lastDownloaded=${last}  submitted=${submitted}  pending=${!!m.isPending}  errors=${m.errors || 0}  warnings=${m.warnings || 0}`,
      );
    }
    console.log("");
  } catch (e) {
    console.log(`SITEMAP: could not read (${e.message})\n`);
  }
}

async function runInspection(token, siteUrl) {
  await sitemapStatus(token, siteUrl);
  const urls = await sitemapUrls();
  console.log(`Inspecting ${urls.length} sitemap URLs against ${siteUrl}\n`);

  const rows = [];
  for (const url of urls) {
    try {
      const r = await inspect(token, siteUrl, url);
      rows.push({ url, ...r });
    } catch (e) {
      rows.push({ url, coverageState: `ERR: ${e.message}`, verdict: "-" });
    }
  }

  const path = (u) => u.replace(/^https?:\/\/fileconcat\.com/, "") || "/";
  const crawl = (t) => (t ? t.slice(0, 10) : "never");
  const indexed = rows.filter((r) => r.verdict === "PASS").length;

  console.log(`${pad("path", 34)}${pad("verdict", 9)}${pad("coverageState", 42)}${pad("lastCrawl", 12)}robots`);
  for (const r of rows) {
    const canonMismatch =
      r.googleCanonical && r.googleCanonical !== r.url ? "  ⚠canon" : "";
    console.log(
      `${pad(path(r.url), 34)}${pad(r.verdict || "-", 9)}${pad(r.coverageState || "-", 42)}${pad(crawl(r.lastCrawlTime), 12)}${(r.robotsTxtState || "-")}${canonMismatch}`,
    );
  }

  console.log(`\n=== SUMMARY: ${indexed}/${rows.length} indexed ===`);
  const buckets = {};
  for (const r of rows) {
    const k = (r.coverageState || "-").replace(/^ERR:.*/, "ERR");
    buckets[k] = (buckets[k] || 0) + 1;
  }
  for (const [state, n] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rpad(n, 3)}  ${state}`);
  }
}

// --- one page, every query it draws -------------------------------------

async function runPage(token, siteUrl, needle) {
  const filters = [{ dimension: "page", operator: "contains", expression: needle }];
  const totals = await query(token, siteUrl, [], 1, filters);
  const t = totals[0];
  if (!t) {
    console.log(`No rows for a page containing "${needle}" in this window.`);
    return;
  }
  console.log(
    `=== PAGE ${needle} ===  clicks=${t.clicks} impressions=${t.impressions} CTR=${pct(t.ctr)} pos=${t.position.toFixed(1)}\n`,
  );

  const rows = (await query(token, siteUrl, ["query"], 5000, filters)).sort(
    (a, b) => b.impressions - a.impressions,
  );
  console.log(`=== QUERIES (${rows.length}) ===`);
  table(rows, 58);

  // Positions 11-20 are the band worth working: already relevant enough to be
  // indexed against the query, one page away from being seen at all. Above 10
  // needs copy, past 20 needs a different page.
  const band = rows.filter((r) => r.position >= 10.5 && r.position < 20.5);
  const impr = band.reduce((a, r) => a + r.impressions, 0);
  console.log(
    `\n=== POSITION 11-20 (${band.length} queries, ${impr} impressions, ${((impr / t.impressions) * 100).toFixed(0)}% of the page) ===`,
  );
  table(band, 58);
}

async function main() {
  let key;
  try {
    key = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  } catch (e) {
    console.error(`Cannot read key at ${KEY_PATH}: ${e.message}`);
    process.exit(1);
  }
  const token = await getAccessToken(key);

  // Discover the exact verified property (domain vs URL-prefix).
  const sites = await api(token, "/webmasters/v3/sites");
  const entries = (sites.siteEntry || []).filter((s) => s.siteUrl.includes("fileconcat.com"));
  if (!entries.length) {
    console.error(
      `Service account ${key.client_email} sees no fileconcat.com property.\n` +
        `Fix: GSC -> Settings -> Users and permissions -> add ${key.client_email} (Restricted).\n` +
        `All visible sites: ${JSON.stringify((sites.siteEntry || []).map((s) => s.siteUrl))}`,
    );
    process.exit(1);
  }
  const siteUrl = (entries.find((s) => s.siteUrl.startsWith("sc-domain:")) || entries[0]).siteUrl;

  if (MODE === "inspect") {
    await runInspection(token, siteUrl);
    return;
  }

  if (MODE === "page") {
    if (!PAGE) {
      console.error("Usage: node scripts/gsc-query.mjs page <url-substring> [days]");
      process.exit(1);
    }
    console.log(`Property: ${siteUrl}   window: ${isoDaysAgo(DAYS)} .. ${isoDaysAgo(1)} (${DAYS}d)\n`);
    await runPage(token, siteUrl, PAGE);
    return;
  }

  console.log(`Property: ${siteUrl}   window: ${isoDaysAgo(DAYS)} .. ${isoDaysAgo(1)} (${DAYS}d)\n`);

  const total = await query(token, siteUrl, [], 1);
  if (total[0]) {
    const t = total[0];
    console.log(`=== TOTAL ===  clicks=${t.clicks} impressions=${t.impressions} CTR=${pct(t.ctr)} pos=${t.position.toFixed(1)}\n`);
  }

  const pages = await query(token, siteUrl, ["page"]);
  console.log(`=== PAGES (${pages.length}) by impressions ===`);
  table(pages.sort((a, b) => b.impressions - a.impressions).slice(0, 20), 52);

  console.log(`\n=== PAGES with impr>=15 but CTR<2% (the click leaks) ===`);
  table(pages.filter((p) => p.impressions >= 15 && p.ctr < 0.02).sort((a, b) => b.impressions - a.impressions), 52);

  const queries = await query(token, siteUrl, ["query"]);
  console.log(`\n=== QUERIES (${queries.length}) top by impressions ===`);
  table(queries.sort((a, b) => b.impressions - a.impressions).slice(0, 25));

  const qp = await query(token, siteUrl, ["query", "page"], 250);
  const leak = qp
    .filter((r) => r.impressions >= 12 && r.ctr < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);
  console.log(`\n=== QUERY -> PAGE for the biggest leaks (impr>=12, CTR<2%) ===`);
  table(leak, 60);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
