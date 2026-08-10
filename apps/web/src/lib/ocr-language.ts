/**
 * Which language recognition should read a scan as.
 *
 * There is no discovering this from the document: a scan holds no text, so
 * there is nothing to detect a language in, and detecting it from recognition's
 * own output means recognising twice at four seconds a page. The browser's
 * language list is the one signal already on hand, it costs nothing, and it is
 * a fair proxy for what the person in front of it reads.
 *
 * **One language, not several.** Measured on a Turkish/English scan
 * (2026-08-10), against eight Turkish words that need Turkish letters:
 *
 * | model     | Turkish | English | time    | download |
 * | --------- | ------- | ------- | ------- | -------- |
 * | `eng`     | 1/8     | 5/5     | 4158 ms | 3.0 MB   |
 * | `tur`     | 6/8     | 4/5     | 3918 ms | 2.1 MB   |
 * | `eng+tur` | 4/8     | 5/5     | 3984 ms | 5.1 MB   |
 *
 * A second language costs nothing in time, which is the surprise, but it is
 * **worse than picking one**: the two language models arbitrate over ambiguous
 * glyphs and the dominant language loses (`Çakır` reverts to `Gakir`). So
 * hedging with `eng+` is not free insurance, and this returns exactly one code.
 */

/**
 * BCP-47 subtag → tesseract traineddata code.
 *
 * Every code here was checked against the CDN that serves it on 2026-08-10
 * (`@tesseract.js-data/<code>/4.0.0_best_int/<code>.traineddata.gz`, 60/60
 * resolved, 0.4 MB to 3.8 MB gzipped, median 1.7 MB). That check is the
 * entry requirement: an unresolvable code does not degrade recognition, it
 * throws, and the document goes back to being unreadable. Anything absent
 * here falls back to English, which is a guess but never a failure.
 */
const TESSERACT_BY_LOCALE: Record<string, string> = {
  af: "afr",
  ar: "ara",
  az: "aze",
  be: "bel",
  bg: "bul",
  bn: "ben",
  bs: "bos",
  ca: "cat",
  cs: "ces",
  cy: "cym",
  da: "dan",
  de: "deu",
  el: "ell",
  en: "eng",
  es: "spa",
  et: "est",
  eu: "eus",
  fa: "fas",
  fi: "fin",
  fr: "fra",
  ga: "gle",
  gl: "glg",
  he: "heb",
  hi: "hin",
  hr: "hrv",
  hu: "hun",
  hy: "hye",
  id: "ind",
  is: "isl",
  it: "ita",
  ja: "jpn",
  ka: "kat",
  kk: "kaz",
  ko: "kor",
  lt: "lit",
  lv: "lav",
  mk: "mkd",
  ms: "msa",
  mt: "mlt",
  nb: "nor",
  nl: "nld",
  nn: "nor",
  no: "nor",
  pl: "pol",
  pt: "por",
  ro: "ron",
  ru: "rus",
  sk: "slk",
  sl: "slv",
  sq: "sqi",
  sr: "srp",
  sv: "swe",
  sw: "swa",
  ta: "tam",
  te: "tel",
  th: "tha",
  tr: "tur",
  uk: "ukr",
  ur: "urd",
  vi: "vie",
  // Chinese needs the script or region to choose a model, so the longer tags
  // are matched before the bare one falls through to simplified.
  zh: "chi_sim",
  "zh-hant": "chi_tra",
  "zh-tw": "chi_tra",
  "zh-hk": "chi_tra",
  "zh-mo": "chi_tra",
};

/**
 * The tag to offer for each model, where several map to the same one.
 *
 * A tag carrying a region loses to one that does not, then the shorter wins.
 * Both halves earn their keep on Chinese: `zh-TW`, `zh-HK` and `zh-Hant` all
 * pick `chi_tra`, and picking the shortest alone would name that model
 * "Chinese (Taiwan)" — a region, for a model that is chosen by script and reads
 * Traditional Chinese wherever it is written.
 */
const CANONICAL_LOCALE: Record<string, string> = (() => {
  const hasRegion = (tag: string) => tag.split("-").some((part) => /^([A-Za-z]{2}|\d{3})$/.test(part) && part !== tag.split("-")[0]);
  const rank = (tag: string): [number, number] => [hasRegion(tag) ? 1 : 0, tag.length];
  const byCode: Record<string, string> = {};
  for (const [locale, code] of Object.entries(TESSERACT_BY_LOCALE)) {
    const held = byCode[code];
    if (held === undefined) {
      byCode[code] = locale;
      continue;
    }
    const [a, b] = [rank(locale), rank(held)];
    if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) byCode[code] = locale;
  }
  return byCode;
})();

export type OcrLanguage = {
  /** The tesseract traineddata code, e.g. `tur`. */
  code: string;
  /** The BCP-47 tag it came from, kept so the choice can be named on screen. */
  locale: string;
};

const ENGLISH: OcrLanguage = { code: "eng", locale: "en" };

/**
 * Pick a recognition language from an ordered list of BCP-47 tags, most
 * preferred first. The first tag we have a model for wins: it is what the
 * person actually set, and second-guessing it would need evidence we do not
 * have. Falls back to English, which is also what an unmapped language gets.
 */
export function ocrLanguageFor(locales: readonly string[]): OcrLanguage {
  for (const tag of locales) {
    if (typeof tag !== "string" || tag.length === 0) continue;
    const parts = tag.toLowerCase().split("-");
    // Longest prefix first, so `zh-Hant-TW` finds `zh-hant` before `zh`.
    for (let end = parts.length; end > 0; end--) {
      const code = TESSERACT_BY_LOCALE[parts.slice(0, end).join("-")];
      if (code) return { code, locale: tag };
    }
  }
  return ENGLISH;
}

/** The language this browser's settings imply. English anywhere without one. */
export function browserOcrLanguage(): OcrLanguage {
  if (typeof navigator === "undefined") return ENGLISH;
  const locales = navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : [];
  return ocrLanguageFor(locales);
}

/**
 * What to call it on screen. `Intl.DisplayNames` already knows every language
 * name, so nothing here needs a table of them.
 *
 * Named in English, because the interface around it is, and by language alone:
 * the region is dropped because the model has none. `en-GB` and `en-US` load
 * the same `eng`, so calling it "British English" would describe the reader
 * rather than the reading.
 */
export function ocrLanguageName(language: OcrLanguage): string {
  return nameOf(withoutRegion(language.locale)) ?? language.code;
}

/**
 * Drop the region, keep the script. `en-GB` and `en-US` both load `eng`, so
 * naming one "British English" would describe the reader rather than the
 * reading — but `zh-Hant` and `zh` really are two models, and the script subtag
 * is the only thing that says which. A script subtag is four letters; a region
 * is two letters or three digits.
 */
function withoutRegion(locale: string): string {
  const [primary, ...rest] = locale.split("-");
  const script = rest.find((part) => /^[A-Za-z]{4}$/.test(part));
  return script ? `${primary}-${script}` : primary;
}

function nameOf(tag: string): string | undefined {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(tag);
    // `of` returns the input unchanged when it knows no name for it.
    if (name && name.toLowerCase() !== tag.toLowerCase()) return name;
  } catch {
    // Older engine, or a tag it refuses.
  }
  return undefined;
}

/**
 * Every language recognition can be asked for, named in English and sorted by
 * that name, for a control that lets someone correct a wrong guess.
 */
export function ocrLanguageOptions(): { locale: string; code: string; name: string }[] {
  return Object.entries(CANONICAL_LOCALE)
    .map(([code, locale]) => ({ locale, code, name: nameOf(locale) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}
