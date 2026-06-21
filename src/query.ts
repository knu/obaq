import * as acorn from "acorn";
import type {
  BaseQuery,
  ObsidianFile,
  QueryResult,
  Column,
  Row,
  Filter,
  QueryGroup,
} from "./types.js";
import { evaluateExpression } from "./evaluator.js";
import { applyFilter } from "./filter.js";

export function executeQuery(
  files: ObsidianFile[],
  query: BaseQuery,
  thisContext?: ObsidianFile,
  viewName?: string
): QueryResult {
  const view = selectView(query, viewName);
  if (!view) {
    return { columns: [], rows: [] };
  }

  const combinedFilter = mergeFilters(query.filters, view.filters);
  const computedRows: Row[] = applyFilter(
    files,
    combinedFilter,
    thisContext,
    files
  ).map((file) => {
    const row: Row = {};
    const formulaValues = computeFormulaValues(
      file,
      query.formulas,
      thisContext,
      files
    );

    for (const [key, value] of Object.entries(formulaValues)) {
      row[`formula.${key}`] = value;
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
        const aVal = getRowValue(a, sortConfig.property) as any;
        const bVal = getRowValue(b, sortConfig.property) as any;

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

  const groupedRows = view.groupBy
    ? orderRowsByGroup(
        computedRows,
        view.groupBy.property,
        view.groupBy.direction
      )
    : computedRows;

  const limitedRows =
    view.limit === undefined
      ? groupedRows
      : groupedRows.slice(0, Math.max(0, view.limit));
  const orderedColumns = view.order || [];
  const columns: Column[] = orderedColumns.map((colId) => {
    const displayName = query.properties?.[colId]?.displayName || colId;
    const size = view.columnSize?.[colId];
    return { id: colId, displayName, size };
  });

  const finalRows = limitedRows.map((row) => {
    const finalRow: Row = {};
    for (const col of columns) {
      finalRow[col.id] = getRowValue(row, col.id);
    }
    return finalRow;
  });

  const result: QueryResult = { columns, rows: finalRows };
  if (view.groupBy) {
    result.groupBy = view.groupBy;
    result.groups = groupFinalRows(
      limitedRows,
      finalRows,
      view.groupBy.property
    );
  }
  if (view.summaries) {
    result.summaries = computeSummaries(
      view.summaries,
      query.summaries,
      limitedRows,
      files
    );
  }

  return result;
}

function selectView(query: BaseQuery, viewName?: string) {
  if (!viewName) {
    return query.views?.[0];
  }

  const view = query.views?.find((candidate) => candidate.name === viewName);
  if (!view) {
    throw new Error(`View not found: ${viewName}`);
  }
  return view;
}

function mergeFilters(
  baseFilter?: Filter,
  viewFilter?: Filter
): Filter | undefined {
  if (!baseFilter) return viewFilter;
  if (!viewFilter) return baseFilter;
  return { and: [baseFilter, viewFilter] };
}

function orderRowsByGroup(
  rows: Row[],
  property: string,
  direction: "ASC" | "DESC"
): Row[] {
  return groupRows(rows, property)
    .sort((a, b) => {
      const cmp = compareValues(a.value, b.value);
      return direction === "DESC" ? -cmp : cmp;
    })
    .flatMap((group) => group.rows);
}

function groupRows(rows: Row[], property: string): QueryGroup[] {
  const groups = new Map<string, QueryGroup>();

  for (const row of rows) {
    const value = getRowValue(row, property);
    const key = groupKey(value);
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, { value, rows: [row] });
    }
  }

  return [...groups.values()];
}

function groupFinalRows(
  sourceRows: Row[],
  finalRows: Row[],
  property: string
): QueryGroup[] {
  const groups = new Map<string, QueryGroup>();

  for (const [index, sourceRow] of sourceRows.entries()) {
    const value = getRowValue(sourceRow, property);
    const key = groupKey(value);
    const group = groups.get(key);
    if (group) {
      group.rows.push(finalRows[index]);
    } else {
      groups.set(key, { value, rows: [finalRows[index]] });
    }
  }

  return [...groups.values()];
}

function getRowValue(row: Row, property: string): unknown {
  if (property in row) return row[property];

  if (property.startsWith("file.")) {
    const file = (row._file as ObsidianFile | undefined)?.file;
    const key = property.slice("file.".length);
    return file ? (file as any)[key] : undefined;
  }

  return undefined;
}

function groupKey(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if ((a as any) < (b as any)) return -1;
  if ((a as any) > (b as any)) return 1;
  return 0;
}

function computeSummaries(
  viewSummaries: Record<string, string>,
  customSummaries: Record<string, string> | undefined,
  rows: Row[],
  files: ObsidianFile[]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(viewSummaries).map(([property, summaryName]) => {
      const values = rows.map((row) => getRowValue(row, property));
      return [
        property,
        evaluateSummary(summaryName, values, customSummaries, rows, files),
      ];
    })
  );
}

function evaluateSummary(
  summaryName: string,
  values: unknown[],
  customSummaries: Record<string, string> | undefined,
  rows: Row[],
  files: ObsidianFile[]
): unknown {
  const customExpression = customSummaries?.[summaryName];
  if (customExpression !== undefined) {
    const firstFile = getFirstSummaryFile(rows, files);
    if (!firstFile) return undefined;
    return evaluateExpression(
      customExpression,
      {
        ...firstFile,
        values,
      },
      firstFile,
      files
    );
  }

  return evaluateDefaultSummary(summaryName, values);
}

function getFirstSummaryFile(
  rows: Row[],
  files: ObsidianFile[]
): ObsidianFile | undefined {
  return (rows[0]?._file as ObsidianFile | undefined) ?? files[0];
}

