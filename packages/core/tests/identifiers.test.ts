import { describe, expect, it } from "vitest";
import { findIdentifiers, ibanValid, luhnValid, ssnValid } from "../src/file-processing/identifiers";

const kinds = (text: string) => findIdentifiers(text).map((m) => `${m.kind}:${text.slice(m.start, m.end)}`);

describe("checksums", () => {
  it("apply the SSA's SSN rules and Luhn", () => {
    expect(ssnValid("123456789")).toBe(true);
    for (const bad of ["000456789", "666456789", "912456789", "123006789", "123450000", "12345678"]) {
      expect(ssnValid(bad)).toBe(false);
    }
    // Published test numbers (Visa, Mastercard, Amex), never issued.
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("5555555555554444")).toBe(true);
    expect(luhnValid("378282246310005")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(luhnValid("411111111111")).toBe(false);
  });

  it("validate IBAN length and mod 97", () => {
    expect(ibanValid("GB82WEST12345698765432")).toBe(true);
    expect(ibanValid("DE89370400440532013000")).toBe(true);
    expect(ibanValid("TR330006100519786457841326")).toBe(true);
    expect(ibanValid("GB82WEST12345698765433")).toBe(false);
    expect(ibanValid("GB82WEST1234569876543")).toBe(false);
  });

});

describe("findIdentifiers", () => {
  it("finds each kind with its span", () => {
    const text =
      "Mail jane@example.co.uk, IBAN GB82 WEST 1234 5698 7654 32 BIC, SSN: 123-45-6789, Visa card 4111 1111 1111 1111.";
    expect(kinds(text)).toEqual([
      "email:jane@example.co.uk",
      "iban:GB82 WEST 1234 5698 7654 32",
      "ssn:123-45-6789",
      "card:4111 1111 1111 1111",
    ]);
  });

  it("skips asset names, failed checksums and digits inside longer tokens", () => {
    expect(kinds("logo@2x.png SSN a123456789 SSN 123456789b card 4111111111111111.5 card 4111111111111111-1")).toEqual([]);
  });

  it("takes an SSN or a card only next to its label", () => {
    expect(kinds("Ref 123-45-6789, order 4111 1111 1111 1111")).toEqual([]);
    expect(kinds("Social Security Number: 123 45 6789")).toEqual(["ssn:123 45 6789"]);
    expect(kinds("Credit card no. 5555-5555-5555-4444")).toEqual(["card:5555-5555-5555-4444"]);
    // Mixed separators are not one SSN; a failed Luhn is not a card.
    expect(kinds("SSN 123-45 6789, card 4111 1111 1111 1112")).toEqual([]);
    // The label must be on the same line.
    expect(kinds("SSN\n123-45-6789")).toEqual([]);
  });

  it("scans long digit runs in linear time", () => {
    for (const run of ["1".repeat(1_000_000), "1 ".repeat(500_000), "card 1-".repeat(150_000)]) {
      const t0 = performance.now();
      findIdentifiers(run);
      expect(performance.now() - t0).toBeLessThan(150);
    }
  });

  it("scans a long run of letters in linear time", () => {
    const run = "a".repeat(1_000_000);
    const t0 = performance.now();
    findIdentifiers(run + "@" + run);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it("does not stretch an IBAN into the next word", () => {
    expect(kinds("DE89 3704 0044 0532 0130 00X")).toEqual([]);
    expect(kinds("DE89 3704 0044 0532 0130 00 next")).toEqual(["iban:DE89 3704 0044 0532 0130 00"]);
  });
});
