import { DEFAULT_IGNORE_PATTERNS } from "../default-ignore";
import { pathMatches } from "./glob-match";

/**
 * Skip-test for `DEFAULT_IGNORE_PATTERNS` using the canonical
 * {@link pathMatches} "matches anywhere in the path" semantics.
 */
export const shouldSkipPath = (path: string): boolean =>
  DEFAULT_IGNORE_PATTERNS.some((pattern) => pathMatches(path, pattern));
