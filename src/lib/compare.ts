import { estimateCost } from "./pricing.js";
import { createProvider, type RegistryConfig } from "./registry.js";
import type {
  CompareMessage,
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

export interface BatchItem {
  id?: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface BatchOptions {
  targets: ModelTarget[];
  items: BatchItem[];
  registry?: RegistryConfig;
  /**
   * How many batch items to run in parallel. Each item still fans out to
   * all targets concurrently inside `compare`, so the effective worst-case
   * concurrent provider calls is `concurrency * targets.length`. Defaults
   * to `1` to be friendly to provider rate limits.
   */
  concurrency?: number;
  defaultRequest?: Pick<CompareRequest, "maxTokens" | "temperature" | "timeoutMs">;
}

export interface BatchResult {
  id: string;
  prompt: string;
  summary: CompareSummary;
}

export interface BatchSummary {
  results: BatchResult[];
  totalLatencyMs: number;
  totalCostUsd: number;
}

export async function compareBatch(
  options: BatchOptions,
): Promise<BatchSummary> {
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const start = performance.now();
  const results = new Array<BatchResult>(options.items.length);
  let cursor = 0;

  const runOneItem = async (index: number): Promise<void> => {
    const item = options.items[index];
    if (!item) return;
    const messages: CompareMessage[] = [];
    if (item.system) messages.push({ role: "system", content: item.system });
    messages.push({ role: "user", content: item.prompt });
    const summary = await compare({
      targets: options.targets,
      registry: options.registry,
      request: {
        messages,
        maxTokens: item.maxTokens ?? options.defaultRequest?.maxTokens,
        temperature: item.temperature ?? options.defaultRequest?.temperature,
        timeoutMs: options.defaultRequest?.timeoutMs,
      },
    });
    results[index] = {
      id: item.id ?? `item-${index + 1}`,
      prompt: item.prompt,
      summary,
    };
  };

  const workers = Array.from({ length: Math.min(concurrency, options.items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= options.items.length) return;
      await runOneItem(i);
    }
  });
  await Promise.all(workers);

  const totalLatencyMs = Math.round(performance.now() - start);
  const totalCostUsd = results.reduce((acc, r) => acc + (r?.summary.totalCostUsd ?? 0), 0);
  return {
    results: results.filter(Boolean),
    totalLatencyMs,
    totalCostUsd,
  };
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
