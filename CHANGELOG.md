# Changelog

## 1.2.0
- Improve compatibility with current Obsidian Bases syntax.
- Support formula-to-formula references.
- Support selecting named views and view row limits.
- Support view `groupBy` metadata and view summaries.
- Add `file.file` and `file.embeds`.
- Parse Obsidian Flavored Markdown wikilinks and embeds with OFM parser extensions.
- Include inline tags in `file.tags` and support nested tags in `file.hasTag()`.
- Compare Link and File values by target in equality checks and list `contains()`.
- Return Link objects from `file.asLink()`.
- Publish npm releases with GitHub trusted publishing.

## 1.1.0
- Improve Bases function coverage and compatibility.
- Add undocumented list functions noted in the changelog: `mean()`, `median()`, `stddev()`.
- Add undocumented global `random()`.
- Add string `replace()`.
- Add date fields: `year`, `month`, `day`, `hour`, `minute`, `second`, `millisecond`.
- Add file `basename`.
- Improve `link.linksTo()` resolution.
- Update list `sort()` to support comparator arguments.

## 1.0.2
- Add `--title-width` to control Markdown table width calculations for links.
- Use `string-width` for display-width alignment (emoji and fullwidth aware).

## 1.0.1
- Add `--this`/`-t` to set the query context file for Base filters.
- Add `--help`/`-h` and improve CLI error messaging for invalid options.

## 1.0.0
- Initial release.
