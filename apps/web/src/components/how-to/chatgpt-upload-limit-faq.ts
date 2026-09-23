/**
 * FAQ for /how-to/chatgpt-file-upload-limit. Rendered on the page and emitted as
 * FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * Every figure is from OpenAI's File Uploads FAQ
 * (help.openai.com/en/articles/8555545), read on 2026-09-24 and pinned in
 * src/data/vendor-caps.json. None of them is our measurement: the upload quota
 * was never tested on an account of ours, so no answer here may claim it was.
 */
export const CHATGPT_UPLOAD_LIMIT_FAQ = [
  {
    q: "What is the ChatGPT file upload limit?",
    a: "OpenAI's File Uploads FAQ says you can upload up to 80 files every 3 hours, and that Free users are limited to 3 file uploads per day. It adds that these limits may be lowered during peak hours. Separately, one file can be at most 512 MB, a text or document file at most 2 million tokens, and everything you have uploaded shares 25 GB of storage per user. Figures as of September 2026; OpenAI changes them, so check the current ones.",
  },
  {
    q: "When does the ChatGPT file upload limit reset?",
    a: "OpenAI calls the 80-file cap a rolling upload rate, so it counts what you uploaded over the last three hours rather than resetting at a set time. The help page does not say when the Free plan's daily count starts over, and ChatGPT does not show how much of either quota you have used or have left. Waiting works; sending fewer files works now.",
  },
  {
    q: 'Why does ChatGPT say "upload limit reached" when I have barely uploaded anything?',
    a: "OpenAI lists three causes: being signed into a different account or plan than you think, failed upload attempts, which can count toward the cap, and limits lowered during peak hours. It also suggests checking status.openai.com. Every retry of a failed upload can spend quota, which is one more reason to send one file instead of many.",
  },
  {
    q: "Does one combined file count as one upload?",
    a: "Yes. The quota counts files, and FileConcat hands back a single file however many documents went into it. Forty PDFs combined into one file cost one of the Free plan's three daily uploads, not all three and then some. The file tree at the top of the file keeps every document labeled and in order.",
  },
  {
    q: "How big can the one combined file be?",
    a: "OpenAI caps a single upload at 512 MB, and a text or document file at 2 million tokens. FileConcat shows the token count of the combined file before you send it, so you know whether the folder fits in one upload or should go in as two.",
  },
  {
    q: "Is this the same as the ChatGPT Project file limit?",
    a: "No. The upload limit counts files you send, in any chat. A Project also caps how many files it can hold at once: 5 on Free, 25 on Go and Plus, 40 on Pro and above. One combined file helps with both, because it is one upload and it takes one Project slot.",
  },
  {
    q: "Are my documents uploaded to a server?",
    a: "Not to us. FileConcat reads every file, the PDFs and Office documents included, in your browser tab, and there is no account to create. The only upload is the one combined file you choose to send to ChatGPT.",
  },
];
