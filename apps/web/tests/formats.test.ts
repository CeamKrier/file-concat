import { EXTRACTED_FORMATS, RECOGNISABLE_IMAGE_FORMATS } from "@fileconcat/core";
import { describe, expect, it } from "vitest";

import { FORMAT_CHIPS, READ_FORMATS } from "~/data/formats";
import { SPEECH_FORMATS } from "~/lib/ocr";
import { SUBTITLE_TRACK_FORMATS } from "~/lib/parsers";

/**
 * Every format the tab acts on: the router's documents, text formats and
 * archives (each loader is held to the router in parsers.test.ts, and the web
 * unpacks every archive kind through 7-Zip), the images recognition is offered
 * over, the recordings speech is, and the videos whose subtitle track is read.
 */
const ACTED_ON = new Set([
  ...EXTRACTED_FORMATS,
  ...RECOGNISABLE_IMAGE_FORMATS,
  ...SPEECH_FORMATS,
  ...SUBTITLE_TRACK_FORMATS,
]);

const LISTED = new Set(READ_FORMATS.flatMap((entry) => entry.formats));

describe("the formats page list", () => {
  it("lists every format the tab reads", () => {
    expect([...ACTED_ON].filter((format) => !LISTED.has(format))).toEqual([]);
  });

  it("claims no format the tab does not read", () => {
    expect([...LISTED].filter((format) => !ACTED_ON.has(format))).toEqual([]);
  });

  it("offers on request exactly what waits to be asked", () => {
    const onRequest = READ_FORMATS.filter((entry) => entry.how === "on-request").flatMap((e) => e.formats);
    for (const format of onRequest) {
      expect(RECOGNISABLE_IMAGE_FORMATS.has(format) || SPEECH_FORMATS.has(format), format).toBe(true);
    }
  });

  it("puts no extension on a homepage chip that is not read on drop", () => {
    const onDrop = new Set(READ_FORMATS.filter((entry) => entry.how === "auto").flatMap((e) => e.extensions));
    const chips = FORMAT_CHIPS.flatMap((chip) => chip.ext);
    expect(chips.filter((ext) => !onDrop.has(ext))).toEqual([]);
  });
});
