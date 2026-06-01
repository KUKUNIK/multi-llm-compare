import { readFile } from "node:fs/promises";
import { Command } from "commander";
import kleur from "kleur";
import { compare } from "./lib/compare.js";
import { formatJson, formatMarkdown, formatText } from "./lib/format.js";
import { parseTarget } from "./lib/registry.js";
import type { CompareMessage } from "./lib/types.js";

const VERSION = "0.1.0";

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
        },
      ) => {
        if (opts.provider.length === 0) {
          fatal('at least one --provider is required (e.g. --provider openai:gpt-4o)');
          return;
        }
        const targets = opts.provider.map(parseTarget);
        const userPrompt = await resolveUserPrompt(promptArg, opts.promptFile);
        const systemPrompt = await resolveSystem(opts.system, opts.systemFile);
        if (!userPrompt) {
          fatal("no user prompt provided (positional arg, --prompt-file, or stdin)");
          return;
        }

        const messages: CompareMessage[] = [];
        if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
        messages.push({ role: "user", content: userPrompt });

        const summary = await compare({
          targets,
          request: {
            messages,
            maxTokens: Number.parseInt(opts.maxTokens, 10),
            temperature: opts.temperature
              ? Number.parseFloat(opts.temperature)
              : undefined,
            timeoutMs: Number.parseInt(opts.timeout, 10),
          },
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
