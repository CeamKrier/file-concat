// Tells IndexNow (Bing, Yandex, Seznam, Naver, Yep, Amazon: one submission
// reaches every participating engine) which fileconcat.com URLs changed.
//
// Run it by hand after a deploy that adds or changes pages, once the deploy is
// live. It never runs in the build or CI: the engines fetch each URL they are
// told about, so a submission before the deploy lands points them at old pages.
//
// Cloudflare's Crawler Hints also speaks IndexNow for this zone, but it fires on
// a cache MISS, and the SSR pages come from the Worker without passing through
// the cache (no cf-cache-status header on them, checked 2026-09-24). Pages are
// only announced when this script runs.
//
// Usage:
//   node scripts/indexnow.mjs                      # every URL in the live sitemap
//   node scripts/indexnow.mjs https://fileconcat.com/how-to/x https://...
//
// The key is public by design: IndexNow proves ownership by fetching
// public/<key>.txt from the host, so the file and this constant must match.
// 200 means received, 202 received with the key still being verified (usual on
// the first submission), 403 the key file is missing or does not match.

const HOST = "fileconcat.com";
const KEY = "fileconcat-indexnow-2026";

async function sitemapUrls() {
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const argUrls = process.argv.slice(2);
const urlList = argUrls.length > 0 ? argUrls : await sitemapUrls();

const keyFile = await fetch(`https://${HOST}/${KEY}.txt`);
if (!keyFile.ok || (await keyFile.text()).trim() !== KEY) {
  console.error(`${keyFile.url} does not serve the key; deploy public/${KEY}.txt first.`);
  process.exit(1);
}

// ponytail: one POST, and the protocol caps a POST at 10,000 URLs; batch if the sitemap ever nears that.
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, urlList }),
});
console.log(`${res.status} ${res.statusText}: ${urlList.length} URLs submitted`);
if (res.status !== 200 && res.status !== 202) process.exit(1);
