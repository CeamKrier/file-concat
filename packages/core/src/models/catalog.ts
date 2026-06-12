import { canonicalModelKey } from "./dedup";
import type {
  AIModel,
  AIProvider,
  CatalogResponse,
  FilteredModel,
  ModelModalities,
} from "./types";

export interface BuildTextModelsOptions {
  /** Drop canonical models whose context window falls below this. Default 16384. */
  minContextLimit?: number;
}

interface Offering {
  providerId: string;
  providerName: string;
  modelId: string;
  model: AIModel;
}

function isTextTextModel(model: { modalities?: ModelModalities }): boolean {
  return Boolean(
    model.modalities?.input?.includes("text") &&
      model.modalities?.output?.includes("text"),
  );
}

function totalCost(model: AIModel): number {
  if (!model.cost) return Number.POSITIVE_INFINITY;
  return model.cost.input + model.cost.output;
}

function hasNonZeroCost(model: AIModel): boolean {
  return Boolean(model.cost && (model.cost.input > 0 || model.cost.output > 0));
}

function buildOfferingIndex(
  providers: Record<string, AIProvider>,
): Map<string, Offering[]> {
  const byName = new Map<string, Offering[]>();
  for (const [providerId, provider] of Object.entries(providers)) {
    if (!provider.models) continue;
    for (const [modelId, model] of Object.entries(provider.models)) {
      const key = canonicalModelKey(model.name);
      if (!key) continue;
      const offering: Offering = {
        providerId,
        providerName: provider.name,
        modelId,
        model,
      };
      const bucket = byName.get(key);
      if (bucket) bucket.push(offering);
      else byName.set(key, [offering]);
    }
  }
  return byName;
}

/**
 * Walk the canonical catalog model list and, for each model, pick the
 * cheapest text-text provider offering. Catalog `models` is already
 * provider-agnostic (one entry per published model) so no post-hoc dedup
 * is needed: the join itself produces a clean list.
 *
 * Models that have no priced text-text offering are dropped. Models below
 * `minContextLimit` are dropped (the workflow targets long-context bundles).
 *
 * The returned list is sorted by `release_date` descending, so the most
 * recently released model shows up at the top of any UI that respects the
 * input order.
 */
export function buildTextModelsFromCatalog(
  catalog: CatalogResponse,
  options: BuildTextModelsOptions = {},
): FilteredModel[] {
  const minContextLimit = options.minContextLimit ?? 16384;
  const offeringsByName = buildOfferingIndex(catalog.providers ?? {});
  const out: FilteredModel[] = [];

  for (const canonical of Object.values(catalog.models ?? {})) {
    if (!isTextTextModel(canonical)) continue;
    if (!canonical.limit?.context || canonical.limit.context < minContextLimit) {
      continue;
    }

    const key = canonicalModelKey(canonical.name);
    const offerings = offeringsByName.get(key) ?? [];
    const priced = offerings.filter(
      (o) => isTextTextModel(o.model) && hasNonZeroCost(o.model),
    );
    if (priced.length === 0) continue;

    priced.sort((a, b) => {
      const diff = totalCost(a.model) - totalCost(b.model);
      if (diff !== 0) return diff;
      // Tie-break by larger context, then by provider id for determinism.
      const aCtx = a.model.limit?.context ?? 0;
      const bCtx = b.model.limit?.context ?? 0;
      if (aCtx !== bCtx) return bCtx - aCtx;
      return a.providerId.localeCompare(b.providerId);
    });
    const cheapest = priced[0];

    out.push({
      uid: canonical.id,
      name: canonical.name,
      providerId: cheapest.providerId,
      providerName: cheapest.providerName,
      contextLimit: canonical.limit.context,
      outputLimit: canonical.limit.output,
      inputCost: cheapest.model.cost!.input,
      outputCost: cheapest.model.cost!.output,
      hasReasoning: canonical.reasoning,
      hasToolCall: canonical.tool_call,
      releaseDate: canonical.release_date,
    });
  }

  out.sort((a, b) => {
    // Newest first. Missing dates sink to the bottom.
    const aDate = a.releaseDate ?? "";
    const bDate = b.releaseDate ?? "";
    if (aDate === bDate) return a.name.localeCompare(b.name);
    if (!aDate) return 1;
    if (!bDate) return -1;
    return bDate.localeCompare(aDate);
  });

  return out;
}
