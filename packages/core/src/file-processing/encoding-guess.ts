/**
 * Names the legacy encoding of bytes that are not UTF-8 and do not say what
 * they are. Returns a label `TextDecoder` accepts ("windows-1251", "Shift_JIS").
 */
export type EncodingGuesser = (bytes: Uint8Array) => string;

/**
 * Firefox's detector, chardetng, from the `chardetng-wasm` build: the wasm
 * bytes in, a guesser out. Each platform finds the bytes its own way (a Vite
 * `?url` asset on the web, the installed package file under node, ADR-0012),
 * which is why only this glue lives in core.
 *
 * The package's own glue imports the wasm as an ES module, which neither the
 * browser nor node does without a bundler plugin or a flag. Its one import is
 * the panic hook, so the few lines below stand in for it: copy the bytes into
 * wasm memory, call `detect`, read the name back.
 */
export async function createEncodingGuesser(wasm: BufferSource): Promise<EncodingGuesser> {
  const readString = (ptr: number, len: number) =>
    new TextDecoder().decode(new Uint8Array(exports.memory.buffer, ptr, len));
  const instance = await WebAssembly.instantiate(await WebAssembly.compile(wasm), {
    "./chardetng_wasm_bg.js": {
      __wbindgen_throw: (ptr: number, len: number) => {
        throw new Error(readString(ptr, len));
      },
    },
  });
  const exports = instance.exports as unknown as ChardetngExports;
  return (bytes) => {
    const retptr = exports.__wbindgen_add_to_stack_pointer(-16);
    const ptr = exports.__wbindgen_malloc(bytes.length);
    new Uint8Array(exports.memory.buffer).set(bytes, ptr);
    let out = { ptr: 0, len: 0 };
    try {
      exports.detect(retptr, ptr, bytes.length);
      const words = new Int32Array(exports.memory.buffer, retptr, 2);
      out = { ptr: words[0], len: words[1] };
      return readString(out.ptr, out.len);
    } finally {
      exports.__wbindgen_add_to_stack_pointer(16);
      exports.__wbindgen_free(out.ptr, out.len);
    }
  };
}

interface ChardetngExports {
  memory: WebAssembly.Memory;
  detect(retptr: number, ptr: number, len: number): void;
  __wbindgen_add_to_stack_pointer(delta: number): number;
  __wbindgen_malloc(size: number): number;
  __wbindgen_free(ptr: number, size: number): void;
}
