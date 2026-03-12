#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { stdin } from "node:process";
import { load } from "js-yaml";
import { parseVault } from "./parser.js";
import { executeQuery } from "./query.js";
import { findVaultRoot } from "./vault-finder.js";
import { replaceBaseCodeBlocks } from "./markdown.js";
import {
  formatResult,
  SUPPORTED_FORMATS,
  type OutputFormat,
} from "./output.js";
import type { BaseQuery, ObsidianFile } from "./types.js";

async function main() {
  let values: {
    d?: string;
    directory?: string;
    e?: string;
    eval?: string;
    f?: string;
    format?: string;
    "title-width"?: string;
    t?: string;
    this?: string;
    v?: string;
    view?: string;
    version?: boolean;
    h?: boolean;
    help?: boolean;
  };
  let positionals: string[];
  let version = "unknown";
  try {
    version = await readPackageVersion();
  } catch (error) {
    console.error(
      `Warning: unable to read package version: ${error instanceof Error ? error.message : error}`
    );
  }
  try {
    ({ values, positionals } = parseArgs({
      options: {
        d: { type: "string" },
        directory: { type: "string" },
        e: { type: "string" },
        eval: { type: "string" },
        f: { type: "string" },
        format: { type: "string" },
        "title-width": { type: "string" },
        t: { type: "string" },
        this: { type: "string" },
        v: { type: "string" },
        view: { type: "string" },
        version: { type: "boolean" },
        h: { type: "boolean" },
        help: { type: "boolean" },
      },
      allowPositionals: true,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    printHelp(version);
    process.exit(1);
  }

  if (values.version) {
    console.log(version);
    process.exit(0);
  }

  if (values.h || values.help) {
    printHelp(version);
    process.exit(0);
  }

  const vaultDir = values.d || values.directory;
  const queryYaml = values.e || values.eval;
  const markdownPath = positionals[0];
  const formatOverride = values.f || values.format;
  const titleWidth = values["title-width"] ?? "markup";
  const thisPath = values.t || values.this;
  const viewName = values.v || values.view;

  if (!queryYaml && !markdownPath) {
    printHelp(version);
    process.exit(1);
  }

  if (queryYaml && markdownPath) {
    console.error(
      "Error: you can only specify either -e/--eval or a Markdown file."
    );
    process.exit(1);
  }

  if (positionals.length > 1) {
    console.error("Error: only one Markdown file may be specified.");
    process.exit(1);
  }

  const format = (formatOverride ||
    (markdownPath ? "markdown" : "json")) as OutputFormat;

  if (titleWidth !== "markup" && titleWidth !== "title") {
    console.error("Error: --title-width must be 'markup' or 'title'.");
    process.exit(1);
  }

  const markdownInput =
    markdownPath === "-"
      ? await readStdin()
      : markdownPath
        ? await readFile(markdownPath, "utf-8")
        : "";
  const markdownDir =
    markdownPath === "-"
      ? process.cwd()
      : markdownPath
        ? dirname(resolve(markdownPath))
        : process.cwd();

  const startDir = vaultDir ? resolve(vaultDir) : markdownDir;
  const resolvedDir = await findVaultRoot(startDir);

  if (!SUPPORTED_FORMATS.includes(format)) {
    console.error(
      `Error: format must be one of: ${SUPPORTED_FORMATS.join(", ")}`
    );
    process.exit(1);
  }

  try {
    const files = await parseVault(resolvedDir);
    const thisFile = markdownPath
      ? findThisFile(files, resolvedDir, markdownPath)
      : thisPath
        ? resolveThisFile(files, resolvedDir, thisPath)
        : undefined;
    if (queryYaml) {
      let resolvedQuery = queryYaml;
      if (resolvedQuery.startsWith("@")) {
        const path = resolvedQuery.slice(1);
        if (path === "-") {
          resolvedQuery = await readStdin();
        } else {
          const filePath = resolve(path);
          resolvedQuery = await readFile(filePath, "utf-8");
        }
      }

      const query = load(resolvedQuery) as BaseQuery;
      const result = executeQuery(files, query, thisFile, viewName);
      console.log(
        formatResult(result, format, { titleWidth: titleWidth as any })
      );
    } else {
      const output = await replaceBaseCodeBlocks(markdownInput, {
        files,
        format,
        baseDir: markdownDir,
        thisFile,
        titleWidth: titleWidth as any,
        view: viewName,
        readStdin: markdownPath === "-" ? undefined : readStdin,
      });
      console.log(output);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function findThisFile(
  files: ObsidianFile[],
  vaultRoot: string,
  markdownPath: string
): ObsidianFile | undefined {
  if (markdownPath === "-") {
    return undefined;
  }
  const relPath = relative(vaultRoot, resolve(markdownPath)).replace(
    /\\/g,
    "/"
  );
  return files.find((file) => file.file.path === relPath);
}

function resolveThisFile(
  files: ObsidianFile[],
  vaultRoot: string,
  thisPath: string
): ObsidianFile {
  const relPath = relative(vaultRoot, resolve(thisPath)).replace(/\\/g, "/");
  const file = files.find((item) => item.file.path === relPath);
  if (!file) {
    throw new Error(`Unable to resolve --this file: ${thisPath}`);
  }
  return file;
}

function printHelp(version: string) {
  const formats = SUPPORTED_FORMATS.join("|");
  console.log(`obaq version ${version}

Usage: obaq [options] (-e YAML | PATH.md)

Options:
  -d, --directory VAULT_DIR   Vault directory (defaults to cwd and auto-detects)
  -e, --eval YAML             YAML query string or @file.base (use @- for stdin)
  -f, --format FORMAT         Output format: ${formats}
      --title-width MODE      Table width: markup|title (default: markup)
  -t, --this PATH             Use PATH as the "this" file context
  -v, --view NAME             Use the named view from the base
      --version               Show version
  -h, --help                  Show this help

Notes:
  - Specify either -e/--eval or a Markdown file, not both.
  - Use "-" as PATH.md to read Markdown from stdin.
`);
}

async function readPackageVersion(): Promise<string> {
  const packageUrl = new URL("../package.json", import.meta.url);
  const contents = await readFile(packageUrl, "utf-8");
  const data = JSON.parse(contents) as { version?: string };
  return data.version ?? "unknown";
}

main();
