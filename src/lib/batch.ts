import type { BatchItem } from "./compare.js";

/**
 * Parse JSON-Lines batch input. Each line is one item; blank lines and
 * lines starting with `#` are ignored. A line can be either a string
 * (shorthand for `{ prompt: "<that string>" }`) or a JSON object that
 * matches BatchItem.
 *
 * Errors include the offending line number so users can find the bad
 * row in their input file.
 */
export function parseBatchJsonl(raw: string): BatchItem[] {
  const lines = raw.split(/\r?\n/);
  const items: BatchItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (line === "" || line.startsWith("#")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(
        `batch line ${i + 1}: invalid JSON (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    if (typeof parsed === "string") {
      items.push({ prompt: parsed });
      continue;
    }
    if (!isPlainObject(parsed)) {
      throw new Error(
        `batch line ${i + 1}: expected a string or object, got ${typeof parsed}`,
      );
    }
    const promptRaw = parsed.prompt;
    if (typeof promptRaw !== "string" || promptRaw.trim() === "") {
      throw new Error(
        `batch line ${i + 1}: object is missing a non-empty "prompt" field`,
      );
    }
    const item: BatchItem = { prompt: promptRaw };
    if (typeof parsed.id === "string") item.id = parsed.id;
    if (typeof parsed.system === "string") item.system = parsed.system;
    if (typeof parsed.maxTokens === "number") item.maxTokens = parsed.maxTokens;
    if (typeof parsed.temperature === "number") {
      item.temperature = parsed.temperature;
    }
    items.push(item);
  }
  return items;
}

function isPlainObject(
  v: unknown,
): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
