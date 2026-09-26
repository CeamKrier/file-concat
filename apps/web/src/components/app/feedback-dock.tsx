import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";

import {
  FEEDBACK_EMAIL,
  FEEDBACK_EMAIL_MAX,
  FEEDBACK_MAX_CHARS,
  type FeedbackOrigin,
} from "~/lib/feedback";
import { sendFeedback, track } from "~/lib/metrics";
import { cn } from "~/lib/utils";

/**
 * The feedback ask and the panel it opens, both docked in the bottom-right
 * corner and neither of them modal. The ask is a note, not a dialog: it takes
 * no focus and blocks nothing. The panel is where somebody writes, and the page
 * makes room for it instead of going dark behind it, because the thing most
 * worth writing about ("this file came out empty") is on the screen beside it.
 */

/** Long enough for the "Copied" confirmation to land first, short enough to read as the same moment. */
const EXPORT_DELAY_MS = 1500;
/** The empty screen is read before it is judged. */
const EMPTY_DELAY_MS = 4000;
/** The thanks line has nothing left to ask, so it leaves by itself. */
const THANKS_MS = 8000;
/** A success-side ask waits a month before it comes back on this device. */
const ASK_EVERY_MS = 30 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "fileconcat-feedback-asked";

/** Once per page load, whatever storage allows. */
let askedThisPage = false;

/**
 * The empty screen asks every time it is reached (once per page load): it only
 * appears when nothing could be combined, and that is never a moment to stay
 * quiet about. The success-side ask backs off for a month once shown.
 */
function mayAsk(kind: "export" | "empty"): boolean {
  if (askedThisPage) return false;
  if (kind === "empty") return true;
  try {
    const last = Number(localStorage.getItem(STORAGE_KEY));
    return !(last > 0 && Date.now() - last < ASK_EVERY_MS);
  } catch {
    return true;
  }
}

function markAsked(kind: "export" | "empty"): void {
  askedThisPage = true;
  if (kind === "empty") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Private mode: the page-load guard still holds.
  }
}

type Note = "export" | "thanks" | "empty";

const NOTE_TEXT: Record<Note, string> = {
  export: "Did this do what you needed?",
  thanks: "Thanks. Anything we could do better?",
  empty: "Not what you expected? Tell us what you were trying to combine.",
};

const PANEL: Record<FeedbackOrigin, { title: string; placeholder: string }> = {
  no: {
    title: "What went wrong?",
    placeholder: "Which file didn't come through, what the AI said, what you expected.",
  },
  yes: {
    title: "What could be better?",
    placeholder: "A file type it should read, a step that took too long, anything.",
  },
  empty: {
    title: "What were you trying to combine?",
    placeholder: "What you dropped, and what you hoped to get out of it.",
  },
  link: {
    title: "What should we fix or add?",
    placeholder: "A file that didn't come through, a missing format, anything.",
  },
};

type Status = "idle" | "sending" | "sent" | "failed";

