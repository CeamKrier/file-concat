import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { findWords, hideList, KEY_RULES } from "@fileconcat/core";

import { normalizeValue } from "~/lib/metrics";
import {
  checkEntries,
  LISTED,
  linesOf,
  maskEntry,
  parseHide,
  renameExcluded,
  SendCheck,
  summarizeCheck,
  type SendCheckProps,
} from "~/components/app/send-check";
import { SendCheckRules } from "~/components/send-check-rules";

// Key-shaped strings are built at runtime so the repository never holds one.
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function token(seed: number) {
  let s = seed;
  let out = "";
  for (let i = 0; i < 36; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out += ALNUM[s % ALNUM.length];
  }
  return "gh" + "p_" + out;
}
const conn = (pw: string) => `postgres://app:${pw}@db.internal:5432/app`;

const all = (entries: { path: string }[]) => new Set(entries.map((e) => e.path));
const none = new Set<string>();

function bundle(entries: { path: string; content: string }[], prev = new Map(), kept = none, masked = none) {
  const checked = checkEntries(entries, all(entries), prev);
  return { checked, out: entries.map((e) => maskEntry(e.path, e.content, checked.get(e.path), kept, masked)) };
}

describe("send check in the bundle step", () => {
  it("masks a key in text that lands after the first check (AC-S1)", () => {
    const first = bundle([{ path: "scan.pdf", content: "" }]);
    expect(first.out).toEqual([""]);
    const key = token(1);
    const later = bundle([{ path: "scan.pdf", content: `token ${key}` }], first.checked);
    expect(later.out).toEqual(["token [Secret removed: GitHub token]"]);
    expect(later.out.join("")).not.toContain(key);
  });

  it("masks a new key after Keep originals, keeping only the kept one (AC-S3)", () => {
    const a = { path: "a.ts", content: `const t = "${token(1)}";` };
    const first = bundle([a]);
    const kept = new Set(summarizeCheck(first.checked).keys.map((k) => k.id));
    const b = { path: "b.ts", content: `const t = "${token(2)}";` };
    const after = bundle([a, b], first.checked, kept);
    expect(after.out[0]).toBe(a.content);
    expect(after.out[1]).toBe(`const t = "[Secret removed: GitHub token]";`);
  });

  it("reuses a file's check only while its text is the same string", () => {
    const a = { path: "a.ts", content: "plain" };
    const first = bundle([a]);
    const again = bundle([a], first.checked);
    expect(again.checked.get("a.ts")).toBe(first.checked.get("a.ts"));
    expect(bundle([], again.checked).checked.size).toBe(0);
  });

  it("lists a database password and masks it only once asked", () => {
    const e = { path: "compose.yml", content: `url: ${conn("hunter2xyz")}` };
    expect(bundle([e]).out[0]).toBe(e.content);
    expect(bundle([e], new Map(), none, new Set(["connection-string"])).out[0]).toBe(
      "url: postgres://app:[Secret removed: database password]@db.internal:5432/app",
    );
    expect(summarizeCheck(bundle([e]).checked).listed.get("connection-string")).toEqual({
      count: 1,
      files: ["compose.yml"],
    });
  });

  it("looks for identifiers in documents only, and masks a kind once asked", () => {
    const text = "Contact jane@example.com, IBAN GB82 WEST 1234 5698 7654 32.";
    const doc = { path: "docs/q3-report.docx", content: text };
    const code = { path: "src/a.ts", content: text };
    const { checked, out } = bundle([doc, code]);
    expect(out).toEqual([text, text]);
    const listed = summarizeCheck(checked).listed;
    expect(listed.get("email")).toEqual({ count: 1, files: ["q3-report.docx"] });
    expect(listed.get("iban")).toEqual({ count: 1, files: ["q3-report.docx"] });
    const masked = bundle([doc, code], new Map(), none, new Set(["email", "iban"])).out;
    expect(masked).toEqual(["Contact [Email removed], IBAN [IBAN removed].", text]);
  });

  it("masks hidden words in every file, also one the detector failed on", () => {
    const list = hideList(parseHide("Acme Corp, jane"));
    const text = "acme  corp hired Jane; Janet stays";
    const words = findWords(text, list);
    expect(maskEntry("a.ts", text, undefined, none, none, words)).toBe("[Hidden] hired [Hidden]; Janet stays");
    expect(maskEntry("a.ts", text, { text, findings: null, lines: [] }, none, none, words)).toBe(
      "[Hidden] hired [Hidden]; Janet stays",
    );
  });

  it("lists a key once per unique value in a file, with the line it is on", () => {
    const key = token(3);
    const text = `a\r\nb ${key}\r\n${key}\nc`;
    const { keys } = summarizeCheck(bundle([{ path: "src/config.ts", content: text }]).checked);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ label: "GitHub token", file: "config.ts", line: 2 });
  });

  it("renames every path in the excluded summary", () => {
    const up = (p: string) => p.toUpperCase();
    expect(
      renameExcluded(
        {
          oversize: ["a"],
          unextractable: ["b"],
          binary: ["c"],
          unsupported: [{ label: "font", paths: ["d"] }],
          unreadable: ["e"],
          partial: [{ path: "f", notes: [] }],
          pending: ["g"],
        },
        up,
      ),
    ).toEqual({
      oversize: ["A"],
      unextractable: ["B"],
      binary: ["C"],
      unsupported: [{ label: "font", paths: ["D"] }],
      unreadable: ["E"],
      partial: [{ path: "F", notes: [] }],
      pending: ["G"],
    });
  });

  it("sends every counter value as written, none stripped by normalizeValue", () => {
    const values = ["found-key", "kept-key", "found-comment", "hid-words"];
    for (const l of LISTED) values.push(`found-${l.value}`, `masked-${l.value}`);
    for (const v of values) expect(normalizeValue(v)).toBe(v);
  });

  it("counts lines the way an editor does, CRLF and lone CR included", () => {
    const f = (start: number) => ({ kind: "x", category: "key" as const, label: "x", start, end: start + 1, value: "x" });
    expect(linesOf("a\r\nb\rc\nd", [f(0), f(3), f(5), f(7)])).toEqual([1, 2, 3, 4]);
  });
});

