import { strFromU8, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { withRtfChoices } from "../src/file-processing/parsers/rtf-choices";

const HEAD = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}{\\f1\\fnil\\fcharset2 Symbol;}}";
const choose = (body: string) => strFromU8(withRtfChoices(strToU8(`${HEAD}${body}}`))).slice(HEAD.length, -1);

describe("withRtfChoices", () => {
  it("keeps the \\ud copy of a \\upr pair and drops \\nonesttables text", () => {
    expect(choose("A {\\upr{ansi copy}{\\*\\ud{uni\\u915?}}} B")).toBe("A {\\upr{}{{uni\\u915?}}} B");
    // An empty group stays, so \nestcell does not run into the next word.
    expect(choose("x\\nestcell{\\nonesttables fallback\\par}y\\nestcell")).toBe("x\\nestcell{}y\\nestcell");
  });

  it("writes a drop-down's selected item into its empty result", () => {
    const field = (res: string, result = "") =>
      `{\\field{\\*\\fldinst{ FORMDROPDOWN {\\*\\formfield{\\fftype2${res}{\\*\\ffl One}{\\*\\ffl Two}}}}}{\\fldrslt ${result}}}`;
    expect(choose(field("\\ffres1\\ffdefres0"))).toContain("{\\fldrslt Two}");
    // \ffres 25 is no choice: the default item shows.
    expect(choose(field("\\ffres25\\ffdefres0"))).toContain("{\\fldrslt One}");
    // A result Word already wrote is left as it is.
    expect(choose(field("\\ffres1", "Kept"))).toContain("{\\fldrslt Kept}");
    // A second empty result in the same field gets nothing.
    expect(choose(field("\\ffres1").replace("{\\fldrslt }", "{\\fldrslt }{\\fldrslt }"))).toContain("{\\fldrslt Two}{\\fldrslt }");
  });

  it("turns a Symbol-font character into the one it draws, and leaves other fonts alone", () => {
    expect(choose("{\\f1 \\u-3913?} {\\f1\\'b7a1} {\\f0 \\u-3913?}")).toBe("{\\f1 \\u8226 ?} {\\f1\\u8226?\\u945?1} {\\f0 \\u-3913?}");
    expect(choose("{\\uc99999\\f1\\'b7}")).toBe(`{\\uc99999\\f1\\u8226${"?".repeat(8)}}`);
  });

  it("gives back the same bytes when there is nothing to choose", () => {
    const plain = strToU8(`${HEAD}\\pard plain\\par}`);
    expect(withRtfChoices(plain)).toBe(plain);
  });
});
