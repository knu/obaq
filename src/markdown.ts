import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { remark } from "remark";
import remarkParse from "remark-parse";
import { executeQuery } from "./query.js";
import { formatResult, type OutputFormat } from "./output.js";
import type { BaseQuery, ObsidianFile } from "./types.js";

interface ReplaceOptions {
  files: ObsidianFile[];
  format: OutputFormat;
  baseDir: string;
  thisFile?: ObsidianFile;
  view?: string;
  titleWidth?: "markup" | "title";
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
  const blocks = collectBaseBlocks(tree);
  if (blocks.length === 0) return markdown;

  const frontmatterEnd = detectFrontmatterEnd(markdown);
  const lineOffsets = buildLineOffsets(markdown);
  const replacements = await Promise.all(
    blocks.map(async (block) => {
      const queryYaml = await resolveQuerySource(block.content ?? "", {
        baseDir: options.baseDir,
        readFile: fileReader,
        readStdin: options.readStdin,
      });
      const query = load(queryYaml) as BaseQuery;
      const result = executeQuery(
        options.files,
        query,
        options.thisFile,
        options.view
      );
      const rendered =
        options.format === "md" || options.format === "markdown"
          ? formatResult(result, "markdown", {
              titleWidth: options.titleWidth,
            })
          : wrapFenced(formatResult(result, options.format), options.format);

      const start = getOffset(block.start, lineOffsets);
      const end = getOffset(block.end, lineOffsets);
      if (frontmatterEnd !== undefined && start < frontmatterEnd) {
        return null;
      }
      return { start, end, rendered };
    })
  );

  return applyReplacements(
    markdown,
    replacements.filter(
      (item): item is { start: number; end: number; rendered: string } =>
        Boolean(item)
    )
  );
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

function collectBaseBlocks(node: any) {
  const blocks: {
    start: Position;
    end: Position;
    content: string;
  }[] = [];

  visit(node, (child) => {
    if (child?.type === "code" && child.lang === "base" && child.position) {
      blocks.push({
        start: child.position.start,
        end: child.position.end,
        content: child.value ?? "",
      });
    }
  });

  return blocks;
}

function visit(node: any, fn: (child: any) => void) {
  fn(node);
  if (node?.children) {
    for (const child of node.children) {
      visit(child, fn);
    }
  }
}

type Position = { line: number; column: number; offset?: number };

function buildLineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

function getOffset(pos: Position, lineOffsets: number[]): number {
  if (typeof pos.offset === "number") return pos.offset;
  const lineIndex = Math.max(pos.line - 1, 0);
  const lineOffset = lineOffsets[lineIndex] ?? 0;
  return lineOffset + Math.max(pos.column - 1, 0);
}

function applyReplacements(
  text: string,
  replacements: { start: number; end: number; rendered: string }[]
): string {
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let output = text;
  for (const replacement of sorted) {
    output =
      output.slice(0, replacement.start) +
      replacement.rendered +
      output.slice(replacement.end);
  }
  return output;
}

function wrapFenced(content: string, lang: string): string {
  return ["```" + lang, content, "```"].join("\n");
}

function detectFrontmatterEnd(text: string): number | undefined {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?\n/);
  if (!match) return undefined;
  return match[0].length;
}
