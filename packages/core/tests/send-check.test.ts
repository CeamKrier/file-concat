import { describe, expect, it } from "vitest";
import { KEY_RULES, findSensitive, maskFindings, type Finding } from "../src/file-processing/send-check";

// Every key-shaped string here is assembled at runtime from parts and a seeded
// generator, so the repository never holds one (GitHub push protection).
function gen(seed: number) {
  let s = seed >>> 0;
  return (n: number, alphabet: string) => {
    let out = "";
    for (let i = 0; i < n; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      out += alphabet[s % alphabet.length];
    }
    return out;
  };
}
const r = gen(7);
const UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOW = "abcdefghijklmnopqrstuvwxyz";
const DIG = "0123456789";
const ALNUM = UP + LOW + DIG;
const B64 = ALNUM + "+/";

// One real-shaped secret per rule, and a near miss the rule must not take.
const CASES: Record<string, { secret: () => string; miss: string }> = {
  "anthropic-api-key": { secret: () => "sk-ant-" + "api03-" + r(93, ALNUM + "_-") + "AA", miss: "sk-ant-" + "api03-" + "x".repeat(40) },
  "anthropic-admin-api-key": { secret: () => "sk-ant-" + "admin01-" + r(93, ALNUM) + "AA", miss: "sk-ant-" + "admin01-short" },
  "aws-access-token": { secret: () => "AK" + "IA" + r(16, UP + "234567"), miss: "AK" + "IA" + "IOSFODNN7" + "EXAMPLE" },
  "gcp-api-key": { secret: () => "AI" + "za" + r(35, ALNUM + "_-"), miss: "AI" + "za" + "a".repeat(35) },
  "github-app-token": { secret: () => "gh" + "s_" + r(36, ALNUM), miss: "gh" + "s_" + "a".repeat(36) },
  "github-fine-grained-pat": { secret: () => "github" + "_pat_" + r(82, ALNUM + "_"), miss: "github" + "_pat_" + r(40, ALNUM) },
  "github-oauth": { secret: () => "gh" + "o_" + r(36, ALNUM), miss: "gh" + "o_" + "ab".repeat(18) },
  "github-pat": { secret: () => "gh" + "p_" + r(36, ALNUM), miss: "gh" + "p_" + r(20, ALNUM) },
  "github-refresh-token": { secret: () => "gh" + "r_" + r(36, ALNUM), miss: "gh" + "r_" + "0".repeat(36) },
  "gitlab-pat": { secret: () => "gl" + "pat-" + r(20, ALNUM), miss: "gl" + "pat-" + "a".repeat(20) },
  "huggingface-access-token": { secret: () => "hf" + "_" + r(34, UP + LOW), miss: "hf" + "_" + r(20, LOW) },
  jwt: { secret: () => "ey" + r(24, ALNUM) + ".ey" + r(40, ALNUM) + "." + r(30, ALNUM), miss: "they" + r(24, ALNUM) },
  "npm-access-token": { secret: () => "np" + "m_" + r(36, LOW + DIG), miss: "np" + "m_" + r(20, LOW) },
  "openai-api-key": {
    secret: () => "sk-" + "proj-" + r(58, ALNUM) + "T3Blbk" + "FJ" + r(58, ALNUM),
    miss: "sk-" + "proj-" + r(58, ALNUM),
  },
  "private-key": {
    secret: () => "-----BEGIN RSA " + "PRIVATE KEY-----\n" + r(64, B64) + "\n" + r(64, B64) + "\n-----END RSA PRIVATE " + "KEY-----",
    miss: "-----BEGIN PUBLIC " + "KEY-----\n" + r(64, B64) + "\n-----END PUBLIC KEY-----",
  },
  "sentry-org-token": {
    secret: () => "sntrys_" + "eyJpYXQiO" + r(30, B64) + "LCJyZWdpb25fdXJs" + r(30, B64) + "_" + r(43, B64),
    miss: "sntrys_" + "eyJpYXQiO" + "short",
  },
  "slack-bot-token": { secret: () => "xo" + "xb-" + r(12, DIG) + "-" + r(12, DIG) + "-" + r(24, ALNUM), miss: "xo" + "xb-" + r(5, DIG) },
  "slack-user-token": {
    secret: () => "xo" + "xp-" + r(12, DIG) + "-" + r(12, DIG) + "-" + r(12, DIG) + "-" + r(32, LOW + DIG),
    miss: "xo" + "xp-" + r(12, DIG) + "-" + r(12, DIG),
  },
  "slack-webhook-url": { secret: () => "https://hooks" + ".slack.com/services/" + r(44, ALNUM), miss: "https://hooks" + ".slack.com/services/T000" },
  "stripe-access-token": { secret: () => "sk" + "_live_" + r(24, ALNUM), miss: "sk" + "_live_" + "abc123" },
  "connection-string": { secret: () => r(16, ALNUM), miss: "postgres://localhost:5432/app" },
};

const wrap = (id: string, s: string) => (id === "connection-string" ? `DATABASE_URL="postgres://admin:${s}@db.internal:5432/app"` : `const value = "${s}";`);
const keys = (text: string) => findSensitive(text).filter((f) => f.category === "key");

