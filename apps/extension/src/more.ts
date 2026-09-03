// Pages that hold a finite set but only put it in the DOM as you scroll: a
// channel's Videos tab, a subreddit's listing. The panel reads what the page
// has loaded, so what has never scrolled into view was never on offer.
//
// ponytail: this scrolls the real page rather than asking each site's own
// pagination endpoint. One helper covers every lazy list on every handler; the
// ceiling is that an endless feed only ever gives up ROUNDS worth of it, and
// the panel's button is pressable again for the next lot.

/** How many scrolls one press spends. About 30 rows each on YouTube. */
const ROUNDS = 12;
/** Long enough for a continuation to come back and render. */
const SETTLE_MS = 900;
/** Quiet rounds before we call it the end of the page. Two, because a single
 *  slow continuation looks exactly like the bottom. */
const QUIET_ROUNDS = 2;

/**
 * Scrolls to the bottom until `count` stops growing, then puts the page back
 * where the reader left it. Answers with the count it got to.
 */
export async function loadMore(count: () => number, rounds = ROUNDS): Promise<number> {
  const home = window.scrollY;
  let last = count();
  let quiet = 0;
  for (let round = 0; round < rounds; round++) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const now = count();
    if (now > last) {
      last = now;
      quiet = 0;
      // A hidden tab renders nothing, so its lazy list never loads and every
      // round looks like the bottom of the page. Measured: the same channel
      // gave 390 rows visible and 30 hidden. Rounds still run out, so this
      // waits rather than hangs.
    } else if (!document.hidden && ++quiet === QUIET_ROUNDS) {
      break;
    }
  }
  window.scrollTo(0, home);
  return last;
}
