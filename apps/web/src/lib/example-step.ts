import { track } from "./metrics";

/**
 * The Express example on the Claude upload-limit page (Q190): `seen` when half
 * its one-file panel is in view, at most once per page load. The band has nothing to
 * click; whether the same load went on to try its own files is the existing
 * tried row under the same page id.
 */
export type ExampleStep = "seen";

const sent = new Set<ExampleStep>();

export function recordExampleStep(step: ExampleStep): void {
  if (sent.has(step)) return;
  sent.add(step);
  track("example_step", step);
}

/** Test hook: a fresh page load. */
export function resetExampleStepsForTest(): void {
  sent.clear();
}
