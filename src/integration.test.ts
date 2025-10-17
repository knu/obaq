import { describe, it } from "node:test";
import assert from "node:assert";
import { resolve } from "node:path";
import { parseVault } from "./parser.js";
import { executeQuery } from "./query.js";
import { load } from "js-yaml";
import { readFile } from "node:fs/promises";
import type { BaseQuery } from "./types.js";

describe("integration", () => {
  it("should execute test-query.base against test-vault", async () => {
    const vaultPath = resolve("test-vault");
    const queryPath = resolve("test-vault/test-query.base");

    const queryYaml = await readFile(queryPath, "utf-8");
    const query = load(queryYaml) as BaseQuery;

    const files = await parseVault(vaultPath);
    const result = executeQuery(files, query);

    assert.ok(result.columns.length > 0, "Should have columns");
    assert.strictEqual(result.columns.length, 3, "Should have 3 columns");
    assert.strictEqual(result.columns[0].displayName, "Title");
    assert.strictEqual(result.columns[1].displayName, "Updated");
    assert.strictEqual(result.columns[2].displayName, "Created");

    assert.ok(result.rows.length > 0, "Should have rows");
    assert.strictEqual(result.rows.length, 2, "Should have 2 rows");

    const firstRow = result.rows[0];
    assert.ok(
      firstRow["formula.title"]?.toString().includes("[[Second Note]]"),
      "First row should have Second Note (sorted by updated DESC)"
    );
    assert.ok(firstRow["formula.updated"], "Should have updated value");
    assert.ok(firstRow["formula.created"], "Should have created value");
  });

  it("should filter files correctly", async () => {
    const vaultPath = resolve("test-vault");
    const files = await parseVault(vaultPath);

    const chatGptFiles = files.filter((f) => f.file.folder === "ChatGPT");
    assert.ok(
      chatGptFiles.length >= 3,
      "Should have at least 3 files in ChatGPT folder"
    );

    const query: BaseQuery = {
      views: [
        {
          type: "table",
          name: "Test",
          filters: {
            and: ['file.folder == "ChatGPT"', "file.name != file.folder"],
          },
          order: ["note.title"],
        },
      ],
    };

    const result = executeQuery(files, query);
    assert.strictEqual(
      result.rows.length,
      2,
      "Should exclude folder note (ChatGPT.md)"
    );
  });

  it("should evaluate formulas with Obsidian functions", async () => {
    const vaultPath = resolve("test-vault");
    const files = await parseVault(vaultPath);

    const query: BaseQuery = {
      formulas: {
        titleLink: "file.asLink(title)",
        dateFormatted: 'date(created).format("YYYY-MM-DD")',
        titleCase: "title.title()",
      },
      views: [
        {
          type: "table",
          name: "Test",
          filters: { and: ['file.folder == "ChatGPT"'] },
          order: [
            "formula.titleLink",
            "formula.dateFormatted",
            "formula.titleCase",
          ],
        },
      ],
    };

    const result = executeQuery(files, query);
    assert.ok(result.rows.length > 0, "Should have results");

    const row = result.rows.find((r) =>
      r["formula.titleLink"]?.toString().includes("First Note")
    );
    assert.ok(row, "Should find row with First Note");
    assert.ok(
      row!["formula.titleLink"]?.toString().includes("[["),
      "Should have wiki link format"
    );
    assert.match(
      row!["formula.dateFormatted"] as string,
      /^\d{4}-\d{2}-\d{2}$/,
      "Should have formatted date"
    );
    assert.ok(
      row!["formula.titleCase"]?.toString().includes("First"),
      "Should have title case"
    );
  });

  it("should sort results correctly", async () => {
    const vaultPath = resolve("test-vault");
    const files = await parseVault(vaultPath);

    const query: BaseQuery = {
      views: [
        {
          type: "table",
          name: "Test",
          filters: {
            and: ['file.folder == "ChatGPT"', "file.name != file.folder"],
          },
          order: ["note.title", "note.updated"],
          sort: [{ property: "note.updated", direction: "DESC" }],
        },
      ],
    };

    const result = executeQuery(files, query);
    assert.strictEqual(result.rows.length, 2, "Should have 2 rows");

    const firstUpdated = result.rows[0]["note.updated"] as string;
    const secondUpdated = result.rows[1]["note.updated"] as string;
    assert.ok(
      firstUpdated >= secondUpdated,
      "First row should have later or equal updated time"
    );
  });

  it("should include .base files with file properties", async () => {
    const vaultPath = resolve("test-vault");
    const files = await parseVault(vaultPath);

    const baseFiles = files.filter((f) => f.file.ext === "base");
    assert.ok(baseFiles.length >= 2, "Should have at least 2 .base files");

    const testQueryBase = baseFiles.find((f) => f.file.name === "test-query");
    assert.ok(testQueryBase, "Should find test-query.base");
    assert.strictEqual(testQueryBase!.file.ext, "base");
    assert.ok(testQueryBase!.file.size > 0, "Should have file size");
    assert.ok(testQueryBase!.file.ctime, "Should have creation time");
    assert.ok(testQueryBase!.file.mtime, "Should have modification time");
    assert.strictEqual(
      testQueryBase!.content,
      "",
      ".base files should have empty content"
    );
  });
});
