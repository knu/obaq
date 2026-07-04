import dayjs from "dayjs";
import { toMarkdown } from "mdast-util-to-markdown";
import { toMarkdown as wikiLinkToMarkdown } from "mdast-util-wiki-link";

export function installDateFieldExtensions() {
  const fields: Array<[string, (date: Date) => number]> = [
    ["year", (date) => dayjs(date).year()],
    ["month", (date) => dayjs(date).month() + 1],
    ["day", (date) => dayjs(date).date()],
    ["hour", (date) => dayjs(date).hour()],
    ["minute", (date) => dayjs(date).minute()],
    ["second", (date) => dayjs(date).second()],
    ["millisecond", (date) => dayjs(date).millisecond()],
  ];

  for (const [name, getter] of fields) {
    if (Object.prototype.hasOwnProperty.call(Date.prototype, name)) continue;
    Object.defineProperty(Date.prototype, name, {
      get() {
        return getter(this as Date);
      },
      enumerable: true,
      configurable: true,
    });
  }
}

export class Link {
  private static resolver?: (link: Link) => unknown;

  constructor(
    public path: string,
    public display?: string
  ) {}

  static setResolver(resolver?: (link: Link) => unknown) {
    Link.resolver = resolver;
  }

  asFile(): unknown {
    return Link.resolver ? Link.resolver(this) : undefined;
  }

  linksTo(file: unknown): boolean {
    const resolved = this.asFile();
    if (resolved && typeof (resolved as any).hasLink === "function") {
      return (resolved as any).hasLink(file);
    }
    if (file && typeof file === "object") {
      const maybePath = (file as { path?: unknown }).path;
      if (typeof maybePath === "string" && this.path === maybePath) return true;
      const maybeName = (file as { name?: unknown }).name;
      if (typeof maybeName === "string" && this.path === maybeName) return true;
    }
    return this.equals(file as any);
  }

  toString(): string {
    const node: any = {
      type: "wikiLink",
      value: this.path,
      data: {
        alias: this.display,
        permalink: this.path,
      },
    };

    const result = toMarkdown(node, {
      extensions: [wikiLinkToMarkdown({ aliasDivider: "|" })] as any,
    }).trim();

    // mdast-util-wiki-link always adds the separator even without display text
    // Remove it if there's no display text
    return this.display ? result : result.replace(/\|(?=\]\]$)/, "");
  }

  equals(other: Link | { name: string } | string): boolean {
    if (typeof other === "string") {
      return this.path === other;
    }
    if (other instanceof Link) {
      return this.path === other.path;
    }
    const file = getFileIdentity(other);
    if (file) {
      if (file.path !== undefined && this.path === file.path) return true;
      if (file.name !== undefined && this.path === file.name) return true;
    }
    return false;
  }
}

export function valuesEqual(
  left: unknown,
  right: unknown,
  options: { coerce?: boolean } = {}
): boolean {
  if (linksOrFilesEqual(left, right)) return true;
  return options.coerce ? (left as any) == (right as any) : left === right;
}

function linksOrFilesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Link) return left.equals(right as any);
  if (right instanceof Link) return right.equals(left as any);

  const leftFile = getFileIdentity(left);
  const rightFile = getFileIdentity(right);
  if (!leftFile || !rightFile) return false;

  if (
    leftFile.path !== undefined &&
    rightFile.path !== undefined &&
    leftFile.path === rightFile.path
  ) {
    return true;
  }
  return (
    leftFile.name !== undefined &&
    rightFile.name !== undefined &&
    leftFile.name === rightFile.name
  );
}

function getFileIdentity(
  value: unknown
): { path?: string; name?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;

  const path = (value as { path?: unknown }).path;
  const name = (value as { name?: unknown }).name;
  if (typeof path === "string" || typeof name === "string") {
    return {
      path: typeof path === "string" ? path : undefined,
      name: typeof name === "string" ? name : undefined,
    };
  }

  const file = (value as { file?: unknown }).file;
  if (file && typeof file === "object" && file !== value) {
    return getFileIdentity(file);
  }

  return undefined;
}

export type DurationUnit =
  "year" | "month" | "week" | "day" | "hour" | "minute" | "second";

