/**
 * The line under a content page's drop zone. It holds what the hero paragraph
 * and its three trust bullets used to carry above the tool: where the cap in
 * the answer line came from, and the path to the worked example. On a phone
 * that copy sat between the searcher's question and the drop zone, which then
 * started below the first screen (2026-10-17 reading: 543-666 px of 844).
 */
export function HeroFootnote({
  source,
  checked,
  example = "See a worked example",
}: {
  source?: string;
  checked?: string;
  example?: string;
}) {
  return (
    <p className="text-ink-faint mt-3 text-center text-[12.5px] leading-relaxed">
      {source && checked ? `Read at the ${source}, ${checked}. ` : ""}
      No sign-up.{" "}
      <a
        href="#example"
        className="whitespace-nowrap hover:text-ink-secondary focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {example}
      </a>
    </p>
  );
}
