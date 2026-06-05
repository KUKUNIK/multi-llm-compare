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
  /**
   * Per-target retry attempts on provider failure (network/5xx/timeout).
   * `retries: 2` means up to 3 attempts total. Defaults to 0 (no retry).
   * Backoff is exponential: `retryBaseMs * 2^attempt`.
   */
  retries?: number;
  /** Backoff base in ms. Defaults to 100. Exposed mainly for tests. */
  retryBaseMs?: number;
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
  /** See {@link CompareOptions.retries}. Forwarded to each per-item `compare()` call. */
  retries?: number;
  /** See {@link CompareOptions.retryBaseMs}. */
  retryBaseMs?: number;
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
      retries: options.retries,
      retryBaseMs: options.retryBaseMs,
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
    options.targets.map((target) =>
      runOne(
        target,
        options.request,
        options.registry,
        options.retries ?? 0,
        options.retryBaseMs ?? 100,
      ),
    ),
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
  registry: RegistryConfig | undefined,
  retries: number,
  retryBaseMs: number,
): Promise<CompareResult> {
  const startedAt = performance.now();
  const maxAttempts = Math.max(1, retries + 1);
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await sleep(retryBaseMs * 2 ** attempt);
      }
    }
  }
  const base = lastError instanceof Error ? lastError.message : String(lastError);
  return {
    target,
    status: "error",
    errorMessage:
      maxAttempts > 1 ? `${base} (after ${maxAttempts} attempts)` : base,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
