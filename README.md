# obsidian-base

CLI query processor for Obsidian Bases

## Installation

```sh
npm install
npm run build
```

## Usage

```sh
obsidian-base [-d VAULT_DIR] -e YAML [-f FORMAT]
```

- `-d|--directory VAULT_DIR`: Path to the Obsidian vault directory (defaults to current directory, searches for vault root)
- `-e|--eval YAML`: YAML query string or `@file.base` to load from file
- `-f|--format FORMAT`: Output format: `json` (default), `csv`, `md`, or `markdown`

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
      "formula.title": "[[Note Title]]",
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
  updated: updated.replace(/T(.+)Z/, " $1")
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
JavaScript expressions evaluated in the context of each file:
- `file.name`: File name without extension
- `file.folder`: Folder path
- `file.path`: Full relative path
- `file.asLink(title)`: Generate Obsidian link
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

YAML datetime values are converted to local timezone ISO 8601 strings (e.g., `2024-01-20T14:45:00+09:00`).

To extract just the time portion, use:
```yaml
updated: updated.replace(/T([^+]+)\+.+$/, " $1")
```
Result: `2024-01-20 14:45:00`

## Examples

```sh
# Build the project
npm run build

# Query with inline YAML
node dist/cli.js -d test-vault -e "$(cat test-vault/query.base)"

# Query from file (inside vault)
node dist/cli.js -d test-vault -e @test-vault/query.base

# Output as CSV
node dist/cli.js -d test-vault -e @test-vault/query.base -f csv

# Output as markdown table
node dist/cli.js -d test-vault -e @test-vault/query.base -f md

# Run from within vault (auto-detects vault root)
cd test-vault
node ../dist/cli.js -e @query.base
```

## License

Copyright (c) 2025 Akinori Musha

Licensed under the 2-clause BSD license.  See LICENSE for details.
