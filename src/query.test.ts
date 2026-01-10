import { describe, it } from "node:test";
import assert from "node:assert";
import { executeQuery } from "./query.js";
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
      properties: { title: "First Note", priority: 1 },
      tags: [],
    }),
    content: "Content 1",
    note: { title: "First Note", priority: 1 },
    title: "First Note",
    priority: 1,
  },
  {
    file: new VaultFile({
      name: "Note2",
      folder: "Notes",
      path: "Notes/Note2.md",
      ext: "md",
      size: 1024,
      ctime: new Date("2024-01-01"),
      mtime: new Date("2024-01-01"),
      properties: { title: "Second Note", priority: 2 },
      tags: [],
    }),
    content: "Content 2",
    note: { title: "Second Note", priority: 2 },
    title: "Second Note",
    priority: 2,
  },
  {
    file: new VaultFile({
      name: "Note3",
      folder: "Archive",
      path: "Archive/Note3.md",
      ext: "md",
      size: 1024,
      ctime: new Date("2024-01-01"),
      mtime: new Date("2024-01-01"),
      properties: { title: "Third Note", priority: 3 },
      tags: [],
    }),
    content: "Content 3",
    note: { title: "Third Note", priority: 3 },
    title: "Third Note",
    priority: 3,
  },
];

for (const file of mockFiles) {
  file.file.setLinkResolver(() => []);
  file.file.setBacklinkResolver(() => []);
}

describe("executeQuery", () => {
  it("should return empty result when no views", () => {
    const query: BaseQuery = {};
    const result = executeQuery(mockFiles, query);
    assert.strictEqual(result.columns.length, 0);
    assert.strictEqual(result.rows.length, 0);
  });

  it("should filter files", () => {
    const query: BaseQuery = {
      views: [
        {
          type: "table",
          name: "Test",
          filters: { and: ['file.folder == "Notes"'] },
          order: ["note.title"],
        },
      ],
    };
    const result = executeQuery(mockFiles, query);
    assert.strictEqual(result.rows.length, 2);
  });

  it("should evaluate formulas", () => {
    const query: BaseQuery = {
      formulas: {
        titleUpper: "title.title()",
      },
      views: [
        {
          type: "table",
          name: "Test",
          order: ["formula.titleUpper"],
        },
      ],
    };
    const result = executeQuery(mockFiles, query);
    assert.strictEqual(result.rows.length, 3);
    assert.strictEqual(result.rows[0]["formula.titleUpper"], "First Note");
  });

  it("should sort results", () => {
    const query: BaseQuery = {
      views: [
        {
          type: "table",
          name: "Test",
          order: ["note.priority"],
          sort: [{ property: "note.priority", direction: "DESC" }],
        },
      ],
    };
    const result = executeQuery(mockFiles, query);
    assert.strictEqual(result.rows[0]["note.priority"], 3);
    assert.strictEqual(result.rows[2]["note.priority"], 1);
  });

  it("should apply column properties", () => {
    const query: BaseQuery = {
      properties: {
        "note.title": { displayName: "Note Title" },
      },
      views: [
        {
          type: "table",
          name: "Test",
          order: ["note.title"],
          columnSize: { "note.title": 200 },
        },
      ],
    };
    const result = executeQuery(mockFiles, query);
    assert.strictEqual(result.columns[0].displayName, "Note Title");
    assert.strictEqual(result.columns[0].size, 200);
  });

  it("should only include ordered columns in output", () => {
    const query: BaseQuery = {
      formulas: {
        formula1: "1",
        formula2: "2",
      },
      views: [
        {
          type: "table",
          name: "Test",
          order: ["formula.formula1"],
        },
      ],
    };
    const result = executeQuery(mockFiles, query);
    assert.strictEqual(result.columns.length, 1);
    assert.ok(!("formula.formula2" in result.rows[0]));
  });
});
