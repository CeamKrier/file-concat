import SevenZip from "7z-wasm";
import wasmUrl from "7z-wasm/7zz.wasm?url";

/**
 * 7-Zip (LGPL-2.1+ with the unRAR restriction; `7zz.wasm` is served as its own
 * unmodified file, so it stays replaceable) in its own worker: an archive of
 * any size unpacks off the main thread, and a trap takes only this worker with
 * it (see `worker-runner.ts`).
 *
 * Answers every regular file with its path relative to the archive. One layer
 * only: a `.tar.xz` comes back as its tar, which core unpacks.
 */
type Fs = {
  readdir(path: string): string[];
  stat(path: string): { mode: number };
  isDir(mode: number): boolean;
  readFile(path: string): Uint8Array;
};

function walk(fs: Fs, dir: string, rel: string): { path: string; bytes: Uint8Array }[] {
  return fs.readdir(dir).flatMap((name) => {
    if (name === "." || name === "..") return [];
    const full = `${dir}/${name}`;
    return fs.isDir(fs.stat(full).mode)
      ? walk(fs, full, `${rel}${name}/`)
      : [{ path: `${rel}${name}`, bytes: fs.readFile(full) }];
  });
}

self.onmessage = async (event: MessageEvent<{ name: string; bytes: Uint8Array }>) => {
  const errors: string[] = [];
  try {
    // A fresh module per archive: emscripten's callMain runs once per instance.
    // ponytail: the wasm is compiled again each time (HTTP-cached, not
    // re-downloaded); cache a compiled module if drops of many archives show it.
    const sz = await SevenZip({
      locateFile: () => wasmUrl,
      print: () => {},
      printErr: (line: string) => errors.push(line),
    });
    const input = `/in/${event.data.name}`;
    sz.FS.mkdir("/in");
    sz.FS.writeFile(input, event.data.bytes);
    try {
      // No password is given, so an encrypted archive fails here instead of
      // waiting on a prompt a worker cannot show.
      sz.callMain(["x", "-y", "-o/out", input]);
    } catch (error) {
      errors.push(String(error));
    }
    let files: { path: string; bytes: Uint8Array }[] = [];
    try {
      files = walk(sz.FS as unknown as Fs, "/out", "");
    } catch {
      // No /out: 7-Zip wrote nothing.
    }
    if (files.length === 0 && errors.length > 0) throw new Error(errors.join(" ").slice(0, 300));
    self.postMessage({ result: files }, { transfer: files.map((file) => file.bytes.buffer) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
