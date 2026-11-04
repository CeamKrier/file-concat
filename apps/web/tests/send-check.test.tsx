import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  checkEntries,
  linesOf,
  maskEntry,
  SendCheck,
  summarizeCheck,
  type SendCheckProps,
} from "~/components/app/send-check";

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
    expect(summarizeCheck(bundle([e]).checked).conn).toEqual({ count: 1, files: ["compose.yml"] });
  });

  it("lists a key once per unique value in a file, with the line it is on", () => {
    const key = token(3);
    const text = `a\r\nb ${key}\r\n${key}\nc`;
    const { keys } = summarizeCheck(bundle([{ path: "src/config.ts", content: text }]).checked);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ label: "GitHub token", file: "config.ts", line: 2 });
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
});
