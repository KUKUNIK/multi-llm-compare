import type { Vendor } from "./types.js";

export interface PricingEntry {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

// Snapshot as of 2026-01-15. Refresh by editing this table.
// Source URLs:
//   openai:    https://openai.com/api/pricing/
//   anthropic: https://www.anthropic.com/pricing
//   google:    https://ai.google.dev/pricing
//   xai:       https://docs.x.ai/docs#pricing
const PRICES: Record<string, PricingEntry> = {
  "openai/gpt-4o": { inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 },
  "openai/gpt-4o-mini": { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
  "openai/gpt-4-turbo": { inputUsdPerMillion: 10, outputUsdPerMillion: 30 },
  "openai/o1": { inputUsdPerMillion: 15, outputUsdPerMillion: 60 },
  "openai/o1-mini": { inputUsdPerMillion: 3, outputUsdPerMillion: 12 },

  "anthropic/claude-3-5-sonnet": { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
  "anthropic/claude-3-5-haiku": { inputUsdPerMillion: 0.8, outputUsdPerMillion: 4 },
  "anthropic/claude-3-opus": { inputUsdPerMillion: 15, outputUsdPerMillion: 75 },
  "anthropic/claude-3-haiku": { inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.25 },

  "google/gemini-1.5-pro": { inputUsdPerMillion: 1.25, outputUsdPerMillion: 5 },
  "google/gemini-1.5-flash": { inputUsdPerMillion: 0.075, outputUsdPerMillion: 0.3 },
  "google/gemini-2.0-flash": { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 },

  "xai/grok-2": { inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
};

export function estimateCost(
  vendor: Vendor,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const cleanedModel = stripModelSuffix(modelId);
  const candidates = [
    `${vendor}/${modelId}`,
    `${vendor}/${cleanedModel}`,
  ];
  for (const key of candidates) {
    const p = PRICES[key];
    if (p) {
      return (
        (inputTokens * p.inputUsdPerMillion + outputTokens * p.outputUsdPerMillion) /
        1_000_000
      );
    }
  }
  return null;
}

function stripModelSuffix(modelId: string): string {
  // gpt-4o-2024-08-06 -> gpt-4o
  // claude-3-5-sonnet-20241022 -> claude-3-5-sonnet
  return modelId.replace(/-\d{4,8}(-\d{2})?(-\d{2})?$/, "");
}
