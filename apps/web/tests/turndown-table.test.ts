import { describe, expect, it } from "vitest";
import { turndown } from "~/lib/turndown-client";

const md = (html: string) => turndown("https://example.com/").turndown(html);

describe("turndown tables", () => {
  it("writes a table as a pipe table, its heading row first", () => {
    expect(
      md(
        `<table><caption>Plans</caption><thead><tr><th>Plan</th><th>Files</th></tr></thead>
         <tbody><tr><td>Plus | Pro</td><td><p>25</p><p>per project</p></td></tr>
         <tr><td></td><td></td></tr><tr><td colspan="2">Team</td></tr><tr><td>Free</td></tr></tbody></table>`,
      ),
    ).toBe(
      ["Plans", "", "| Plan | Files |", "| --- | --- |", "| Plus \\| Pro | 25 per project |", "| Team | |", "| Free | |"].join("\n"),
    );
  });

  it("gives a table with no heading row an empty one", () => {
    expect(md("<p>Before</p><table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table><p>After</p>")).toBe(
      ["Before", "", "|  |  |", "| --- | --- |", "| a | b |", "| c | d |", "", "After"].join("\n"),
    );
  });

  it("writes a footer row after the body, where a browser draws it", () => {
    expect(
      md("<table><thead><tr><th>Pos</th><th>Player</th></tr></thead><tfoot><tr><th>Total</th><th>2</th></tr></tfoot><tbody><tr><td>DL</td><td>A</td></tr><tr><td>LB</td><td>B</td></tr></tbody></table>"),
    ).toBe(["| Pos | Player |", "| --- | --- |", "| DL | A |", "| LB | B |", "| Total | 2 |"].join("\n"));
  });

  it("leaves a table wider than 100 columns as text, so padding cannot blow up", () => {
    const wide = `<table><tr>${'<td colspan="1000">w</td>'.repeat(50)}</tr>${"<tr><td>x</td><td>y</td></tr>".repeat(200)}</table>`;
    const out = md(wide);
    expect(out).not.toContain("|");
    expect(out.length).toBeLessThan(5000);
  });

  it("leaves a layout table and a one-cell table as text, and still writes the table inside", () => {
    const out = md(
      `<table><tr><td>Menu</td><td><table><tr><th>K</th><th>V</th></tr><tr><td>x</td><td>1</td></tr></table></td></tr></table>` +
        `<table><tr><td>Just a box</td></tr></table>`,
    );
    expect(out).toContain("| K | V |\n| --- | --- |\n| x | 1 |");
    expect(out).toContain("Menu");
    expect(out).not.toContain("| Menu");
    expect(out).not.toContain("| Just a box");
  });
});

describe("turndown math and drawings", () => {
  it("writes a formula as its TeX source, else its alttext, else its tokens spaced", () => {
    const tex = '<annotation encoding="application/x-tex">x = \\frac{a}{b}</annotation>';
    expect(md(`<p>So <math><semantics><mrow><mi>x</mi><mo>=</mo></mrow>${tex}</semantics></math> holds.</p>`)).toBe("So $x = \\frac{a}{b}$ holds.");
    expect(md(`<math display="block"><semantics><mi>y</mi>${tex}</semantics></math>`)).toBe("$$x = \\frac{a}{b}$$");
    expect(md('<p><math alttext="E equals m c squared"><mi>E</mi></math></p>')).toBe("E equals m c squared");
    expect(md("<p><math><mi>x</mi><mo>=</mo><mtext>size</mtext><annotation>hidden</annotation></math></p>")).toBe("x = size");
  });

  it("labels a drawing's title and description, then writes the text it draws", () => {
    expect(md('<p>See <svg><title>Sales</title><desc>By quarter</desc><text x="0">Q1</text><text><tspan>Q2</tspan></text></svg> here.</p>')).toBe(
      "See [Image: Sales; By quarter] Q1 Q2 here.",
    );
    expect(md('<p>Go<svg aria-hidden="true"><title>Arrow</title></svg></p>')).toBe("Go");
    expect(md("<p>a<svg><text>b</text></svg>c</p>")).toBe("a b c");
  });

  it("reads a deeply nested formula or drawing once, from the outermost", () => {
    for (const [open, close] of [["<math><mi>x</mi>", "</math>"], ["<svg><text>x</text>", "</svg>"]]) {
      const started = performance.now();
      expect(md(`<p>${open.repeat(300)}${close.repeat(300)}</p>`)).toBe(Array(300).fill("x").join(" "));
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });
});
