import type {
  CompareRequest,
  ProviderConfig,
  ProviderResponse,
  Vendor,
} from "../lib/types.js";

export abstract class BaseProvider {
  abstract readonly vendor: Vendor;
  protected readonly apiKey: string;
  protected readonly baseUrl: string;
  protected readonly fetchImpl: typeof fetch;

  constructor(config: ProviderConfig, defaultBaseUrl: string) {
    if (!config.apiKey) {
      throw new Error("apiKey is required");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? defaultBaseUrl).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  abstract complete(
    modelId: string,
    request: CompareRequest,
  ): Promise<ProviderResponse>;

  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number | undefined,
    label: string,
  ): Promise<T> {
    if (!timeoutMs) return promise;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      promise.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (err) => {
          clearTimeout(t);
          reject(err);
        },
      );
    });
  }
}
