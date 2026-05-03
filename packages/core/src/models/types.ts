/**
 * models.dev API Type Definitions
 * API: https://models.dev/api.json
 */

/** Input/Output modaliteleri */
export type Modality = "text" | "image" | "audio" | "video" | "pdf";

/** Model yetenekleri */
export interface ModelCapabilities {
  /** Dosya/gorsel ekleme destegi */
  attachment: boolean;
  /** Reasoning/chain-of-thought destegi */
  reasoning: boolean;
  /** Tool/function calling destegi */
  tool_call: boolean;
  /** Structured output (JSON mode) destegi */
  structured_output?: boolean;
  /** Temperature parametresi destegi */
  temperature: boolean;
}

/** Model maliyet bilgisi (per 1M tokens) */
export interface ModelCost {
  /** Input token maliyeti (USD per 1M tokens) */
  input: number;
  /** Output token maliyeti (USD per 1M tokens) */
  output: number;
  /** Cache read maliyeti (opsiyonel) */
  cache_read?: number;
  /** Audio input maliyeti (opsiyonel) */
  input_audio?: number;
  /** Audio output maliyeti (opsiyonel) */
  output_audio?: number;
  /** 200K+ context icin farkli fiyatlandirma */
  context_over_200k?: {
    input: number;
    output: number;
    cache_read?: number;
  };
}

/** Model limit bilgisi */
export interface ModelLimits {
  /** Maksimum context window (tokens) */
  context: number;
  /** Maksimum output tokens */
  output: number;
}

/** Model modality bilgisi */
export interface ModelModalities {
  /** Desteklenen input modalities */
  input: Modality[];
  /** Desteklenen output modalities */
  output: Modality[];
}

/** Tek bir AI modeli */
export interface AIModel {
  /** Model ID (e.g., "gpt-4o", "claude-3-5-sonnet") */
  id: string;
  /** Model display name */
  name: string;
  /** Model family (e.g., "gpt", "claude", "gemini") */
  family?: string;
  /** Model yetenekleri */
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
  structured_output?: boolean;
  temperature: boolean;
  /** Knowledge cutoff date (YYYY-MM format) */
  knowledge?: string;
  /** Release date (YYYY-MM-DD format) */
  release_date?: string;
  /** Last updated date (YYYY-MM-DD format) */
  last_updated?: string;
  /** Input/output modalities */
  modalities: ModelModalities;
  /** Open weights model mi */
  open_weights: boolean;
  /** Maliyet bilgisi */
  cost: ModelCost;
  /** Token limitleri */
  limit: ModelLimits;
}

/** AI Provider (e.g., OpenAI, Anthropic, Google) */
export interface AIProvider {
  /** Provider ID (e.g., "openai", "anthropic") */
  id: string;
  /** Provider display name */
  name: string;
  /** Environment variables for API key */
  env: string[];
  /** npm package for AI SDK */
  npm?: string;
  /** API endpoint (eger ozel ise) */
  api?: string;
  /** Documentation URL */
  doc?: string;
  /** Provider'a ait modeller */
  models: Record<string, AIModel>;
}

/** models.dev API response type */
export type ModelsDevAPIResponse = Record<string, AIProvider>;

/** Filtrelenmis ve normalize edilmis model registry */
export interface ModelsRegistry {
  /** Tum provider'lar */
  providers: Record<string, AIProvider>;
  /** Son guncelleme zamani */
  lastUpdated: string;
  /** Toplam model sayisi */
  totalModels: number;
  /** Sadece text destekleyen modeller (filtered) */
  textModels: FilteredModel[];
}

/** Filtered model (UI icin basitlestirilmis) */
export interface FilteredModel {
  /** Unique identifier: providerId/modelId */
  uid: string;
  /** Model ID */
  id: string;
  /** Model display name */
  name: string;
  /** Provider ID */
  providerId: string;
  /** Provider display name */
  providerName: string;
  /** Context limit (tokens) */
  contextLimit: number;
  /** Output limit (tokens) */
  outputLimit: number;
  /** Input cost (USD per 1M tokens) */
  inputCost: number;
  /** Output cost (USD per 1M tokens) */
  outputCost: number;
  /** Reasoning destegi var mi */
  hasReasoning: boolean;
  /** Tool call destegi var mi */
  hasToolCall: boolean;
}

/** Cost estimation result */
export interface CostEstimate {
  /** Tahmini input maliyeti (USD) */
  inputCost: number;
  /** Tahmini output maliyeti (USD) */
  outputCost: number;
  /** Toplam tahmini maliyet (USD) */
  totalCost: number;
  /** Kullanilan model */
  model: FilteredModel;
  /** Input token sayisi */
  inputTokens: number;
  /** Tahmini output token sayisi */
  estimatedOutputTokens: number;
}
