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
const DAYS = Number(process.argv[2] || 90);

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

async function query(token, siteUrl, dimensions, rowLimit = 250) {
  const json = await api(token, `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    startDate: isoDaysAgo(DAYS),
    endDate: isoDaysAgo(1),
    dimensions,
    rowLimit,
    dataState: "final",
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
