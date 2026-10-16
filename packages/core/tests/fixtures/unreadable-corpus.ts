/**
 * The 45-case corpus from the 2026-10-17 unreadable-files research, built in
 * memory: lock files, XML in every Unicode form and a compiled Android one,
 * shaders, logs with ANSI codes and NUL padding, XHTML and plain text in
 * legacy encodings, bytecode, and a text file with a binary tail. Binary
 * payloads come from a seeded generator, so no blob is committed.
 *
 * `text` is what the bundle should hold: the source string, NULs removed,
 * cut where binary data starts.
 */
export interface CorpusCase {
  name: string;
  file: string;
  bytes: Uint8Array;
  expect: "text" | "binary" | "empty";
  text?: string;
}

/** mulberry32: a small seeded generator, so the random payloads are the same on every run. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % 256;
  };
}

const legacyMaps = new Map<string, Map<string, number[]>>();

/**
 * Encode in a legacy encoding. `TextDecoder` only decodes, so the encoder is
 * its inverse: decode every single byte and every lead/trail pair, keep the
 * first byte sequence that gives each character.
 */
export function encodeLegacy(text: string, label: string): Uint8Array {
  let map = legacyMaps.get(label);
  if (!map) {
    map = new Map();
    const decoder = new TextDecoder(label);
    for (let b = 0x80; b < 0x100; b++) {
      const c = decoder.decode(Uint8Array.of(b));
      if (c.length === 1 && c !== "�" && !map.has(c)) map.set(c, [b]);
    }
    for (let lead = 0x81; lead < 0xff; lead++) {
      for (let trail = 0x40; trail < 0xff; trail++) {
        const c = decoder.decode(Uint8Array.of(lead, trail));
        if ([...c].length === 1 && c !== "�" && !map.has(c)) map.set(c, [lead, trail]);
      }
    }
    legacyMaps.set(label, map);
  }
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else {
      const seq = map.get(ch);
      if (!seq) throw new Error(`${label} has no ${ch}`);
      out.push(...seq);
    }
  }
  return Uint8Array.from(out);
}

function utf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), littleEndian);
  return out;
}

function utf32(text: string, littleEndian: boolean): Uint8Array {
  const points = [...text].map((c) => c.codePointAt(0)!);
  const out = new Uint8Array(points.length * 4);
  const view = new DataView(out.buffer);
  points.forEach((p, i) => view.setUint32(i * 4, p, littleEndian));
  return out;
}

/** Python's struct.pack for the few codes used here: H h I q, little or big endian. */
function pack(littleEndian: boolean, codes: string, ...values: number[]): Uint8Array {
  const size = { H: 2, h: 2, I: 4, q: 8 } as Record<string, number>;
  const out = new Uint8Array([...codes].reduce((n, c) => n + size[c], 0));
  const view = new DataView(out.buffer);
  let at = 0;
  [...codes].forEach((c, i) => {
    if (c === "H") view.setUint16(at, values[i], littleEndian);
    else if (c === "h") view.setInt16(at, values[i], littleEndian);
    else if (c === "I") view.setUint32(at, values[i] >>> 0, littleEndian);
    else view.setBigInt64(at, BigInt(values[i]), littleEndian);
    at += size[c];
  });
  return out;
}

function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

/** The string repeated, then cut, to `n` characters. */
const rep = (s: string, n = 4000) => s.repeat(Math.ceil(n / s.length) + 1).slice(0, n);
const utf8 = (s: string) => new TextEncoder().encode(s);
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

const EN = "The quick brown fox jumps over the lazy dog. Configuration values follow.\n";
const JA = "これは日本語のテキストです。設定ファイルの説明をここに書きます。文字化けしないことを確認します。\n";
const ZH = "这是中文文本。这里写配置文件的说明，确认不会出现乱码。游戏脚本里的字符串也常用这种编码。\n";
const RU = "Это русский текст. Здесь описание файла настроек, проверяем, что кодировка определяется верно.\n";
const KO = "이것은 한국어 텍스트입니다. 설정 파일에 대한 설명을 여기에 씁니다. 글자가 깨지지 않는지 확인합니다.\n";
const TR = "Bu Türkçe bir metindir. Ayar dosyasının açıklaması burada; şöyle güzel çalışıyor mu, ığdır.\n";
const DE = "Grüße aus München. Die Größe der Datei ist äußerst wichtig für Übersetzungen.\n";
// Windows smart quotes and an en dash, the characters cp1252 files are known for.
const QUOTES = "“Quoted” it’s – café.\n";

