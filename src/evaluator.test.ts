import { describe, it } from "node:test";
import dayjs from "dayjs";
import { Link } from "./functions.js";
import { VaultFile } from "./types.js";
import assert from "node:assert";
import { evaluateExpression } from "./evaluator.js";
import type { ObsidianFile } from "./types.js";

const mockFile: ObsidianFile = {
  file: new VaultFile({
    name: "Test",
    folder: "Notes",
    path: "Notes/Test.md",
    ext: "md",
    size: 1024,
    ctime: new Date("2024-01-15T10:30:00+00:00"),
    mtime: new Date("2024-01-20T14:45:00+00:00"),
    properties: {},
    tags: ["tag1", "tag2"],
  }),
  content: "Test content",
  note: {
    title: "Test Note",
    tags: ["tag1", "tag2"],
    links: [],
    backlinks: [],
    hasLink: () => false,
    created: new Date("2024-01-15T10:30:00+00:00"),
    updated: new Date("2024-01-20T14:45:00+00:00"),
  },
  title: "Test Note",
  tags: ["tag1", "tag2"],
  links: [],
  backlinks: [],
  hasLink: () => false,
  created: new Date("2024-01-15T10:30:00+00:00"),
  updated: new Date("2024-01-20T14:45:00+00:00"),
};

mockFile.file.setLinkResolver(() => []);
mockFile.file.setBacklinkResolver(() => []);

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

  it("should support date arithmetic with durations", () => {
    const result = evaluateExpression(
      'date("2024-12-01") + "1M" + "4h" + "3m"',
      mockFile
    ) as Date;
    const formatted = dayjs(result).format("YYYY-MM-DD HH:mm:ss");
    assert.strictEqual(formatted, "2025-01-01 04:03:00");
  });

  it("should support date plus duration values", () => {
    const result = evaluateExpression(
      'date("2024-12-01") + duration("1M")',
      mockFile
    ) as Date;
    const formatted = dayjs(result).format("YYYY-MM-DD HH:mm:ss");
    assert.strictEqual(formatted, "2025-01-01 00:00:00");
  });

  it("should handle month boundaries in date arithmetic", () => {
    const result = evaluateExpression(
      'date("2024-01-31") + "1M"',
      mockFile
    ) as Date;
    const formatted = dayjs(result).format("YYYY-MM-DD HH:mm:ss");
    assert.strictEqual(formatted, "2024-02-29 00:00:00");
  });

  it("should handle month boundaries in date subtraction", () => {
    const endOfMonth = evaluateExpression(
      'date("2024-01-31") - "2M"',
      mockFile
    ) as Date;
    assert.strictEqual(
      dayjs(endOfMonth).format("YYYY-MM-DD HH:mm:ss"),
      "2023-11-30 00:00:00"
    );

    const midMonth = evaluateExpression(
      'date("2024-02-28") - "2M"',
      mockFile
    ) as Date;
    assert.strictEqual(
      dayjs(midMonth).format("YYYY-MM-DD HH:mm:ss"),
      "2023-12-28 00:00:00"
    );
  });

  it("should handle arithmetic, unary, comparison, and logical operators", () => {
    assert.strictEqual(evaluateExpression("(2 + 3) * (9 - 7)", mockFile), 10);
    assert.strictEqual(evaluateExpression("-(1 + 2) + +3", mockFile), 0);
    assert.strictEqual(evaluateExpression("5 > 3", mockFile), true);
    assert.strictEqual(
      evaluateExpression('5 > 3 && "a" == "a"', mockFile),
      true
    );
  });

  it("should support regexp matches", () => {
    assert.strictEqual(
      evaluateExpression('/abc/.matches("abcde")', mockFile),
      true
    );
    assert.strictEqual(
      evaluateExpression('/abc/.matches("def")', mockFile),
      false
    );
    assert.strictEqual(
      evaluateExpression('/a[^/]c\\/d/.matches("abc/def")', mockFile),
      true
    );
  });

  it("should support link creation", () => {
    const result = evaluateExpression(
      'link("path", "display")',
      mockFile
    ) as Link;
    assert.ok(result instanceof Link);
    assert.strictEqual(result.toString(), "[[path|display]]");
  });

  it("should support file methods", () => {
    assert.strictEqual(
      evaluateExpression('file.hasProperty("title")', mockFile),
      false
    );
    assert.strictEqual(
      evaluateExpression('file.hasTag("tag1")', mockFile),
      true
    );
    assert.strictEqual(
      evaluateExpression('file.inFolder("Notes")', mockFile),
      true
    );
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
