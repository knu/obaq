import type { Filter, ObsidianFile } from "./types.js";
import { evaluateExpression } from "./evaluator.js";

export function applyFilter(
  files: ObsidianFile[],
  filter: Filter | undefined
): ObsidianFile[] {
  if (!filter) return files;
  return files.filter((file) => matchesFilter(file, filter));
}

function matchesFilter(file: ObsidianFile, filter: Filter): boolean {
  if (typeof filter === "string") {
    try {
      return !!evaluateExpression(filter, file);
    } catch {
      return false;
    }
  }

  if ("not" in filter) {
    return !filter.not.some((condition) => matchesFilter(file, condition));
  }

  if ("and" in filter) {
    return filter.and.every((condition) => matchesFilter(file, condition));
  }

  if ("or" in filter) {
    return filter.or.some((condition) => matchesFilter(file, condition));
  }

  throw new Error(`Invalid filter: ${JSON.stringify(filter)}`);
}