function evaluateDefaultSummary(name: string, values: unknown[]): unknown {
  const numbers = values.filter(isFiniteNumber);
  const dates = values.filter((value): value is Date => value instanceof Date);

  switch (name) {
    case "Average":
      return numbers.length === 0 ? null : sum(numbers) / numbers.length;
    case "Min":
      return numbers.length === 0 ? null : Math.min(...numbers);
    case "Max":
      return numbers.length === 0 ? null : Math.max(...numbers);
    case "Sum":
      return sum(numbers);
    case "Range":
      if (numbers.length > 0)
        return Math.max(...numbers) - Math.min(...numbers);
      if (dates.length > 0) {
        return Math.max(...dates.map(Number)) - Math.min(...dates.map(Number));
      }
      return null;
    case "Median":
      return median(numbers);
    case "Stddev":
      return stddev(numbers);
    case "Earliest":
      return dates.length === 0
        ? null
        : new Date(Math.min(...dates.map(Number)));
    case "Latest":
      return dates.length === 0
        ? null
        : new Date(Math.max(...dates.map(Number)));
    case "Checked":
      return values.filter((value) => value === true).length;
    case "Unchecked":
      return values.filter((value) => value === false).length;
    case "Empty":
      return values.filter(isEmptyValue).length;
    case "Filled":
      return values.filter((value) => !isEmptyValue(value)).length;
    case "Unique":
      return new Set(values.map(groupKey)).size;
    default:
      return undefined;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return 0;
  const mean = sum(values) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Date) return false;
  if (value && typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

function computeFormulaValues(
  file: ObsidianFile,
  formulas: Record<string, string> | undefined,
  thisContext: ObsidianFile | undefined,
  files: ObsidianFile[]
): Record<string, unknown> {
  if (!formulas) return {};
  const definedFormulas = formulas;
  const circularFormulas = collectCircularFormulas(definedFormulas);

  const cache = new Map<string, unknown>();
  const visiting = new Set<string>();
  const formulaProxy = new Proxy(Object.create(null), {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      return resolveFormula(property);
    },
    has(_target, property) {
      return typeof property === "string" && property in definedFormulas;
    },
    ownKeys() {
      return Object.keys(definedFormulas);
    },
    getOwnPropertyDescriptor(_target, property) {
      if (typeof property !== "string" || !(property in definedFormulas)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
      };
    },
  });
  const contextWithFormulas = {
    ...file,
    formula: formulaProxy,
  };

  return Object.fromEntries(
    Object.keys(definedFormulas).map((key) => [key, resolveFormula(key)])
  );

  function resolveFormula(key: string): unknown {
    if (!(key in definedFormulas)) return undefined;
    if (cache.has(key)) return cache.get(key);
    if (circularFormulas.has(key)) {
      cache.set(key, undefined);
      return undefined;
    }
    if (visiting.has(key)) {
      throw new Error(`Circular formula reference: ${key}`);
    }

    visiting.add(key);
    try {
      const value = evaluateExpression(
        definedFormulas[key],
        contextWithFormulas,
        thisContext ?? file,
        files
      );
      cache.set(key, value);
      return value;
    } finally {
      visiting.delete(key);
    }
  }
}

function collectCircularFormulas(
  formulas: Record<string, string>
): Set<string> {
  const dependencies = new Map<string, string[]>();
  for (const [key, expr] of Object.entries(formulas)) {
    dependencies.set(
      key,
      findReferencedFormulas(expr).filter((name) => name in formulas)
    );
  }

  const circular = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const stackSet = new Set<string>();

  for (const key of Object.keys(formulas)) {
    visit(key);
  }

  return circular;

  function visit(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    stack.push(key);
    stackSet.add(key);

    for (const dependency of dependencies.get(key) ?? []) {
      if (stackSet.has(dependency)) {
        const index = stack.indexOf(dependency);
        for (const name of stack.slice(index)) {
          circular.add(name);
        }
        continue;
      }

      visit(dependency);
    }

    stack.pop();
    stackSet.delete(key);
  }
}

function findReferencedFormulas(expression: string): string[] {
  try {
    const transformed = expression.replace(/\bif\(/g, "_if(");
    const node = acorn.parseExpressionAt(transformed, 0, {
      ecmaVersion: "latest",
    }) as unknown as AcornNode;
    const references = new Set<string>();
    visitNode(node, (current) => {
      if (current.type !== "MemberExpression") return;
      const object = current.object as AcornNode;
      if (object.type !== "Identifier" || object.name !== "formula") return;

      const property = current.computed
        ? getLiteralPropertyName(current.property as AcornNode)
        : getIdentifierPropertyName(current.property as AcornNode);
      if (property) {
        references.add(property);
      }
    });
    return [...references];
  } catch {
    return [];
  }
}

type AcornNode = {
  type: string;
  [key: string]: unknown;
};

function visitNode(node: AcornNode, fn: (node: AcornNode) => void) {
  fn(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isAcornNode(child)) {
          visitNode(child, fn);
        }
      }
      continue;
    }

    if (isAcornNode(value)) {
      visitNode(value, fn);
    }
  }
}

function isAcornNode(value: unknown): value is AcornNode {
  return value !== null && typeof value === "object" && "type" in value;
}

function getIdentifierPropertyName(node: AcornNode): string | undefined {
  if (node.type !== "Identifier") return undefined;
  return typeof node.name === "string" ? node.name : undefined;
}

function getLiteralPropertyName(node: AcornNode): string | undefined {
  if (node.type !== "Literal") return undefined;
  return typeof node.value === "string" ? node.value : undefined;
}
