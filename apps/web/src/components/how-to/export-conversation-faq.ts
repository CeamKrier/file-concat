/**
 * FAQ for /how-to/export-chatgpt-conversation-to-markdown. Rendered on the page
 * and emitted as FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * The account exports are from OpenAI's "Exporting your ChatGPT history and
 * data" and Claude's "Export your Claude data", read on 2026-10-26 and pinned in
 * src/data/vendor-caps.json. Neither page names the file format inside the
 * download, so no answer here does either. Clipper behaviour is read from
 * apps/extension at 0.3.2, the version in the Chrome Web Store.
 */
export const EXPORT_CONVERSATION_FAQ = [
  {
    q: "How do I export one ChatGPT conversation?",
    a: "ChatGPT's own export is for the whole account: Settings, Data controls, Export, then a ZIP link by email or text that OpenAI says can take up to 7 days. For one conversation, open it with the FileConcat Clipper side panel and press Clip this conversation. You get every turn as Markdown right away.",
  },
  {
    q: "Can I export a Claude conversation to Markdown?",
    a: "Yes, the same way: open the chat on claude.ai with the Clipper panel and clip it. Claude's own export, under Settings and Privacy, sends a link to your whole chat history by email, and the link expires after 24 hours. The Clipper also works on Gemini conversations.",
  },
  {
    q: "Why not select all and copy?",
    a: "Because most of a long conversation is not on the page. On a 41-turn ChatGPT conversation we measured, the page held 4 of its 82 messages after it loaded and swapped the rest in as we scrolled. The Clipper asks the site for the whole conversation instead.",
  },
  {
    q: "Does the Markdown include reasoning and tool output?",
    a: "Only if you ask. The panel's Include reasoning and tool activity option adds thought summaries, tool calls and their outputs. On the conversation we measured, that made the clipping 3 to 6.5 times larger.",
  },
  {
    q: "Where does the Markdown go?",
    a: "Copy puts it on your clipboard, ready for a notes app. Send hands it to an open fileconcat.com tab, where several conversations become one bundle you can download as a single .md file with Format set to Markdown.",
  },
  {
    q: "Is the conversation uploaded to a server?",
    a: "Not to us. The panel reads the conversation in your browser and holds the clipping in your browser's storage until you copy or send it. There is no account to create. It needs Chrome on a computer.",
  },
];
