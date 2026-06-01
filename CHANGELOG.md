# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

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