export class Duration {
  constructor(
    public value: number,
    public unit: DurationUnit
  ) {}
}

const DURATION_UNITS: Record<string, DurationUnit> = {
  y: "year",
  year: "year",
  years: "year",
  M: "month",
  month: "month",
  months: "month",
  w: "week",
  week: "week",
  weeks: "week",
  d: "day",
  day: "day",
  days: "day",
  h: "hour",
  hour: "hour",
  hours: "hour",
  m: "minute",
  minute: "minute",
  minutes: "minute",
  s: "second",
  second: "second",
  seconds: "second",
};

const DURATION_UNIT_PATTERN = Object.keys(DURATION_UNITS)
  .sort((a, b) => b.length - a.length)
  .join("|");

export function parseDuration(value: string): Duration | undefined {
  const match = new RegExp(
    `^\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*(${DURATION_UNIT_PATTERN})\\s*$`
  ).exec(value);
  if (!match) return undefined;

  const amount = Number(match[1]);
  if (Number.isNaN(amount)) return undefined;

  const normalized = DURATION_UNITS[match[2]];
  return new Duration(amount, normalized);
}

// Global functions
export const globalFunctions = {
  date: (input: string | Date): Date => {
    if (input instanceof Date) return input;
    return dayjs(input).toDate();
  },

  duration: (value: string): Duration => {
    const parsed = parseDuration(value);
    if (!parsed) {
      throw new Error(`Cannot parse duration "${value}"`);
    }
    return parsed;
  },

  _if: (condition: any, trueResult: any, falseResult: any = null): any => {
    return condition ? trueResult : falseResult;
  },

  max: (...values: number[]): number => Math.max(...values),

  min: (...values: number[]): number => Math.min(...values),

  random: (): number => Math.random(),

  link: (path: string, display?: string): Link => {
    return new Link(path, display);
  },

  list: (element: any): any[] => {
    if (Array.isArray(element)) return element;
    return [element];
  },

  now: (): Date => new Date(),

  today: (): Date => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },

  number: (input: any): number => {
    switch (typeof input) {
      case "number":
        return input;
      case "boolean":
        return input ? 1 : 0;
      case "string": {
        const parsed = parseFloat(input);
        if (isNaN(parsed))
          throw new Error(`Cannot convert "${input}" to number`);
        return parsed;
      }
      default:
        if (input instanceof Date) return input.getTime();
        throw new Error(`Cannot convert ${typeof input} to number`);
    }
  },
};

// String prototype extensions
const nativeStartsWith = String.prototype.startsWith;
const nativeEndsWith = String.prototype.endsWith;
const nativeReplace = String.prototype.replace as (
  this: string,
  pattern: string | RegExp,
  replacement: string
) => string;

export const stringExtensions = {
  contains(this: string, value: string): boolean {
    return this.includes(value);
  },

  containsAll(this: string, ...values: string[]): boolean {
    return values.every((v) => this.includes(v));
  },

  containsAny(this: string, ...values: string[]): boolean {
    return values.some((v) => this.includes(v));
  },

  endsWith(this: string, query: string): boolean {
    return nativeEndsWith.call(this, query);
  },

  isEmpty(this: string): boolean {
    return this.length === 0;
  },

  lower(this: string): string {
    return this.toLowerCase();
  },

  replace(this: string, pattern: string | RegExp, replacement: string): string {
    if (pattern instanceof RegExp) {
      return nativeReplace.call(this, pattern, replacement);
    }
    return this.split(pattern).join(replacement);
  },

  reverse(this: string): string {
    return this.split("").reverse().join("");
  },

  startsWith(this: string, query: string): boolean {
    return nativeStartsWith.call(this, query);
  },

  title(this: string): string {
    return this.replace(/\b\w/g, (c) => c.toUpperCase());
  },
};

// Number prototype extensions
export const numberExtensions = {
  abs(this: number): number {
    return Math.abs(this);
  },

  ceil(this: number): number {
    return Math.ceil(this);
  },

  floor(this: number): number {
    return Math.floor(this);
  },

  round(this: number, digits?: number): number {
    if (digits === undefined) return Math.round(this);
    const factor = Math.pow(10, digits);
    return Math.round(this * factor) / factor;
  },

  isEmpty(this: number): boolean {
    return this === null || this === undefined;
  },
};

