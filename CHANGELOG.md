# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added

- `--retries <n>` (CLI) / `retries`, `retryBaseMs` (library) for per-target
  retry on transient provider failures. Exponential backoff
  `retryBaseMs * 2^attempt`, default `retryBaseMs = 100`. After exhausting
  the budget the error message is suffixed with `(after K attempts)`.
- Tests covering successful retry, exhausted retry, and default `retries=0`
  no-retry behaviour.

## [0.2.0] - 2026-06-03

### Added

- **Batch mode.** `--batch <file>` runs a JSONL file of prompts through
  the same set of providers. Each line is either a bare string (treated
  as the prompt) or an object with `prompt`, `id`, `system`, `maxTokens`,
  `temperature`. Lines beginning with `#` and blank lines are skipped.
- `--concurrency <n>` (default `1`) controls how many batch items are in
  flight at once. Each item still fans out to every provider in parallel,
  so the worst case is `concurrency × providers` simultaneous calls.
- Library exports: `compareBatch`, `parseBatchJsonl`,
  `formatBatchText` / `formatBatchMarkdown` / `formatBatchJson`, and the
  `BatchItem` / `BatchOptions` / `BatchResult` / `BatchSummary` types.

### Changed

- CLI version bumped to `0.2.0`. The single-prompt path is untouched and
  fully backwards-compatible.

## [0.1.0] - 2026-06-01

### Added

- Initial release.
- Direct REST clients (no SDK dependencies) for four vendors:
  - **OpenAI** Chat Completions API
  - **Anthropic** Messages API
  - **Google** Gemini `generateContent`
  - **xAI** (OpenAI-compatible)
- `compare()` runs all targets concurrently with `Promise.all` and returns a `CompareSummary` with per-provider results, latency, token usage, and estimated cost.
- Per-request timeout enforced via wrapper (default 60s, override with `--timeout`).
- Output formats: `text` (default), `markdown` (table + per-model sections), `json`.
- `llm-compare` CLI with positional prompt, `--prompt-file`, or stdin.
- System prompt support via `--system` or `--system-file`.
- Override base URLs through `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` / `GOOGLE_BASE_URL` / `XAI_BASE_URL` env vars (useful for Azure OpenAI, proxies, self-hosted endpoints).

### Security

- API keys are read from `process.env` only. The package never writes keys to disk, never logs them, and never includes them in JSON output.
- The `.env.example` file is committed; `.env` and `.env.*` are gitignored.

### Pricing

- Bundled price catalog (`asOf: 2026-01-15`) covering the four supported vendors. Unknown models return `costUsd: null` rather than throwing.
- Date-suffixed model IDs (e.g. `claude-3-5-sonnet-20241022`) are normalized to their catalog entries.
