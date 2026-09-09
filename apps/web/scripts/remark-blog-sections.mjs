/**
 * Numbers the `##` sections of a blog post at compile time.
 *
 * A research post runs 3,000 words over a dozen sections and a reader scrolling
 * it needs two things an `<h2>` alone cannot give: a counter that says how far
 * in they are, and a contents list that says how much is left. Both need the
 * total, which is only knowable once the whole document is parsed. That is this
 * plugin's whole job.
 *
 * It sets on every depth-2 heading:
 *   id           slug of the heading text, so the contents list can link to it
 *   data-index   "01".."NN", zero padded
 *   data-total   the section count, same on every heading
 *
 * and marks the paragraph directly under a heading with `data-lede`, which the
 * prose styles render as the section's summary line. Writers get all of this
 * from plain `##` and a first paragraph, with nothing to remember.
 *
 * It also adds a `sections` export to the module, which `<Contents />` renders.
 *
 * Blog content only. The docs tree shares the same MDX pipeline and its pages
 * are short lookups that would only be hurt by section furniture.
 */

/** Text content of a heading node, ignoring emphasis and link wrappers. */
function toText(node) {
  if (node.value) return node.value;
  if (!node.children) return "";
  return node.children.map(toText).join("");
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * JSON value to estree expression. MDX needs a real estree on an `mdxjsEsm`
 * node, not source text, and the alternative was pulling acorn in as a
 * dependency to parse a string we are the ones generating.
 */
function lit(value) {
  if (Array.isArray(value)) {
    return { type: "ArrayExpression", elements: value.map(lit) };
  }
  if (value && typeof value === "object") {
    return {
      type: "ObjectExpression",
      properties: Object.entries(value).map(([key, v]) => ({
        type: "Property",
        kind: "init",
        method: false,
        shorthand: false,
        computed: false,
        key: { type: "Identifier", name: key },
        value: lit(v),
      })),
    };
  }
  return { type: "Literal", value };
}

function esmExport(name, value) {
  const declaration = {
    type: "VariableDeclaration",
    kind: "const",
    declarations: [
      {
        type: "VariableDeclarator",
        id: { type: "Identifier", name },
        init: lit(value),
      },
    ],
  };
  return {
    type: "mdxjsEsm",
    value: "",
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [{ type: "ExportNamedDeclaration", declaration, specifiers: [], source: null }],
      },
    },
  };
}

function setProps(node, props) {
  node.data ??= {};
  node.data.hProperties = { ...node.data.hProperties, ...props };
}

export function remarkBlogSections() {
  return (tree, file) => {
    const path = file?.path ?? file?.history?.[0] ?? "";
    if (!/[\\/]content[\\/]blog[\\/]/.test(path)) return;

    const found = [];
    tree.children.forEach((node, at) => {
      if (node.type === "heading" && node.depth === 2) found.push({ node, at });
    });
    if (found.length === 0) return;

    const total = String(found.length);
    const sections = found.map(({ node, at }, i) => {
      const text = toText(node);
      const id = slug(text);
      const index = String(i + 1).padStart(2, "0");
      setProps(node, { id, "data-index": index, "data-total": total });

      // The first paragraph of a section is its summary line. Marked here rather
      // than asked of the writer, so it cannot be forgotten on one section and
      // leave the page half-styled.
      const next = tree.children[at + 1];
      if (next?.type === "paragraph") setProps(next, { "data-lede": "true" });

      return { index, id, text };
    });

    tree.children.unshift(esmExport("sections", sections));
    tree.children.unshift(esmExport("readingMinutes", readingMinutes(tree)));
  };
}

/**
 * Prose minutes at 200 words per minute, floor of one.
 *
 * Counted over text nodes only, so a figure's props and a code fence do not
 * inflate it. This is the conventional reading-time estimate and is labelled as
 * minutes on the page, never as a measurement.
 */
function readingMinutes(tree) {
  let words = 0;
  const walk = (node) => {
    if (node.type === "text") words += node.value.trim().split(/\s+/).filter(Boolean).length;
    node.children?.forEach(walk);
  };
  walk(tree);
  return Math.max(1, Math.round(words / 200));
}
