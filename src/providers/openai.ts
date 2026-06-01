import type {
  CompareRequest,
  ProviderConfig,
  ProviderResponse,
} from "../lib/types.js";
import { BaseProvider } from "./base.js";

const DEFAULT_BASE = "https://api.openai.com/v1";

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAIProvider extends BaseProvider {
  readonly vendor = "openai" as const;

  constructor(config: ProviderConfig, baseUrl: string = DEFAULT_BASE) {
    super({ ...config, baseUrl: config.baseUrl ?? baseUrl }, baseUrl);
  }

  async complete(
    modelId: string,
    request: CompareRequest,
  ): Promise<ProviderResponse> {
    const body = {
      model: modelId,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    };
    const url = `${this.baseUrl}/chat/completions`;
    const res = await this.withTimeout(
      this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      }),
      request.timeoutMs,
      `openai:${modelId}`,
    );
    const data = (await res.json()) as OpenAIChatResponse;
    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    }
    const text = data.choices?.[0]?.message?.content ?? "";
    return {
      text,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
