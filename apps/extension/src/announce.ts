// Tells the panel when a page has become something else.
//
// Chrome reports a tab's loads, and that is not enough twice over. A feed
// hydrates *after* `complete` — measured 2026-08-19, a subreddit holds 3 posts
// when Chrome calls it loaded and 27 a moment later — and scrolling a feed or a
// channel loads more without any navigation at all. A panel that only listens
// to Chrome describes the first of those moments forever.
//
// ponytail: a poll. The alternatives are a MutationObserver on a feed that
// mutates constantly, or each site's own events, which is a per-site contract
// to maintain. One interval reading one number is cheaper than either — but it
// does not stop itself, so it runs for the life of every tab on every page.
// Skipping the tick while the tab is hidden keeps that lifetime cheap: Chrome
// already throttles a background tab's timers, this just makes the skipped
// tick's cost zero instead of merely rare.

import { browser } from "#imports";
import type { NavSignal } from "./messages";

const EVERY_MS = 800;

/**
 * Signals whenever `describe()` changes. Sites pass their path plus however
 * many items they are offering, so both "you are somewhere else now" and "there
 * is more here now" arrive on the same channel.
 */
export function announceChanges(describe: () => string): void {
  let last: string | undefined;
  setInterval(() => {
    if (document.hidden) return;
    const current = describe();
    if (current === last) return;
    // The first reading is the page as it first settled, which the panel has
    // usually already asked about — sending it anyway costs one message and
    // covers the case where it asked too early.
    last = current;
    void browser.runtime.sendMessage({ type: "fc:nav" } satisfies NavSignal).catch(() => {});
  }, EVERY_MS);
}
