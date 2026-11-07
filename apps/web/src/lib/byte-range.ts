/**
 * Answer a `Range: bytes=a-b` request from a full asset response.
 *
 * Workers static assets ignore Range and send the whole file with a 200
 * (workers-sdk issue 8967, measured on this site 2026-11-07). Safari will not
 * play an MP4 from a server that does that, so the demo clips under `/demo/`
 * come through here. One range only: a multi-range or malformed header is
 * ignored and the full 200 goes back, which RFC 9110 section 14.2 allows.
 * An unsatisfiable range gets 416 with the size, never a slice past the end.
 */
export async function withByteRange(request: Request, response: Response): Promise<Response> {
  // With If-Range the client is resuming a copy it may hold of an older file;
  // the full body is always a correct answer to it (RFC 9110 section 13.1.5).
  const header = request.headers.has("if-range") ? null : request.headers.get("range");
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  // Only a plain 200 is sliced: a 304, a 404, or a store that one day answers
  // ranges itself (206) passes through untouched.
  if (response.status !== 200 || !match || (match[1] === "" && match[2] === "")) {
    const passed = new Response(response.body, response);
    if (response.status === 200) passed.headers.set("accept-ranges", "bytes");
    return passed;
  }

  const body = await response.arrayBuffer();
  const size = body.byteLength;
  let start: number;
  let end: number;
  if (match[1] === "") {
    // Suffix form `bytes=-n`: the last n bytes, and `-0` asks for none.
    const n = Number(match[2]);
    start = n === 0 ? size : Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }

  const headers = new Headers(response.headers);
  headers.set("accept-ranges", "bytes");
  if (start >= size || start > end) {
    headers.delete("content-length");
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("content-range", `bytes ${start}-${end}/${size}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}