// Array prototype extensions
const nativeArraySort = Array.prototype.sort;
export const arrayExtensions = {
  mean(this: any[]): number | null {
    const numbers = this.filter(
      (value) => typeof value === "number" && Number.isFinite(value)
    );
    if (numbers.length === 0) return null;
    const sum = numbers.reduce((acc, value) => acc + value, 0);
    return sum / numbers.length;
  },

  median(this: any[]): number | null {
    const numbers = this.filter(
      (value) => typeof value === "number" && Number.isFinite(value)
    );
    if (numbers.length === 0) return null;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  },

  stddev(this: any[]): number | null {
    const numbers = this.filter(
      (value) => typeof value === "number" && Number.isFinite(value)
    );
    if (numbers.length === 0) return null;
    if (numbers.length === 1) return 0;
    const mean =
      numbers.reduce((acc, value) => acc + value, 0) / numbers.length;
    const variance =
      numbers.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
      numbers.length;
    return Math.sqrt(variance);
  },

  contains(this: any[], value: any): boolean {
    return this.some((item) => valuesEqual(item, value));
  },

  containsAll(this: any[], ...values: any[]): boolean {
    return values.every((value) =>
      this.some((item) => valuesEqual(item, value))
    );
  },

  containsAny(this: any[], ...values: any[]): boolean {
    return values.some((value) =>
      this.some((item) => valuesEqual(item, value))
    );
  },

  isEmpty(this: any[]): boolean {
    return this.length === 0;
  },

  flat(this: any[]): any[] {
    return this.flat();
  },

  unique(this: any[]): any[] {
    return [...new Set(this)];
  },

  sort(this: any[], compareFn?: (a: any, b: any) => number): any[] {
    if (typeof compareFn === "function") {
      nativeArraySort.call(this, compareFn);
      return this;
    }

    const compare = (a: any, b: any): number => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;

      const aValue = a instanceof Date ? a.getTime() : a;
      const bValue = b instanceof Date ? b.getTime() : b;
      if (typeof aValue === "number" && typeof bValue === "number") {
        return aValue - bValue;
      }
      return String(aValue).localeCompare(String(bValue));
    };

    nativeArraySort.call(this, compare);
    return this;
  },
};

// Date extensions
export const dateExtensions = {
  date(this: Date | string): Date {
    const d = dayjs(this);
    return d.startOf("day").toDate();
  },

  format(this: Date | string, format: string): string {
    return dayjs(this).format(format);
  },

  time(this: Date | string): string {
    return dayjs(this).format("HH:mm:ss");
  },

  relative(this: Date | string): string {
    const d = dayjs(this);
    const now = dayjs();
    const diffDays = now.diff(d, "day");

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays === -1) return "tomorrow";
    if (diffDays > 0) return `${diffDays} days ago`;
    return `in ${Math.abs(diffDays)} days`;
  },

  isEmpty(this: Date | string): boolean {
    return false;
  },
};

export const objectExtensions = {
  isEmpty(this: unknown): boolean {
    const value = unwrapValue(this);
    if (value === null || value === undefined) return true;
    if (typeof value !== "object") return false;
    if (Array.isArray(value)) return value.length === 0;
    return Object.keys(value).length === 0;
  },

  keys(this: unknown): string[] {
    const value = unwrapValue(this);
    if (!value || typeof value !== "object") return [];
    return Object.keys(value);
  },

  values(this: unknown): unknown[] {
    const value = unwrapValue(this);
    if (!value || typeof value !== "object") return [];
    return Object.values(value);
  },
};

export const regexpExtensions = {
  matches(this: RegExp, value: string): boolean {
    return this.test(value);
  },
};

function unwrapValue(value: unknown) {
  return (value as any)?.valueOf?.() ?? value;
}

export function extendPrototypes() {
  Object.assign(String.prototype, stringExtensions);
  Object.assign(Number.prototype, numberExtensions);
  Object.assign(Array.prototype, arrayExtensions);
  Object.assign(Date.prototype, dateExtensions);
  Object.assign(Object.prototype, objectExtensions);
  Object.assign(RegExp.prototype, regexpExtensions);
  installDateFieldExtensions();
}
