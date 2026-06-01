import { AnthropicProvider } from "../providers/anthropic.js";
import type { BaseProvider } from "../providers/base.js";
import { GoogleProvider } from "../providers/google.js";
import { OpenAIProvider } from "../providers/openai.js";
import { XaiProvider } from "../providers/xai.js";
import type { ModelTarget, Vendor } from "./types.js";

const ENV_KEY_FOR_VENDOR: Record<Vendor, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
};

const ENV_BASE_URL_FOR_VENDOR: Record<Vendor, string> = {
  openai: "OPENAI_BASE_URL",
  anthropic: "ANTHROPIC_BASE_URL",
  google: "GOOGLE_BASE_URL",
  xai: "XAI_BASE_URL",
};

const VALID_VENDORS = new Set<Vendor>(["openai", "anthropic", "google", "xai"]);

export function parseTarget(spec: string): ModelTarget {
  const idx = spec.indexOf(":");
  if (idx <= 0 || idx === spec.length - 1) {
    throw new Error(
      `bad provider spec "${spec}" — expected "<vendor>:<model-id>"`,
    );
  }
  const vendor = spec.slice(0, idx) as Vendor;
  if (!VALID_VENDORS.has(vendor)) {
    throw new Error(
      `unknown vendor "${vendor}" (expected: ${[...VALID_VENDORS].join(", ")})`,
    );
  }
  const modelId = spec.slice(idx + 1);
  return { vendor, modelId };
}

export interface RegistryConfig {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export function createProvider(
  target: ModelTarget,
  config: RegistryConfig = {},
): BaseProvider {
  const env = config.env ?? process.env;
  const apiKey = env[ENV_KEY_FOR_VENDOR[target.vendor]];
  if (!apiKey) {
    throw new Error(
      `missing env var ${ENV_KEY_FOR_VENDOR[target.vendor]} for vendor ${target.vendor}`,
    );
  }
  const baseUrl = env[ENV_BASE_URL_FOR_VENDOR[target.vendor]];
  const cfg = {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
  };
  switch (target.vendor) {
    case "openai":
      return new OpenAIProvider(cfg);
    case "anthropic":
      return new AnthropicProvider(cfg);
    case "google":
      return new GoogleProvider(cfg);
    case "xai":
      return new XaiProvider(cfg);
  }
}
