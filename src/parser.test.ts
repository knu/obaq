import { describe, it } from "node:test";
import assert from "node:assert";
import { parseVault } from "./parser.js";
import { resolve } from "node:path";

describe("parseVault", () => {
  it("should parse markdown files from test vault", async () => {
    const files = await parseVault(resolve("test-vault"));

    assert.ok(files.length > 0, "Should parse at least one file");

    const file = files[0];
    assert.ok(file.file, "File should have file property");
    assert.ok(file.file.name, "File should have name");
    assert.ok(file.file.path, "File should have path");
    assert.ok(
      typeof file.file.asLink === "function",
      "File should have asLink function"
    );
  });

  it("should parse frontmatter properties", async () => {
    const files = await parseVault(resolve("test-vault"));
    const chatGptFiles = files.filter((f) => f.file.folder === "ChatGPT");

    assert.ok(chatGptFiles.length > 0, "Should find files in ChatGPT folder");

    const fileWithProps = chatGptFiles.find((f) => f.title);
    assert.ok(fileWithProps, "Should find file with title property");
    assert.ok(
      typeof fileWithProps!.title === "string",
      "Title should be string"
    );
  });

  it("should convert dates to ISO format with timezone", async () => {
    const files = await parseVault(resolve("test-vault"));
    const fileWithDate = files.find((f) => f.created);

    if (fileWithDate) {
      assert.ok(
        typeof fileWithDate.created === "string",
        "Date should be string"
      );
      assert.ok(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(
          fileWithDate.created as string
        ),
        "Date should be in ISO format with timezone"
      );
    }
  });
});
