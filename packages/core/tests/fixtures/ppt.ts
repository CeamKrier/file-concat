/** A hand-built PowerPoint 97 deck, for the reader that only sees its streams. */

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const le = (bytes: number, value: number): Uint8Array => {
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) out[i] = Math.floor(value / 2 ** (8 * i)) & 0xff;
  return out;
};
export const u32s = (...values: number[]): Uint8Array => concat(...values.map((value) => le(4, value >>> 0)));
export const utf16 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    out[i * 2] = s.charCodeAt(i) & 0xff;
    out[i * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  return out;
};
const header = (version: number, inst: number, type: number, length: number) =>
  concat(le(2, version | (inst << 4)), le(2, type), le(4, length));

export const atom = (type: number, body: Uint8Array, inst = 0): Uint8Array =>
  concat(header(0, inst, type, body.length), body);
export const container = (type: number, children: Uint8Array[], inst = 0): Uint8Array => {
  const body = concat(...children);
  return concat(header(0xf, inst, type, body.length), body);
};

/** A click on `[from, to)` of the text body before it follows hyperlink `id`; `mouseOver` is the hover one, `action` another action. */
export const textLink = (id: number, from: number, to: number, options: { mouseOver?: boolean; action?: number } = {}): Uint8Array[] => [
  container(0x0ff2, [atom(0x0ff3, concat(u32s(0, id), Uint8Array.of(options.action ?? 4, 0, 0, 0, 0, 0, 0, 0)))], options.mouseOver ? 1 : 0),
  atom(0x0fdf, u32s(from, to)),
];

/** A text body: TextHeaderAtom, the characters, and a SlideNumberMCAtom (or
 * `fieldType`) per position in `fields`. `bytes` stores it 8-bit. */
export function text(chars: string, options: { bytes?: boolean; fields?: number[]; fieldType?: number } = {}): Uint8Array[] {
  return [
    atom(0x0f9f, u32s(1)),
    options.bytes ? atom(0x0fa8, Uint8Array.from(chars, (c) => c.charCodeAt(0))) : atom(0x0fa0, utf16(chars)),
    ...(options.fields ?? []).map((at) => atom(options.fieldType ?? 0x0fd8, u32s(at))),
  ];
}

export interface ShapeSpec {
  /** Text in the shape's own ClientTextbox. */
  text?: Uint8Array[];
  /** Index of a text body in the sheet's slide-list segment instead. */
  outline?: number;
  /** PlaceholderEnum placement id. */
  ph?: number;
  /** Child anchor, left and top. */
  anchor?: [number, number];
  /** MS-ODRAW shape type; 20 is a line. */
  shapeType?: number;
  /** Mark the group shape of a table. */
  table?: boolean;
  /** StyleTextProp9Atom body, under the shape's `___PPT9` tag. */
  pp9?: Uint8Array;
}

const binaryTag = (name: string, data: Uint8Array[]) =>
  container(0x138a, [atom(0x0fba, utf16(name)), atom(0x138b, concat(...data))]);

export function shape(spec: ShapeSpec): Uint8Array {
  return container(0xf004, [
    atom(0xf00a, u32s(1024, spec.table ? 0x201 : 0xa00), spec.shapeType ?? 1),
    // tableProperties lives in the tertiary property table, one six-byte entry.
    ...(spec.table ? [atom(0xf122, concat(le(2, 0x039f), u32s(1)), 1)] : []),
    ...(spec.anchor ? [atom(0xf00f, u32s(spec.anchor[0], spec.anchor[1], spec.anchor[0] + 10, spec.anchor[1] + 10))] : []),
    ...(spec.ph !== undefined || spec.pp9
      ? [
          container(0xf011, [
            ...(spec.ph !== undefined ? [atom(0x0bc3, concat(u32s(0), Uint8Array.of(spec.ph, 0, 0, 0)))] : []),
            ...(spec.pp9 ? [container(0x1388, [binaryTag("___PPT9", [atom(0x0fac, spec.pp9)])])] : []),
          ]),
        ]
      : []),
    ...(spec.text ? [container(0xf00d, spec.text)] : []),
    ...(spec.outline !== undefined ? [container(0xf00d, [atom(0x0f9e, u32s(spec.outline))])] : []),
  ]);
}

