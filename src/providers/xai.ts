import type {
  CompareRequest,
  ProviderConfig,
  ProviderResponse,
} from "../lib/types.js";
import { BaseProvider } from "./base.js";
import { OpenAIProvider } from "./openai.js";

const DEFAULT_BASE = "https://api.x.ai/v1";

export class XaiProvider extends BaseProvider {
  readonly vendor = "xai" as const;
  private readonly delegate: OpenAIProvider;

  constructor(config: ProviderConfig) {
    super({ ...config, baseUrl: config.baseUrl ?? DEFAULT_BASE }, DEFAULT_BASE);
    this.delegate = new OpenAIProvider({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      fetchImpl: this.fetchImpl,
    });
  }

  complete(modelId: string, request: CompareRequest): Promise<ProviderResponse> {
    return this.delegate.complete(modelId, request);
  }
}
