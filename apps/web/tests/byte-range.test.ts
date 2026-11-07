import { describe, expect, it } from "vitest";
import { withByteRange } from "~/lib/byte-range";

const file = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { status: 200, headers: { etag: '"x"' } });
const ask = (range?: string) => new Request("https://x/demo/a.mp4", range ? { headers: { range } } : {});

async function bytes(res: Response) {
  return Array.from(new Uint8Array(await res.arrayBuffer()));
}

describe("withByteRange", () => {
  it("answers a closed range with 206 and that slice", async () => {
    const res = await withByteRange(ask("bytes=2-4"), file());
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(res.headers.get("content-length")).toBe("3");
    expect(res.headers.get("etag")).toBe('"x"');
    expect(await bytes(res)).toEqual([2, 3, 4]);
  });

  it("reads an open end and clamps an end past the size", async () => {
    expect(await bytes(await withByteRange(ask("bytes=7-"), file()))).toEqual([7, 8, 9]);
    const clamped = await withByteRange(ask("bytes=8-99"), file());
    expect(clamped.headers.get("content-range")).toBe("bytes 8-9/10");
  });

  it("serves the last n bytes for a suffix range", async () => {
    expect(await bytes(await withByteRange(ask("bytes=-3"), file()))).toEqual([7, 8, 9]);
    expect(await bytes(await withByteRange(ask("bytes=-50"), file()))).toHaveLength(10);
  });

  it("refuses a range that starts past the end with 416 and the size", async () => {
    for (const range of ["bytes=10-", "bytes=5-2", "bytes=-0"]) {
      const res = await withByteRange(ask(range), file());
      expect(res.status, range).toBe(416);
      expect(res.headers.get("content-range")).toBe("bytes */10");
    }
  });

  it("sends the whole file for no, multiple or malformed ranges", async () => {
    for (const range of [undefined, "bytes=0-1,4-5", "items=0-1", "bytes=-"]) {
      const res = await withByteRange(ask(range), file());
      expect(res.status, range).toBe(200);
      expect(res.headers.get("accept-ranges")).toBe("bytes");
      expect(await bytes(res)).toHaveLength(10);
    }
  });

  it("sends the whole file when the client resumes with If-Range", async () => {
    const req = new Request("https://x/demo/a.mp4", { headers: { range: "bytes=0-1", "if-range": '"old"' } });
    expect((await withByteRange(req, file())).status).toBe(200);
  });

  it("passes a non-200 through untouched", async () => {
    const res = await withByteRange(ask("bytes=0-1"), new Response(null, { status: 404 }));
    expect(res.status).toBe(404);
  });
});
