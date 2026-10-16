import { encodingName } from "~/lib/encoding-guess";

/**
 * The legacy encodings a text file without a declared charset turns up in,
 * as `TextDecoder` labels, with the script each one is for. UTF-8 is on the
 * list for the file that was mostly UTF-8 with a few stray bytes.
 */
const ENCODINGS: readonly (readonly [label: string, script: string])[] = [
  ["utf-8", "Unicode"],
  ["windows-1252", "Western European"],
  ["windows-1250", "Central European"],
  ["windows-1251", "Cyrillic"],
  ["koi8-r", "Russian"],
  ["windows-1253", "Greek"],
  ["windows-1254", "Turkish"],
  ["windows-1255", "Hebrew"],
  ["windows-1256", "Arabic"],
  ["windows-1257", "Baltic"],
  ["windows-1258", "Vietnamese"],
  ["windows-874", "Thai"],
  ["shift_jis", "Japanese"],
  ["euc-jp", "Japanese"],
  ["gbk", "Simplified Chinese"],
  ["gb18030", "Simplified Chinese"],
  ["big5", "Traditional Chinese"],
  ["euc-kr", "Korean"],
];

export function EncodingPicker({
  name,
  value,
  onPick,
}: {
  name: string;
  value: string;
  onPick: (label: string) => void;
}) {
  const known = ENCODINGS.some(([label]) => label === value);
  return (
    <select
      aria-label={`Encoding for ${name}`}
      value={value}
      onChange={(e) => onPick(e.target.value)}
      className="border-border-strong bg-surface text-ink rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface-inset border px-1.5 py-0.5 font-mono text-[11.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
    >
      {!known && <option value={value}>{encodingName(value)}</option>}
      {ENCODINGS.map(([label, script]) => (
        <option key={label} value={label}>
          {encodingName(label)}, {script}
        </option>
      ))}
    </select>
  );
}
