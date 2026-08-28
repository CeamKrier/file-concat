/**
 * What the mocks on /clipper are looking at: one thread, one video, and the
 * cart they fill.
 *
 * Its own module rather than a corner of the panel, because the panel and the
 * artifacts beside it have to agree on these to the character — a filename in
 * one and a slug in the other is the kind of detail a reader checks and then
 * stops trusting the rest of. A component file that also exports constants
 * gives up fast refresh, which is the other reason.
 */

export const THREAD = "Ask HN: How do you keep a design system honest?";
export const VIDEO = "How databases actually store your data";

/**
 * The cart, in the order the page fills it: the thread, then the three rows off
 * the listing, then the video. Every count and every figure in the panel is
 * derived from this one list.
 *
 * The names are what `clippingPath` actually produces: the page's own title,
 * spaces and capitals intact, with only the characters a filesystem refuses
 * turned into hyphens. Slugging them would have been a guess at a rule the
 * extension does not have.
 */
export const CART = [
  { name: "Ask HN- How do you keep a design system honest.md", tokens: 14.2 },
  { name: "What are you working on this week.md", tokens: 7.8 },
  { name: "Writing a parser without a parser generator.md", tokens: 9.1 },
  { name: "Async cancellation, three years later.md", tokens: 11.6 },
  { name: `${VIDEO}.md`, tokens: 6.4 },
];

/** What the cart weighs, in the panel's own shorthand. */
export const weigh = (files: { tokens: number }[]) =>
  `~${files.reduce((total, file) => total + file.tokens, 0).toFixed(1)}k`;
