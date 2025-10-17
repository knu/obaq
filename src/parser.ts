import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, dirname, basename, extname } from "node:path";
import matter from "gray-matter";
import dayjs from "dayjs";
import type { ObsidianFile } from "./types.js";

export async function parseVault(vaultPath: string): Promise<ObsidianFile[]> {
  const files: ObsidianFile[] = [];
  await scanDirectory(vaultPath, vaultPath, files);
  return files;
}

async function scanDirectory(
  basePath: string,
  currentPath: string,
  files: ObsidianFile[]
): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = join(currentPath, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(basePath, fullPath, files);
    } else {
      const ext = extname(entry.name).slice(1); // Remove leading dot
      const relativePath = relative(basePath, fullPath);
      const folderPath = dirname(relativePath);
      const fileName = basename(relativePath, extname(entry.name));
      const stats = await stat(fullPath);

      let content = "";
      let frontmatter: Record<string, unknown> = {};

      // Only parse frontmatter for .md files
      if (ext === "md") {
        const fileContent = await readFile(fullPath, "utf-8");
        const parsed = matter(fileContent);
        content = parsed.content;

        for (const [key, value] of Object.entries(parsed.data)) {
          if (value instanceof Date) {
            frontmatter[key] = dayjs(value).format("YYYY-MM-DDTHH:mm:ssZ");
          } else {
            frontmatter[key] = value;
          }
        }
      }

      const fileTags = (() => {
        const tags = frontmatter.tags;
        if (!tags) return [];
        return Array.isArray(tags) ? tags : [tags];
      })();

      const obsidianFile: ObsidianFile = {
        file: {
          name: fileName,
          folder: folderPath === "." ? "" : folderPath,
          path: relativePath,
          ext,
          size: stats.size,
          ctime: stats.birthtime,
          mtime: stats.mtime,
          properties: frontmatter,
          tags: fileTags,
          asLink: (title?: string) => `[[${title || fileName}]]`,
          hasTag: (...tags: string[]) =>
            tags.some((tag) => fileTags.includes(tag)),
          hasProperty: (name: string) => name in frontmatter,
          inFolder: (folder: string) => {
            const fileFolder = folderPath === "." ? "" : folderPath;
            return fileFolder === folder || fileFolder.startsWith(folder + "/");
          },
        },
        content,
        note: frontmatter,
        ...frontmatter,
      };

      files.push(obsidianFile);
    }
  }
}
