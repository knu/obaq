# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the TypeScript source for the CLI and core query engine.  Tests live alongside code as `*.test.ts`.
- `dist/` is the compiled output from `tsc` and is the executable entrypoint (`dist/cli.js`).  Do not edit by hand.
- `test-vault/` is a sample Obsidian vault used by tests and manual runs (includes `.base` query files).
- `docs/` contains project notes and references.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run build`: compile TypeScript to `dist/`.
- `npm run dev`: watch build for local development.
- `npm run typecheck`: run `tsc --noEmit` for fast correctness checks.
- `npm run test`: build then run Node's test runner against `dist/**.test.js`.
- `npm run format`: Prettier formatting for `src/**/*.ts` and `test-vault/**/*.base`.
- `npm run lint`: run ESLint over `src/` (ensure config aligns with repo needs).

Example local run:
```sh
node dist/cli.js -d test-vault -e @test-vault/query.base -f md
```

## Coding Style & Naming Conventions
- Indentation is 2 spaces.  Semicolons are required.  Strings use double quotes (Prettier config).
- Follow existing naming: `*.test.ts` for tests, camelCase for variables/functions, PascalCase for types.
- Keep modules focused and prefer small, pure helpers in `src/` over large files.

## Testing Guidelines
- Tests are in `src/*.test.ts` and run via Node's built-in test runner after compilation.
- Keep tests deterministic and use `test-vault/` for fixtures and sample queries.
- Name new tests to match the source file (`parser.test.ts`, `query.test.ts`).

## Commit & Pull Request Guidelines
- Commit messages are short, imperative, and sentence case (e.g., “Add CI”, “Rename this tool to obaq”).
- PRs should include a concise description, the commands run (`npm run test`, `npm run typecheck`), and any CLI output changes or screenshots when output format is affected.

## Security & Configuration Tips
- The CLI reads local vault data.  Avoid committing real vault content or secrets.
- Treat `dist/` as build output; regenerate with `npm run build` after changes.
