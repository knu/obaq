import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const DOCS = [
  {
    name: "functions",
    markdownUrl:
      "https://raw.githubusercontent.com/obsidianmd/obsidian-help/refs/heads/master/en/Bases/Functions.md",
    outputPath: `${ROOT_DIR}/docs/functions.md`,
  },
  {
    name: "syntax",
    markdownUrl:
      "https://raw.githubusercontent.com/obsidianmd/obsidian-help/refs/heads/master/en/Bases/Bases%20syntax.md",
    outputPath: `${ROOT_DIR}/docs/syntax.md`,
  },
  {
    name: "formulas",
    markdownUrl:
      "https://raw.githubusercontent.com/obsidianmd/obsidian-help/refs/heads/master/en/Bases/Formulas.md",
    outputPath: `${ROOT_DIR}/docs/formulas.md`,
  },
];

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function updateDoc({ name, markdownUrl, outputPath }) {
  const markdown = await fetchText(markdownUrl);
  const normalized = markdown.replace(/\r\n/g, "\n");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    normalized.endsWith("\n") ? normalized : `${normalized}\n`
  );
  console.log(`Updated ${name}: ${outputPath}`);
}

async function main() {
  for (const doc of DOCS) {
    await updateDoc(doc);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
