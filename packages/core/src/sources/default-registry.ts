import { createSourceRegistry } from "./registry";
import { githubAdapter } from "./adapters/github";
import { gitlabAdapter } from "./adapters/gitlab";
import { bitbucketAdapter } from "./adapters/bitbucket";
import { gistAdapter } from "./adapters/gist";
import { urlAdapter } from "./adapters/url";

/**
 * Default source registry with all built-in adapters
 * Order matters: more specific adapters first, URL adapter last (fallback)
 */
export const defaultSourceRegistry = createSourceRegistry([
  githubAdapter,
  gitlabAdapter,
  bitbucketAdapter,
  gistAdapter,
  urlAdapter, // Fallback - matches any URL
]);
