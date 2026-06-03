# multi-llm-compare

[![CI](https://github.com/KUKUNIK/multi-llm-compare/actions/workflows/ci.yml/badge.svg)](https://github.com/KUKUNIK/multi-llm-compare/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/multi-llm-compare.svg)](https://www.npmjs.com/package/multi-llm-compare)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Send one prompt to multiple LLM providers in parallel and see the responses, latency, and estimated cost side by side.

```
$ llm-compare "Write a haiku about TypeScript." \
    -p openai:gpt-4o-mini \
    -p anthropic:claude-3-5-haiku \
    -p google:gemini-1.5-flash

=== openai:gpt-4o-mini ===
  latency: 481ms · tokens in/out: 13/24 · cost: $0.0000164

  Types tighten loose code
  ...

=== anthropic:claude-3-5-haiku ===
  ...

(wall-clock 1140ms across 3 model(s); total cost $0.000071)
```

Supports **OpenAI**, **Anthropic**, **Google Gemini**, and **xAI Grok**. Works with their public APIs directly — no SDK dependencies, no proxy layer.

> Status: `0.2.0` — usable, but the CLI flags and JSON shape may shift before `1.0`.

## Why

You're picking between models. The right answer almost always depends on **your** workload, not on benchmarks. So you want to throw your actual prompt at three or four candidates, line up the responses, and decide.

`multi-llm-compare` does exactly that. No SDK, no framework, no chat UI to log into. One CLI command, one library function.

## Install

```bash
npm install -g multi-llm-compare
# or
pnpm add -g multi-llm-compare
```

Requires Node 18+ (uses the built-in `fetch`).

## Setup

This package never reads or writes secrets to disk. It only reads API keys from `process.env` at runtime. Set whichever providers you want to compare:

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...
export XAI_API_KEY=xai-...
```

You can also copy [`.env.example`](./.env.example) to `.env` and `source` it. **The `.env` file is in `.gitignore` — never commit it.**

You only need keys for the providers you actually compare. Missing a key just reports an error for that one row; the rest still run.

## CLI usage

```bash
llm-compare "<prompt>" \
  -p openai:gpt-4o \
  -p anthropic:claude-3-5-sonnet \
  -p google:gemini-1.5-pro \
  [--system <text>]
  [--system-file <path>]
  [--prompt-file <path>]            # or pipe the prompt on stdin
  [--max-tokens 1024]
  [--temperature 0.7]
  [--timeout 60000]
  [--format text|markdown|json]
  [--full]                          # don't truncate text output
  [--no-color]
  [--batch prompts.jsonl]           # run many prompts through the same panel
  [--concurrency 1]                 # how many batch items run in parallel
```

Provider specs look like `vendor:model-id`. Examples:

- `openai:gpt-4o`, `openai:gpt-4o-mini`, `openai:o1-mini`
- `anthropic:claude-3-5-sonnet-20241022`, `anthropic:claude-3-5-haiku`
- `google:gemini-1.5-pro`, `google:gemini-1.5-flash`, `google:gemini-2.0-flash`
- `xai:grok-2`

If a model id includes a date suffix (e.g. `claude-3-5-sonnet-20241022`) the cost estimator strips it back to the catalog entry. Unknown models still run; you just get `cost: n/a`.

### Examples

```bash
# Markdown output (great for a writeup or a PR comment)
llm-compare "explain the Y combinator" \
  -p openai:gpt-4o-mini \
  -p anthropic:claude-3-5-haiku \
  --format markdown > comparison.md

# Pipe a long prompt
cat prompt.txt | llm-compare \
  -p openai:gpt-4o \
  -p anthropic:claude-3-5-sonnet \
  --max-tokens 2000

# System prompt + JSON output for downstream tooling
llm-compare "extract the action items" \
  --system "You are a meeting notes summarizer." \
  -p openai:gpt-4o-mini \
  -p google:gemini-1.5-flash \
  --format json | jq '.results[] | {model: .target.modelId, text}'
```

### Batch mode

If you want to run the same set of models against **many prompts** —
a regression test, a small eval set, a "how does each model answer
my top 20 support tickets" — point `--batch` at a JSON-Lines file:

```jsonl
# eval.jsonl  (lines starting with # are ignored)
{"id": "math-1", "prompt": "What is 17 * 23?"}
{"id": "code-1", "prompt": "Refactor this loop to use map.", "system": "Reply with code only."}
"a bare string works too — it becomes the prompt"
```

```bash
llm-compare \
  -p openai:gpt-4o-mini \
  -p anthropic:claude-3-5-haiku \
  --batch eval.jsonl \
  --concurrency 2 \
  --format markdown > eval-report.md
```

Each line is one item. Each item fans out to every `-p` provider, so the
underlying provider call count is `items × providers`. `--concurrency`
controls how many items are in flight at once; default `1` keeps it
provider-friendly. The output is one section per item plus a totals
footer.

## Library usage

```ts
import { compare } from "multi-llm-compare";

const summary = await compare({
  targets: [
    { vendor: "openai", modelId: "gpt-4o-mini" },
    { vendor: "anthropic", modelId: "claude-3-5-haiku" },
  ],
  request: {
    messages: [
      { role: "system", content: "Be concise." },
      { role: "user", content: "Why is the sky blue?" },
    ],
    maxTokens: 200,
    temperature: 0.3,
  },
});

for (const r of summary.results) {
  if (r.status === "ok") {
    console.log(`${r.target.vendor}:${r.target.modelId}  ${r.latencyMs}ms  $${r.costUsd}`);
    console.log(r.text);
  } else {
    console.error(`${r.target.vendor}:${r.target.modelId} failed:`, r.errorMessage);
  }
}
```

You can inject a custom `fetch` (for proxies, tests, or rate-limiters) via the registry config:

```ts
import { compare } from "multi-llm-compare";

await compare({
  targets: [...],
  request: {...},
  registry: {
    env: { OPENAI_API_KEY: process.env.MY_OPENAI_KEY },
    fetchImpl: myWrappedFetch,
  },
});
```

## What it returns

```ts
type CompareSummary = {
  request: CompareRequest;
  results: CompareResult[];        // one per target, same order
  totalLatencyMs: number;          // wall-clock for the whole batch
  totalCostUsd: number;
};

type CompareResult =
  | { target, status: "ok",    text, usage, latencyMs, costUsd }
  | { target, status: "error", errorMessage, latencyMs };
```

`CompareResult` is a discriminated union — TypeScript narrows it correctly on `status`.

## Costs are estimates

The cost catalog is a frozen snapshot (`asOf: 2026-01-15`). Prices change frequently. Use the numbers as a rough ranking, not a billing record. For accurate live numbers, query your provider's usage dashboard.

Unknown model ids return `costUsd: null` rather than throwing.

## Security notes

- API keys are only read from `process.env`. They are never written to disk, never echoed, never included in JSON output. Even error messages from providers are passed through verbatim — be careful with `--format json` if your environment has strict logging.
- The `.env` file pattern (`.env`, `.env.*` except `.env.example`) is in `.gitignore`. If you fork this repo, double-check before committing.
- All HTTP requests go directly to the vendor URLs (or whatever `*_BASE_URL` env var you set). There is no telemetry, no analytics, no proxy.

## License

MIT
