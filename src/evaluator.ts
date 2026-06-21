import * as acorn from "acorn";
import dayjs from "dayjs";
import { VaultFile, type ObsidianFile } from "./types.js";
import {
  globalFunctions,
  stringExtensions,
  numberExtensions,
  arrayExtensions,
  dateExtensions,
  objectExtensions,
  regexpExtensions,
  Duration,
  parseDuration,
  Link,
  installDateFieldExtensions,
  valuesEqual,
} from "./functions.js";

let prototypesInitialized = false;

function setupPrototypeExtensions() {
  if (prototypesInitialized) return;
  prototypesInitialized = true;

  Object.assign(String.prototype, stringExtensions, {
    format: dateExtensions.format,
    time: dateExtensions.time,
    relative: dateExtensions.relative,
  });
  Object.assign(Number.prototype, numberExtensions);
  Object.assign(Array.prototype, arrayExtensions);
  Object.assign(Date.prototype, dateExtensions);
  Object.assign(Object.prototype, objectExtensions);
  Object.assign(RegExp.prototype, regexpExtensions);
  installDateFieldExtensions();

  if (!("isTruthy" in Object.prototype)) {
    Object.defineProperty(Object.prototype, "isTruthy", {
      value: function isTruthy() {
        return !!this;
      },
      enumerable: false,
    });
  }
  if (!("isType" in Object.prototype)) {
    Object.defineProperty(Object.prototype, "isType", {
      value: function isType(type: string) {
        const value = this?.valueOf?.() ?? this;
        switch (type) {
          case "string":
          case "number":
          case "boolean":
          case "bigint":
          case "symbol":
          case "function":
          case "undefined":
            return typeof value === type;
          case "null":
            return value === null;
          case "list":
          case "array":
            return Array.isArray(value);
          case "date":
            return value instanceof Date;
          case "link":
            return value instanceof Link;
          case "object":
            return (
              typeof value === "object" &&
              value !== null &&
              !Array.isArray(value)
            );
          default:
            return false;
        }
      },
      enumerable: false,
    });
  }
}