export function buildCorpus(): CorpusCase[] {
  const random = seeded(7);
  const noise = (n: number) => Uint8Array.from({ length: n }, random);
  const cases: CorpusCase[] = [];
  const put = (name: string, file: string, bytes: Uint8Array, expect: CorpusCase["expect"], text?: string) =>
    cases.push({ name, file, bytes, expect, text });
  const text = (name: string, file: string, source: string, bytes = utf8(source)) =>
    put(name, file, bytes, "text", source);

  // Lock files
  text("lock-yarn", "yarn.lock", rep('# yarn lockfile v1\n\n"lodash@^4.17.21":\n  version "4.17.21"\n  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"\n  integrity sha512-v2kDE\n\n'));
  text("lock-cargo", "Cargo.lock", rep('[[package]]\nname = "serde"\nversion = "1.0.200"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "ddc6f9cc"\n\n'));
  text("lock-poetry", "poetry.lock", rep('[[package]]\nname = "requests"\nversion = "2.31.0"\ndescription = "Python HTTP for Humans."\noptional = false\n\n'));
  text("lock-gemfile", "Gemfile.lock", rep("GEM\n  remote: https://rubygems.org/\n  specs:\n    rack (3.0.8)\n    rails (7.1.2)\n      actionpack (= 7.1.2)\n"));
  text("lock-libreoffice", ".~lock.report.odt#", "Jane Doe,jane,LAPTOP-01,17.10.2026 10:12,file:///home/jane/.config/libreoffice/4;");
  // Gradle's cross-process lock: a version byte, then an owner record of longs and a short string.
  put("lock-gradle", "fileHashes.lock", concat([3], pack(false, "qqh", 0x1234, 98765, 9), ascii("127.0.0.1"), new Uint8Array(8)), "binary");
  // git's index.lock is a copy of the index: "DIRC", version, entry count, stat data.
  put("lock-git-index", "index.lock", concat(ascii("DIRC"), pack(false, "II", 2, 3), noise(400)), "binary");

  // XML
  const strings = Array.from({ length: 30 }, (_, i) => `  <string name="k${i}">${EN.trim()} ${DE.trim()}</string>\n`).join("");
  const xml = (enc: string) => `<?xml version="1.0" encoding="${enc}"?>\n<resources>\n${strings}</resources>\n`;
  text("xml-utf8", "strings.xml", xml("utf-8"));
  text("xml-utf16le-bom", "strings.xml", xml("utf-16"), concat([0xff, 0xfe], utf16(xml("utf-16"), true)));
  text("xml-utf16be-bom", "strings.xml", xml("utf-16"), concat([0xfe, 0xff], utf16(xml("utf-16"), false)));
  text("xml-utf16le-nobom", "strings.xml", xml("utf-16"), utf16(xml("utf-16"), true));
  text("xml-utf16be-nobom", "strings.xml", xml("utf-16"), utf16(xml("utf-16"), false));
  text("xml-latin1", "strings.xml", xml("ISO-8859-1"), encodeLegacy(xml("ISO-8859-1"), "windows-1252"));
  // Android compiled XML (AAPT): an XML chunk, a UTF-16 string pool, binary attribute records.
  const pool = concat(...["resources", "string", "name", "android", "app_name"].map((s) => concat(pack(true, "H", s.length), utf16(s, true), [0, 0])));
  const records = Array.from({ length: 16 }, (_, i) => pack(true, "HHIIIHHHHHH", 0x0102, 16, 36, i, 0xffffffff, 0, 1, 20, 1, 0, 0));
  put("xml-android-binary", "AndroidManifest.xml", concat(pack(true, "HHI", 3, 8, 8 + 28 + pool.length + 600), pack(true, "HHIIIIII", 1, 28, 28 + pool.length, 5, 0, 0, 28, 0), pool, ...records), "binary");

  // Shaders
  text("frag-glsl", "ink.frag", rep("#version 320 es\nprecision highp float;\nuniform vec4 u_color;\nout vec4 fragColor;\nvoid main() { fragColor = u_color * 0.5; }\n"));
  // Flutter's impellerc output: a flatbuffer whose file identifier "IPLR" sits at offset 4.
  put("frag-flutter-compiled", "ink_sparkle.frag", concat(pack(true, "I", 12), ascii("IPLR"), noise(3000)), "binary");

  // Logs
  const clock = (i: number) => `2026-10-17 10:${String(i % 60).padStart(2, "0")}:00`;
  text("log-ansi", "server.log", Array.from({ length: 200 }, (_, i) => `\x1b[32m${clock(i)}\x1b[0m \x1b[1mINFO\x1b[0m request ${i} served in ${i % 97} ms\n`).join(""));
  text("log-spinner", "build.log", Array.from({ length: 1500 }, (_, i) => `\r\x1b[2K\x1b[36m${"|/-\\"[i % 4]}\x1b[0m ${i}%`).join(""));
  const log = Array.from({ length: 400 }, (_, i) => `${clock(i)} INFO request ${i} served\n`).join("");
  text("log-nul-tail", "app.log", log + log, concat(utf8(log), new Uint8Array(65536), utf8(log)));
  text("log-nul-head", "app.log", log, concat(new Uint8Array(9000), utf8(log)));
  text("log-nul-sparse", "app.log", log, concat(...log.split("\n").map((line, i) => concat(utf8(line), i % 9 === 0 ? [0] : [], i < 400 ? [0x0a] : []))));

  // XHTML in every encoding an EPUB chapter turns up in
  const xhtml = (body: string, enc: string) =>
    `<?xml version="1.0" encoding="${enc}"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="${enc}"/><title>Ch 1</title></head><body>\n` +
    `<p>${body.trim()}</p>\n`.repeat(40) +
    "</body></html>\n";
  text("xhtml-utf8", "ch1.xhtml", xhtml(JA, "utf-8"));
  text("xhtml-utf16le-bom", "ch1.xhtml", xhtml(JA, "utf-16"), concat([0xff, 0xfe], utf16(xhtml(JA, "utf-16"), true)));
  text("xhtml-utf16le-nobom-cjk", "ch1.xhtml", xhtml(JA.repeat(3), "utf-16"), utf16(xhtml(JA.repeat(3), "utf-16"), true));
  for (const [name, body, enc, label] of [
    ["cp1252", DE + QUOTES, "windows-1252", "windows-1252"],
    ["shiftjis", JA, "shift_jis", "shift_jis"],
    ["gbk", ZH, "gbk", "gbk"],
    ["cp1251", RU, "windows-1251", "windows-1251"],
    ["euckr", KO, "euc-kr", "euc-kr"],
  ]) {
    text(`xhtml-${name}`, "ch1.xhtml", xhtml(body, enc), encodeLegacy(xhtml(body, enc), label));
  }
  // What an Adobe ADEPT or FairPlay EPUB holds: encrypted, deflated content.
  put("xhtml-drm", "ch1.xhtml", noise(6000), "binary");

  // Plain text in legacy encodings
  for (const [name, body, label] of [
    ["shiftjis", JA, "shift_jis"],
    ["gbk", ZH, "gbk"],
    ["cp1251", RU, "windows-1251"],
    ["euckr", KO, "euc-kr"],
    ["cp1254", TR, "windows-1254"],
    ["latin1", DE, "windows-1252"],
  ]) {
    text(`txt-${name}`, "readme.txt", rep(body + EN), encodeLegacy(rep(body + EN), label));
  }
  const css = rep("/* Основные стили сайта */\nbody { margin: 0; font-family: Arial; }\n.nav a { color: #333; } /* ссылки меню */\n");
  text("css-cp1251-comments", "site.css", css, encodeLegacy(css, "windows-1251"));
  const lua = rep('local quest = {\n  name = "寻找失落的宝剑",\n  desc = "前往北方的山洞，击败守卫。",\n  reward = 500,\n}\n');
  text("lua-gbk-strings", "quest.lua", lua, encodeLegacy(lua, "gbk"));
  const notes = rep("Meeting notes – it’s agreed: “ship Friday”.\n" + EN);
  text("txt-cp1252-quotes", "notes.txt", notes, encodeLegacy(notes, "windows-1252"));
  text("txt-utf32le-bom", "notes.txt", rep(EN, 2000), concat([0xff, 0xfe, 0, 0], utf32(rep(EN, 2000), true)));
  text("txt-utf32be-bom", "notes.txt", rep(EN, 2000), concat([0, 0, 0xfe, 0xff], utf32(rep(EN, 2000), false)));

  // Compiled scripts
  put("lua-bytecode", "quest.lua", concat([0x1b], ascii("Lua"), [0x53, 0x00, 0x19, 0x93, 0x0d, 0x0a, 0x1a, 0x0a, 0x04, 0x08, 0x04, 0x08, 0x08], noise(3000)), "binary");
  put("lua-luajit", "quest.lua", concat([0x1b], ascii("LJ"), [0x02], noise(3000)), "binary");

  // A text head with binary data after it, past the sniff window: the text is kept, the rest cut.
  const big = EN.repeat(1600);
  put("big-text-then-binary", "dump.txt", concat(utf8(big), noise(200_000)), "text", big);

  put("empty", "empty.txt", new Uint8Array(0), "empty");
  return cases;
}
