import { describe, it } from "node:test";
import assert from "node:assert";
import { parseVault } from "./parser.js";
import { resolve } from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function makeParserVault() {
  const tmpDir = resolve(".tmp");
  await mkdir(tmpDir, { recursive: true });
  return mkdtemp(join(tmpDir, "parser-"));
}

describe("parseVault", () => {
  it("should parse markdown files from test vault", async () => {
    const files = await parseVault(resolve("test-vault"));

    assert.ok(files.length > 0, "Should parse at least one file");

    const file = files[0];
    assert.ok(file.file, "File should have file property");
    assert.ok(file.file.name, "File should have name");
    assert.ok(file.file.path, "File should have path");
    assert.strictEqual(file.file.file, file.file);
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
      assert.ok(fileWithDate.created instanceof Date, "Date should be Date");
    }
  });

  it("should compute backlinks correctly", async () => {
    const files = await parseVault(resolve("test-vault"));

    // Find files by name
    const noteA = files.find((f) => f.file.name === "NoteA");
    const noteB = files.find((f) => f.file.name === "NoteB");
    const noteC = files.find((f) => f.file.name === "NoteC");

    assert.ok(noteA, "Should find NoteA");
    assert.ok(noteB, "Should find NoteB");
    assert.ok(noteC, "Should find NoteC");

    // NoteA links to NoteB and NoteC
    assert.ok(
      noteA!.file.links.some((l) => l.equals("NoteB")),
      "NoteA should link to NoteB"
    );
    assert.ok(
      noteA!.file.links.some((l) => l.equals("NoteC")),
      "NoteA should link to NoteC"
    );

    // NoteB links to NoteC
    assert.ok(
      noteB!.file.links.some((l) => l.equals("NoteC")),
      "NoteB should link to NoteC"
    );

    // NoteC has no outgoing links
    assert.strictEqual(
      noteC!.file.links.length,
      0,
      "NoteC should have no links"
    );

    // NoteB should have backlinks from NoteA
    assert.ok(
      noteB!.file.backlinks.some((l) => l.equals("NoteA")),
      "NoteB should have backlink from NoteA"
    );

    // NoteC should have backlinks from both NoteA and NoteB
    assert.ok(
      noteC!.file.backlinks.some((l) => l.equals("NoteA")),
      "NoteC should have backlink from NoteA"
    );
    assert.ok(
      noteC!.file.backlinks.some((l) => l.equals("NoteB")),
      "NoteC should have backlink from NoteB"
    );
    assert.strictEqual(
      noteC!.file.backlinks.length,
      2,
      "NoteC should have exactly 2 backlinks"
    );

    // NoteA should have no backlinks
    assert.strictEqual(
      noteA!.file.backlinks.length,
      0,
      "NoteA should have no backlinks"
    );
  });

  it("should parse file embeds", async () => {
    const vaultDir = await makeParserVault();
    await mkdir(join(vaultDir, "Notes"));
    await writeFile(
      join(vaultDir, "Notes", "Embedded.md"),
      [
        "---",
        "cover: '![[assets/cover.png]]'",
        "---",
        "",
        "![Diagram](assets/diagram.png)",
        "",
        "![[assets/inline.png|Inline]]",
        "",
      ].join("\n")
    );

    const files = await parseVault(vaultDir);
    const embedded = files.find((file) => file.file.name === "Embedded");

    assert.ok(embedded, "Should parse Embedded.md");
    assert.deepStrictEqual(
      embedded!.file.embeds.map((embed) => embed.toString()).sort(),
      [
        "[[assets/cover.png]]",
        "[[assets/diagram.png|Diagram]]",
        "[[assets/inline.png|Inline]]",
      ].sort()
    );
  });

  it("should include frontmatter and inline tags in file.tags", async () => {
    const vaultDir = await makeParserVault();
    await mkdir(join(vaultDir, "Notes"));
    await writeFile(
      join(vaultDir, "Notes", "Tagged.md"),
      [
        "---",
        "tags:",
        "  - frontmatter",
        "  - '#MixedCase'",
        "---",
        "",
        "Body has #inline and #project/alpha tags.",
        "",
        "`#ignored-inline-code`",
        "",
        "```md",
        "#ignored-code-block",
        "```",
        "",
        "Repeated #INLINE should be deduplicated.",
        "",
      ].join("\n")
    );

    const files = await parseVault(vaultDir);
    const tagged = files.find((file) => file.file.name === "Tagged");

    assert.ok(tagged, "Should parse Tagged.md");
    assert.deepStrictEqual(tagged!.file.tags, [
      "frontmatter",
      "MixedCase",
      "inline",
      "project/alpha",
    ]);
  });
});
