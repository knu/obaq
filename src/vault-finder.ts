import { access, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export async function findVaultRoot(startPath: string): Promise<string> {
  let currentPath = startPath;

  while (true) {
    const obsidianDir = join(currentPath, ".obsidian");

    try {
      await access(obsidianDir);
      const entries = await readdir(obsidianDir);
      if (entries.length > 0) {
        return currentPath;
      }
    } catch {
      // .obsidian doesn't exist, continue
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      return startPath;
    }

    currentPath = parentPath;
  }
}
