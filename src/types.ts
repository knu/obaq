export interface BaseQuery {
  formulas?: Record<string, string>;
  properties?: Record<string, PropertyConfig>;
  views?: View[];
}

export interface PropertyConfig {
  displayName?: string;
}

export interface View {
  type: string;
  name: string;
  filters?: Filter;
  order?: string[];
  sort?: SortConfig[];
  columnSize?: Record<string, number>;
}

export type Filter =
  | string
  | { and: Filter[] }
  | { or: Filter[] }
  | { not: Filter[] };

export interface SortConfig {
  property: string;
  direction: "ASC" | "DESC";
}

import type { Link } from "./functions.js";

export interface ObsidianFile {
  file: {
    name: string;
    folder: string;
    path: string;
    ext: string;
    size: number;
    ctime: Date;
    mtime: Date;
    properties: Record<string, unknown>;
    tags: string[];
    links: Link[];
    backlinks: Link[];
    asLink: (title?: string) => Link;
    hasProperty: (name: string) => boolean;
    hasTag: (...tags: string[]) => boolean;
    hasLink: (...linkNames: (string | { name: string })[]) => boolean;
    inFolder: (folder: string) => boolean;
  };
  content: string;
  note: Record<string, unknown>;
  [key: string]: unknown;
}

export interface QueryResult {
  columns: Column[];
  rows: Row[];
}

export interface Column {
  id: string;
  displayName: string;
  size?: number;
}

export interface Row {
  [key: string]: unknown;
}
