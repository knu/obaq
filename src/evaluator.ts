import { posix } from "node:path";
import type { ObsidianFile } from "./types.js";
import {
  globalFunctions,
  stringExtensions,
  numberExtensions,
  arrayExtensions,
  dateExtensions,
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
}

export function evaluateExpression(
  expr: string,
  context: ObsidianFile,
  thisContext: ObsidianFile = context
): unknown {
  setupPrototypeExtensions();

  try {
    // Replace if( with _if( to avoid reserved keyword
    const transformedExpr = expr.replace(/\bif\(/g, "_if(");
    const evalContext = createEvalContext(context, thisContext);

    const func = new Function(
      "_context",
      "_funcs",
      `with (_funcs) { with (_context) { return (${transformedExpr}); } }`
    );

    return func.call(thisContext, evalContext, globalFunctions);
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
