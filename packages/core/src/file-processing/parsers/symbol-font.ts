/**
 * The Symbol font's characters as Unicode, codes 0x20 to 0xFE, from Unicode's
 * mapping of Adobe's Symbol encoding (unicode.org/Public/MAPPINGS/VENDORS/
 * ADOBE/symbol.txt); NUL where it gives only a private-use character, such as
 * a bracket piece. The serif and sans registered, copyright and trademark
 * signs (0xD2-0xD4, 0xE2-0xE4) are added: Adobe gives them private-use points.
 */
const SYMBOL =
  " !\u2200#\u2203%&\u220B()\u2217+,\u2212./0123456789:;<=>?\u2245\u0391\u0392\u03A7\u0394\u0395\u03A6\u0393\u0397\u0399\u03D1\u039A\u039B\u039C\u039D\u039F\u03A0\u0398\u03A1\u03A3\u03A4\u03A5\u03C2\u03A9\u039E\u03A8\u0396[\u2234]\u22A5_\0\u03B1\u03B2\u03C7\u03B4\u03B5\u03C6\u03B3\u03B7\u03B9\u03D5\u03BA\u03BB\u00B5\u03BD\u03BF\u03C0\u03B8\u03C1\u03C3\u03C4\u03C5\u03D6\u03C9\u03BE\u03C8\u03B6{|}\u223C\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\u20AC\u03D2\u2032\u2264\u2044\u221E\u0192\u2663\u2666\u2665\u2660\u2194\u2190\u2191\u2192\u2193\u00B0\u00B1\u2033\u2265\u00D7\u221D\u2202\u2022\u00F7\u2260\u2261\u2248\u2026\0\0\u21B5\u2135\u2111\u211C\u2118\u2297\u2295\u2205\u2229\u222A\u2283\u2287\u2284\u2282\u2286\u2208\u2209\u2220\u2207\u00AE\u00A9\u2122\u220F\u221A\u22C5\u00AC\u2227\u2228\u21D4\u21D0\u21D1\u21D2\u21D3\u25CA\u2329\u00AE\u00A9\u2122\u2211\0\0\0\0\0\0\0\0\0\0\0\u232A\u222B\u2320\0\u2321\0\0\0\0\0\0\0\0\0";

/**
 * The character a Symbol-font code draws. Word writes one as `w:sym` or
 * sprmCSymbol with the code at U+F0xx, its private-use copy of the font's
 * 0x20-0xFF; pandoc's docx reader turns it back the same way, from a table
 * per symbol font. A code in another font is its own character.
 *
 * ponytail: Symbol only; a Wingdings or Webdings code (a check box, a bullet)
 * gives undefined, where pandoc has tables for those too. Add one per font
 * when a real document needs it.
 */
export function symbolFontChar(font: string, code: number): string | undefined {
  const own = code >= 0xf000 && code <= 0xf0ff ? code - 0xf000 : code;
  if (/^symbol$/i.test(font.trim())) {
    const char = own >= 0x20 && own <= 0xfe ? SYMBOL[own - 0x20] : undefined;
    return char && char !== "\0" ? char : undefined;
  }
  return code >= 0xf000 && code <= 0xf0ff ? undefined : String.fromCharCode(code);
}
