import { stringify } from "csv-stringify/sync";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { toMarkdown as wikiLinkToMarkdown } from "mdast-util-wiki-link";
import type { QueryResult } from "./types.js";
import { Link } from "./functions.js";

export const SUPPORTED_FORMATS = ["json", "csv", "md", "markdown"] as const;
export type OutputFormat = (typeof SUPPORTED_FORMATS)[number];

export function formatResult(
  result: QueryResult,
  format: OutputFormat
): string {
  switch (format) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "csv":
      return formatCSV(result);
    case "md":
    case "markdown":
      return formatMarkdown(result);
  }
}

export function buildMarkdownTable(result: QueryResult): any {
  return {
    type: "table",
    children: [
      {
        type: "tableRow",
        children: result.columns.map((col) => ({
          type: "tableCell",
          children: [{ type: "text", value: col.displayName }],
        })),
      },
      ...result.rows.map((row) => ({
        type: "tableRow",
        children: result.columns.map((col) => ({
          type: "tableCell",
          children: renderCellValue(row[col.id]),
        })),
      })),
    ],
  };
}

function formatCSV(result: QueryResult): string {
  const header = result.columns.map((col) => col.displayName);
  const records = result.rows.map((row) =>
    result.columns.map((col) => row[col.id] ?? "")
  );

  return stringify([header, ...records]);
}

function formatMarkdown(result: QueryResult): string {
  return toMarkdown(buildMarkdownTable(result), {
    extensions: [
      gfmTableToMarkdown(),
      wikiLinkToMarkdown({ aliasDivider: "|" }),
    ] as any,
  }).trim();
}

function renderCellValue(value: unknown): any[] {
  if (value instanceof Link) {
    return [wikiLinkNode(value.path, value.display)];
  }

  if (typeof value === "string") {
    const markdownLink = parseMarkdownLink(value);
    if (markdownLink) {
      return [
        {
          type: "link",
          url: markdownLink.url,
          children: [{ type: "text", value: markdownLink.text }],
        },
      ];
    }
    const parsed = parseWikiLink(value);
    if (parsed) {
      return [wikiLinkNode(parsed.path, parsed.display)];
    }
  }

  return [{ type: "text", value: String(value ?? "") }];
}

function parseWikiLink(
  text: string
): { path: string; display?: string } | null {
  const match = text.match(/^\[\[([\s\S]+)\]\]$/);
  if (!match) return null;
  const body = match[1] ?? "";
  const [path, display] = body.split("|");
  if (!path) return null;
  return { path, display };
}

function parseMarkdownLink(text: string): { text: string; url: string } | null {
  const match = text.match(/^\[([\s\S]+)\]\(([\s\S]+)\)$/);
  if (!match) return null;
  const label = match[1] ?? "";
  const url = match[2] ?? "";
  if (!label || !url) return null;
  return { text: label, url };
}

function wikiLinkNode(path: string, display?: string): any {
  return {
    type: "wikiLink",
    value: path,
    data: {
      alias: display,
      permalink: path,
    },
  };
}
