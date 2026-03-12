import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, dirname, basename, extname } from "node:path";
import matter from "gray-matter";
import { fromMarkdown } from "mdast-util-from-markdown";
import { ofmWikilink } from "@moritzrs/micromark-extension-ofm-wikilink";
import { ofmWikilinkFromMarkdown } from "@moritzrs/mdast-util-ofm-wikilink";
import { Link } from "./functions.js";
import { VaultFile, type ObsidianFile } from "./types.js";

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
  targetFile.file.setBacklinkResolver(() => {
    const backlinks: Link[] = [];

    for (const otherFile of allFiles) {
      if (otherFile === targetFile) continue;

      // Check if this file links to the target
      if (otherFile.file.links.some((link) => link.equals(targetFile.file))) {
        backlinks.push(new Link(otherFile.file.name));
      }
    }

    return backlinks;
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
          frontmatter[key] = value;
        }
      }

      const titleDefault = relativePath;
      if (frontmatter.title === undefined) {
        frontmatter.title = titleDefault;
      }

      const fileTags = (() => {
        const tags = frontmatter.tags;
        if (!tags) return [];
        return Array.isArray(tags) ? tags : [tags];
      })();

      const extractLinksFromText = (text: string): Link[] => {
        const links: Link[] = [];
        const tree = parseMarkdownTree(text);

        const visit = (node: any) => {
          if (node.type === "ofmWikilink") {
            links.push(
              new Link(
                buildOfmPath(node),
                extractOfmAlias(text, node) ?? undefined
              )
            );
          }
          if (node.children) {
            node.children.forEach(visit);
          }
        };

        visit(tree);
        return links;
      };

      const extractEmbedsFromText = (text: string): Link[] => {
        const embeds: Link[] = [];
        const tree = parseMarkdownTree(text);
        const visit = (node: any) => {
          if (node.type === "ofmWikiembedding") {
            embeds.push(
              new Link(
                buildOfmPath(node),
                extractOfmAlias(text, node) ?? undefined
              )
            );
          }
          if (node.type === "image" && typeof node.url === "string") {
            embeds.push(new Link(node.url, node.alt || undefined));
          }
          if (node.children) {
            node.children.forEach(visit);
          }
        };

        visit(tree);
        return embeds;
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

      const extractEmbeds = () => {
        const embeds: Link[] = [];

        for (const value of Object.values(frontmatter)) {
          if (typeof value !== "string") continue;
          if (value.includes("![[")) {
            embeds.push(...extractEmbedsFromText(value));
          }
          if (value.includes("![")) {
            embeds.push(...extractEmbedsFromText(value));
          }
        }

        if (ext === "md" && content) {
          embeds.push(...extractEmbedsFromText(content));
        }

        return embeds.filter((embed, index, all) => {
          return (
            all.findIndex(
              (candidate) =>
                candidate.path === embed.path &&
                candidate.display === embed.display
            ) === index
          );
        });
      };

      const fileObj = new VaultFile({
        name: fileName,
        folder: folderPath === "." ? "" : folderPath,
        path: relativePath,
        ext,
        size: stats.size,
        ctime: stats.birthtime,
        mtime: stats.mtime,
        properties: frontmatter,
        tags: fileTags,
      });
      fileObj.setLinkResolver(extractLinks);
      fileObj.setEmbedResolver(extractEmbeds);

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

function parseMarkdownTree(text: string) {
  return fromMarkdown(text, {
    extensions: [ofmWikilink()],
    mdastExtensions: [ofmWikilinkFromMarkdown()],
  }) as any;
}

function buildOfmPath(node: { url?: string; hash?: string }) {
  if (!node.hash) return String(node.url ?? "");
  return `${String(node.url ?? "")}#${node.hash}`;
}

function extractOfmAlias(text: string, node: any): string | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return null;
  const source = text.slice(start, end);
  const divider = source.indexOf("|");
  if (divider === -1) return null;
  const closing = source.lastIndexOf("]]");
  if (closing === -1 || closing <= divider) return null;
  const alias = source.slice(divider + 1, closing).trim();
  return alias || null;
}
