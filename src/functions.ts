import dayjs from "dayjs";
import { toMarkdown } from "mdast-util-to-markdown";
import { toMarkdown as wikiLinkToMarkdown } from "mdast-util-wiki-link";
import type { ObsidianFile } from "./types.js";

export class Link {
  constructor(
    public path: string,
    public display?: string
  ) {}

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
    // Compare with file object
    return this.path === other.name;
  }
}

// Global functions
export const globalFunctions = {
  date: (input: string | Date): Date => {
    if (input instanceof Date) return input;
    return dayjs(input).toDate();
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

export function extendPrototypes() {
  Object.assign(String.prototype, stringExtensions);
  Object.assign(Number.prototype, numberExtensions);
  Object.assign(Array.prototype, arrayExtensions);
  Object.assign(Date.prototype, dateExtensions);
}