const base: SendCheckProps = {
  keys: [],
  kept: new Set(),
  onKeep: () => {},
  onRemove: () => {},
  listed: [],
  comments: { count: 0, files: [] },
  hide: { entries: [], places: 0, onCommit: () => {} },
  pending: 0,
  failed: [],
};
const keys = [
  { id: "1", label: "AWS access key", file: "config.ts", line: 3 },
  { id: "2", label: "private key", file: "id_rsa", line: 1 },
  { id: "3", label: "private key", file: "id_rsa", line: 40 },
];

describe("the send check block", () => {
  it("says what was not found, and what is never checked", () => {
    const { container } = render(<SendCheck {...base} />);
    expect(
      screen.getByText("No keys or passwords found. Names and addresses are not checked."),
    ).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("data-clarity-mask", "True");
  });

  it("does not claim a clean bundle while files are still being read or failed (AC-S2)", () => {
    render(<SendCheck {...base} pending={2} failed={["notes.pdf"]} />);
    expect(screen.queryByText(/No keys/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Still reading 2 files. They are checked when their text lands. Could not check notes.pdf. Names and addresses are not checked.",
      ),
    ).toBeInTheDocument();
  });

  it("names the removed keys and keeps every one on Keep originals", () => {
    const onKeep = vi.fn();
    const { container } = render(<SendCheck {...base} keys={keys} onKeep={onKeep} />);
    expect(container.firstElementChild).toHaveAttribute("data-clarity-mask", "True");
    expect(screen.getByText("Checked before you send")).toBeInTheDocument();
    expect(
      screen.getByText("3 keys removed: AWS access key in config.ts, private key in id_rsa"),
    ).toBeInTheDocument();
    expect(screen.getByText("Names and addresses are not checked.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep originals" }));
    expect(onKeep).toHaveBeenCalledWith(["1", "2", "3"]);
  });

  it("lists each key with its line, kept one by one", () => {
    const onKeep = vi.fn();
    render(<SendCheck {...base} keys={keys} onKeep={onKeep} />);
    fireEvent.click(screen.getByRole("button", { name: "Show each" }));
    expect(screen.getByText("AWS access key, config.ts line 3")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Keep" })[0]);
    expect(onKeep).toHaveBeenCalledWith(["1"]);
  });

  it("offers Remove again once every key is kept", () => {
    const onRemove = vi.fn();
    render(<SendCheck {...base} keys={keys} kept={new Set(["1", "2", "3"])} onRemove={onRemove} />);
    expect(screen.getByText("3 keys kept as written")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove again" }));
    expect(onRemove).toHaveBeenCalledWith(["1", "2", "3"]);
  });

  it("lists database passwords with Mask, and Show again once masked", () => {
    const row = {
      kind: "connection-string",
      noun: ["database password", "database passwords"] as [string, string],
      count: 2,
      files: ["a.yml", "b.yml", "c.yml", "d.yml"],
      masked: false,
      onToggle: vi.fn(),
    };
    const { rerender } = render(<SendCheck {...base} listed={[row]} />);
    expect(screen.getByText("2 database passwords in a.yml, b.yml +2 more")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mask" }));
    expect(row.onToggle).toHaveBeenCalledOnce();
    rerender(<SendCheck {...base} listed={[{ ...row, masked: true }]} />);
    expect(screen.getByText("2 database passwords masked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show again" })).toBeInTheDocument();
  });

  it("names review comments the readers kept, with no action", () => {
    render(<SendCheck {...base} comments={{ count: 12, files: ["q3-report.docx"] }} />);
    expect(screen.getByText("12 review comments, in q3-report.docx")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mask" })).not.toBeInTheDocument();
  });

  it("splits hide entries on commas and lines, each once", () => {
    expect(parseHide(" Jane Doe,Acme\r\n\nacme, Acme ,")).toEqual(["Jane Doe", "Acme", "acme"]);
  });

  it("commits hidden words on Enter and on blur, never per keystroke", () => {
    const onCommit = vi.fn();
    render(<SendCheck {...base} hide={{ ...base.hide, onCommit }} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide names" }));
    const field = screen.getByLabelText("Always hide these words");
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: "Jane Doe, Acme" } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onCommit).toHaveBeenLastCalledWith(["Jane Doe", "Acme"]);
    fireEvent.change(field, { target: { value: "Jane Doe" } });
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenLastCalledWith(["Jane Doe"]);
  });

  it("never puts a hidden word in an attribute or outside the masked root (AC-S8)", () => {
    const { container } = render(
      <SendCheck {...base} hide={{ entries: ["Zyxwvut"], places: 3, onCommit: () => {} }} />,
    );
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute("data-clarity-mask", "True");
    expect(screen.getByLabelText("Always hide these words")).toHaveValue("Zyxwvut");
    expect(screen.getByText("Hidden in 3 places. Forgotten when you start over.")).toBeInTheDocument();
    for (const el of container.querySelectorAll("*")) {
      for (const a of el.attributes) expect(a.value).not.toContain("Zyxwvut");
    }
  });
});

describe("the send check docs", () => {
  it("links from every state to the page that lists what is checked, in a new tab", () => {
    for (const props of [base, { ...base, pending: 1 }, { ...base, keys }]) {
      const { unmount } = render(<SendCheck {...props} />);
      const link = screen.getByRole("link", { name: "What is checked" });
      expect(link).toHaveAttribute("href", "/docs/send-check");
      expect(link).toHaveAttribute("target", "_blank");
      unmount();
    }
  });

  it("lists every key rule the detector has, by its readable name", () => {
    render(<SendCheckRules />);
    for (const rule of KEY_RULES.filter((r) => r.id !== "connection-string")) {
      expect(screen.getAllByText(new RegExp(`^${rule.label}$`, "i")).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("database password")).not.toBeInTheDocument();
  });
});
