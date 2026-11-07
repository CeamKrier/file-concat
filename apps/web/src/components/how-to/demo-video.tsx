import { useLoaderData } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { type Demo, type DemoCut, recordDemoPlay, settleDemoArm } from "~/lib/demo-arm";

/** Every step the clip shows, in the words burned into it (WCAG 1.2.1 text alternative). */
const CAPTIONS: Record<DemoCut, string> = {
  claude:
    "Shown: a folder of 40 files dropped in, Format set to Plain, the .txt downloaded and attached in Claude as one file.",
  chatgpt:
    "Shown: a folder of 40 files dropped in, Format set to Plain, the .txt downloaded and attached in ChatGPT as one file.",
};

/**
 * VD1's demo loop, in the hero under the subtitle (spec 2026-11-07). Renders
 * in both arms so the arm is counted; draws only in the `video` arm, and only
 * on a screen that could show it (the CSS below matches `DEMO_MEDIA`).
 */
export function DemoVideo() {
  const data = useLoaderData({ strict: false }) as { demo?: Demo | null } | undefined;
  const demo = data?.demo ?? null;

  useEffect(() => {
    if (demo) settleDemoArm(demo.arm);
  }, [demo]);

  if (demo?.arm !== "video") return null;
  return <DemoPlayer cut={demo.cut} />;
}

function DemoPlayer({ cut }: { cut: DemoCut }) {
  const video = useRef<HTMLVideoElement>(null);
  const pausedByPerson = useRef(false);
  const [playing, setPlaying] = useState(false);
  const captionId = useId();

  // Plays while half of it is in view. Under reduced motion or Save-Data it
  // waits on the poster for the button (WCAG 2.2.2 and C39).
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || connection?.saveData) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (pausedByPerson.current) return;
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    pausedByPerson.current = !el.paused;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };

  const Icon = playing ? Pause : Play;
  return (
    <figure className="border-border bg-surface-inset rounded-card mt-8 hidden max-w-[560px] overflow-hidden border [@media(pointer:fine)_and_(min-width:1024px)]:block">
      <div className="border-border flex items-center justify-between gap-3 border-b px-3 py-2">
        <span className="text-ink-secondary text-[12px] font-medium">Demo</span>
        <button
          type="button"
          onClick={toggle}
          className="text-ink-secondary hover:text-ink focus-visible:ring-primary inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2"
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          {playing ? "Pause demo" : "Play demo"}
        </button>
      </div>
      {/* The clip has no audio track, so there is nothing to caption. */}
      <video
        ref={video}
        muted
        loop
        playsInline
        preload="none"
        poster={`/demo/${cut}.webp`}
        width={1280}
        height={800}
        aria-describedby={captionId}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onPlaying={recordDemoPlay}
        className="block aspect-[16/10] h-auto w-full cursor-pointer bg-surface"
      >
        <source src={`/demo/${cut}.mp4`} type="video/mp4" />
      </video>
      <figcaption id={captionId} className="text-ink-muted border-border border-t px-3 py-2 text-[13px] leading-snug">
        {CAPTIONS[cut]}
      </figcaption>
    </figure>
  );
}
