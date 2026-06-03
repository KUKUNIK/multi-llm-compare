import kleur from "kleur";
import type { BatchSummary } from "./compare.js";
import type { CompareResult, CompareSummary } from "./types.js";

export interface FormatOptions {
  color?: boolean;
  showFullText?: boolean;
}

function targetLabel(r: CompareResult): string {
  return `${r.target.vendor}:${r.target.modelId}`;
}

function fmtUsd(n: number | null): string {
  if (n === null) return "n/a";
  if (n === 0) return "$0";
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  return `$${n.toFixed(6)}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

export function formatText(
  summary: CompareSummary,
  opts: FormatOptions = {},
): string {
  const useColor = opts.color !== false && Boolean(process.stdout.isTTY);
  const c = (fn: (s: string) => string, s: string) => (useColor ? fn(s) : s);
  const lines: string[] = [];

  for (const r of summary.results) {
    lines.push(c((s) => kleur.cyan().bold(s), `=== ${targetLabel(r)} ===`));
    if (r.status === "error") {
      lines.push(c((s) => kleur.red(s), `  error: ${r.errorMessage}`));
      lines.push(`  latency: ${r.latencyMs}ms`);
      lines.push("");
      continue;
    }
    lines.push(
      `  latency: ${r.latencyMs}ms  ·  tokens in/out: ${r.usage.inputTokens}/${r.usage.outputTokens}  ·  cost: ${fmtUsd(r.costUsd)}`,
    );
    lines.push("");
    lines.push(opts.showFullText ? r.text : truncate(r.text, 600));
    lines.push("");
  }

  lines.push(c((s) => kleur.gray(s),
    `(wall-clock ${summary.totalLatencyMs}ms across ${summary.results.length} model(s); total cost ${fmtUsd(summary.totalCostUsd)})`,
  ));
  return `${lines.join("\n")}\n`;
}

export function formatMarkdown(summary: CompareSummary): string {
  const lines: string[] = [];
  lines.push("# multi-llm-compare results");
  lines.push("");
  lines.push(
    `_${summary.results.length} model(s) · wall-clock ${summary.totalLatencyMs}ms · total cost ${fmtUsd(summary.totalCostUsd)}_`,
  );
  lines.push("");

  lines.push("| model | latency | input | output | cost |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of summary.results) {
    if (r.status === "error") {
      lines.push(
        `| ${targetLabel(r)} | ${r.latencyMs}ms | — | — | error: ${r.errorMessage} |`,
      );
    } else {
      lines.push(
        `| ${targetLabel(r)} | ${r.latencyMs}ms | ${r.usage.inputTokens} | ${r.usage.outputTokens} | ${fmtUsd(r.costUsd)} |`,
      );
    }
  }
  lines.push("");

  for (const r of summary.results) {
    lines.push(`## ${targetLabel(r)}`);
    lines.push("");
    if (r.status === "error") {
      lines.push(`> error: ${r.errorMessage}`);
    } else {
      lines.push(r.text);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function formatJson(summary: CompareSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

export function formatBatchText(
  batch: BatchSummary,
  opts: FormatOptions = {},
): string {
  const useColor = opts.color !== false && Boolean(process.stdout.isTTY);
  const c = (fn: (s: string) => string, s: string) => (useColor ? fn(s) : s);
  const lines: string[] = [];
  for (const r of batch.results) {
    lines.push(
      c(
        (s) => kleur.magenta().bold(s),
        `\n### batch item: ${r.id} — ${truncate(r.prompt, 80)}`,
      ),
    );
    lines.push(formatText(r.summary, opts).trimEnd());
  }
  lines.push(
    c(
      (s) => kleur.gray(s),
      `\n=== batch totals: ${batch.results.length} item(s) · wall-clock ${batch.totalLatencyMs}ms · total cost ${fmtUsd(batch.totalCostUsd)} ===`,
    ),
  );
  return `${lines.join("\n")}\n`;
}

export function formatBatchMarkdown(batch: BatchSummary): string {
  const lines: string[] = [];
  lines.push("# multi-llm-compare batch results");
  lines.push("");
  lines.push(
    `_${batch.results.length} item(s) · wall-clock ${batch.totalLatencyMs}ms · total cost ${fmtUsd(batch.totalCostUsd)}_`,
  );
  lines.push("");
  lines.push("| item | prompt | wall-clock | cost |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of batch.results) {
    lines.push(
      `| ${r.id} | ${escapeCell(truncate(r.prompt, 60))} | ${r.summary.totalLatencyMs}ms | ${fmtUsd(r.summary.totalCostUsd)} |`,
    );
  }
  lines.push("");
  for (const r of batch.results) {
    lines.push(`## ${r.id}`);
    lines.push("");
    lines.push(`> ${truncate(r.prompt, 200)}`);
    lines.push("");
    lines.push(formatMarkdown(r.summary));
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function formatBatchJson(batch: BatchSummary): string {
  return `${JSON.stringify(batch, null, 2)}\n`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
