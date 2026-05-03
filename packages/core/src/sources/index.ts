// Types
export type {
  SourceType,
  SourceMeta,
  ParsedSourceUrl,
  FetchOptions,
  SourceAdapter,
  SourceRegistry,
} from "./types";

// Metadata
export { SOURCE_METADATA, getSourceMeta, getRemoteSourceTypes } from "./metadata";

// Registry
export { createSourceRegistry } from "./registry";

// Adapters
export {
  githubAdapter,
  gitlabAdapter,
  bitbucketAdapter,
  gistAdapter,
  urlAdapter,
} from "./adapters";

// Default registry
export { defaultSourceRegistry } from "./default-registry";
