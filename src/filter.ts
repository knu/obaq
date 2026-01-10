import type { Filter, ObsidianFile } from "./types.js";
import { evaluateExpression } from "./evaluator.js";

export function applyFilter(
  files: ObsidianFile[],
  filter: Filter | undefined,
  thisContext?: ObsidianFile,
  vaultFiles?: ObsidianFile[]
): ObsidianFile[] {
  if (!filter) return files;
  return files.filter((file) =>
    matchesFilter(file, filter, thisContext, vaultFiles)
  );
}

function matchesFilter(
  file: ObsidianFile,
  filter: Filter,
  thisContext?: ObsidianFile,
  vaultFiles?: ObsidianFile[]
): boolean {
  if (typeof filter === "string") {
    try {
      return !!evaluateExpression(
        filter,
        file,
        thisContext ?? file,
        vaultFiles
      );
    } catch {
      return false;
    }
  }

  if ("not" in filter) {
    return !filter.not.some((condition) =>
      matchesFilter(file, condition, thisContext, vaultFiles)
    );
  }

  if ("and" in filter) {
    return filter.and.every((condition) =>
      matchesFilter(file, condition, thisContext, vaultFiles)
    );
  }

  if ("or" in filter) {
    return filter.or.some((condition) =>
      matchesFilter(file, condition, thisContext, vaultFiles)
    );
  }

  throw new Error(`Invalid filter: ${JSON.stringify(filter)}`);
}
