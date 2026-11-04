/**
 * The send check (K1): what in a file's text the user may not mean an AI to
 * see, found without a model, and the masked text.
 *
 * Key rules are ported from gitleaks (config/gitleaks.toml, MIT) by hand, with
 * their keywords and entropy floors; the connection string follows secretlint's
 * database-connection-string. RE2 regexes are linear by construction and the JS
 * engine is not, so every rule here is held to a linear-time test on adversarial
 * input (tests/send-check.test.ts). gitleaks' curl-auth-header rule is left out:
 * its multi-line lazy scan is the ReDoS shape, and in a bundle it is mostly
 * README examples with placeholder tokens.
 *
 * Detection runs as gitleaks does: one pass over every rule keyword, then only
 * the rules whose keyword occurs. Measured 2026-11-04 on a 20.7 M char bundle:
 * 299 ms at 4x CPU throttle against 1,100 ms running every rule.
 */
import { findIdentifiers, type IdentifierKind } from "./identifiers";

export interface KeyRule {
  id: string;
  /** Readable name, used in the placeholder and on screen. */
  label: string;
  /** Lowercase substrings, at least one of which a match contains. */
  keywords: string[];
  re: RegExp;
  /** Capture group holding the secret; 0 means the whole match. */
  group: number;
  /** Shannon entropy floor for the secret, as gitleaks sets it. */
  entropy?: number;
  /** A secret matching this is a published example, not a key. */
  allow?: RegExp;
}

// The delimiter gitleaks expects after a secret; kept out of the masked span.
const TAIL = String.raw`(?:[\x60'"\s;]|\\[nr]|$)`;
const rule = (id: string, label: string, keywords: string[], src: string, extra: Partial<KeyRule> & { flags?: string } = {}): KeyRule => {
  const { flags = "", ...rest } = extra;
  return { id, label, keywords, re: new RegExp(src, `gd${flags}`), group: 0, ...rest };
};

