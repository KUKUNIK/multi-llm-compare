import type {
  CompareRequest,
  ProviderConfig,
  ProviderResponse,
} from "../lib/types.js";
import { BaseProvider } from "./base.js";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GoogleResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string };
}

export class GoogleProvider extends BaseProvider {
  readonly vendor = "google" as const;

  constructor(config: ProviderConfig, baseUrl: string = DEFAULT_BASE) {
    super({ ...config, baseUrl: config.baseUrl ?? baseUrl }, baseUrl);
  }

  async complete(
    modelId: string,
    request: CompareRequest,
  ): Promise<ProviderResponse> {
    const systemContent = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body = {
      contents,
      ...(systemContent
        ? { systemInstruction: { parts: [{ text: systemContent }] } }
        : {}),
      generationConfig: {
        ...(request.maxTokens
          ? { maxOutputTokens: request.maxTokens }
          : {}),
        ...(request.temperature !== undefined
          ? { temperature: request.temperature }
          : {}),
      },
    };

    const url = `${this.baseUrl}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await this.withTimeout(
      this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      request.timeoutMs,
      `google:${modelId}`,
    );
    const data = (await res.json()) as GoogleResponse;
    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    }
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    return {
      text,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}
