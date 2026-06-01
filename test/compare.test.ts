import { describe, expect, it } from "vitest";
import { compare } from "../src/lib/compare.js";
import { formatJson, formatMarkdown, formatText } from "../src/lib/format.js";
import { estimateCost } from "../src/lib/pricing.js";
import { parseTarget } from "../src/lib/registry.js";

function makeFakeFetch(responses: Record<string, { ok: boolean; body: unknown }>) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    let matched: { ok: boolean; body: unknown } | undefined;
    for (const [host, resp] of Object.entries(responses)) {
      if (url.includes(host)) {
        matched = resp;
        break;
      }
    }
    if (!matched) {
      return new Response("not mocked", { status: 500 });
    }
    return new Response(JSON.stringify(matched.body), {
      status: matched.ok ? 200 : 500,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("parseTarget", () => {
  it("parses vendor:model", () => {
    expect(parseTarget("openai:gpt-4o")).toEqual({
      vendor: "openai",
      modelId: "gpt-4o",
    });
    expect(parseTarget("anthropic:claude-3-5-sonnet-20241022")).toEqual({
      vendor: "anthropic",
      modelId: "claude-3-5-sonnet-20241022",
    });
  });

  it("rejects bad specs", () => {
    expect(() => parseTarget("gpt-4o")).toThrow(/expected/);
    expect(() => parseTarget(":")).toThrow();
    expect(() => parseTarget("unknown:foo")).toThrow(/unknown vendor/);
  });
});

describe("estimateCost", () => {
  it("computes cost for a known model", () => {
    const cost = estimateCost("openai", "gpt-4o", 1_000_000, 500_000);
    expect(cost).toBeCloseTo(2.5 + 5.0);
  });

  it("strips date suffix to match catalog entries", () => {
    const cost = estimateCost(
      "anthropic",
      "claude-3-5-sonnet-20241022",
      1_000_000,
      0,
    );
    expect(cost).toBeCloseTo(3);
  });

  it("returns null for unknown models", () => {
    expect(estimateCost("openai", "totally-fake-model-id", 1, 1)).toBeNull();
  });
});

describe("compare", () => {
  it("calls multiple providers in parallel and aggregates results", async () => {
    const fakeFetch = makeFakeFetch({
      "api.openai.com": {
        ok: true,
        body: {
          choices: [{ message: { content: "hello from openai" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        },
      },
      "api.anthropic.com": {
        ok: true,
        body: {
          content: [{ type: "text", text: "hello from anthropic" }],
          usage: { input_tokens: 12, output_tokens: 6 },
        },
      },
      "generativelanguage.googleapis.com": {
        ok: true,
        body: {
          candidates: [
            { content: { parts: [{ text: "hello from google" }] } },
          ],
          usageMetadata: {
            promptTokenCount: 14,
            candidatesTokenCount: 7,
          },
        },
      },
    });

    const summary = await compare({
      targets: [
        { vendor: "openai", modelId: "gpt-4o" },
        { vendor: "anthropic", modelId: "claude-3-5-sonnet" },
        { vendor: "google", modelId: "gemini-1.5-flash" },
      ],
      request: {
        messages: [
          { role: "system", content: "be brief" },
          { role: "user", content: "say hello" },
        ],
        maxTokens: 64,
        temperature: 0,
      },
      registry: {
        fetchImpl: fakeFetch,
        env: {
          OPENAI_API_KEY: "test",
          ANTHROPIC_API_KEY: "test",
          GOOGLE_API_KEY: "test",
        },
      },
    });

    expect(summary.results).toHaveLength(3);
    expect(summary.results.every((r) => r.status === "ok")).toBe(true);
    const openai = summary.results[0];
    if (openai.status !== "ok") throw new Error("openai should be ok");
    expect(openai.text).toBe("hello from openai");
    expect(openai.usage.inputTokens).toBe(10);
    expect(openai.costUsd).not.toBeNull();
  });

  it("captures per-provider errors without failing the batch", async () => {
    const fakeFetch = makeFakeFetch({
      "api.openai.com": {
        ok: true,
        body: {
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        },
      },
      "api.anthropic.com": {
        ok: false,
        body: { error: { message: "rate limited" } },
      },
    });

    const summary = await compare({
      targets: [
        { vendor: "openai", modelId: "gpt-4o" },
        { vendor: "anthropic", modelId: "claude-3-5-sonnet" },
      ],
      request: { messages: [{ role: "user", content: "hi" }] },
      registry: {
        fetchImpl: fakeFetch,
        env: { OPENAI_API_KEY: "t", ANTHROPIC_API_KEY: "t" },
      },
    });

    expect(summary.results[0]?.status).toBe("ok");
    expect(summary.results[1]?.status).toBe("error");
    if (summary.results[1]?.status === "error") {
      expect(summary.results[1].errorMessage).toMatch(/rate limited/);
    }
  });

  it("throws when API key env var is missing", async () => {
    await expect(
      compare({
        targets: [{ vendor: "openai", modelId: "gpt-4o" }],
        request: { messages: [{ role: "user", content: "hi" }] },
        registry: { env: {} },
      }),
    ).resolves.toMatchObject({
      results: [
        {
          status: "error",
          errorMessage: expect.stringMatching(/OPENAI_API_KEY/),
        },
      ],
    });
  });
});

describe("formatters", () => {
  const summary = {
    request: { messages: [{ role: "user" as const, content: "hi" }] },
    results: [
      {
        target: { vendor: "openai" as const, modelId: "gpt-4o" },
        status: "ok" as const,
        text: "Hello!",
        usage: { inputTokens: 5, outputTokens: 3 },
        latencyMs: 120,
        costUsd: 0.0001,
      },
    ],
    totalLatencyMs: 120,
    totalCostUsd: 0.0001,
  };

  it("formats json", () => {
    const out = formatJson(summary);
    expect(out).toContain('"vendor": "openai"');
    expect(out).toContain('"text": "Hello!"');
  });

  it("formats markdown with a table", () => {
    const out = formatMarkdown(summary);
    expect(out).toContain("| model | latency");
    expect(out).toContain("openai:gpt-4o");
    expect(out).toContain("Hello!");
  });

  it("formats text", () => {
    const out = formatText(summary, { color: false });
    expect(out).toContain("openai:gpt-4o");
    expect(out).toContain("Hello!");
    expect(out).toContain("latency: 120ms");
  });
});
