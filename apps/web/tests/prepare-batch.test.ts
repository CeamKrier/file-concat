import { describe, expect, it } from "vitest";

import { prepareBatch } from "~/lib/prepare-batch-client";

/** A File whose bytes refuse to be read, the way a moved or blocked file does. */
function unreadable(name: string): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "slice", {
    value: () => ({
      arrayBuffer: () => Promise.reject(new DOMException("nope", "NotReadableError")),
    }),
  });
  return file;
}

describe("prepareBatch", () => {
  it("keeps the batch when one file's bytes can't be read", async () => {
    const { files } = await prepareBatch([
      { file: unreadable("broken.ts"), path: "src/broken.ts" },
      { file: new File(["hello"], "ok.ts"), path: "src/ok.ts" },
    ]);

    expect(files.map((f) => f.path)).toEqual(["src/broken.ts", "src/ok.ts"]);
  });

  it("reports progress as it routes", async () => {
    const seen: [number, number][] = [];
    await prepareBatch(
      [1, 2, 3].map((n) => ({ file: new File(["x"], `${n}.ts`), path: `${n}.ts` })),
      (done, total) => seen.push([done, total]),
    );

    expect(seen).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });
});
