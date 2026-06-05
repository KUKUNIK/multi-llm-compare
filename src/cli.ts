import { readFile } from "node:fs/promises";
import { Command } from "commander";
import kleur from "kleur";
import { parseBatchJsonl } from "./lib/batch.js";
import { compare, compareBatch } from "./lib/compare.js";
import {
  formatBatchJson,
  formatBatchMarkdown,
  formatBatchText,
  formatJson,
  formatMarkdown,
  formatText,
} from "./lib/format.js";
import { parseTarget } from "./lib/registry.js";
import type { CompareMessage } from "./lib/types.js";

const VERSION = "0.2.0";

async function readStdinIfPiped(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk.toString("utf8");
  return data.trim();
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("llm-compare")
    .description(
      "Send one prompt to multiple LLM providers and compare responses, latency, and cost.",
    )
    .version(VERSION)
    .argument("[prompt]", "user prompt text (omit to read from --prompt-file or stdin)")
    .option(
      "-p, --provider <spec>",
      'provider:model spec, repeatable (e.g. "openai:gpt-4o")',
      (value: string, prev: string[] = []) => [...prev, value],
      [] as string[],
    )
    .option("-s, --system <text>", "system prompt")
    .option("--system-file <path>", "read system prompt from file")
    .option("--prompt-file <path>", "read user prompt from file")
    .option("--max-tokens <n>", "max output tokens", "1024")
    .option("--temperature <n>", "sampling temperature")
    .option("--timeout <ms>", "per-provider timeout in ms", "60000")
    .option("--format <fmt>", "output: text | markdown | json", "text")
    .option("--full", "do not truncate text responses in text format")
    .option("--no-color", "disable ANSI colors")
    .option(
      "--batch <path>",
      "JSONL file: one prompt per line (string, or {prompt, system?, id?, maxTokens?, temperature?})",
    )
    .option(
      "--concurrency <n>",
      "for --batch, how many items to run in parallel (defaults to 1; each item still fans out to every provider in parallel)",
      "1",
    )
    .option(
      "--retries <n>",
      "retry transient provider failures per target (exponential backoff, base 100ms). 0 = no retry",
      "0",
    )
    .action(
      async (
        promptArg: string | undefined,
        opts: {
          provider: string[];
          system?: string;
          systemFile?: string;
          promptFile?: string;
          maxTokens: string;
          temperature?: string;
          timeout: string;
          format: string;
          full?: boolean;
          color: boolean;
          batch?: string;
          concurrency: string;
          retries: string;
        },
      ) => {
        if (opts.provider.length === 0) {
          fatal('at least one --provider is required (e.g. --provider openai:gpt-4o)');
          return;
        }
        const targets = opts.provider.map(parseTarget);
        const maxTokens = Number.parseInt(opts.maxTokens, 10);
        const temperature = opts.temperature
          ? Number.parseFloat(opts.temperature)
          : undefined;
        const timeoutMs = Number.parseInt(opts.timeout, 10);
        const retries = Number.parseInt(opts.retries, 10);
        if (Number.isNaN(retries) || retries < 0) {
          fatal(`bad --retries: ${opts.retries} (expected a non-negative integer)`);
          return;
        }

        if (opts.batch) {
          const concurrency = Number.parseInt(opts.concurrency, 10);
          if (Number.isNaN(concurrency) || concurrency < 1) {
            fatal(`bad --concurrency: ${opts.concurrency} (expected a positive integer)`);
            return;
          }
          const raw = await readFile(opts.batch, "utf8");
          const items = parseBatchJsonl(raw);
          if (items.length === 0) {
            fatal(`batch file "${opts.batch}" has no items`);
            return;
          }
          const systemPrompt = await resolveSystem(opts.system, opts.systemFile);
          if (systemPrompt) {
            for (const it of items) {
              if (!it.system) it.system = systemPrompt;
            }
          }
          const batch = await compareBatch({
            targets,
            items,
            concurrency,
            defaultRequest: { maxTokens, temperature, timeoutMs },
            retries,
          });
          if (opts.format === "json") {
            process.stdout.write(formatBatchJson(batch));
          } else if (opts.format === "markdown") {
            process.stdout.write(formatBatchMarkdown(batch));
          } else {
            process.stdout.write(
              formatBatchText(batch, {
                color: opts.color,
                showFullText: opts.full,
              }),
            );
          }
          const anyError = batch.results.some((r) =>
            r.summary.results.some((x) => x.status === "error"),
          );
          process.exitCode = anyError ? 1 : 0;
          return;
        }

        const userPrompt = await resolveUserPrompt(promptArg, opts.promptFile);
        const systemPrompt = await resolveSystem(opts.system, opts.systemFile);
        if (!userPrompt) {
          fatal("no user prompt provided (positional arg, --prompt-file, --batch, or stdin)");
          return;
        }

        const messages: CompareMessage[] = [];
        if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
        messages.push({ role: "user", content: userPrompt });

        const summary = await compare({
          targets,
          request: { messages, maxTokens, temperature, timeoutMs },
          retries,
        });

        if (opts.format === "json") {
          process.stdout.write(formatJson(summary));
        } else if (opts.format === "markdown") {
          process.stdout.write(formatMarkdown(summary));
        } else {
          process.stdout.write(
            formatText(summary, {
              color: opts.color,
              showFullText: opts.full,
            }),
          );
        }

        const anyError = summary.results.some((r) => r.status === "error");
        process.exitCode = anyError ? 1 : 0;
      },
    );

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    fatal(err instanceof Error ? err.message : String(err));
  }
}

async function resolveUserPrompt(
  positional: string | undefined,
  promptFile: string | undefined,
): Promise<string> {
  if (positional) return positional;
  if (promptFile) return (await readFile(promptFile, "utf8")).trim();
  return readStdinIfPiped();
}

async function resolveSystem(
  systemText: string | undefined,
  systemFile: string | undefined,
): Promise<string> {
  if (systemText) return systemText;
  if (systemFile) return (await readFile(systemFile, "utf8")).trim();
  return "";
}

function fatal(message: string): void {
  process.stderr.write(`${kleur.red("error")}: ${message}\n`);
  process.exitCode = 2;
}

main();
