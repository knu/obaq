import type {
  BaseQuery,
  ObsidianFile,
  QueryResult,
  Column,
  Row,
} from "./types.js";
import { evaluateExpression } from "./evaluator.js";
import { applyFilter } from "./filter.js";

export function executeQuery(
  files: ObsidianFile[],
  query: BaseQuery
): QueryResult {
  const view = query.views?.[0];
  if (!view) {
    return { columns: [], rows: [] };
  }

  const computedRows: Row[] = applyFilter(files, view.filters).map((file) => {
    const row: Row = {};

    if (query.formulas) {
      for (const [key, expr] of Object.entries(query.formulas)) {
        const formulaKey = `formula.${key}`;
        row[formulaKey] = evaluateExpression(expr, file);
      }
    }

    for (const [key, value] of Object.entries(file)) {
      if (key !== "file" && key !== "content") {
        row[`note.${key}`] = value;
      }
    }

    row._file = file;
    return row;
  });

  if (view.sort) {
    computedRows.sort((a, b) => {
      for (const sortConfig of view.sort!) {
        const aVal = a[sortConfig.property] as any;
        const bVal = b[sortConfig.property] as any;

        let cmp = 0;
        if (aVal < bVal) cmp = -1;
        else if (aVal > bVal) cmp = 1;

        if (cmp !== 0) {
          return sortConfig.direction === "DESC" ? -cmp : cmp;
        }
      }
      return 0;
    });
  }

  const orderedColumns = view.order || [];
  const columns: Column[] = orderedColumns.map((colId) => {
    const displayName = query.properties?.[colId]?.displayName || colId;
    const size = view.columnSize?.[colId];
    return { id: colId, displayName, size };
  });

  const finalRows = computedRows.map((row) => {
    const finalRow: Row = {};
    for (const col of columns) {
      finalRow[col.id] = row[col.id];
    }
    return finalRow;
  });

  return { columns, rows: finalRows };
}
