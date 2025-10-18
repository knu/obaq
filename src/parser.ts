import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, dirname, basename, extname } from "node:path";
import matter from "gray-matter";
import dayjs from "dayjs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkWikiLink from "remark-wiki-link";
import { Link } from "./functions.js";
import type { ObsidianFile } from "./types.js";

export async function parseVault(vaultPath: string): Promise<ObsidianFile[]> {
  const files: ObsidianFile[] = [];
  await scanDirectory(vaultPath, vaultPath, files);

  // Setup backlinks by providing access to all files
  for (const file of files) {
    setupBacklinks(file, files);
  }

  return files;
}

function setupBacklinks(targetFile: ObsidianFile, allFiles: ObsidianFile[]) {
  Object.defineProperty(targetFile.file, "backlinks", {
    get: () => {
      const backlinks: Link[] = [];

      for (const otherFile of allFiles) {
        if (otherFile === targetFile) continue;

        // Check if this file links to the target
        if (otherFile.file.links.some((link) => link.equals(targetFile.file))) {
          backlinks.push(new Link(otherFile.file.name));
        }
      }

      return backlinks;
    },
    enumerable: true,
  });
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

      const extractLinksFromText = (text: string): Link[] => {
        const links: Link[] = [];
        const tree = unified()
          .use(remarkParse)
          .use(remarkWikiLink, {
            pageResolver: (name: string) => [name],
            hrefTemplate: (permalink: string) => permalink,
          })
          .parse(text);

        const visit = (node: any) => {
          if (node.type === "wikiLink") {
            // Extract display text from node data if available
            const display =
              node.data?.hProperties?.["data-alias"] ||
              (node.children?.[0]?.value !== node.value
                ? node.children?.[0]?.value
                : undefined);
            links.push(new Link(node.value, display));
          }
          if (node.children) {
            node.children.forEach(visit);
          }
        };

        visit(tree);
        return links;
      };

      const extractLinks = () => {
        const links: Link[] = [];

        // Extract links from frontmatter using remark
        for (const value of Object.values(frontmatter)) {
          if (typeof value === "string" && value.includes("[[")) {
            links.push(...extractLinksFromText(value));
          }
        }

        // Extract links from markdown content
        if (ext === "md" && content) {
          links.push(...extractLinksFromText(content));
        }

        return links;
      };

      const fileObj = {
        name: fileName,
        folder: folderPath === "." ? "" : folderPath,
        path: relativePath,
        ext,
        size: stats.size,
        ctime: stats.birthtime,
        mtime: stats.mtime,
        properties: frontmatter,
        tags: fileTags,
        asLink: (title?: string) => new Link(fileName, title),
        hasTag: (...tags: string[]) =>
          tags.some((tag) => fileTags.includes(tag)),
        hasProperty: (name: string) => name in frontmatter,
        inFolder: (folder: string) => {
          const fileFolder = folderPath === "." ? "" : folderPath;
          return fileFolder === folder || fileFolder.startsWith(folder + "/");
        },
        hasLink: (...linkNames: (string | { name: string })[]) => {
          const fileLinks = extractLinks();
          return linkNames.some((link) => {
            return fileLinks.some((l) => l.equals(link));
          });
        },
      };

      Object.defineProperty(fileObj, "links", {
        get: extractLinks,
        enumerable: true,
      });

      const obsidianFile: ObsidianFile = {
        file: fileObj as ObsidianFile["file"],
        content,
        note: frontmatter,
        ...frontmatter,
      };

      files.push(obsidianFile);
    }
  }
}
