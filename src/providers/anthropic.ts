import type {
  CompareRequest,
  ProviderConfig,
  ProviderResponse,
} from "../lib/types.js";
import { BaseProvider } from "./base.js";

const DEFAULT_BASE = "https://api.anthropic.com";

interface AnthropicMessagesResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export class AnthropicProvider extends BaseProvider {
  readonly vendor = "anthropic" as const;

  constructor(config: ProviderConfig, baseUrl: string = DEFAULT_BASE) {
    super({ ...config, baseUrl: config.baseUrl ?? baseUrl }, baseUrl);
  }

  async complete(
    modelId: string,
    request: CompareRequest,
  ): Promise<ProviderResponse> {
    const systemMessages = request.messages.filter((m) => m.role === "system");
    const turnMessages = request.messages.filter((m) => m.role !== "system");
    const system = systemMessages.map((m) => m.content).join("\n\n");

    const body = {
      model: modelId,
      max_tokens: request.maxTokens ?? 1024,
      ...(system ? { system } : {}),
      messages: turnMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    };
    const url = `${this.baseUrl}/v1/messages`;
    const res = await this.withTimeout(
      this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      }),
      request.timeoutMs,
      `anthropic:${modelId}`,
    );
    const data = (await res.json()) as AnthropicMessagesResponse;
    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    }
    const text = (data.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    return {
      text,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  }
}
