/**
 * Exact identifiers in text: the ones a checksum or a fixed shape settles, so a
 * match needs no model and no guess (Q145 O1). Names, addresses and anything
 * else that takes context to see are out of scope on purpose.
 *
 * IBAN follows python-stdnum (iban.py), with lengths from the SWIFT IBAN
 * registry v101 through stdnum's iban.dat. A US SSN and a payment card are
 * taken only next to their label: on the 2026-11-04 corpora every unlabelled
 * Luhn-valid run (11,212 in 66 documents) and every dashed SSN shape (3) was a
 * decimal, a DOI, a table number or another country's id, and no labelled one
 * was false.
 *
 * A phone number is taken only right after its label too (Q158 O1). Presidio
 * runs libphonenumber per region and lets the label raise a score; here the
 * label gates, because unlabelled phone shapes in the same documents were
 * mostly table and course numbers, and 40 of 40 sampled labelled ones (784
 * in 140 of 2,277 documents) were phones. The number is read from the label onward, so an international
 * prefix such as "+44 (0)" is part of the match.
 */

export type IdentifierKind = "email" | "iban" | "ssn" | "card" | "phone";

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

/** US SSN as the SSA issues it: area not 000, 666 or 900-999, group not 00, serial not 0000. */
export function ssnValid(digits: string): boolean {
  return /^(?!000|666|9)\d{3}(?!00)\d{2}(?!0000)\d{4}$/.test(digits);
}

/** Luhn over 13 to 19 digits (ISO/IEC 7812). */
export function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2) n = n > 4 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
}

// A file extension after the @ is an asset name such as icon@2x.png, not a mailbox.
const NOT_A_TLD = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "js", "ts", "css", "json"]);
// Bounded parts (RFC 5321: local part 64, label 63) and a start only at the head of
// a run, so a long run of letters is scanned once, not once per position.
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,8}([A-Za-z]{2,24})(?![A-Za-z0-9-])/g;
const IBAN_START = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?=[ ]?[A-Z0-9])/g;
// Digit runs that stand alone: not inside a word, a path, a URL query or a decimal.
const SSN_SHAPE = /(?<![\w./=?#,-])\d{3}([- ]?)\d{2}\1\d{4}(?![\w-]|[.,]\d)/g;
const CARD_SHAPE = /(?<![\w./=?#,-])\d(?:[ -]?\d){12,18}(?![\w-]|[.,]\d)/g;
// The label must sit just before the number, on the same line.
const SSN_LABEL = /(?:\bssn|\bsocial\s+security(?:\s+(?:number|no\.?|#))?|\bss#)[^\d\n]{0,12}$/i;
const CARD_LABEL = /(?:\bcard|\bcredit|\bdebit|\bvisa|\bmastercard|\bamex|\bamerican\s+express)[^\d\n]{0,20}$/i;
const labelled = (text: string, at: number, label: RegExp) => label.test(text.slice(Math.max(0, at - 40), at));
// The label, then the number from where it ends: 7 to 15 digits (E.164), with
// spaces, dots, dashes and brackets between them, standing alone.
const PHONE_LABEL = /\b(?:phone|tel|mobile|cell|fax|call)[^\d\n+(]{0,15}/gi;
const PHONE_SHAPE = /\(?\+?\(?\d(?:[ .()-]{0,2}\d){6,14}(?![\w-]|[.,]\d)/y;

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

  for (const m of text.matchAll(SSN_SHAPE)) {
    const digits = m[0].replace(/\D/g, "");
    if (ssnValid(digits) && labelled(text, m.index, SSN_LABEL)) {
      out.push({ kind: "ssn", start: m.index, end: m.index + m[0].length, value: digits });
    }
  }

  for (const m of text.matchAll(CARD_SHAPE)) {
    const digits = m[0].replace(/\D/g, "");
    if (luhnValid(digits) && labelled(text, m.index, CARD_LABEL)) {
      out.push({ kind: "card", start: m.index, end: m.index + m[0].length, value: digits });
    }
  }

  for (const label of text.matchAll(PHONE_LABEL)) {
    PHONE_SHAPE.lastIndex = label.index + label[0].length;
    const m = PHONE_SHAPE.exec(text);
    if (m) out.push({ kind: "phone", start: m.index, end: m.index + m[0].length, value: m[0].replace(/\D/g, "") });
  }

  return out.sort((a, b) => a.start - b.start);
}
