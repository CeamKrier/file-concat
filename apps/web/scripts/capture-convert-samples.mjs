// Writes src/data/convert-samples.json: what FileConcat made of each sample
// file in scripts/convert-samples/, read off the real result screen. The
// /convert/* pages draw that screen from this file, so the numbers and the
// bundle excerpt on them are an engine run, never typed by hand.
//
// Rerun after a reader changes:
//   pnpm --filter @fileconcat/web dev            (serves :5173)
//   node scripts/capture-convert-samples.mjs --url http://localhost:5173/
//
// The image is read as English through the same "Read them" offer a person
// clicks; recognition downloads its language data on the first run.

import { chromium } from "playwright-core";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const urlArg = process.argv.indexOf("--url");
const url = urlArg > 0 ? process.argv[urlArg + 1] : "http://localhost:5173/";

const SAMPLES = [
  { key: "pdf", file: "q3-report.pdf" },
  { key: "docx", file: "offer-letter.docx" },
  { key: "excel", file: "budget.xlsx" },
  { key: "pptx", file: "kickoff.pptx" },
  { key: "image", file: "whiteboard.jpg", recognise: true },
  { key: "email", file: "renewal-terms.eml" },
  { key: "html", file: "four-day-week.html" },
  { key: "epub", file: "harbour-guide.epub" },
  { key: "rtf", file: "board-minutes.rtf" },
  { key: "odt", file: "leave-policy.odt" },
  { key: "ods", file: "stock-count.ods" },
  { key: "odp", file: "welcome-week.odp" },
];

const cache = join(homedir(), ".cache/ms-playwright");
const rev = readdirSync(cache)
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]))
  .pop();
const browser = await chromium.launch({
  executablePath: join(cache, rev, "chrome-linux64/chrome"),
  args: ["--no-sandbox"],
});

const { version } = JSON.parse(readFileSync(join(here, "../package.json"), "utf8"));
const out = { version, samples: {} };

for (const s of SAMPLES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator("input[type=file]:not([webkitdirectory])").first().setInputFiles(join(here, "convert-samples", s.file));
  if (s.recognise) {
    await page.getByRole("button", { name: /^Read them/ }).first().click();
    // The dialog closes itself and the result screen takes the reading.
    await page.getByRole("button", { name: "Read 1 file" }).click();
  }
  await page.getByText("Your bundle is ready").waitFor({ timeout: 300_000 });
  await page.waitForTimeout(1500);

  const screen = await page.evaluate(() => {
    const section = document.querySelector("section");
    const figures = [...section.querySelector("div.rounded-card > div").children].map((f) => f.innerText.split("\n"));
    const heading = [...section.querySelectorAll("h3")].find((h) => h.textContent.includes("What your AI receives"));
    const ledger = [...section.querySelectorAll("button")].find((b) => b.textContent.includes("What happened to your files"));
    return {
      figures,
      previewLabel: heading.nextElementSibling.textContent,
      preview: section.querySelector("pre").textContent,
      ledger: ledger.lastElementChild.textContent,
    };
  });

  // The excerpt the page shows: the file's own block, plus the summary line
  // that marks recognised text, the one line of the header a reader needs.
  const start = screen.preview.indexOf("<file ");
  const end = screen.preview.indexOf("]]></file>") + "]]></file>".length;
  const marker = screen.preview.split("\n").find((l) => l.startsWith("- text below was read by recognition"));
  const [tokens, files, share, cost] = screen.figures;
  out.samples[s.key] = {
    file: s.file,
    tokens: tokens[0],
    files: files[0],
    share: share[0],
    model: share[2],
    cost: cost[0],
    characters: screen.previewLabel.match(/([\d,]+) characters/)[1],
    ledger: screen.ledger,
    excerpt: (marker ? `${marker}\n\n` : "") + screen.preview.slice(start, end),
  };
  await page.close();
  console.log(s.key, out.samples[s.key].tokens, "tokens");
}

await browser.close();
writeFileSync(join(here, "../src/data/convert-samples.json"), `${JSON.stringify(out, null, 2)}\n`);
