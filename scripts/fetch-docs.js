import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const DOCS = [
  {
    name: "functions",
    pageUrl: "https://help.obsidian.md/bases/functions",
    outputPath: `${ROOT_DIR}/docs/functions.md`,
  },
  {
    name: "syntax",
    pageUrl: "https://help.obsidian.md/bases/syntax",
    outputPath: `${ROOT_DIR}/docs/syntax.md`,
  },
  {
    name: "formulas",
    pageUrl: "https://help.obsidian.md/formulas",
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

function extractPreloadUrl(html, pageUrl) {
  const match = html.match(/preloadPage=f\("([^"]+)"\)/);
  if (!match) {
    throw new Error(`Could not find preloadPage url in ${pageUrl}`);
  }
  return match[1];
}

async function updateDoc({ name, pageUrl, outputPath }) {
  const html = await fetchText(pageUrl);
  const preloadUrl = extractPreloadUrl(html, pageUrl);
  const markdown = await fetchText(preloadUrl);
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
