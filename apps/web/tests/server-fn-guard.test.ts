import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// TanStack Start before 1.168.60 has an unauthenticated reflected XSS in
// server-function responses (GHSA-qx66-fv34-fjm8) and seroval deserialization
// bugs on the same path. The site is safe only because it defines no server
// function: an unknown id is rejected before the payload is read. TanStack is
// held at 1.157 until Vite 8, so the first createServerFn would open the hole.
const PATCHED = [1, 168, 60];

function atLeast(version: string, min: number[]): boolean {
  const parts = version.split(/[.-]/).map(Number);
  for (let i = 0; i < min.length; i++) {
    if (parts[i] !== min[i]) return parts[i] > min[i];
  }
  return true;
}

describe("server functions", () => {
  it("stay absent while TanStack Start is below the XSS fix", () => {
    const pkg = join(__dirname, "..", "node_modules", "@tanstack", "react-start", "package.json");
    const { version } = JSON.parse(readFileSync(pkg, "utf8")) as { version: string };
    if (atLeast(version, PATCHED)) return;

    const src = join(__dirname, "..", "src");
    const users = readdirSync(src, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => readFileSync(join(src, file), "utf8").includes("createServerFn"));
    expect(users, `upgrade @tanstack/react-start to 1.168.60+ first (installed ${version})`).toEqual([]);
  });

  it("compares versions numerically", () => {
    expect(atLeast("1.157.16", PATCHED)).toBe(false);
    expect(atLeast("1.168.60", PATCHED)).toBe(true);
    expect(atLeast("1.169.0", PATCHED)).toBe(true);
    expect(atLeast("2.0.0", PATCHED)).toBe(true);
  });
});
