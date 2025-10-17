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
  context: ObsidianFile
): unknown {
  setupPrototypeExtensions();

  try {
    // Replace if( with _if( to avoid reserved keyword
    const transformedExpr = expr.replace(/\bif\(/g, "_if(");

    const func = new Function(
      "_context",
      "_funcs",
      `with (_funcs) { with (_context) { return (${transformedExpr}); } }`
    );

    return func(context, globalFunctions);
  } catch (error) {
    console.error("Formula evaluation error:", error);
    return undefined;
  }
}
