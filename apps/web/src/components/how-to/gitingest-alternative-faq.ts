/**
 * FAQ for /how-to/gitingest-repomix-alternative. Rendered on the page and
 * emitted as FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * Every statement about gitingest and Repomix is their own, read on 2026-09-24
 * and pinned in src/data/vendor-caps.json: gitingest.com, its README on
 * GitHub, and repomix.com's privacy policy. The bundle figures are our
 * published run of 2026-09-10 (/blog/repomix-vs-gitingest-vs-code2prompt),
 * quoted, never re-derived here. Our own claim stays at "not uploaded to us":
 * the site runs Clarity.
 */
export const GITINGEST_ALTERNATIVE_FAQ = [
  {
    q: "Is there a gitingest alternative that runs locally?",
    a: "FileConcat runs in your browser tab: a folder or ZIP is read from your disk, and a public GitHub repository is fetched by your browser straight from GitHub, with nothing to install. gitingest's own command-line tool also runs on your machine, installed with pip.",
  },
  {
    q: "Is Repomix safe to use?",
    a: "Its privacy policy draws the line itself. The command-line tool processes everything locally, which the policy says makes it safe for private and internal repositories. The website is different for a folder or ZIP: uploaded files are temporarily stored on Repomix's servers and deleted immediately after processing.",
  },
  {
    q: "Does gitingest work with private repositories?",
    a: "Yes, with a GitHub personal access token, which its site says is used once for cloning and never stored. FileConcat does not import a private repository by link: clone it and drop the folder, which is read in your browser.",
  },
  {
    q: "Which one packs the most of my own code?",
    a: "Over the same 60 public repositories on 2026-09-10, each tool at its defaults, a FileConcat bundle was a median 68.0% source code, against 51.1% for gitingest and 49.6% for Repomix. Tests alone were a median 9.0% of a gitingest bundle and 9.4% of a Repomix one, against 0.7% of ours.",
  },
  {
    q: "Can gitingest or Repomix read PDFs and Word files?",
    a: "Not at their defaults in our test on 2026-09-10. Given a folder with a PDF, a Word file, a spreadsheet and a slide deck next to the code, Repomix packed the source file only and gitingest named three of the documents without their text. FileConcat carried the text of all four. Both describe themselves as packing a codebase, and a PDF is not code.",
  },
  {
    q: "Is my code uploaded to a server?",
    a: "Not to us. A folder is read in your browser tab, and a public repository is fetched by your browser from GitHub, so that request goes to them. There is no account to create.",
  },
];
