export { compare } from "./lib/compare.js";
export type { CompareOptions } from "./lib/compare.js";
export { createProvider, parseTarget } from "./lib/registry.js";
export type { RegistryConfig } from "./lib/registry.js";
export { estimateCost } from "./lib/pricing.js";
export type { PricingEntry } from "./lib/pricing.js";
export { formatJson, formatMarkdown, formatText } from "./lib/format.js";
export type {
  CompareMessage,
  CompareRequest,
  CompareResult,
  CompareResultErr,
  CompareResultOk,
  CompareSummary,
  ModelTarget,
  ProviderConfig,
  ProviderResponse,
  ProviderUsage,
  Vendor,
} from "./lib/types.js";

export { BaseProvider } from "./providers/base.js";
export { OpenAIProvider } from "./providers/openai.js";
export { AnthropicProvider } from "./providers/anthropic.js";
export { GoogleProvider } from "./providers/google.js";
export { XaiProvider } from "./providers/xai.js";
