import { describe, it } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { replaceBaseCodeBlocks } from "./markdown.js";
import { parseVault } from "./parser.js";
import { executeQuery } from "./query.js";
import { formatResult } from "./output.js";
import { VaultFile, type BaseQuery, type ObsidianFile } from "./types.js";

const mockFiles: ObsidianFile[] = [
  {
    file: new VaultFile({
      name: "Note1",
      folder: "Notes",
      path: "Notes/Note1.md",
      ext: "md",
      size: 1024,
      ctime: new Date("2024-01-01"),
      mtime: new Date("2024-01-01"),
      properties: { title: "First Note" },
      tags: [],
    }),
    content: "Content 1",
    note: { title: "First Note" },
    title: "First Note",
  },
];

mockFiles[0].file.setLinkResolver(() => []);
mockFiles[0].file.setBacklinkResolver(() => []);

describe("replaceBaseCodeBlocks", () => {
  it("replaces base blocks with markdown output", async () => {
    const markdown = [
      "# Report",
      "",
      "```base",
      "views:",
      "  - type: table",
      "    name: Test",
      "    order:",
      "      - note.title",
      "properties:",
      "  note.title:",
      "    displayName: Title",
      "```",
      "",
    ].join("\n");

    const query: BaseQuery = {
      properties: {
        "note.title": { displayName: "Title" },
      },
      views: [
        {
          type: "table",
          name: "Test",
          order: ["note.title"],
        },
      ],
    };

    const expectedTable = formatResult(
      executeQuery(mockFiles, query),
      "markdown"
    );
    const expected = ["# Report", "", expectedTable, ""].join("\n");

    const output = await replaceBaseCodeBlocks(markdown, {
      files: mockFiles,
      format: "markdown",
      baseDir: "/repo",
    });

    assert.strictEqual(output, expected);
  });

  it("wraps non-markdown formats in fenced blocks", async () => {
    const markdown = [
      "```base",
      "views:",
      "  - type: table",
      "    name: Test",
      "    order:",
      "      - note.title",
      "```",
    ].join("\n");

    const output = await replaceBaseCodeBlocks(markdown, {
      files: mockFiles,
      format: "json",
      baseDir: "/repo",
    });

    assert.ok(output.startsWith("```json\n"));
    assert.ok(output.trimEnd().endsWith("```"));
    assert.ok(output.includes('"columns"'));
  });

  it("resolves @file references relative to the markdown", async () => {
    const markdown = ["```base", "@queries/report.base", "```"].join("\n");
    const baseDir = "/repo/docs";
    const queryYaml = [
      "views:",
      "  - type: table",
      "    name: Test",
      "    order:",
      "      - note.title",
    ].join("\n");

    const output = await replaceBaseCodeBlocks(markdown, {
      files: mockFiles,
      format: "markdown",
      baseDir,
      readFile: async (path) => {
        assert.strictEqual(path, resolve(baseDir, "queries/report.base"));
        return queryYaml;
      },
    });

    assert.ok(output.includes("| note.title |"));
  });

  it("uses the markdown file as this context for filters", async () => {
    const vaultPath = resolve("test-vault");
    const markdownPath = resolve("test-vault/ChatGPT/ChatGPT.md");
    const markdownInput = await readFile(markdownPath, "utf-8");
    const files = await parseVault(vaultPath);
    const thisFile = files.find(
      (file) => file.file.path === "ChatGPT/ChatGPT.md"
    );

    assert.ok(thisFile, "Should find ChatGPT.md in parsed vault");

    const output = await replaceBaseCodeBlocks(markdownInput, {
      files,
      format: "markdown",
      baseDir: resolve("test-vault/ChatGPT"),
      thisFile,
    });

    assert.ok(output.includes("[First Note](Note1.md)"));
    assert.ok(output.includes("[ChatGPT/Note2.md](Note2.md)"));
    assert.ok(!output.includes("[ChatGPT Report](ChatGPT.md)"));
    assert.ok(!output.includes("Third Note"));
  });
});
