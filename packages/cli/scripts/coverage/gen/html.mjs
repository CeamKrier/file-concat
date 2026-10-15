// Hand-built saved pages (Chromium "Webpage, Complete" comment). Two probes:
// article.html (long prose, Readability should accept) and app.html (short
// text spread over widgets, meant to fall to the turndown fallback).
// Markers carry the probe's prefix: QZA... in article.html, QZB... in app.html.
import fs from "node:fs";
import path from "node:path";
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "probes", "html");
const URL_ = "https://news.example.com/blog/post.html";
const saved = `<!-- saved from url=(${String(URL_.length).padStart(4, "0")})${URL_} -->`;

const filler = (P) =>
  Array.from({ length: 6 }, (_, i) =>
    `<p>Filler paragraph ${i} for ${P}, written so the article scorer has enough prose, with commas, clauses, and ordinary sentences that read like a news story about measurements, tools, and files.</p>`).join("\n");

function constructs(P) {
  return `
<h1>${P}HONE</h1>
<p>Lead paragraph ${P}PARA with <abbr title="${P}ABBRTITLE">${P}ABBRTEXT</abbr>, a <time datetime="2026-10-14">${P}TIMETEXT</time>, inline <code>${P}INLINECODE</code>, <a href="other.html">${P}RELTEXT</a>, <a href="//cdn.other.example/${P}PROTOREL">${P}PROTORELTEXT</a> and <a href="https://elsewhere.example/${P}EXTHREF">${P}EXTTEXT</a>.</p>
<!-- ${P}COMMENT -->
<h2>${P}HTWO</h2><h3>${P}HTHREE</h3><h4>${P}HFOUR</h4><h5>${P}HFIVE</h5><h6>${P}HSIX</h6>
<ul><li>${P}ULITEM<ul><li>${P}NESTEDITEM</li></ul></li></ul>
<ol><li>${P}OLITEM</li></ol>
<dl><dt>${P}DTTERM</dt><dd>${P}DDDEF</dd></dl>
<table><caption>${P}TCAPTION</caption>
<thead><tr><th>${P}THONE</th><th>${P}THTWO</th></tr></thead>
<tbody><tr><td colspan="2">${P}COLSPAN</td></tr><tr><td>${P}TDONE</td><td>${P}TDTWO</td></tr></tbody></table>
<figure><img src="fig.png" alt="${P}FIGALT"><figcaption>${P}FIGCAPTION</figcaption></figure>
<p><img src="pic.png" alt="${P}IMGALT" title="${P}IMGTITLE"> after image.</p>
<details><summary>${P}SUMMARY</summary><p>${P}DETAILSBODY</p></details>
<template><p>${P}TEMPLATE</p></template>
<noscript><p>${P}NOSCRIPT</p></noscript>
<script>var s = "${P}SCRIPT";</script>
<style>.${P}STYLE { color: red; }</style>
<p hidden>${P}HIDDENATTR</p>
<p aria-hidden="true">${P}ARIAHIDDEN</p>
<form><label for="q">${P}LABEL</label>
<input id="q" type="text" placeholder="${P}PLACEHOLDER" value="${P}INPUTVALUE">
<input type="hidden" value="${P}HIDDENINPUT">
<input type="submit" value="${P}SUBMITVALUE">
<select><option>${P}OPTIONONE</option><option selected>${P}OPTIONSELECTED</option></select>
<textarea>${P}TEXTAREA</textarea>
<button>${P}BUTTON</button></form>
<iframe srcdoc="&lt;p&gt;${P}SRCDOC&lt;/p&gt;">${P}IFRAMEFALLBACK</iframe>
<p><ruby>${P}RUBYBASE<rp>(</rp><rt>${P}RUBYRT</rt><rp>)</rp></ruby></p>
<svg width="100" height="40"><title>${P}SVGTITLE</title><desc>${P}SVGDESC</desc><text x="0" y="20">${P}SVGTEXT</text></svg>
<math><semantics><mrow><mi>x</mi><mo>=</mo><mtext>${P}MTEXT</mtext></mrow><annotation encoding="application/x-tex">${P}ANNOTATION</annotation></semantics></math>
<pre><code class="language-python">print("${P}PRECODE")
    indented()</code></pre>
<blockquote><p>${P}BLOCKQUOTE</p></blockquote>
<p>Closing paragraph ${P}CLOSING.</p>`;
}

const chrome = (P) => `
<div id="cookie-banner" class="banner">We use cookies ${P}COOKIE <button>Accept</button></div>
<header class="site-header"><a href="/">${P}SITEHEADER</a></header>
<nav><ul><li><a href="/a">${P}NAVLINK</a></li></ul></nav>
<div role="dialog" aria-modal="true">${P}MODAL</div>`;
const footer = (P) => `
<aside class="sidebar"><p>${P}ASIDE related posts</p></aside>
<footer><p>${P}FOOTER copyright</p></footer>`;

const head = (P) => `<head>
<meta charset="utf-8">
<title>${P}TITLE</title>
<meta name="description" content="${P}METADESC">
</head>`;

const article = `${saved}
<!DOCTYPE html>
<html lang="en">${head("QZA")}
<body>${chrome("QZA")}
<main><article>
${filler("QZA")}
${constructs("QZA")}
${filler("QZA").replaceAll("Filler", "More filler")}
</article></main>
<div class="cols" style="display:flex"><div style="order:2">${"QZA"}COLRIGHT</div><div style="order:1">${"QZA"}COLLEFT</div></div>
${footer("QZA")}
</body></html>
`;

// Short on prose so Readability's article stays under MIN_CHARS (400) and the
// whole body goes through withoutChrome + turndown.
const B = "QZB";
const app = `${saved}
<!DOCTYPE html>
<html lang="en">${head(B)}
<body>${chrome(B)}
<div class="app">
<div class="cols" style="display:flex">
<div class="right" style="order:2">${B}COLRIGHT</div>
<div class="left" style="order:1">${B}COLLEFT</div>
</div>
<h1>${B}HONE</h1>
<table><caption>${B}TCAPTION</caption><tr><th>${B}THONE</th><th>${B}THTWO</th></tr><tr><td colspan="2">${B}COLSPAN</td></tr></table>
<details><summary>${B}SUMMARY</summary>${B}DETAILSBODY</details>
<template>${B}TEMPLATE</template><noscript>${B}NOSCRIPT</noscript>
<script>var s = "${B}SCRIPT";</script><style>.${B}STYLE{}</style>
<div hidden>${B}HIDDENATTR</div><span aria-hidden="true">${B}ARIAHIDDEN</span>
<!-- ${B}COMMENT -->
<label for="q">${B}LABEL</label><input id="q" placeholder="${B}PLACEHOLDER" value="${B}INPUTVALUE">
<select><option>${B}OPTIONONE</option><option selected>${B}OPTIONSELECTED</option></select>
<textarea>${B}TEXTAREA</textarea><button>${B}BUTTON</button>
<iframe srcdoc="&lt;p&gt;${B}SRCDOC&lt;/p&gt;"></iframe>
<svg><title>${B}SVGTITLE</title><text>${B}SVGTEXT</text></svg>
<math><semantics><mtext>${B}MTEXT</mtext><annotation>${B}ANNOTATION</annotation></semantics></math>
<pre><code class="language-python">${B}PRECODE</code></pre>
<img src="pic.png" alt="${B}IMGALT">
</div>
${footer(B)}
</body></html>
`;

fs.writeFileSync(path.join(dir, "article.html"), article);
fs.writeFileSync(path.join(dir, "app.html"), app);
console.log("wrote article.html, app.html");
