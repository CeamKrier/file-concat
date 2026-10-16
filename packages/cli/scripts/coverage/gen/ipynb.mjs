// Hand-built nbformat 4.5 notebook, one marker per construct.
import fs from "node:fs";
import path from "node:path";
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "probes", "ipynb", "probe.ipynb");
const ESC = "\u001b";
const nb = {
  cells: [
    { id: "c1", cell_type: "markdown", metadata: {}, source: ["# QZMDHEADING\n", "\n", "Prose QZMDPROSE with ![img](attachment:pic.png)\n"],
      attachments: { "pic.png": { "image/png": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" } } },
    { id: "c2", cell_type: "code", execution_count: 1, metadata: { tags: ["QZCELLTAG"], name: "QZCELLNAME" },
      source: ["print('QZCODESRC')\n", "import sys; print('x', file=sys.stderr)"],
      outputs: [
        { output_type: "stream", name: "stdout", text: ["QZSTDOUT\n"] },
        { output_type: "stream", name: "stderr", text: ["QZSTDERR warning\n"] },
      ] },
    { id: "c3", cell_type: "code", execution_count: 2, metadata: {}, source: ["df"],
      outputs: [
        { output_type: "execute_result", execution_count: 2, metadata: {},
          data: { "text/plain": ["QZEXECPLAIN"], "text/html": ["<table><tr><td>QZEXECHTML</td></tr></table>"] } },
      ] },
    { id: "c4", cell_type: "code", execution_count: 3, metadata: {}, source: ["display(Markdown('x'))"],
      outputs: [
        { output_type: "display_data", metadata: {}, data: { "text/markdown": ["**QZDISPMDONLY**"] } },
        { output_type: "display_data", metadata: {}, data: { "text/html": ["<b>QZDISPHTMLONLY</b>"] } },
        { output_type: "display_data", metadata: {}, data: { "image/png": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "text/plain": ["<Figure size 640x480 with 1 Axes>"] } },
        { output_type: "display_data", metadata: {}, data: { "image/png": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" } },
      ] },
    { id: "c5", cell_type: "code", execution_count: 4, metadata: {}, source: ["1/0"],
      outputs: [
        { output_type: "error", ename: "ZeroDivisionError", evalue: "QZERRVALUE",
          traceback: [`${ESC}[0;31m---------------------------------------------------------------------------${ESC}[0m`,
            `${ESC}[0;31mZeroDivisionError${ESC}[0m                         Traceback (most recent call last)`,
            `Cell ${ESC}[0;32mIn[4], line 1${ESC}[0m\n${ESC}[0;32m----> 1${ESC}[0m QZTRACEBACK${ESC}[38;5;241m/${ESC}[39m0`] },
      ] },
    { id: "c6", cell_type: "raw", metadata: { format: "text/latex" }, source: ["\\section{QZRAWCELL}"] },
    { id: "c7", cell_type: "code", execution_count: null, metadata: {}, source: ["x = 'QZUNRUN'"], outputs: [] },
  ],
  metadata: {
    kernelspec: { display_name: "QZKERNELDISPLAY", language: "python", name: "python3" },
    language_info: { name: "python", version: "3.12.0" },
    authors: [{ name: "QZAUTHOR" }],
    title: "QZNBTITLE",
  },
  nbformat: 4,
  nbformat_minor: 5,
};
fs.writeFileSync(out, JSON.stringify(nb, null, 1));
JSON.parse(fs.readFileSync(out, "utf8"));
console.log("wrote", out);
