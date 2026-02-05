# obaq

CLI query processor for Obsidian Bases

This tool aims to process Base queries with compatibility against the Obsidian Bases specifications.
For authoritative behavior and examples, refer to the official Obsidian documentation:
```
https://help.obsidian.md/bases
https://help.obsidian.md/bases/syntax
https://help.obsidian.md/bases/functions
https://help.obsidian.md/formulas
```

## Installation

```sh
npm install
npm run build
```

## Usage

```sh
obaq [-d VAULT_DIR] [-f FORMAT] (-e YAML | PATH.md)
```

- `-d|--directory VAULT_DIR`: Path to the Obsidian vault directory (defaults to current directory, searches for vault root).
- `-e|--eval YAML`: YAML query string or `@file.base` to load from file (use `@-` for stdin).
- `-t|--this PATH`: File path to use as the `this` context for base queries.
- `PATH.md`: Markdown file containing `\`\`\`base` blocks to evaluate and replace (use `-` for stdin).
- `-f|--format FORMAT`: Output format: `json` (default for `-e`), `csv`, `md`, or `markdown` (default for `PATH.md`).
- `--title-width MODE`: Table width calculation for Markdown output: `markup` (default) or `title`.

Specify either `-e/--eval` or a Markdown file.  You cannot use both at once.

## Output Format

The tool outputs JSON with the following structure:

```json
{
  "columns": [
    {
      "id": "formula.title",
      "displayName": "Title",
      "size": 286
    }
  ],
  "rows": [
    {
      "formula.title": "[Note Title](Notes/Note%20Title.md)",
      "formula.updated": "2024-01-20T14:45:00.000Z",
      "note.created": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Columns
- `id`: Column identifier (e.g., `formula.title` or `note.propertyName`)
- `displayName`: Human-readable column name
- `size`: Optional column width

### Rows
Each row contains values for the columns specified in the query's `order` field.

## Query Format

The tool supports YAML queries with the following structure:

```yaml
formulas:
  title: file.asLink(title)
  updated: updated.format("YYYY-MM-DD HH:mm:ss")
properties:
  formula.title:
    displayName: Title
  formula.updated:
    displayName: Updated
views:
  - type: table
    name: Table
    filters:
      and:
        - file.folder == "ChatGPT"
        - file.name != file.folder
    order:
      - formula.title
      - formula.updated
    sort:
      - property: formula.updated
        direction: DESC
    columnSize:
      formula.title: 286
```

### Formulas
JavaScript-like expressions evaluated in the context of each file:
- `file.name`: File name without extension
- `file.folder`: Folder path
- `file.path`: Full relative path
- `file.asLink(title)`: Generate a Markdown link
- All frontmatter properties are available as variables

### Filters
Boolean expressions or nested `and`/`or` structures:
```yaml
filters:
  and:
    - file.folder == "Notes"
    - created > "2024-01-01"
```

### Note on Date Handling

YAML datetime values are preserved as `Date` instances when parsed from frontmatter.  Format them explicitly when needed:
```yaml
updated: updated.format("YYYY-MM-DD HH:mm:ss")
```

## Examples

```sh
# Build the project
npm run build

# Query with inline YAML
node dist/cli.js -d test-vault -e "$(cat test-vault/query.base)"

# Query from file (inside vault)
node dist/cli.js -d test-vault -e @test-vault/query.base

# Process a Markdown file containing ```base blocks
node dist/cli.js -d test-vault test-vault/query.md

# Process stdin as Markdown (uses cwd as base)
cat test-vault/query.md | node dist/cli.js - -f markdown

# Output as CSV
node dist/cli.js -d test-vault -e @test-vault/query.base -f csv

# Output as markdown table
node dist/cli.js -d test-vault -e @test-vault/query.base -f md

# Run from within vault (auto-detects vault root)
cd test-vault
node ../dist/cli.js -e @query.base
```

## License

Copyright (c) 2025-2026 Akinori Musha

Licensed under the 2-clause BSD license.  See LICENSE for details.
