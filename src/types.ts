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

import { Link } from "./functions.js";

export class VaultFile {
  name: string;
  folder: string;
  path: string;
  ext: string;
  size: number;
  ctime: Date;
  mtime: Date;
  properties: Record<string, unknown>;
  tags: string[];
  private linkResolver: () => Link[] = () => [];
  private backlinkResolver: () => Link[] = () => [];

  constructor(options: {
    name: string;
    folder: string;
    path: string;
    ext: string;
    size: number;
    ctime: Date;
    mtime: Date;
    properties: Record<string, unknown>;
    tags: string[];
  }) {
    this.name = options.name;
    this.folder = options.folder;
    this.path = options.path;
    this.ext = options.ext;
    this.size = options.size;
    this.ctime = options.ctime;
    this.mtime = options.mtime;
    this.properties = options.properties;
    this.tags = options.tags;
  }

  setLinkResolver(resolver: () => Link[]) {
    this.linkResolver = resolver;
  }

  setBacklinkResolver(resolver: () => Link[]) {
    this.backlinkResolver = resolver;
  }

  get links(): Link[] {
    return this.linkResolver();
  }

  get backlinks(): Link[] {
    return this.backlinkResolver();
  }

  asLink(title?: string): Link {
    return new Link(this.name, title);
  }

  hasProperty(name: string): boolean {
    return name in this.properties;
  }

  hasTag(...tags: string[]): boolean {
    return tags.some((tag) => this.tags.includes(tag));
  }

  hasLink(...linkNames: (string | { name: string })[]): boolean {
    const fileLinks = this.links;
    return linkNames.some((link) => fileLinks.some((l) => l.equals(link)));
  }

  inFolder(folder: string): boolean {
    return this.folder === folder || this.folder.startsWith(folder + "/");
  }
}

export interface ObsidianFile {
  file: VaultFile;
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