/** A group: its own shape first, then its members. */
export const group = (members: Uint8Array[], table = false): Uint8Array =>
  container(0xf003, [shape({ table }), ...members]);

const drawing = (shapes: Uint8Array[]) => container(0x040c, [container(0xf002, [group(shapes)])]);

export interface SlideSpec {
  shapes: Uint8Array[];
  /** Records of the slide's segment in the slide list (outline text). */
  outline?: Uint8Array[];
  hidden?: boolean;
  comments?: [author: string, said: string][];
  notes?: Uint8Array[];
}

export interface DeckSpec {
  slides: SlideSpec[];
  /** Order of `slides` in the slide list, when it is not storage order. */
  order?: number[];
  /** Notes pages in the notes list, by slide index; storage order otherwise. */
  notesOrder?: number[];
  masters?: { shapes: Uint8Array[]; ppt12?: boolean }[];
  footer?: { text?: string; on: boolean };
  /** The deck's hyperlinks, by id: a target and a location. */
  hyperlinks?: [id: number, target?: string, location?: string][];
  /** The newest edit points back at itself. */
  selfLoop?: boolean;
  /** The edit names an encryption session. */
  cryptSession?: boolean;
  /** Current User says the deck is encrypted. */
  encryptedToken?: boolean;
}

/**
 * A deck's two streams: the DocumentContainer (slide lists, footer settings),
 * then each master, slide and notes page, the persist directory and one
 * UserEditAtom; Current User points at the edit. Persist id 1 is the document,
 * then masters, slides, notes and an encryption session in that order.
 */
