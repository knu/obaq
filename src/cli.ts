#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin } from "node:process";
import { load } from "js-yaml";
import { stringify } from "csv-stringify/sync";
import { markdownTable } from "markdown-table";
import { parseVault } from "./parser.js";
import { executeQuery } from "./query.js";
import { findVaultRoot } from "./vault-finder.js";
import type { BaseQuery, QueryResult } from "./types.js";

const SUPPORTED_FORMATS = ["json", "csv", "md", "markdown"] as const;
type OutputFormat = (typeof SUPPORTED_FORMATS)[number];

async function main() {
  const { values } = parseArgs({
    options: {
      d: { type: "string" },
      directory: { type: "string" },
      e: { type: "string" },
      eval: { type: "string" },
      f: { type: "string" },
      format: { type: "string" },
    },
  });

  const vaultDir = values.d || values.directory;
  let queryYaml = values.e || values.eval;
  const format = (values.f || values.format || "json") as OutputFormat;

  if (!queryYaml) {
    console.error(
      `Usage: obsidian-base [-d|--directory VAULT_DIR] -e|--eval YAML [-f|--format ${SUPPORTED_FORMATS.join("|")}]`
    );
    process.exit(1);
  }

  const startDir = vaultDir ? resolve(vaultDir) : process.cwd();
  const resolvedDir = await findVaultRoot(startDir);

  if (!SUPPORTED_FORMATS.includes(format)) {
    console.error(
      `Error: format must be one of: ${SUPPORTED_FORMATS.join(", ")}`
    );
    process.exit(1);
  }

  try {
    if (queryYaml.startsWith("@")) {
      const path = queryYaml.slice(1);
      if (path === "-") {
        queryYaml = await readStdin();
      } else {
        const filePath = resolve(path);
        queryYaml = await readFile(filePath, "utf-8");
      }
    }

    const query = load(queryYaml) as BaseQuery;
    const files = await parseVault(resolvedDir);
    const result = executeQuery(files, query);

    switch (format) {
      case "json":
        console.log(JSON.stringify(result, null, 2));
        break;
      case "csv":
        console.log(formatCSV(result));
        break;
      case "md":
      case "markdown":
        console.log(formatMarkdown(result));
        break;
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function formatCSV(result: QueryResult): string {
  const header = result.columns.map((col) => col.displayName);
  const records = result.rows.map((row) =>
    result.columns.map((col) => row[col.id] ?? "")
  );

  return stringify([header, ...records]);
}

function formatMarkdown(result: QueryResult): string {
  const header = result.columns.map((col) => col.displayName);
  const rows = result.rows.map((row) =>
    result.columns.map((col) => String(row[col.id] ?? ""))
  );

  return markdownTable([header, ...rows]);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

main();
