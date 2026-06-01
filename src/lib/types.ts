export type Vendor = "openai" | "anthropic" | "google" | "xai";

export interface ModelTarget {
  vendor: Vendor;
  modelId: string;
}

export interface CompareMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompareRequest {
  messages: CompareMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResponse {
  text: string;
  usage: ProviderUsage;
  raw?: unknown;
}

export interface CompareResultOk {
  target: ModelTarget;
  status: "ok";
  text: string;
  usage: ProviderUsage;
  latencyMs: number;
  costUsd: number | null;
}

export interface CompareResultErr {
  target: ModelTarget;
  status: "error";
  errorMessage: string;
  latencyMs: number;
}

export type CompareResult = CompareResultOk | CompareResultErr;

export interface CompareSummary {
  request: CompareRequest;
  results: CompareResult[];
  totalLatencyMs: number;
  totalCostUsd: number;
}
