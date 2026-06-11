import { createSourceRegistry } from "./registry";
import { githubAdapter } from "./adapters/github";
import { gitlabAdapter } from "./adapters/gitlab";
import { bitbucketAdapter } from "./adapters/bitbucket";
import { gistAdapter } from "./adapters/gist";
import { urlAdapter } from "./adapters/url";

/**
 * Default source registry. The registry sorts adapters by `priority`, so
 * specific adapters always win over `urlAdapter` regardless of insertion
 * order. Adapter order in this list is presentational only.
 */
export const defaultSourceRegistry = createSourceRegistry([
  githubAdapter,
  gitlabAdapter,
  bitbucketAdapter,
  gistAdapter,
  urlAdapter,
]);
