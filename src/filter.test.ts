import { describe, it } from "node:test";
import assert from "node:assert";
import { applyFilter } from "./filter.js";
import type { ObsidianFile, Filter } from "./types.js";

const mockFiles: ObsidianFile[] = [
  {
    file: {
      name: "File1",
      folder: "Notes",
      path: "Notes/File1.md",
      ext: "md",
      size: 1024,
      ctime: new Date("2024-01-01"),
      mtime: new Date("2024-01-01"),
      properties: { title: "First File", status: "done" },
      tags: [],
      asLink: () => "[[File1]]",
      hasTag: () => false,
      hasProperty: (n) => n === "title" || n === "status",
      inFolder: (f) => "Notes" === f,
    },
    content: "Content 1",
    note: { title: "First File", status: "done" },
    title: "First File",
    status: "done",
  },
  {
    file: {
      name: "File2",
      folder: "Notes",
      path: "Notes/File2.md",
      ext: "md",
      size: 1024,
      ctime: new Date("2024-01-01"),
      mtime: new Date("2024-01-01"),
      properties: { title: "Second File", status: "pending" },
      tags: [],
      asLink: () => "[[File2]]",
      hasTag: () => false,
      hasProperty: (n) => n === "title" || n === "status",
      inFolder: (f) => "Notes" === f,
    },
    content: "Content 2",
    note: { title: "Second File", status: "pending" },
    title: "Second File",
    status: "pending",
  },
  {
    file: {
      name: "File3",
      folder: "Archive",
      path: "Archive/File3.md",
      ext: "md",
      size: 1024,
      ctime: new Date("2024-01-01"),
      mtime: new Date("2024-01-01"),
      properties: { title: "Third File", status: "done" },
      tags: [],
      asLink: () => "[[File3]]",
      hasTag: () => false,
      hasProperty: (n) => n === "title" || n === "status",
      inFolder: (f) => "Archive" === f,
    },
    content: "Content 3",
    note: { title: "Third File", status: "done" },
    title: "Third File",
    status: "done",
  },
];

describe("applyFilter", () => {
  it("should return all files when filter is undefined", () => {
    const result = applyFilter(mockFiles, undefined);
    assert.strictEqual(result.length, 3);
  });

  it("should filter by single condition", () => {
    const filter: Filter = { and: ['file.folder == "Notes"'] };
    const result = applyFilter(mockFiles, filter);
    assert.strictEqual(result.length, 2);
    assert.ok(result.every((f) => f.file.folder === "Notes"));
  });

  it("should filter with AND logic", () => {
    const filter: Filter = {
      and: ['file.folder == "Notes"', 'status == "done"'],
    };
    const result = applyFilter(mockFiles, filter);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].file.name, "File1");
  });

  it("should filter with OR logic", () => {
    const filter: Filter = {
      or: ['file.folder == "Archive"', 'status == "pending"'],
    };
    const result = applyFilter(mockFiles, filter);
    assert.strictEqual(result.length, 2);
  });

  it("should handle string methods in filters", () => {
    const filter: Filter = { and: ['title.contains("Second")'] };
    const result = applyFilter(mockFiles, filter);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, "Second File");
  });

  it("should handle complex nested filters", () => {
    const filter: Filter = {
      and: [
        'file.folder == "Notes"',
        { or: ['status == "done"', 'title.contains("Second")'] },
      ],
    };
    const result = applyFilter(mockFiles, filter as any);
    assert.strictEqual(result.length, 2);
  });

  it("should filter with NOT logic using string condition", () => {
    const filter: Filter = { not: ['status == "done"'] };
    const result = applyFilter(mockFiles, filter);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].status, "pending");
  });

  it("should filter with NOT logic using multiple conditions", () => {
    const filter: Filter = {
      not: ['file.folder == "Archive"', 'status == "done"'],
    };
    const result = applyFilter(mockFiles, filter);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].file.name, "File2");
  });

  it("should filter with NOT logic using nested filter", () => {
    const filter: Filter = {
      not: [{ and: ['file.folder == "Notes"', 'status == "done"'] }],
    };
    const result = applyFilter(mockFiles, filter);
    assert.strictEqual(result.length, 2);
    assert.ok(
      result.some((f) => f.file.name === "File2") &&
        result.some((f) => f.file.name === "File3")
    );
  });

  it("should combine NOT with other operators", () => {
    const filter: Filter = {
      and: ['file.folder == "Notes"', { not: ['status == "done"'] }],
    };
    const result = applyFilter(mockFiles, filter);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].file.name, "File2");
  });
});