type FeedbackDockProps = {
  /** False once the result screen is gone; a pending or visible ask goes with it. */
  active: boolean;
  /** Successful exports this page load. The first one asks. */
  exports: number;
  /** True while the empty screen stands with nothing being read. */
  empty: boolean;
  /** The panel, controlled so the page can make room for it and open it from its own link. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeedbackDock({ active, exports, empty, open, onOpenChange }: FeedbackDockProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [origin, setOrigin] = useState<FeedbackOrigin | null>(null);
  const [draft, setDraft] = useState("");
  // Kept after a send: the same person writing a second note wants the same reply.
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const emailId = useId();

  const exported = exports > 0;

  function ask(kind: "export" | "empty") {
    if (!mayAsk(kind)) return;
    markAsked(kind);
    setNote(kind);
    track("feedback", "asked");
  }

  useEffect(() => {
    if (!exported || !active || open || !mayAsk("export")) return;
    const id = setTimeout(() => ask("export"), EXPORT_DELAY_MS);
    return () => clearTimeout(id);
    // Only the first export asks; later ones find the guard already set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exported]);

  useEffect(() => {
    if (!empty || open || !mayAsk("empty")) return;
    const id = setTimeout(() => ask("empty"), EMPTY_DELAY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty]);

  useEffect(() => {
    if (!active) setNote(null);
  }, [active]);

  useEffect(() => {
    if (note !== "thanks") return;
    const id = setTimeout(() => setNote(null), THANKS_MS);
    return () => clearTimeout(id);
  }, [note]);

  // Focus goes into the panel when it opens and back where it came from when it
  // closes, which is all a non-modal panel owes the keyboard. Nothing is
  // trapped: Tab walks out of it and back into the page.
  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      textareaRef.current?.focus();
      return;
    }
    returnFocus.current?.focus?.();
    returnFocus.current = null;
  }, [open]);

  function openPanel(from: FeedbackOrigin) {
    setNote(null);
    setOrigin(from);
    onOpenChange(true);
  }

  function close() {
    onOpenChange(false);
    setOrigin(null);
    if (status === "sent") setStatus("idle");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (message.length === 0 || status === "sending") return;
    setStatus("sending");
    const address = email.trim();
    const ok = await sendFeedback(origin ?? "link", message, address);
    if (ok) {
      setDraft("");
      setSentTo(address);
      setStatus("sent");
    } else {
      setStatus("failed");
    }
  }

  // Opened by the page's own link rather than by the ask.
  const panel = PANEL[origin ?? "link"];
  const left = FEEDBACK_MAX_CHARS - draft.length;

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {note && !open ? NOTE_TEXT[note] : ""}
      </div>

      {note && !open && (
        <section
          aria-label="Feedback"
          className="z-sticky border-border bg-surface rounded-card animate-fade-up fixed inset-x-3 bottom-3 border px-4 pb-3.5 pt-3 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.55)] motion-reduce:animate-none sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[340px]"
        >
          <div className="flex items-start gap-3">
            <p className="text-ink min-w-0 flex-1 pt-[3px] text-[14px] leading-[1.5]">
              {NOTE_TEXT[note]}
            </p>
            <CloseButton
              label="Dismiss"
              onClick={() => {
                if (note !== "thanks") track("feedback", "closed");
                setNote(null);
              }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {note === "export" && (
              <>
                <Chip
                  primary
                  onClick={() => {
                    track("feedback", "yes");
                    setNote("thanks");
                  }}
                >
                  Yes
                </Chip>
                <Chip
                  onClick={() => {
                    track("feedback", "no");
                    openPanel("no");
                  }}
                >
                  Not quite
                </Chip>
              </>
            )}
            {note === "thanks" && (
              <Chip primary onClick={() => openPanel("yes")}>
                Write a note
              </Chip>
            )}
            {note === "empty" && (
              <Chip primary onClick={() => openPanel("empty")}>
                Tell us
              </Chip>
            )}
          </div>
        </section>
      )}

      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className="z-sticky border-border bg-surface rounded-t-card animate-fade-up fixed inset-x-0 bottom-0 flex max-h-[80dvh] flex-col overflow-y-auto border-t px-5 pb-5 pt-4 shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.5)] motion-reduce:animate-none lg:inset-x-auto lg:bottom-5 lg:right-5 lg:w-[380px] lg:rounded-card lg:border lg:shadow-[0_18px_50px_-24px_rgba(0,0,0,0.55)]"
        >
          <div className="flex items-start gap-3">
            <h2
              id={titleId}
              className="font-display text-ink min-w-0 flex-1 pt-[3px] text-[16px] font-semibold tracking-[-0.01em]"
            >
              {status === "sent" ? "Sent. Thank you." : panel.title}
            </h2>
            <CloseButton label="Close" onClick={close} />
          </div>

          {status === "sent" ? (
            sentTo && (
              <p className="text-ink-secondary mt-2 text-[13.5px] leading-[1.55]">
                We'll reply to <span className="text-ink break-all">{sentTo}</span>.
              </p>
            )
          ) : (
            <form onSubmit={submit} className="mt-3">
              <textarea
                ref={textareaRef}
                aria-labelledby={titleId}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (status === "failed") setStatus("idle");
                }}
                maxLength={FEEDBACK_MAX_CHARS}
                rows={5}
                placeholder={panel.placeholder}
                className="border-border bg-surface-inset text-ink placeholder:text-ink-muted focus-visible:border-border-strong focus-visible:ring-ring rounded-input block w-full resize-none border px-3 py-2.5 text-[14px] leading-[1.55] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
              />
              {left < 200 && (
                <p className="text-ink-muted mt-1.5 font-mono text-[11px] tabular-nums">
                  {left} characters left
                </p>
              )}
              <label
                htmlFor={emailId}
                className="text-ink-secondary mt-3 block text-[12.5px] leading-[1.5]"
              >
                Want a reply? Your email <span className="text-ink-muted">(optional)</span>
              </label>
              <input
                id={emailId}
                type="email"
                autoComplete="email"
                maxLength={FEEDBACK_EMAIL_MAX}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "failed") setStatus("idle");
                }}
                placeholder="you@example.com"
                className="border-border bg-surface-inset text-ink placeholder:text-ink-muted focus-visible:border-border-strong focus-visible:ring-ring rounded-input mt-1.5 block h-[38px] w-full border px-3 text-[14px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
              />
              {status === "failed" && (
                <p role="alert" className="text-ink mt-2 text-[13px] leading-[1.5]">
                  Couldn't send it. Your note is still here, so try again, or email it to{" "}
                  <EmailLink />.
                </p>
              )}
              <button
                type="submit"
                disabled={draft.trim().length === 0 || status === "sending"}
                className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface mt-3 h-[38px] px-4 text-[13.5px] font-semibold transition-[filter,opacity] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:hover:brightness-100"
              >
                {status === "sending" ? "Sending..." : "Send"}
              </button>
            </form>
          )}

          <p className="text-ink-muted mt-4 border-t border-[oklch(var(--hairline))] pt-3 text-[12px] leading-[1.55]">
            Sent with this visit's anonymous counts, like which file types failed. Never your
            files or their names. An email you add is used only to reply.
          </p>
        </section>
      )}
    </>
  );
}

/** `primary` is the answer that moves forward, in the same green as Copy and Send. */
function Chip({
  primary = false,
  onClick,
  children,
}: {
  primary?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-chip focus-visible:ring-ring focus-visible:ring-offset-surface border px-3 py-1.5 text-[13px] transition-[filter,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        primary
          ? "bg-primary text-primary-foreground border-transparent font-semibold hover:brightness-110"
          : "border-border-strong text-ink hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="text-ink-muted hover:text-ink hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-surface -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

function EmailLink() {
  return (
    <a
      href={`mailto:${FEEDBACK_EMAIL}`}
      className="text-go-fg underline decoration-[oklch(var(--border-strong))] underline-offset-[3px] hover:decoration-current"
    >
      {FEEDBACK_EMAIL}
    </a>
  );
}
