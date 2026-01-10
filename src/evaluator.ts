import { posix } from "node:path";
import type { ObsidianFile } from "./types.js";
import {
  globalFunctions,
  stringExtensions,
  numberExtensions,
  arrayExtensions,
  dateExtensions,
  Link,
} from "./functions.js";

function setupPrototypeExtensions() {
  if (!(String.prototype as any).contains) {
    Object.assign(String.prototype, stringExtensions);
  }
  if (!(String.prototype as any).format) {
    Object.assign(String.prototype, {
      format: dateExtensions.format,
      time: dateExtensions.time,
      relative: dateExtensions.relative,
    });
  }
  if (!(Number.prototype as any).abs) {
    Object.assign(Number.prototype, numberExtensions);
  }
  if (!(Array.prototype as any).unique) {
    Object.assign(Array.prototype, arrayExtensions);
  }
  if (!(Date.prototype as any).format) {
    Object.assign(Date.prototype, dateExtensions);
  }
  if (!(Object.prototype as any).isTruthy) {
    Object.defineProperty(Object.prototype, "isTruthy", {
      value: function isTruthy() {
        return !!this;
      },
      enumerable: false,
    });
  }
  if (!(Object.prototype as any).isType) {
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

  try {
    // Replace if( with _if( to avoid reserved keyword
    const transformedExpr = expr.replace(/\bif\(/g, "_if(");
    const evalContext = createEvalContext(context, thisContext);
    const funcs = createGlobalFunctions(vaultFiles);

    const func = new Function(
      "_context",
      "_funcs",
      `with (_funcs) { with (_context) { return (${transformedExpr}); } }`
    );

    return func.call(thisContext, evalContext, funcs);
  } catch (error) {
    console.error("Formula evaluation error:", error);
    return undefined;
  }
}

function createEvalContext(
  context: ObsidianFile,
  thisContext: ObsidianFile
): ObsidianFile {
  const fileProxy = Object.create(context.file);
  fileProxy.asLink = (_title?: string) => {
    return buildFileLink(context, thisContext);
  };

  return {
    ...context,
    file: fileProxy,
  };
}

function buildFileLink(
  target: ObsidianFile,
  thisContext?: ObsidianFile
): string {
  const linkText =
    typeof target.title === "string" && target.title.trim() !== ""
      ? target.title
      : target.file.path;
  if (!thisContext) {
    return `[${linkText}](${target.file.path})`;
  }

  const fromDir = posix.dirname(thisContext.file.path);
  let linkPath = posix.relative(fromDir, target.file.path);
  if (!linkPath) {
    linkPath = posix.basename(target.file.path);
  }

  return `[${linkText}](${linkPath})`;
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
    file: (
      path: string | { path?: string } | { name?: string } | ObsidianFile
    ) => resolveFile(path, vaultFiles),
  };
}

function resolveFile(
  value: string | { path?: string } | { name?: string } | ObsidianFile,
  vaultFiles?: ObsidianFile[]
) {
  if (!vaultFiles) return undefined;
  if (typeof value === "object" && value && "file" in value) {
    return value.file;
  }
  let path = "";
  if (typeof value === "string") {
    path = value;
  } else if (value && typeof value === "object") {
    if ("path" in value && typeof value.path === "string") {
      path = value.path;
    } else if ("name" in value && typeof value.name === "string") {
      path = value.name;
    }
  }
  if (!path) return undefined;
  const normalized = path.replace(/\\/g, "/");
  const found =
    vaultFiles.find((file) => file.file.path === normalized) ??
    vaultFiles.find((file) => file.file.name === normalized);
  return found?.file;
}