export const KEY_RULES: KeyRule[] = [
  rule("private-key", "private key", ["-----begin"], String.raw`-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----[\s\S-]{64,16384}?KEY(?: BLOCK)?-----`, { flags: "i" }),
  rule("aws-access-token", "AWS access key", ["a3t", "akia", "asia", "abia", "acca"], String.raw`\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\b`, { group: 1, entropy: 3, allow: /EXAMPLE$/ }),
  rule("github-pat", "GitHub token", ["ghp_"], String.raw`ghp_[0-9a-zA-Z]{36}`, { entropy: 3 }),
  rule("github-fine-grained-pat", "GitHub token", ["github_pat_"], String.raw`github_pat_\w{82}`, { entropy: 3 }),
  rule("github-oauth", "GitHub token", ["gho_"], String.raw`gho_[0-9a-zA-Z]{36}`, { entropy: 3 }),
  rule("github-app-token", "GitHub token", ["ghu_", "ghs_"], String.raw`(?:ghu|ghs)_[0-9a-zA-Z]{36}`, { entropy: 3 }),
  rule("github-refresh-token", "GitHub token", ["ghr_"], String.raw`ghr_[0-9a-zA-Z]{36}`, { entropy: 3 }),
  rule("gitlab-pat", "GitLab token", ["glpat-"], String.raw`glpat-[\w-]{20}`, { entropy: 3 }),
  rule(
    "openai-api-key",
    "OpenAI API key",
    ["t3blbkfj"],
    String.raw`\b(sk-(?:proj|svcacct|admin)-(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})T3BlbkFJ(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})\b|sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20})${TAIL}`,
    { group: 1, entropy: 3 },
  ),
  rule("anthropic-api-key", "Anthropic API key", ["sk-ant-api03"], String.raw`\b(sk-ant-api03-[a-zA-Z0-9_\-]{93}AA)${TAIL}`, { group: 1 }),
  rule("anthropic-admin-api-key", "Anthropic admin key", ["sk-ant-admin01"], String.raw`\b(sk-ant-admin01-[a-zA-Z0-9_\-]{93}AA)${TAIL}`, { group: 1 }),
  rule("stripe-access-token", "Stripe key", ["sk_test", "sk_live", "sk_prod", "rk_test", "rk_live", "rk_prod"], String.raw`\b((?:sk|rk)_(?:test|live|prod)_[a-zA-Z0-9]{10,99})${TAIL}`, { group: 1, entropy: 2 }),
  rule("gcp-api-key", "Google API key", ["aiza"], String.raw`\b(AIza[\w-]{35})${TAIL}`, { group: 1, entropy: 4 }),
  rule("slack-bot-token", "Slack token", ["xoxb"], String.raw`xoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*`, { entropy: 3 }),
  rule("slack-user-token", "Slack token", ["xoxp-", "xoxe-"], String.raw`xox[pe](?:-[0-9]{10,13}){3}-[a-zA-Z0-9-]{28,34}`, { entropy: 2 }),
  rule("slack-webhook-url", "Slack webhook URL", ["hooks.slack.com"], String.raw`(?:https?://)?hooks.slack.com/(?:services|workflows|triggers)/[A-Za-z0-9+/]{43,56}`),
  rule("jwt", "JWT", ["ey"], String.raw`\b(ey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9\/\\_-]{17,}\.(?:[a-zA-Z0-9\/\\_-]{10,}={0,2})?)${TAIL}`, { group: 1, entropy: 3 }),
  rule(
    "sentry-org-token",
    "Sentry token",
    ["sntrys_eyjpyxqio"],
    String.raw`\b(sntrys_eyJpYXQiO[a-zA-Z0-9+/]{10,200}(?:LCJyZWdpb25fdXJs|InJlZ2lvbl91cmwi|cmVnaW9uX3VybCI6)[a-zA-Z0-9+/]{10,200}={0,2}_[a-zA-Z0-9+/]{43})(?:[^a-zA-Z0-9+/]|$)`,
    { group: 1, entropy: 4.5 },
  ),
  rule("npm-access-token", "npm token", ["npm_"], String.raw`\b(npm_[a-z0-9]{36})${TAIL}`, { group: 1, entropy: 2, flags: "i" }),
  rule("huggingface-access-token", "Hugging Face token", ["hf_"], String.raw`\b(hf_[a-zA-Z]{34})${TAIL}`, { group: 1, entropy: 2 }),
  // Only the password is the secret: user, host and database stay readable. On the
  // 2026-11-04 repo corpus all 73 matches were placeholders, templates or test
  // values, so the common ones are allowed here and the caller lists the rest
  // without masking them by default.
  rule("connection-string", "database password", ["://"], String.raw`\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@\/]{1,64}:([^\s@\/]{1,128})@[^\s\/:]{1,253}`, {
    group: 1,
    flags: "i",
    allow: /^(?:[#$%]?\{|<|\[|%[A-Z_]|\*+$|x+$|(?:pass(?:word|wd)?|secret|pwd|changeme|example|test|admin|root|guest|user|postgres|mysql|redis)$)/i,
  }),
];

const IDENTIFIER_LABEL: Record<IdentifierKind, string> = { email: "Email", iban: "IBAN", ssn: "SSN", card: "Card number" };

export interface Finding {
  /** A key rule id, an identifier kind, or `word` for the user's own words. */
  kind: string;
  category: "key" | "identifier" | "word";
  label: string;
  start: number;
  end: number;
  value: string;
}

function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) h -= (c / s.length) * Math.log2(c / s.length);
  return h;
}