describe("key rules", () => {
  it("has one case per rule", () => {
    expect(Object.keys(CASES).sort()).toEqual(KEY_RULES.map((k) => k.id).sort());
  });

  for (const rule of KEY_RULES) {
    it(`${rule.id}: finds the secret and spans only the secret`, () => {
      const secret = CASES[rule.id].secret();
      const text = wrap(rule.id, secret);
      const found = keys(text);
      expect(found.map((f) => f.kind)).toContain(rule.id);
      const f = found.find((x) => x.kind === rule.id)!;
      expect(text.slice(f.start, f.end)).toBe(secret);
    });

    it(`${rule.id}: skips the near miss`, () => {
      expect(keys(wrap(rule.id, CASES[rule.id].miss)).filter((f) => f.kind === rule.id)).toEqual([]);
    });
  }

  // Each regex alone over 1 MB inputs built against its own quantifiers: its
  // keyword followed by a long run it accepts, the keyword repeated, and runs
  // broken by the delimiters its tail looks for. Linear rules take a few ms; a
  // backtracking one takes seconds.
  it("runs every rule in linear time on adversarial input", () => {
    const MB = 1_000_000;
    for (const rule of KEY_RULES) {
      for (const kw of rule.keywords) {
        const inputs = [
          kw + "a".repeat(MB),
          (kw + " ").repeat(MB / (kw.length + 1)),
          (kw + "aB3".repeat(10) + ".").repeat(MB / (kw.length + 31)),
          (kw + "-1234567890").repeat(MB / (kw.length + 11)),
        ];
        for (const input of inputs) {
          const re = new RegExp(rule.re.source, rule.re.flags);
          const t0 = performance.now();
          void [...input.matchAll(re)].length;
          const ms = performance.now() - t0;
          expect(ms, `${rule.id} on ${JSON.stringify(input.slice(0, 30))}`).toBeLessThan(100);
        }
      }
    }
  });
});

describe("findSensitive", () => {
  it("skips placeholder passwords in connection strings", () => {
    for (const pw of ["password", "secret", "${DB_PASSWORD}", "#{pass}", "<password>", "[PASSWORD]", "****"]) {
      expect(findSensitive(`postgres://app:${pw}@db:5432/x`)).toEqual([]);
    }
  });

  it("looks for identifiers only when asked (document files)", () => {
    const text = "Pay to TR33 0006 1005 1978 6457 8413 26, mail ayse@ornek.com.tr";
    expect(findSensitive(text).filter((f) => f.category === "identifier")).toEqual([]);
    expect(findSensitive(text, { identifiers: true }).map((f) => f.kind)).toEqual(["iban", "email"]);
  });
});

describe("maskFindings", () => {
  const all = () => true;

  it("replaces only the secret, keeping the quotes around it", () => {
    const secret = CASES["github-pat"].secret();
    const text = `token = "${secret}"\nnext line`;
    expect(maskFindings(text, findSensitive(text), all)).toBe(`token = "[Secret removed: GitHub token]"\nnext line`);
  });

  it("masks two findings on one line and one at the end of the file", () => {
    const a = CASES["stripe-access-token"].secret();
    const b = CASES["npm-access-token"].secret();
    const c = CASES["github-pat"].secret();
    const text = `x("${a}", "${b}")\n${c}`;
    expect(maskFindings(text, findSensitive(text), all)).toBe(
      `x("[Secret removed: Stripe key]", "[Secret removed: npm token]")\n[Secret removed: GitHub token]`,
    );
  });

  it("keeps the line count of a multi-line key, CRLF included", () => {
    const key = CASES["private-key"].secret().replace(/\n/g, "\r\n");
    const text = `a\r\n${key}\r\nb`;
    const out = maskFindings(text, findSensitive(text), all);
    expect(out).toBe("a\r\n[Secret removed: private key]\r\n\r\n\r\n\r\nb");
    expect(out.split("\r\n").length).toBe(text.split("\r\n").length);
  });

  it("leaves findings the caller keeps", () => {
    const secret = CASES["github-pat"].secret();
    const text = `"${secret}"`;
    expect(maskFindings(text, findSensitive(text), () => false)).toBe(text);
  });

  it("lets the key mask win where an identifier overlaps it", () => {
    const text = "postgres://ayse@ornek.com.tr:pw@db"; // not a key, an email inside a URL
    const email: Finding = { kind: "email", category: "identifier", label: "Email", start: 11, end: 28, value: "ayse@ornek.com.tr" };
    const key: Finding = { kind: "connection-string", category: "key", label: "database password", start: 5, end: 31, value: "x" };
    expect(maskFindings(text, [email, key], all)).toBe("postg[Secret removed: database password]@db");
  });

  it("masks a 100k-address contact list in linear time", () => {
    const text = Array.from({ length: 100_000 }, (_, i) => `person${i}@example.org`).join("\n");
    const findings = findSensitive(text, { identifiers: true });
    expect(findings.length).toBe(100_000);
    const t0 = performance.now();
    const out = maskFindings(text, findings, all);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(out.split("\n").every((l) => l === "[Email removed]")).toBe(true);
  });

  it("masks identifiers with their own label", () => {
    const text = "IBAN TR33 0006 1005 1978 6457 8413 26.";
    expect(maskFindings(text, findSensitive(text, { identifiers: true }), all)).toBe("IBAN [IBAN removed].");
  });
});
