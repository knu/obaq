import { describe, it } from "node:test";
import { Link } from "./functions.js";
import assert from "node:assert";
import { evaluateExpression } from "./evaluator.js";
import type { ObsidianFile } from "./types.js";

const mockFile: ObsidianFile = {
  file: {
    name: "Test",
    folder: "Notes",
    path: "Notes/Test.md",
    ext: "md",
    size: 1024,
    ctime: new Date("2024-01-15T10:30:00+00:00"),
    mtime: new Date("2024-01-20T14:45:00+00:00"),
    properties: {},
    tags: ["tag1", "tag2"],
    links: [],
    backlinks: [],
    hasLink: () => false,
    asLink: (title) => new Link("Test", title),
    hasTag: (...tags) => tags.some((t) => ["tag1", "tag2"].includes(t)),
    hasProperty: (name) => name in mockFile,
    inFolder: (folder) =>
      "Notes" === folder || "Notes".startsWith(folder + "/"),
  },
  content: "Test content",
  note: {
    title: "Test Note",
    tags: ["tag1", "tag2"],
    links: [],
    backlinks: [],
    hasLink: () => false,
    created: "2024-01-15T10:30:00+00:00",
    updated: "2024-01-20T14:45:00+00:00",
  },
  title: "Test Note",
  tags: ["tag1", "tag2"],
  links: [],
  backlinks: [],
  hasLink: () => false,
  created: "2024-01-15T10:30:00+00:00",
  updated: "2024-01-20T14:45:00+00:00",
};

describe("evaluateExpression", () => {
  it("should evaluate file properties", () => {
    assert.strictEqual(evaluateExpression("file.name", mockFile), "Test");
    assert.strictEqual(evaluateExpression("file.folder", mockFile), "Notes");
  });

  it("should evaluate file.asLink", () => {
    const result = evaluateExpression("file.asLink(title)", mockFile) as string;
    assert.strictEqual(result, "[Test Note](Test.md)");
  });

  it("should evaluate frontmatter properties", () => {
    assert.strictEqual(evaluateExpression("title", mockFile), "Test Note");
  });

  it("should support global functions", () => {
    assert.strictEqual(evaluateExpression("max(1, 2, 3)", mockFile), 3);
    assert.strictEqual(evaluateExpression("min(1, 2, 3)", mockFile), 1);
  });

  it("should support if function", () => {
    assert.strictEqual(
      evaluateExpression('if(file.size > 1000, "large", "small")', mockFile),
      "large"
    );
    assert.strictEqual(
      evaluateExpression('if(file.size < 100, "small", "large")', mockFile),
      "large"
    );
    assert.strictEqual(
      evaluateExpression("if(title, title, file.name)", mockFile),
      "Test Note"
    );
  });

  it("should support string methods", () => {
    const result = evaluateExpression("title.lower()", mockFile);
    assert.strictEqual(result, "test note");
  });

  it("should support date formatting", () => {
    const result = evaluateExpression(
      'date(created).format("YYYY-MM-DD")',
      mockFile
    );
    assert.strictEqual(result, "2024-01-15");
  });

  it("should support link creation", () => {
    const result = evaluateExpression(
      'link("path", "display")',
      mockFile
    ) as Link;
    assert.ok(result instanceof Link);
    assert.strictEqual(result.toString(), "[[path|display]]");
  });

  it("should return undefined for invalid expressions", () => {
    assert.strictEqual(
      evaluateExpression("nonexistent.property", mockFile),
      undefined
    );
  });
});

describe("evaluateExpression as condition", () => {
  it("should evaluate boolean expressions", () => {
    assert.strictEqual(
      !!evaluateExpression('file.folder == "Notes"', mockFile),
      true
    );
    assert.strictEqual(
      !!evaluateExpression('file.folder == "Other"', mockFile),
      false
    );
  });

  it("should evaluate string comparisons", () => {
    assert.strictEqual(
      !!evaluateExpression('title.contains("Test")', mockFile),
      true
    );
    assert.strictEqual(
      !!evaluateExpression('title.contains("Missing")', mockFile),
      false
    );
  });

  it("should return undefined for invalid conditions", () => {
    assert.strictEqual(
      evaluateExpression("invalid syntax {", mockFile),
      undefined
    );
  });
});