export function deckStreams(spec: DeckSpec): Map<string, Uint8Array> {
  const masters = spec.masters ?? [{ shapes: [] }];
  const masterId = (i: number) => 0x80000000 + i;
  const slideId = (i: number) => 256 + i;
  let next = 2;
  const masterRef = masters.map(() => next++);
  const slideRef = spec.slides.map(() => next++);
  const withNotes = spec.slides.flatMap((slide, i) => (slide.notes ? [i] : []));
  const notesRef = new Map(withNotes.map((i) => [i, next++]));
  const cryptRef = next++;

  const persistAtom = (ref: number, id: number) => atom(0x03f3, u32s(ref, 0, 0, id, 0));
  const order = spec.order ?? spec.slides.map((_, i) => i);
  const notesOrder = spec.notesOrder ?? withNotes;
  const document = container(0x03e8, [
    atom(0x03e9, new Uint8Array(40)),
    container(0x0ff0, masters.map((_, i) => persistAtom(masterRef[i], masterId(i))), 1),
    container(0x0ff0, order.flatMap((i) => [persistAtom(slideRef[i], slideId(i)), ...(spec.slides[i].outline ?? [])]), 0),
    container(0x0ff0, notesOrder.map((i) => persistAtom(notesRef.get(i)!, 0x1000 + i)), 2),
    ...(spec.footer
      ? [
          container(
            0x0fd9,
            [
              atom(0x0fda, concat(le(2, 0), le(2, spec.footer.on ? 0x20 : 0))),
              ...(spec.footer.text !== undefined ? [atom(0x0fba, utf16(spec.footer.text), 2)] : []),
            ],
            3,
          ),
        ]
      : []),
    ...(spec.hyperlinks
      ? [
          container(
            0x0409,
            spec.hyperlinks.map(([id, target, location]) =>
              container(0x0fd7, [
                atom(0x0fd3, u32s(id)),
                ...(target !== undefined ? [atom(0x0fba, utf16(target), 1)] : []),
                ...(location !== undefined ? [atom(0x0fba, utf16(location), 3)] : []),
              ]),
            ),
          ),
        ]
      : []),
  ]);

  const objects = new Map<number, Uint8Array>([[1, document]]);
  masters.forEach((master, i) => {
    objects.set(
      masterRef[i],
      container(0x03f8, [
        atom(0x03ef, new Uint8Array(24)),
        drawing(master.shapes),
        ...(master.ppt12 ? [container(0x1388, [binaryTag("___PPT12", [])])] : []),
      ]),
    );
  });
  spec.slides.forEach((slide, i) => {
    const comments = (slide.comments ?? []).map(([author, said]) =>
      container(0x2ee0, [atom(0x0fba, utf16(author), 0), atom(0x0fba, utf16(said), 1), atom(0x2ee1, new Uint8Array(28))]),
    );
    objects.set(
      slideRef[i],
      container(0x03ee, [
        atom(0x03ef, concat(u32s(0, 0, 0, masterId(0), 0), le(2, 0), le(2, 0))),
        ...(slide.hidden ? [atom(0x03f9, concat(u32s(0, 0), Uint8Array.of(0, 0), le(2, 0x0004), u32s(0)))] : []),
        drawing(slide.shapes),
        ...(comments.length ? [container(0x1388, [binaryTag("___PPT10", comments)])] : []),
      ]),
    );
    if (slide.notes) {
      objects.set(notesRef.get(i)!, container(0x03f0, [atom(0x03f1, u32s(slideId(i), 0)), drawing(slide.notes)]));
    }
  });
  if (spec.cryptSession) objects.set(cryptRef, container(0x2f14, [atom(0x2f15, new Uint8Array(16))]));

  const ids = [...objects.keys()].sort((a, b) => a - b);
  const offsets = new Map<number, number>();
  let at = 0;
  for (const id of ids) {
    offsets.set(id, at);
    at += objects.get(id)!.length;
  }
  // One entry per run of consecutive ids.
  const entries: Uint8Array[] = [];
  for (let k = 0; k < ids.length; ) {
    let end = k;
    while (end + 1 < ids.length && ids[end + 1] === ids[end] + 1) end++;
    entries.push(u32s(((end - k + 1) << 20) | ids[k], ...ids.slice(k, end + 1).map((id) => offsets.get(id)!)));
    k = end + 1;
  }
  const directory = atom(0x1772, concat(...entries));
  const directoryAt = at;
  const editAt = directoryAt + directory.length;
  const edit = atom(
    0x0ff5,
    concat(
      u32s(0),
      le(2, 0),
      Uint8Array.of(0, 3),
      u32s(spec.selfLoop ? editAt : 0, directoryAt, 1, next),
      le(2, 1),
      le(2, 0),
      ...(spec.cryptSession ? [u32s(cryptRef)] : []),
    ),
  );
  const doc = concat(...ids.map((id) => objects.get(id)!), directory, edit);
  const currentUser = concat(
    header(0, 0, 0x0ff6, 20),
    u32s(0x14, spec.encryptedToken ? 0xf3d1c4df : 0xe391c05f, editAt),
    le(2, 0),
    le(2, 0x03f4),
    Uint8Array.of(3, 0),
    le(2, 0),
  );
  return new Map([
    ["PowerPoint Document", doc],
    ["Current User", currentUser],
  ]);
}

/**
 * Save `spec` again over an existing deck the way PowerPoint's fast save does:
 * the new objects and a new edit appended to the stream, the old ones left in
 * place, and Current User pointed at the new edit.
 */
export function amend(streams: Map<string, Uint8Array>, id: number, object: Uint8Array): Map<string, Uint8Array> {
  const doc = streams.get("PowerPoint Document")!;
  const currentUser = streams.get("Current User")!;
  const view = new DataView(currentUser.buffer, currentUser.byteOffset, currentUser.byteLength);
  const previous = view.getUint32(16, true);
  const objectAt = doc.length;
  const directory = atom(0x1772, u32s((1 << 20) | id, objectAt));
  const directoryAt = objectAt + object.length;
  const editAt = directoryAt + directory.length;
  const edit = atom(0x0ff5, concat(u32s(0), le(2, 0), Uint8Array.of(0, 3), u32s(previous, directoryAt, 1, 99), le(2, 1), le(2, 0)));
  const amended = new Uint8Array(currentUser);
  new DataView(amended.buffer).setUint32(16, editAt, true);
  return new Map([
    ["PowerPoint Document", concat(doc, object, directory, edit)],
    ["Current User", amended],
  ]);
}

/** A slide container as `deckStreams` writes one, for `amend`. */
export const slideContainer = (shapes: Uint8Array[]): Uint8Array =>
  container(0x03ee, [atom(0x03ef, concat(u32s(0, 0, 0, 0x80000000, 0), le(2, 0), le(2, 0))), drawing(shapes)]);
