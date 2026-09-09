import { createContext, useContext } from "react";

import type { BlogSection } from "~/lib/blog";

type Outline = { sections: BlogSection[]; readingMinutes: number };

const OutlineContext = createContext<Outline>({ sections: [], readingMinutes: 0 });

export const OutlineProvider = OutlineContext.Provider;

/** Small enough to write out. Past twenty the digit reads fine on its own. */
const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];

/**
 * `<Contents />` is the article's orientation device: how many sections there
 * are, how long they take, and what they are.
 *
 * It sits in the flow after the opening rather than in a sticky rail. A rail
 * costs a margin the phone does not have, needs a second design for small
 * screens, and puts one more fixed element over the text. This answers "how
 * much is left" once, at the top, and then hands the job to the counter in
 * every section boundary, which is already there.
 *
 * The section count is spelled out and the minutes stay a digit so the two
 * numbers in the same label cannot be read as one.
 */
export function Contents() {
  const { sections, readingMinutes } = useContext(OutlineContext);
  if (sections.length === 0) return null;

  const count = WORDS[sections.length] ?? String(sections.length);
  const half = Math.ceil(sections.length / 2);

  return (
    <nav
      aria-label="Sections in this article"
      className="border-border bg-surface-alt rounded-chip my-9 border px-4 py-4 sm:px-6 sm:py-5"
    >
      <p className="text-ink-faint mb-4 font-mono text-[10.5px] uppercase tracking-[0.12em]">
        {count} sections / {readingMinutes} min
      </p>
      {/* Two columns reading down, not across: the eye follows 01-06 then 07-12,
          which is the order the article is in. A single grid with auto-flow
          column would need a fixed row count and breaks when a post is odd. */}
      <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
        {[sections.slice(0, half), sections.slice(half)].map((column, c) => (
          <ol key={c} className="contents sm:block">
            {column.map((section) => (
              <li key={section.id} className="flex items-baseline gap-3 py-[5px]">
                <span className="text-ink-faint shrink-0 font-mono text-[11px] tabular-nums">
                  {section.index}
                </span>
                <a
                  href={`#${section.id}`}
                  className="text-ink-secondary hover:text-ink text-[14.5px] leading-[1.45] transition-colors"
                >
                  {section.text}
                </a>
              </li>
            ))}
          </ol>
        ))}
      </div>
    </nav>
  );
}
