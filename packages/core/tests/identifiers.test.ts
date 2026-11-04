import { describe, expect, it } from "vitest";
import { findIdentifiers, ibanValid, tcknValid, vknValid } from "../src/file-processing/identifiers";

const kinds = (text: string) => findIdentifiers(text).map((m) => `${m.kind}:${text.slice(m.start, m.end)}`);

describe("checksums", () => {
  it("match python-stdnum's documented examples", () => {
    expect(tcknValid("17291716060")).toBe(true);
    expect(tcknValid("17291716061")).toBe(false);
    expect(tcknValid("07291716060")).toBe(false);
    expect(vknValid("4540536920")).toBe(true);
    expect(vknValid("4540536921")).toBe(false);
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
      "Mail ayse@ornek.com.tr, IBAN TR33 0006 1005 1978 6457 8413 26 BIC, TCKN 17291716060, VKN 4540536920.";
    expect(kinds(text)).toEqual([
      "email:ayse@ornek.com.tr",
      "iban:TR33 0006 1005 1978 6457 8413 26",
      "tckn:17291716060",
      "vkn:4540536920",
    ]);
  });

  it("skips asset names, failed checksums and digits inside longer tokens", () => {
    expect(kinds("logo@2x.png a17291716060 17291716060b 1729171606.05 4540536920-1")).toEqual([]);
  });

  it("scans a long run of letters in linear time", () => {
    const run = "a".repeat(1_000_000);
    const t0 = performance.now();
    findIdentifiers(run + "@" + run);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it("takes a VKN only next to its label", () => {
    expect(kinds("ISBN 4540536920")).toEqual([]);
    expect(kinds("Vergi No: 4540536920")).toEqual(["vkn:4540536920"]);
    expect(kinds("VKN 4540536920")).toEqual(["vkn:4540536920"]);
  });

  it("does not stretch an IBAN into the next word", () => {
    expect(kinds("DE89 3704 0044 0532 0130 00X")).toEqual([]);
    expect(kinds("DE89 3704 0044 0532 0130 00 next")).toEqual(["iban:DE89 3704 0044 0532 0130 00"]);
  });
});
