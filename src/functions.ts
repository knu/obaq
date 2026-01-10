import dayjs from "dayjs";
import { toMarkdown } from "mdast-util-to-markdown";
import { toMarkdown as wikiLinkToMarkdown } from "mdast-util-wiki-link";

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
    if (other && typeof other === "object") {
      const maybePath = (other as { path?: unknown }).path;
      if (typeof maybePath === "string" && this.path === maybePath) return true;
    }
    // Compare with file object
    return this.path === other.name;
  }
}

export type DurationUnit =
  | "year"
  | "month"
  | "week"
  | "day"
  | "hour"
  | "minute"
  | "second";

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
export const arrayExtensions = {
  contains(this: any[], value: any): boolean {
    return this.includes(value);
  },

  containsAll(this: any[], ...values: any[]): boolean {
    return values.every((v) => this.includes(v));
  },

  containsAny(this: any[], ...values: any[]): boolean {
    return values.some((v) => this.includes(v));
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
}