export function evaluateExpression(
  expr: string,
  context: ObsidianFile,
  thisContext: ObsidianFile = context,
  vaultFiles?: ObsidianFile[]
): unknown {
  setupPrototypeExtensions();
  if (vaultFiles) {
    Link.setResolver((link) => resolveFile(link, vaultFiles));
  }

  try {
    // Replace if( with _if( to avoid reserved keyword
    const transformedExpr = expr.replace(/\bif\(/g, "_if(");
    const evalContext = createEvalContext(context, thisContext);
    const funcs = createGlobalFunctions(vaultFiles);
    const node = parseExpression(transformedExpr);

    return evaluateNode(node, evalContext, funcs, thisContext);
  } catch (error) {
    console.error("Formula evaluation error:", error);
    return undefined;
  } finally {
    Link.setResolver(undefined);
  }
}

function createEvalContext(
  context: ObsidianFile,
  thisContext: ObsidianFile
): ObsidianFile {
  const fileProxy = Object.create(context.file);
  Object.defineProperty(fileProxy, "asLink", {
    value: (title?: string) => context.file.asLink(title),
    enumerable: true,
  });

  return {
    ...context,
    file: fileProxy,
  };
}

function createGlobalFunctions(vaultFiles?: ObsidianFile[]) {
  return {
    ...globalFunctions,
    escapeHTML: (html: string): string =>
      String(html)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;"),
    html: (html: string): string => String(html),
    image: (path: string | { path?: string }): string =>
      typeof path === "string" ? path : String(path?.path ?? ""),
    icon: (name: string): string => String(name),
    file: (path: string | Link | ObsidianFile | VaultFile) =>
      resolveFile(path, vaultFiles),
  };
}

const ALLOWED_METHODS: Record<string, Set<string>> = {
  any: new Set(["isTruthy", "isType", "toString"]),
  string: new Set([
    "contains",
    "containsAll",
    "containsAny",
    "endsWith",
    "isEmpty",
    "lower",
    "replace",
    "repeat",
    "reverse",
    "slice",
    "split",
    "startsWith",
    "title",
    "trim",
  ]),
  number: new Set(["abs", "ceil", "floor", "isEmpty", "round", "toFixed"]),
  array: new Set([
    "contains",
    "containsAll",
    "containsAny",
    "filter",
    "flat",
    "isEmpty",
    "join",
    "map",
    "mean",
    "median",
    "reduce",
    "reverse",
    "slice",
    "sort",
    "stddev",
    "unique",
  ]),
  date: new Set(["date", "format", "time", "relative", "isEmpty"]),
  file: new Set(["asLink", "hasLink", "hasProperty", "hasTag", "inFolder"]),
  object: new Set(["isEmpty", "keys", "values"]),
  link: new Set(["asFile", "linksTo"]),
  regexp: new Set(["matches"]),
};

function resolveFile(
  value: string | Link | ObsidianFile | VaultFile,
  vaultFiles?: ObsidianFile[]
) {
  if (!vaultFiles) return undefined;

  const file = resolveFileValue(value);
  if (file) return file;

  const path = resolveFilePath(value);
  if (!path) return undefined;

  const normalized = normalizePath(path);
  const found =
    vaultFiles.find((file) => file.file.path === normalized) ??
    vaultFiles.find((file) => file.file.name === normalized);
  return found?.file;
}

type AstNode = any;

function parseExpression(expression: string): AstNode {
  const node = acorn.parseExpressionAt(expression, 0, {
    ecmaVersion: "latest",
  });
  if (expression.slice(node.end).trim().length > 0) {
    throw new Error("Unexpected input after expression.");
  }
  return node;
}

function evaluateNode(
  node: AstNode,
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
): unknown {
  switch (node.type) {
    case "Literal": {
      const literal = node as AstNode;
      if (literal.regex) {
        return new RegExp(literal.regex.pattern, literal.regex.flags);
      }
      return literal.value;
    }
    case "Identifier": {
      const identifier = node as AstNode;
      const name = identifier.name as string;
      if (name in context) return (context as any)[name];
      if (name in functions) return (functions as any)[name];
      return undefined;
    }
    case "ThisExpression":
      return thisContext;
    case "MemberExpression":
      return getMemberValue(node as AstNode, context, functions, thisContext);
    case "CallExpression":
      return evaluateCall(node as AstNode, context, functions, thisContext);
    case "UnaryExpression":
      return evaluateUnary(node as AstNode, context, functions, thisContext);
    case "BinaryExpression":
      return evaluateBinary(node as AstNode, context, functions, thisContext);
    case "LogicalExpression":
      return evaluateLogical(node as AstNode, context, functions, thisContext);
    case "ConditionalExpression":
      return evaluateConditional(
        node as AstNode,
        context,
        functions,
        thisContext
      );
    case "ArrayExpression":
      return (node as AstNode).elements.map((element: AstNode | null) =>
        element ? evaluateNode(element, context, functions, thisContext) : null
      );
    case "ObjectExpression":
      return evaluateObject(node as AstNode, context, functions, thisContext);
    default:
      throw new Error(`Unsupported expression type: ${node.type}`);
  }
}

function evaluateObject(
  node: AstNode,
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
) {
  const obj: Record<string, unknown> = {};
  for (const property of node.properties) {
    if (property.type === "Property") {
      if (property.kind !== "init") {
        throw new Error(`Unsupported object property kind: ${property.kind}`);
      }
      const key = property.computed
        ? evaluateNode(property.key, context, functions, thisContext)
        : getPropertyKey(property.key);
      if (typeof key !== "string" && typeof key !== "number") {
        throw new Error("Invalid object key.");
      }
      obj[String(key)] = evaluateNode(
        property.value,
        context,
        functions,
        thisContext
      );
    } else if (property.type === "SpreadElement") {
      const spreadValue = evaluateNode(
        property.argument,
        context,
        functions,
        thisContext
      );
      if (spreadValue && typeof spreadValue === "object") {
        Object.assign(obj, spreadValue as Record<string, unknown>);
      }
    } else {
      throw new Error(`Unsupported object property: ${property.type}`);
    }
  }
  return obj;
}

function evaluateCall(
  node: AstNode,
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
) {
  if (node.callee.type === "Identifier") {
    const args = node.arguments.map((arg: AstNode) =>
      evaluateNode(arg, context, functions, thisContext)
    );
    const name = node.callee.name as string;
    const fn = (functions as any)[name];
    if (typeof fn !== "function") return undefined;
    return fn(...args);
  }

  if (node.callee.type === "MemberExpression") {
    const { receiver, value, property } = resolveMember(
      node.callee,
      context,
      functions,
      thisContext
    );
    if (typeof property !== "string") return undefined;
    if (Array.isArray(receiver)) {
      const listResult = evaluateListMethod(
        property,
        receiver,
        node.arguments,
        context,
        functions,
        thisContext
      );
      if (listResult !== undefined) return listResult;
    }
    if (!isAllowedMethod(receiver, property)) return undefined;
    if (typeof value !== "function") return undefined;
    const args = node.arguments.map((arg: AstNode) =>
      evaluateNode(arg, context, functions, thisContext)
    );
    return value.apply(receiver, args);
  }

  throw new Error("Unsupported callee type.");
}

function evaluateListMethod(
  property: string,
  receiver: unknown[],
  args: AstNode[],
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
): unknown {
  if (property === "filter") {
    const expr = args[0];
    if (!expr) return [];
    return receiver.filter((value, index) => {
      const iterationContext = { ...context, value, index };
      return !!evaluateNode(expr, iterationContext, functions, thisContext);
    });
  }
  if (property === "map") {
    const expr = args[0];
    if (!expr) return [];
    return receiver.map((value, index) => {
      const iterationContext = { ...context, value, index };
      return evaluateNode(expr, iterationContext, functions, thisContext);
    });
  }
  if (property === "reduce") {
    const expr = args[0];
    if (!expr) return undefined;
    const hasInitial = args.length > 1;
    let acc = hasInitial
      ? evaluateNode(args[1], context, functions, thisContext)
      : undefined;
    let startIndex = 0;
    if (!hasInitial && receiver.length > 0) {
      acc = receiver[0];
      startIndex = 1;
    }
    for (let index = startIndex; index < receiver.length; index += 1) {
      const value = receiver[index];
      const iterationContext = { ...context, value, index, acc };
      acc = evaluateNode(expr, iterationContext, functions, thisContext);
    }
    return acc;
  }
  return undefined;
}

function getMemberValue(
  node: AstNode,
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
) {
  return resolveMember(node, context, functions, thisContext).value;
}

function resolveMember(
  node: AstNode,
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
) {
  const receiver = evaluateNode(node.object, context, functions, thisContext);
  if (receiver === null || receiver === undefined) {
    return { receiver, value: undefined, property: undefined };
  }
  const property = node.computed
    ? evaluateNode(node.property, context, functions, thisContext)
    : getPropertyKey(node.property);
  if (
    typeof property !== "string" &&
    typeof property !== "number" &&
    typeof property !== "symbol"
  ) {
    return { receiver, value: undefined, property };
  }
  if (isUnsafeProperty(property)) {
    return { receiver, value: undefined, property };
  }
  return { receiver, value: (receiver as any)[property], property };
}

function evaluateUnary(
  node: AstNode,
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
) {
  const arg = evaluateNode(node.argument, context, functions, thisContext);
  switch (node.operator) {
    case "!":
      return !arg;
    case "+":
      return +(arg as any);
    case "-":
      return -(arg as any);
    case "typeof":
      return typeof arg;
    case "void":
      return void arg;
    default:
      throw new Error(`Unsupported unary operator: ${node.operator}`);
  }
}

function evaluateBinary(
  node: AstNode,
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
) {
  const left = evaluateNode(node.left, context, functions, thisContext);
  const right = evaluateNode(node.right, context, functions, thisContext);
  switch (node.operator) {
    case "+":
      if (left instanceof Date) {
        const duration = coerceDuration(right);
        if (duration) return applyDuration(left, duration, 1);
      }
      if (left instanceof Duration || right instanceof Duration) {
        throw new Error("Cannot add durations directly.");
      }
      return (left as any) + (right as any);
    case "-":
      if (left instanceof Date) {
        const duration = coerceDuration(right);
        if (duration) return applyDuration(left, duration, -1);
      }
      if (left instanceof Duration || right instanceof Duration) {
        throw new Error("Cannot subtract durations directly.");
      }
      return (left as any) - (right as any);
    case "*":
      if (left instanceof Duration && typeof right === "number") {
        return new Duration(left.value * right, left.unit);
      }
      return (left as any) * (right as any);
    case "/":
      if (left instanceof Duration && typeof right === "number") {
        return new Duration(left.value / right, left.unit);
      }
      return (left as any) / (right as any);
    case "%":
      return (left as any) % (right as any);
    case "==":
      return valuesEqual(left, right, { coerce: true });
    case "!=":
      return !valuesEqual(left, right, { coerce: true });
    case "===":
      return (left as any) === (right as any);
    case "!==":
      return (left as any) !== (right as any);
    case "<":
      return (left as any) < (right as any);
    case "<=":
      return (left as any) <= (right as any);
    case ">":
      return (left as any) > (right as any);
    case ">=":
      return (left as any) >= (right as any);
    default:
      throw new Error(`Unsupported binary operator: ${node.operator}`);
  }
}

function coerceDuration(value: unknown): Duration | undefined {
  if (value instanceof Duration) return value;
  if (typeof value === "string") return parseDuration(value);
  return undefined;
}

function applyDuration(
  date: Date,
  duration: Duration,
  direction: number
): Date {
  return dayjs(date)
    .add(duration.value * direction, duration.unit)
    .toDate();
}

function evaluateLogical(
  node: AstNode,
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
) {
  if (node.operator === "&&") {
    const left = evaluateNode(node.left, context, functions, thisContext);
    return left
      ? evaluateNode(node.right, context, functions, thisContext)
      : left;
  }
  if (node.operator === "||") {
    const left = evaluateNode(node.left, context, functions, thisContext);
    return left
      ? left
      : evaluateNode(node.right, context, functions, thisContext);
  }
  if (node.operator === "??") {
    const left = evaluateNode(node.left, context, functions, thisContext);
    return left ?? evaluateNode(node.right, context, functions, thisContext);
  }
  throw new Error(`Unsupported logical operator: ${node.operator}`);
}

function evaluateConditional(
  node: AstNode,
  context: ObsidianFile,
  functions: Record<string, unknown>,
  thisContext: ObsidianFile
) {
  const test = evaluateNode(node.test, context, functions, thisContext);
  return test
    ? evaluateNode(node.consequent, context, functions, thisContext)
    : evaluateNode(node.alternate, context, functions, thisContext);
}

function getPropertyKey(node: AstNode) {
  if (node.type === "Identifier") {
    return (node as AstNode).name as string;
  }
  if (node.type === "Literal") {
    return (node as AstNode).value;
  }
  throw new Error("Unsupported property key.");
}

function isAllowedMethod(receiver: unknown, property: string): boolean {
  if (ALLOWED_METHODS.any.has(property)) return true;
  const type = getReceiverType(receiver);
  const allowed = ALLOWED_METHODS[type];
  return allowed ? allowed.has(property) : false;
}

function getReceiverType(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Link) return "link";
  if (isFileValue(value)) return "file";
  if (value instanceof RegExp) return "regexp";
  if (Array.isArray(value)) return "array";
  if (value instanceof Duration) return "duration";
  if (value instanceof Date) return "date";
  if (typeof value === "string" || value instanceof String) return "string";
  if (typeof value === "number" || value instanceof Number) return "number";
  if (typeof value === "boolean" || value instanceof Boolean) return "boolean";
  if (typeof value === "object") return "object";
  return typeof value;
}

function isFileValue(value: unknown): boolean {
  return value instanceof VaultFile;
}

function resolveFileValue(value: unknown): VaultFile | undefined {
  if (value instanceof VaultFile) return value;
  if (value && typeof value === "object" && "file" in value) {
    const file = (value as { file?: unknown }).file;
    if (file instanceof VaultFile) return file;
  }
  return undefined;
}

function resolveFilePath(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof Link) return value.path;
  return undefined;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isUnsafeProperty(prop: string | number | symbol): boolean {
  return prop === "__proto__" || prop === "prototype" || prop === "constructor";
}
