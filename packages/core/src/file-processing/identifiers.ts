/**
 * Exact identifiers in text: the ones a checksum or a fixed shape settles, so a
 * match needs no model and no guess (Q145 O1). Names, addresses and anything
 * else that takes context to see are out of scope on purpose.
 *
 * Algorithms follow python-stdnum (tr/tckimlik.py, tr/vkn.py, iban.py). IBAN
 * lengths come from the SWIFT IBAN registry v101 through stdnum's iban.dat.
 * Payment cards are left out: on the 2026-11-04 corpora every Luhn-valid match
 * was a decimal, a DOI or an id, none a card.
 */

export type IdentifierKind = "email" | "iban" | "tckn" | "vkn";

export interface IdentifierMatch {
  kind: IdentifierKind;
  start: number;
  end: number;
  /** The match with spaces and dashes removed, for the checksum kinds. */
  value: string;
}

// Full IBAN length per country, SWIFT IBAN registry v101.
const IBAN_LENGTH: Record<string, number> = Object.fromEntries(
  (
    "AD:24 AE:23 AL:28 AT:20 AZ:28 BA:20 BE:16 BG:22 BH:22 BI:27 BR:29 BY:28 CH:21 CR:22 CY:28 CZ:24 " +
    "DE:22 DJ:27 DK:18 DO:28 EE:20 EG:29 ES:24 FI:18 FK:18 FO:18 FR:27 GB:22 GE:22 GI:23 GL:18 GR:27 " +
    "GT:28 HN:28 HR:21 HU:28 IE:22 IL:23 IQ:23 IS:26 IT:27 JO:30 KW:30 KZ:20 LB:28 LC:32 LI:21 LT:20 " +
    "LU:20 LV:21 LY:25 MC:27 MD:24 ME:22 MK:19 MN:20 MR:27 MT:31 MU:30 NI:28 NL:18 NO:15 OM:23 PK:24 " +
    "PL:28 PS:29 PT:25 QA:29 RO:24 RS:22 RU:33 SA:24 SC:31 SD:18 SE:24 SI:19 SK:24 SM:27 SO:23 ST:25 " +
    "SV:28 TL:23 TN:24 TR:26 UA:29 VA:22 VG:24 XK:20 YE:30"
  )
    .split(" ")
    .map((pair) => [pair.slice(0, 2), Number(pair.slice(3))]),
);

/** ISO 13616: the country's registered length, then mod 97 over the rearranged digits. */
export function ibanValid(compact: string): boolean {
  if (IBAN_LENGTH[compact.slice(0, 2)] !== compact.length) return false;
  let rest = 0;
  for (const ch of compact.slice(4) + compact.slice(0, 4)) {
    const code = ch.charCodeAt(0);
    const n = code >= 65 ? code - 55 : code - 48;
    rest = (n > 9 ? rest * 100 + n : rest * 10 + n) % 97;
  }
  return rest === 1;
}

/** Turkish identity number: 11 digits, no leading zero, two check digits. */
export function tcknValid(digits: string): boolean {
  if (!/^[1-9]\d{10}$/.test(digits)) return false;
  const d = [...digits].map(Number);
  let weighted = 0;
  for (let i = 0; i < 9; i++) weighted += d[i] * (i % 2 === 0 ? 3 : 1);
  const check1 = (((10 - weighted) % 10) + 10) % 10;
  const check2 = (check1 + d.slice(0, 9).reduce((a, b) => a + b, 0)) % 10;
  return d[9] === check1 && d[10] === check2;
}

/** Turkish tax number: 10 digits, one check digit. */
export function vknValid(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 1; i <= 9; i++) {
    const c1 = (Number(digits[9 - i]) + i) % 10;
    if (c1) sum += (c1 * 2 ** i) % 9 || 9;
  }
  return (((10 - sum) % 10) + 10) % 10 === Number(digits[9]);
}

// A file extension after the @ is an asset name such as icon@2x.png, not a mailbox.
const NOT_A_TLD = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "js", "ts", "css", "json"]);
// Bounded parts (RFC 5321: local part 64, label 63) and a start only at the head of
// a run, so a long run of letters is scanned once, not once per position.
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,8}([A-Za-z]{2,24})(?![A-Za-z0-9-])/g;
const IBAN_START = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?=[ ]?[A-Z0-9])/g;
const TEN_OR_ELEVEN = /(?<![\w./=?#,-])\d{10,11}(?![\w-]|[.,]\d)/g;
// One random 10-digit number in ten passes the VKN check, so a VKN needs its label nearby.
const VKN_LABEL = /(?:vkn|vergi\s*(?:kimlik\s*)?(?:no|numaras)|tax\s*(?:id|no))[^\d\n]{0,12}$/i;

/** Every exact identifier in `text`, in order of position. */
export function findIdentifiers(text: string): IdentifierMatch[] {
  const out: IdentifierMatch[] = [];

  for (const m of text.matchAll(EMAIL)) {
    if (NOT_A_TLD.has(m[1].toLowerCase())) continue;
    out.push({ kind: "email", start: m.index, end: m.index + m[0].length, value: m[0] });
  }

  for (const m of text.matchAll(IBAN_START)) {
    const length = IBAN_LENGTH[m[0].slice(0, 2)];
    if (!length) continue;
    // Walk forward taking letters and digits, allowing one space between groups,
    // until the country's length is reached; the next character must end the word.
    let compact = m[0];
    let at = m.index + m[0].length;
    while (compact.length < length && at < text.length) {
      const ch = text[at];
      if (/[A-Z0-9]/.test(ch)) compact += ch;
      else if (!(ch === " " && /[A-Z0-9]/.test(text[at + 1] ?? ""))) break;
      at++;
    }
    if (compact.length === length && !/[A-Za-z0-9]/.test(text[at] ?? "") && ibanValid(compact)) {
      out.push({ kind: "iban", start: m.index, end: at, value: compact });
    }
  }

  for (const m of text.matchAll(TEN_OR_ELEVEN)) {
    const labelled = () => VKN_LABEL.test(text.slice(Math.max(0, m.index - 40), m.index));
    const kind = m[0].length === 11 ? (tcknValid(m[0]) ? "tckn" : null) : vknValid(m[0]) && labelled() ? "vkn" : null;
    if (kind) out.push({ kind, start: m.index, end: m.index + m[0].length, value: m[0] });
  }

  return out.sort((a, b) => a.start - b.start);
}
