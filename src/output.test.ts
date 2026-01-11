import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Link } from "./functions.js";
import { createTableStringLength, formatResult } from "./output.js";
import type { QueryResult } from "./types.js";

describe("formatResult", () => {
  it("supports title width for links in markdown tables", () => {
    const result: QueryResult = {
      columns: [{ id: "title", displayName: "Title" }],
      rows: [{ title: new Link("VeryLongPathName", "A") }],
    };

    const markup = formatResult(result, "markdown", { titleWidth: "markup" });
    const title = formatResult(result, "markdown", { titleWidth: "title" });

    assert.notStrictEqual(markup, title);
    assert.ok(markup.split("\n")[0].length > title.split("\n")[0].length);
  });
});

describe("createTableStringLength", () => {
  it("measures display width for emoji", () => {
    const width = createTableStringLength("markup");
    assert.strictEqual(width("🙂"), 2);
    assert.strictEqual(width("a🙂b"), 4);
  });

  it("uses link titles for width when configured", () => {
    const width = createTableStringLength("title");
    assert.strictEqual(width("[[Page|🙂]]"), 2);
    assert.strictEqual(width("[Title](path.md)"), 5);
  });
});
