import type { ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";

import { InfoCard, type InfoTone } from "~/components/app/info-card";

type CalloutType = "tip" | "warn" | "note";

/**
 * Maps a post-author-facing type to the site's existing InfoCard tones so blog
 * callouts share the exact tint, border, and icon-plus-title contract as the
 * in-app notices (full borders, never a side-stripe; color is never the only
 * signal). tip = green/go, warn = amber/info, note = blue/neutral.
 */
const MAP: Record<CalloutType, { tone: InfoTone; icon: LucideIcon; defaultTitle: string }> = {
  tip: { tone: "go", icon: Lightbulb, defaultTitle: "Tip" },
  warn: { tone: "info", icon: TriangleAlert, defaultTitle: "Heads up" },
  note: { tone: "neutral", icon: Info, defaultTitle: "Note" },
};

/**
 * `<Callout type="tip" | "warn" | "note" title="...">` for MDX posts. A short
 * emphasis or honest caveat that breaks the prose. Body paragraphs are pulled
 * tight so they sit inside the card rather than carrying full prose margins.
 */
export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children?: ReactNode;
}) {
  const { tone, icon, defaultTitle } = MAP[type];
  return (
    <InfoCard
      tone={tone}
      icon={icon}
      title={title ?? defaultTitle}
      className="my-7 [&_a]:text-[14px] [&_li]:text-[14px] [&_li]:leading-[1.55] [&_p]:my-0 [&_p]:text-[14px] [&_p]:leading-[1.6] [&_p:not(:last-child)]:mb-2.5 [&_ul]:mb-0 [&_ul]:mt-1.5 [&_ul]:space-y-1"
    >
      {children}
    </InfoCard>
  );
}
