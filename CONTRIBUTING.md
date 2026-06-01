# Contributing

Thanks for considering a contribution.

## Setup

```bash
git clone https://github.com/KUKUNIK/multi-llm-compare
cd multi-llm-compare
npm install
npm test
```

The test suite uses a mocked `fetch` and never calls real provider APIs — you do not need any API keys to run tests.

## Development loop

```bash
npm run typecheck
npm test
npm run build
```

CI runs typecheck → test → build on Node 18, 20, and 22.

## Adding a new provider

Each provider lives in `src/providers/<vendor>.ts` and extends `BaseProvider`:

1. Add the vendor to `Vendor` in `src/lib/types.ts`.
2. Create the provider class.
3. Register it in `src/lib/registry.ts` (`createProvider` switch, env key map, base URL map).
4. Add a price entry in `src/lib/pricing.ts` if the vendor publishes per-token pricing.
5. Update the README's "Provider specs" section.
6. Add a test using `makeFakeFetch` in `test/compare.test.ts`.

Prefer **direct REST calls with built-in `fetch`** over a vendor SDK. SDKs add transitive deps, churn through versions, and obscure the request/response shape — none of which fit a small comparison tool.

## Security expectations

Anything that touches API keys gets extra scrutiny:

- Keys live in `process.env` only. They must never be written to disk, logged, or echoed.
- The `.env.example` file is committed; `.env` files of any flavor are gitignored.
- Error messages from providers are passed through verbatim. If a provider ever started embedding the key in its error responses, we'd need a sanitization step — open an issue if you spot this.

## What we are cautious about

- Streaming / SSE responses. The compare-then-show flow doesn't fit streams cleanly.
- Function calling / tool use. Out of scope for a "send one prompt, get one response" tool.

## Process

1. Open an issue first for non-trivial changes.
2. One change per PR.
3. CI must be green.
