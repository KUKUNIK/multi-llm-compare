import { describe, expect, it } from "vitest";
import { parseBatchJsonl } from "../src/lib/batch.js";
import { compareBatch } from "../src/lib/compare.js";

function makeFakeFetch(text: string, idTokens = 4, outTokens = 8) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    let body: unknown;
    if (url.includes("api.openai.com")) {
      body = {
        choices: [{ message: { content: text } }],
        usage: { prompt_tokens: idTokens, completion_tokens: outTokens },
      };
    } else if (url.includes("api.anthropic.com")) {
      body = {
        content: [{ type: "text", text }],
        usage: { input_tokens: idTokens, output_tokens: outTokens },
      };
    } else {
      return new Response("not mocked", { status: 500 });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("parseBatchJsonl", () => {
  it("accepts string-shorthand and object form, skipping blanks and comments", () => {
    const raw = [
      "# a comment",
      "",
      '"just a prompt"',
      '{"prompt": "explain quantum tunneling", "id": "phys-1"}',
      '{"prompt": "ping", "system": "be brief"}',
    ].join("\n");
    const items = parseBatchJsonl(raw);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ prompt: "just a prompt" });
    expect(items[1]).toEqual({
      prompt: "explain quantum tunneling",
      id: "phys-1",
    });
    expect(items[2]).toEqual({ prompt: "ping", system: "be brief" });
  });

  it("reports line numbers on invalid JSON", () => {
    const raw = [
      '{"prompt": "ok"}',
      "not json at all",
    ].join("\n");
    expect(() => parseBatchJsonl(raw)).toThrow(/line 2/);
  });

  it("rejects objects missing prompt", () => {
    expect(() => parseBatchJsonl('{"id": "x"}')).toThrow(/prompt/);
  });

  it("rejects non-string, non-object lines", () => {
    expect(() => parseBatchJsonl("42")).toThrow(/string or object/);
  });
});

describe("compareBatch", () => {
  it("runs every item through every target and aggregates totals", async () => {
    const fakeFetch = makeFakeFetch("hello");
    const batch = await compareBatch({
      targets: [
        { vendor: "openai", modelId: "gpt-4o" },
        { vendor: "anthropic", modelId: "claude-3-5-sonnet" },
      ],
      items: [
        { id: "q1", prompt: "say hi" },
        { id: "q2", prompt: "say bye", system: "be terse" },
      ],
      registry: {
        fetchImpl: fakeFetch,
        env: { OPENAI_API_KEY: "x", ANTHROPIC_API_KEY: "x" },
      },
    });

    expect(batch.results).toHaveLength(2);
    expect(batch.results[0]?.id).toBe("q1");
    expect(batch.results[1]?.id).toBe("q2");
    for (const r of batch.results) {
      expect(r.summary.results).toHaveLength(2);
      expect(r.summary.results.every((x) => x.status === "ok")).toBe(true);
    }
    expect(batch.totalCostUsd).toBeGreaterThanOrEqual(0);
  });

  it("auto-assigns ids when items have none", async () => {
    const fakeFetch = makeFakeFetch("hi");
    const batch = await compareBatch({
      targets: [{ vendor: "openai", modelId: "gpt-4o" }],
      items: [{ prompt: "a" }, { prompt: "b" }, { prompt: "c" }],
      registry: { fetchImpl: fakeFetch, env: { OPENAI_API_KEY: "x" } },
    });
    expect(batch.results.map((r) => r.id)).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ]);
  });

  it("preserves item order regardless of concurrency", async () => {
    const fakeFetch = makeFakeFetch("hi");
    const batch = await compareBatch({
      targets: [{ vendor: "openai", modelId: "gpt-4o" }],
      items: Array.from({ length: 5 }, (_, i) => ({
        id: `q${i + 1}`,
        prompt: `prompt ${i + 1}`,
      })),
      concurrency: 4,
      registry: { fetchImpl: fakeFetch, env: { OPENAI_API_KEY: "x" } },
    });
    expect(batch.results.map((r) => r.id)).toEqual([
      "q1",
      "q2",
      "q3",
      "q4",
      "q5",
    ]);
  });

  it("captures per-item provider errors without failing the batch", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      if (String(input).includes("api.anthropic.com")) {
        return new Response("upstream down", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const batch = await compareBatch({
      targets: [
        { vendor: "openai", modelId: "gpt-4o" },
        { vendor: "anthropic", modelId: "claude-3-5-sonnet" },
      ],
      items: [{ id: "q1", prompt: "x" }],
      registry: {
        fetchImpl: fakeFetch,
        env: { OPENAI_API_KEY: "k", ANTHROPIC_API_KEY: "k" },
      },
    });
    const item = batch.results[0];
    expect(item?.summary.results[0]?.status).toBe("ok");
    expect(item?.summary.results[1]?.status).toBe("error");
  });
});
