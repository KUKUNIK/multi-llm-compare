import { estimateCost } from "./pricing.js";
import { createProvider, type RegistryConfig } from "./registry.js";
import type {
  CompareRequest,
  CompareResult,
  CompareSummary,
  ModelTarget,
} from "./types.js";

export interface CompareOptions {
  targets: ModelTarget[];
  request: CompareRequest;
  registry?: RegistryConfig;
}

export async function compare(options: CompareOptions): Promise<CompareSummary> {
  const start = performance.now();
  const results = await Promise.all(
    options.targets.map((target) => runOne(target, options.request, options.registry)),
  );
  const totalLatencyMs = Math.round(performance.now() - start);
  const totalCostUsd = results.reduce((acc, r) => {
    if (r.status === "ok" && r.costUsd) return acc + r.costUsd;
    return acc;
  }, 0);

  return {
    request: options.request,
    results,
    totalLatencyMs,
    totalCostUsd,
  };
}

async function runOne(
  target: ModelTarget,
  request: CompareRequest,
  registry?: RegistryConfig,
): Promise<CompareResult> {
  const startedAt = performance.now();
  try {
    const provider = createProvider(target, registry);
    const response = await provider.complete(target.modelId, request);
    const latencyMs = Math.round(performance.now() - startedAt);
    const costUsd = estimateCost(
      target.vendor,
      target.modelId,
      response.usage.inputTokens,
      response.usage.outputTokens,
    );
    return {
      target,
      status: "ok",
      text: response.text,
      usage: response.usage,
      latencyMs,
      costUsd,
    };
  } catch (err) {
    return {
      target,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}
