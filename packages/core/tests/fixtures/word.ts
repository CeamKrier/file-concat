/** A hand-built Word 97 file, for the reader that only sees its streams. */

const utf16 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    out[i * 2] = s.charCodeAt(i) & 0xff;
    out[i * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  return out;
};
const ansi = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

export interface Piece {
  text: string;
  compressed?: boolean;
}

/**
 * A Word 97 file's two streams: a FIB naming the table stream, the character
 * counts and the piece table, then the text pieces themselves after the FIB.
 * `parts` are the lengths of body, footnotes, headers, comments, endnotes and
 * text boxes, in the stream's own order.
 */
export function wordStreams(
  pieces: Piece[],
  parts: { body: number; footnotes?: number; headers?: number; comments?: number; endnotes?: number; textboxes?: number },
  flags = 0x0200,
): Map<string, Uint8Array> {
  const fibLength = 0x0200;
  let fc = fibLength;
  const encoded = pieces.map((piece) => {
    const bytes = piece.compressed ? ansi(piece.text) : utf16(piece.text);
    const at = fc;
    fc += bytes.length;
    return { ...piece, bytes, at };
  });
  const word = new Uint8Array(fc);
  const fib = new DataView(word.buffer);
  fib.setUint16(0, 0xa5ec, true);
  fib.setUint16(2, 0x00c1, true);
  fib.setUint16(0x0a, flags, true);
  fib.setInt32(0x4c, parts.body, true);
  fib.setInt32(0x50, parts.footnotes ?? 0, true);
  fib.setInt32(0x54, parts.headers ?? 0, true);
  fib.setInt32(0x5c, parts.comments ?? 0, true);
  fib.setInt32(0x60, parts.endnotes ?? 0, true);
  fib.setInt32(0x64, parts.textboxes ?? 0, true);
  for (const piece of encoded) word.set(piece.bytes, piece.at);

  // CLX: one property modifier (to prove it is skipped), then the piece table.
  const plcLength = 4 + (encoded.length + 1) * 4 + encoded.length * 8;
  const clx = new Uint8Array(3 + 2 + 5 + plcLength - 4);
  const view = new DataView(clx.buffer);
  clx[0] = 0x01;
  view.setUint16(1, 2, true);
  clx[5] = 0x02;
  view.setUint32(6, plcLength, true);
  let cp = 0;
  encoded.forEach((piece, index) => {
    view.setUint32(10 + index * 4, cp, true);
    cp += piece.text.length;
    const pcd = 10 + (encoded.length + 1) * 4 + index * 8;
    view.setUint32(pcd + 2, piece.compressed ? (piece.at * 2) | 0x40000000 : piece.at, true);
  });
  view.setUint32(10 + encoded.length * 4, cp, true);
  const table = new Uint8Array(64 + clx.length);
  table.set(clx, 64);
  fib.setUint32(0x01a2, 64, true);
  fib.setUint32(0x01a6, clx.length, true);
  return new Map([
    ["WordDocument", word],
    [flags & 0x0200 ? "1Table" : "0Table", table],
  ]);
}
