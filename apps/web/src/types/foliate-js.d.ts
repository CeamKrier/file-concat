declare module "foliate-js/mobi.js" {
  interface Book {
    metadata?: { title?: unknown };
    sections: { createDocument?: () => Promise<Document> }[];
  }
  export class MOBI {
    constructor(options: { unzlib: (data: Uint8Array) => Uint8Array });
    /** MOBI6 or KF8, whichever the file holds. */
    open(file: Blob): Promise<Book>;
  }
}
