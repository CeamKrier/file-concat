/**
 * FAQ for /how-to/chatgpt-conversation-too-long. Rendered on the page and
 * emitted as FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * The Projects facts are from OpenAI's "Projects in ChatGPT" (articles/10169521)
 * and the 2M-token file cap from its File uploads FAQ (articles/8555545), read
 * on 2026-09-30 and pinned in src/data/vendor-caps.json. Neither error string
 * is on OpenAI's help center; both are quoted as they appear in the titles of
 * OpenAI community forum threads, pinned there too. Whether the Clipper can
 * read a conversation that no longer opens has not been tested, so no answer
 * here says it can.
 */
export const CHATGPT_CONVERSATION_TOO_LONG_FAQ = [
  {
    q: 'What does "You\'ve reached the maximum length for this conversation" mean?',
    a: "ChatGPT caps how long one conversation can grow. Past that point you can keep talking only in a new chat, and the new chat starts without the old one's messages. OpenAI's help center does not publish the length, so there is no number to plan around.",
  },
  {
    q: "How do I continue a ChatGPT conversation in a new chat?",
    a: "Give the new chat the old one as a file. FileConcat Clipper, a free Chrome side panel, reads every turn of the conversation and sends it to fileconcat.com as one bundle. Set Format to Plain, download the .txt, attach it to the new chat and ask it to continue from the last turn.",
  },
  {
    q: "Can I move the conversation into a Project instead?",
    a: "Yes, and on Plus and Pro that is ChatGPT's own route: OpenAI's help center says a moved chat inherits the project's instructions and file context, and that ChatGPT can reference previous chats within a project for Plus and Pro users. A chat created with a GPT cannot be moved into a project. The file works on any plan, in Claude or Gemini too, and stays on your disk.",
  },
  {
    q: 'What if ChatGPT says "This conversation is too long, please start a new one" and the conversation will not open?',
    a: "People on OpenAI's community forum report old conversations that stop opening with this message. We have not tested the Clipper on a conversation in that state, so we cannot say it reads one. Clip a long conversation while it still opens.",
  },
  {
    q: "Will the file fit in the new chat?",
    a: "The result screen shows the file's token count before you attach it. OpenAI caps a text file at 2M tokens. Reasoning and tool activity are left out unless you turn them on in the panel, because they make the file several times larger.",
  },
  {
    q: "Does this work for Claude and Gemini conversations?",
    a: "Yes. The Clipper offers the same on a Claude conversation page and a Gemini one, and a clipped ChatGPT conversation can be attached to a Claude or Gemini chat as easily as to ChatGPT.",
  },
  {
    q: "Is my conversation uploaded anywhere?",
    a: "Not to us. The extension asks chatgpt.com for the one conversation with your own signed-in session, keeps nothing, and hands the text to the fileconcat.com tab in your browser. The only upload is the file you attach to the new chat.",
  },
];