const RULES_BY_KEYWORD = new Map<string, KeyRule[]>();
for (const r of KEY_RULES) for (const k of r.keywords) RULES_BY_KEYWORD.set(k, [...(RULES_BY_KEYWORD.get(k) ?? []), r]);
const KEYWORDS = new RegExp([...RULES_BY_KEYWORD.keys()].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");

/**
 * Every key in `text`, and with `identifiers` every exact identifier too (the
 * caller asks for those on document files only). In order of position.
 */
export function findSensitive(text: string, options: { identifiers?: boolean } = {}): Finding[] {
  const hit = new Set<KeyRule>();
  for (const m of text.matchAll(KEYWORDS)) {
    for (const r of RULES_BY_KEYWORD.get(m[0].toLowerCase()) ?? []) hit.add(r);
    if (hit.size === KEY_RULES.length) break;
  }

  const out: Finding[] = [];
  for (const r of KEY_RULES) {
    if (!hit.has(r)) continue;
    for (const m of text.matchAll(r.re)) {
      // The `d` flag's match indices; the root tsconfig's ES2020 lib predates them.
      const indices = (m as RegExpMatchArray & { indices: ([number, number] | undefined)[] }).indices;
      const [start, end] = indices[r.group] ?? indices[0]!;
      const value = text.slice(start, end);
      if (r.entropy && entropy(value) < r.entropy) continue;
      if (r.allow?.test(value)) continue;
      out.push({ kind: r.id, category: "key", label: r.label, start, end, value });
    }
  }
  if (options.identifiers) {
    for (const m of findIdentifiers(text)) {
      out.push({ kind: m.kind, category: "identifier", label: IDENTIFIER_LABEL[m.kind], start: m.start, end: m.end, value: m.value });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** At most this many words, each this long: the list is matched on every bundle change. */
export const HIDE_LIMITS = { entries: 200, length: 100 };

// A word is a run of Unicode letters and digits, so "Acme's" holds the word
// "Acme" and "Muller" never matches inside "Mullerstrasse".
const WORD = /[\p{L}\p{N}]+/gu;
const WORD_AT = /[\p{L}\p{N}]+/uy;
const GAP_AT = /\s+/y;

/**
 * The user's "always hide" entries, ready to match: lowercased words per entry,
 * by first word. An entry may be several words ("Jane Doe"); they then match
 * across any run of whitespace, line breaks included.
 */
export function hideList(entries: readonly string[]): Map<string, string[][]> {
  const byFirst = new Map<string, string[][]>();
  for (const entry of entries.slice(0, HIDE_LIMITS.entries)) {
    const words = entry.slice(0, HIDE_LIMITS.length).toLowerCase().match(WORD);
    if (!words) continue;
    byFirst.set(words[0], [...(byFirst.get(words[0]) ?? []), words]);
  }
  return byFirst;
}

/**
 * Every place in `text` where an entry of `list` stands as whole words, case
 * ignored. One pass over the words of the text and a map lookup each, so a
 * long list costs about what a short one does.
 */
export function findWords(text: string, list: Map<string, string[][]>): Finding[] {
  const out: Finding[] = [];
  if (list.size === 0) return out;
  for (const m of text.matchAll(WORD)) {
    const entries = list.get(m[0].toLowerCase());
    if (!entries) continue;
    let best = -1;
    for (const words of entries) {
      let end = m.index + m[0].length;
      let i = 1;
      for (; i < words.length; i++) {
        GAP_AT.lastIndex = end;
        if (!GAP_AT.test(text)) break;
        WORD_AT.lastIndex = GAP_AT.lastIndex;
        const next = WORD_AT.exec(text);
        if (!next || next[0].toLowerCase() !== words[i]) break;
        end = WORD_AT.lastIndex;
      }
      if (i === words.length) best = Math.max(best, end);
    }
    if (best >= 0) out.push({ kind: "word", category: "word", label: "Hidden", start: m.index, end: best, value: text.slice(m.index, best) });
  }
  return out;
}

const TIER: Record<Finding["category"], number> = { key: 0, word: 1, identifier: 2 };
const placeholder = (f: Finding) =>
  f.category === "key" ? `[Secret removed: ${f.label}]` : f.category === "word" ? "[Hidden]" : `[${f.label} removed]`;

/**
 * `text` with every finding `masked` accepts replaced by its placeholder.
 * Masked spans that overlap are replaced as their union, once, under the
 * placeholder of the highest tier (key, then the user's word, then an
 * identifier), so no character of any masked span is left. A replaced span
 * keeps its line breaks, so line numbers still match.
 */
export function maskFindings(text: string, findings: Finding[], masked: (f: Finding) => boolean): string {
  // Linear after the sort: a contact list can hold 100k emails, so no pairwise
  // overlap check and no string rebuilt per finding.
  const wanted = findings.filter(masked).sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let at = 0;
  for (let i = 0; i < wanted.length; ) {
    let top = wanted[i];
    let end = top.end;
    const start = top.start;
    for (i++; i < wanted.length && wanted[i].start < end; i++) {
      end = Math.max(end, wanted[i].end);
      if (TIER[wanted[i].category] < TIER[top.category]) top = wanted[i];
    }
    const breaks = text.slice(start, end).match(/\r\n|\r|\n/g)?.join("") ?? "";
    parts.push(text.slice(at, start), placeholder(top), breaks);
    at = end;
  }
  parts.push(text.slice(at));
  return parts.join("");
}
