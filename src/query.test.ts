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

  it("should use the named view when selected", () => {
    const query: BaseQuery = {
      views: [
        {
          type: "table",
          name: "First",
          order: ["note.title"],
        },
        {
          type: "table",
          name: "Second",
          order: ["note.priority"],
        },
      ],
    };

    const result = executeQuery(mockFiles, query, undefined, "Second");
    assert.strictEqual(result.columns[0].id, "note.priority");
    assert.strictEqual(result.rows[0]["note.priority"], 1);
  });

  it("should fail when the named view does not exist", () => {
    const query: BaseQuery = {
      views: [
        {
          type: "table",
          name: "First",
          order: ["note.title"],
        },
      ],
    };

    assert.throws(() => executeQuery(mockFiles, query, undefined, "Missing"), {
      message: "View not found: Missing",
    });
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

  it("should apply view limit after sorting", () => {
    const query: BaseQuery = {
      views: [
        {
          type: "table",
          name: "Test",
          order: ["note.priority"],
          sort: [{ property: "note.priority", direction: "DESC" }],
          limit: 2,
        },
      ],
    };
    const result = executeQuery(mockFiles, query);
    assert.strictEqual(result.rows.length, 2);
    assert.strictEqual(result.rows[0]["note.priority"], 3);
    assert.strictEqual(result.rows[1]["note.priority"], 2);
  });

  it("should group rows by the selected property", () => {
    const query: BaseQuery = {
      views: [
        {
          type: "table",
          name: "Test",
          order: ["note.title"],
          groupBy: { property: "file.folder", direction: "DESC" },
        },
      ],
    };

    const result = executeQuery(mockFiles, query);
    assert.deepStrictEqual(
      result.rows.map((row) => row["note.title"]),
      ["First Note", "Second Note", "Third Note"]
    );
    assert.deepStrictEqual(
      result.groups?.map((group) => group.value),
      ["Notes", "Archive"]
    );
    assert.deepStrictEqual(
      result.groups?.map((group) => group.rows.length),
      [2, 1]
    );
    assert.strictEqual(result.groupBy?.property, "file.folder");
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

  it("should resolve formulas that reference other formulas", () => {
    const query: BaseQuery = {
      formulas: {
        total: "formula.doublePriority + 1",
        doublePriority: "priority * 2",
      },
      views: [
        {
          type: "table",
          name: "Test",
          order: ["formula.total", "formula.doublePriority"],
        },
      ],
    };

    const result = executeQuery(mockFiles, query);
    assert.strictEqual(result.rows[0]["formula.doublePriority"], 2);
    assert.strictEqual(result.rows[0]["formula.total"], 3);
    assert.strictEqual(result.rows[2]["formula.doublePriority"], 6);
    assert.strictEqual(result.rows[2]["formula.total"], 7);
  });

  it("should return undefined for circular formula references", () => {
    const query: BaseQuery = {
      formulas: {
        first: "formula.second + 1",
        second: "formula.first + 1",
      },
      views: [
        {
          type: "table",
          name: "Test",
          order: ["formula.first", "formula.second"],
        },
      ],
    };

    const result = executeQuery(mockFiles, query);
    assert.strictEqual(result.rows[0]["formula.first"], undefined);
    assert.strictEqual(result.rows[0]["formula.second"], undefined);
  });
});
