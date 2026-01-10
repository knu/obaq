import { describe, it } from "node:test";
import { Link } from "./functions.js";
import assert from "node:assert";
import { applyFilter } from "./filter.js";
import { VaultFile, type ObsidianFile, type Filter } from "./types.js";

const baseFileOptions = {
  ext: "md",
  size: 1024,
  ctime: new Date("2024-01-01"),
  mtime: new Date("2024-01-01"),
  tags: [],
};

function createMockFile(options: {
  name: string;
  folder: string;
  properties: Record<string, unknown>;
  content: string;
  links?: Link[];
  backlinks?: Link[];
}) {
  const path = `${options.folder}/${options.name}.md`;
  const file = new VaultFile({
    ...baseFileOptions,
    name: options.name,
    folder: options.folder,
    path,
    properties: options.properties,
  });
  file.setLinkResolver(() => options.links ?? []);
  file.setBacklinkResolver(() => options.backlinks ?? []);

  return {
    file,
    content: options.content,
    note: options.properties,
    ...options.properties,
  } as ObsidianFile;
}

const mockFiles: ObsidianFile[] = [
  createMockFile({
    name: "File1",
    folder: "Notes",
    properties: { title: "First File", status: "done" },
    content: "Content 1",
  }),
  createMockFile({
    name: "File2",
    folder: "Notes",
    properties: { title: "Second File", status: "pending" },
    content: "Content 2",
  }),
  createMockFile({
    name: "File3",
    folder: "Archive",
    properties: { title: "Third File", status: "done" },
    content: "Content 3",
  }),
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

  it("should filter using hasLink function", () => {
    const filesWithLinks: ObsidianFile[] = [
      createMockFile({
        name: "File1",
        folder: "Notes",
        properties: { title: "First File", status: "done" },
        content: "Content 1",
        links: [new Link("LinkedNote")],
      }),
      createMockFile({
        name: "File2",
        folder: "Notes",
        properties: { title: "Second File", status: "pending" },
        content: "Content 2",
        links: [],
      }),
    ];
    const filter: Filter = { and: ['file.hasLink("LinkedNote")'] };
    const result = applyFilter(filesWithLinks, filter);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].file.name, "File1");
  });

  it("should filter using multiple link names in hasLink", () => {
    const filesWithLinks: ObsidianFile[] = [
      createMockFile({
        name: "File1",
        folder: "Notes",
        properties: { title: "First File", status: "done" },
        content: "Content 1",
        links: [new Link("NoteA"), new Link("NoteB")],
      }),
      createMockFile({
        name: "File2",
        folder: "Notes",
        properties: { title: "Second File", status: "pending" },
        content: "Content 2",
        links: [new Link("NoteC")],
      }),
      createMockFile({
        name: "File3",
        folder: "Archive",
        properties: { title: "Third File", status: "done" },
        content: "Content 3",
        links: [],
      }),
    ];
    const filter: Filter = { and: ['file.hasLink("NoteA", "NoteC")'] };
    const result = applyFilter(filesWithLinks, filter);
    assert.strictEqual(result.length, 2);
    assert.ok(result.some((f) => f.file.name === "File1"));
    assert.ok(result.some((f) => f.file.name === "File2"));
  });

  it("should access backlinks property", () => {
    const filesWithBacklinks: ObsidianFile[] = [
      createMockFile({
        name: "File1",
        folder: "Notes",
        properties: { title: "First File", status: "done" },
        content: "Content 1",
        backlinks: [new Link("File2"), new Link("File3")],
      }),
      createMockFile({
        name: "File2",
        folder: "Notes",
        properties: { title: "Second File", status: "pending" },
        content: "Content 2",
        backlinks: [],
      }),
    ];
    const filter: Filter = { and: ["file.backlinks.length > 0"] };
    const result = applyFilter(filesWithBacklinks, filter);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].file.name, "File1");
  });

  it("should support hasLink with file object", () => {
    const targetFile = mockFiles[0];
    const filesWithLinks: ObsidianFile[] = [
      createMockFile({
        name: "File2",
        folder: "Notes",
        properties: { title: "Second File", status: "pending" },
        content: "Content 2",
        links: [new Link("File1")],
      }),
      createMockFile({
        name: "File3",
        folder: "Archive",
        properties: { title: "Third File", status: "done" },
        content: "Content 3",
        links: [],
      }),
    ];

    // Simulate file.hasLink(this.file) by passing file object
    const hasLinkToFile1 = filesWithLinks[0].file.hasLink(targetFile.file);
    assert.ok(hasLinkToFile1, "Should detect link using file object");

    const hasNoLink = filesWithLinks[1].file.hasLink(targetFile.file);
    assert.strictEqual(
      hasNoLink,
      false,
      "Should not detect link when none exists"
    );
  });
});
