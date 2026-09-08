import { describe, expect, it } from "vitest";

import { remarkBlogSections } from "../scripts/remark-blog-sections.mjs";

/**
 * The plugin is the only thing that knows a post's section count, and three
 * pieces of the reading system depend on it: the counter in every boundary, the
 * contents block, and the summary line under each heading. None of that is
 * visible in a component test, because by then the numbers are already props.
 */

type Node = { type: string; depth?: number; value?: string; children?: Node[]; data?: unknown };

const heading = (text: string): Node => ({
  type: "heading",
  depth: 2,
  children: [{ type: "text", value: text }],
});
const para = (text: string): Node => ({
  type: "paragraph",
  children: [{ type: "text", value: text }],
});

function run(children: Node[], path = "/repo/src/content/blog/a-post.mdx") {
  const tree = { type: "root", children };
  remarkBlogSections()(tree as never, { path } as never);
  return tree;
}

const props = (node: Node) => (node.data as { hProperties?: Record<string, string> })?.hProperties;

/** The `mdxjsEsm` node the plugin unshifts, by exported name. */
function exported(tree: { children: Node[] }, name: string) {
  for (const node of tree.children) {
    if (node.type !== "mdxjsEsm") continue;
    const body = (node.data as { estree: { body: [{ declaration: { declarations: [{ id: { name: string }; init: unknown }] } }] } }).estree.body[0];
    const declarator = body.declaration.declarations[0];
    if (declarator.id.name === name) return declarator.init as { value?: unknown; elements?: unknown[] };
  }
  return undefined;
}

describe("remarkBlogSections", () => {
  it("numbers every section against the total, which is only knowable at the end", () => {
    const tree = run([heading("One"), para("a"), heading("Two"), para("b"), heading("Three")]);
    const headings = tree.children.filter((n) => n.type === "heading");

    expect(headings.map((h) => props(h)!["data-index"])).toEqual(["01", "02", "03"]);
    expect(headings.every((h) => props(h)!["data-total"] === "3")).toBe(true);
  });

  it("slugs the heading text so the contents block can link to it", () => {
    const tree = run([heading("What the format actually costs")]);

    expect(props(tree.children.find((n) => n.type === "heading")!)!.id).toBe(
      "what-the-format-actually-costs",
    );
  });

  it("marks only the paragraph directly under a heading as the summary line", () => {
    const tree = run([heading("One"), para("lede"), para("body"), heading("Two")]);
    const paragraphs = tree.children.filter((n) => n.type === "paragraph");

    expect(props(paragraphs[0])!["data-lede"]).toBe("true");
    expect(props(paragraphs[1])).toBeUndefined();
  });

  it("does not mark a section that opens with a figure instead of prose", () => {
    const tree = run([heading("One"), { type: "mdxJsxFlowElement" }, para("body")]);

    expect(props(tree.children.find((n) => n.type === "paragraph")!)).toBeUndefined();
  });

  it("exports the sections in document order for the contents block", () => {
    const tree = run([heading("First up"), heading("Then this")]);
    const sections = exported(tree, "sections")!.elements as { properties: unknown[] }[];

    expect(sections).toHaveLength(2);
    const first = Object.fromEntries(
      (sections[0].properties as { key: { name: string }; value: { value: string } }[]).map((p) => [
        p.key.name,
        p.value.value,
      ]),
    );
    expect(first).toEqual({ index: "01", id: "first-up", text: "First up" });
  });

  it("estimates reading minutes from prose and never returns zero", () => {
    const words = (n: number) => para(Array.from({ length: n }, () => "word").join(" "));

    expect(exported(run([heading("H"), words(600)]), "readingMinutes")!.value).toBe(3);
    expect(exported(run([heading("H"), words(5)]), "readingMinutes")!.value).toBe(1);
  });

  it("leaves the docs tree alone, since a lookup page needs no section furniture", () => {
    const tree = run([heading("Installing")], "/repo/src/content/docs/install.mdx");

    expect(props(tree.children[0])).toBeUndefined();
    expect(tree.children.some((n) => n.type === "mdxjsEsm")).toBe(false);
  });
});
