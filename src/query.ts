import * as acorn from "acorn";
import type {
  BaseQuery,
  ObsidianFile,
  QueryResult,
  Column,
  Row,
  Filter,
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

  const limitedRows =
    view.limit === undefined
      ? computedRows
      : computedRows.slice(0, Math.max(0, view.limit));
  const orderedColumns = view.order || [];
  const columns: Column[] = orderedColumns.map((colId) => {
    const displayName = query.properties?.[colId]?.displayName || colId;
    const size = view.columnSize?.[colId];
    return { id: colId, displayName, size };
  });

  const finalRows = limitedRows.map((row) => {
    const finalRow: Row = {};
    for (const col of columns) {
      finalRow[col.id] = row[col.id];
    }
    return finalRow;
  });

  return { columns, rows: finalRows };
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
      if (
        typeof property !== "string" ||
        !(property in definedFormulas)
      ) {
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

function collectCircularFormulas(formulas: Record<string, string>): Set<string> {
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
