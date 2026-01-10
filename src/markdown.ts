import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { remark } from "remark";
import remarkParse from "remark-parse";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { toMarkdown as wikiLinkToMarkdown } from "mdast-util-wiki-link";
import { executeQuery } from "./query.js";
import {
  buildMarkdownTable,
  formatResult,
  type OutputFormat,
} from "./output.js";
import type { BaseQuery, ObsidianFile } from "./types.js";

interface ReplaceOptions {
  files: ObsidianFile[];
  format: OutputFormat;
  baseDir: string;
  thisFile?: ObsidianFile;
  readStdin?: () => Promise<string>;
  readFile?: (path: string) => Promise<string>;
}

export async function replaceBaseCodeBlocks(
  markdown: string,
  options: ReplaceOptions
): Promise<string> {
  const fileReader =
    options.readFile ?? ((path: string) => readFile(path, "utf-8"));
  const tree = remark().use(remarkParse).parse(markdown) as any;
  await replaceNodes(tree, options, fileReader);
  return toMarkdown(tree, {
    extensions: [
      gfmTableToMarkdown(),
      wikiLinkToMarkdown({ aliasDivider: "|" }),
    ] as any,
  });
}

async function replaceNodes(
  node: any,
  options: ReplaceOptions,
  readFileFn: (path: string) => Promise<string>
): Promise<void> {
  if (!node || !node.children) {
    return;
  }

  const nextChildren: any[] = [];
  for (const child of node.children) {
    if (child?.type === "code" && child.lang === "base") {
      const queryYaml = await resolveQuerySource(child.value ?? "", {
        baseDir: options.baseDir,
        readFile: readFileFn,
        readStdin: options.readStdin,
      });
      const query = load(queryYaml) as BaseQuery;
      const result = executeQuery(options.files, query, options.thisFile);

      if (options.format === "md" || options.format === "markdown") {
        nextChildren.push(buildMarkdownTable(result));
      } else {
        nextChildren.push({
          type: "code",
          lang: options.format,
          value: formatResult(result, options.format),
        });
      }
      continue;
    }

    await replaceNodes(child, options, readFileFn);
    nextChildren.push(child);
  }

  node.children = nextChildren;
}

async function resolveQuerySource(
  source: string,
  options: {
    baseDir: string;
    readFile: (path: string) => Promise<string>;
    readStdin?: () => Promise<string>;
  }
): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed.startsWith("@") || trimmed.includes("\n")) {
    return source;
  }

  const ref = trimmed.slice(1).trim();
  if (ref === "-") {
    if (!options.readStdin) {
      throw new Error("Query reference @- is unavailable in this mode.");
    }
    return options.readStdin();
  }

  const filePath = resolve(options.baseDir, ref);
  return options.readFile(filePath);
}
