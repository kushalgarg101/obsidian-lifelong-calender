import {
  TFile,
  TFolder,
  normalizePath,
  parseYaml,
  stringifyYaml
} from "obsidian";
import type LifelongCalendarPlugin from "../main";
import { isValidIsoDate, toSlug } from "../lib/date-utils";
import { parseStoredLink } from "../lib/link-parser";
import type { TimelineEntry, TimelineEntryInput } from "../types";

interface FrontmatterRecord {
  [key: string]: unknown;
}

interface FrontmatterSplitResult {
  frontmatter: FrontmatterRecord;
  body: string;
}

export class EntryRepository {
  constructor(private readonly plugin: LifelongCalendarPlugin) {}

  async ensureEntriesFolder(): Promise<void> {
    const folderPath = normalizePath(this.plugin.settings.entriesFolder);
    const segments = folderPath.split("/").filter(Boolean);
    let currentPath = "";

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = this.plugin.app.vault.getAbstractFileByPath(currentPath);
      if (!existing) {
        await this.plugin.app.vault.createFolder(currentPath);
      }
    }
  }

  async loadAllEntries(): Promise<TimelineEntry[]> {
    await this.ensureEntriesFolder();
    const folderPath = normalizePath(this.plugin.settings.entriesFolder);
    const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      return [];
    }

    const files = this.collectMarkdownFiles(folder);
    const entries: TimelineEntry[] = [];

    for (const file of files) {
      const parsed = await this.parseEntryFile(file);
      if (parsed) {
        entries.push(parsed);
      }
    }

    return entries;
  }

  async createEntry(input: TimelineEntryInput): Promise<TimelineEntry> {
    await this.ensureEntriesFolder();
    const now = new Date().toISOString();
    const entryId = crypto.randomUUID();
    const filePath = this.generateUniqueFilePath(input.date, input.title);
    const content = this.serializeEntry({
      id: entryId,
      date: input.date,
      title: input.title,
      type: input.type?.trim() || undefined,
      links: input.links.map((link) => parseStoredLink(link)),
      note: input.note,
      filePath,
      createdAt: now,
      updatedAt: now,
      favorite: input.favorite ?? false,
      extraFrontmatter: {}
    });

    await this.plugin.app.vault.create(filePath, content);
    const file = this.getRequiredFile(filePath);
    const parsed = await this.parseEntryFile(file);
    if (!parsed) {
      throw new Error("Failed to read newly created timeline entry.");
    }

    return parsed;
  }

  async updateEntry(existing: TimelineEntry, input: TimelineEntryInput): Promise<TimelineEntry> {
    const nextPath = this.generateUniqueFilePath(input.date, input.title, existing.filePath);
    const content = this.serializeEntry({
      ...existing,
      title: input.title,
      date: input.date,
      type: input.type?.trim() || undefined,
      links: input.links.map((link) => parseStoredLink(link)),
      note: input.note,
      updatedAt: new Date().toISOString(),
      filePath: nextPath,
      favorite: input.favorite ?? existing.favorite
    });

    const file = this.getRequiredFile(existing.filePath);
    if (nextPath !== existing.filePath) {
      await this.plugin.app.fileManager.renameFile(file, nextPath);
    }

    const updatedFile = this.getRequiredFile(nextPath);
    await this.plugin.app.vault.modify(updatedFile, content);

    const parsed = await this.parseEntryFile(updatedFile);
    if (!parsed) {
      throw new Error("Failed to read updated timeline entry.");
    }

    return parsed;
  }

  async parseEntryFile(file: TFile): Promise<TimelineEntry | null> {
    try {
      const content = await this.plugin.app.vault.cachedRead(file);
      const split = splitFrontmatter(content);
      const id = asString(split.frontmatter.lc_id);
      const date = asDateOnlyString(split.frontmatter.date);
      const title = asString(split.frontmatter.title);
      const createdAt = asIsoTimestampString(split.frontmatter.created_at);
      const updatedAt = asIsoTimestampString(split.frontmatter.updated_at);

      if (!id || !date || !title || !createdAt || !updatedAt || !isValidIsoDate(date)) {
        return null;
      }

      const linksRaw = normalizeLinks(split.frontmatter.links);

      const extraFrontmatter = { ...split.frontmatter };
      delete extraFrontmatter.lc_id;
      delete extraFrontmatter.date;
      delete extraFrontmatter.title;
      delete extraFrontmatter.type;
      delete extraFrontmatter.links;
      delete extraFrontmatter.created_at;
      delete extraFrontmatter.updated_at;
      delete extraFrontmatter.favorite;

      return {
        id,
        date,
        title,
        type: asString(split.frontmatter.type) || undefined,
        links: linksRaw.map((raw) => parseStoredLink(raw)),
        note: split.body.trim(),
        filePath: file.path,
        createdAt,
        updatedAt,
        favorite: typeof split.frontmatter.favorite === "boolean" ? split.frontmatter.favorite : false,
        extraFrontmatter
      };
    } catch (error) {
      console.error("Lifelong Calendar: failed to parse entry file", file.path, error);
      return null;
    }
  }

  private collectMarkdownFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];

    for (const child of folder.children) {
      if (child instanceof TFolder) {
        files.push(...this.collectMarkdownFiles(child));
      } else if (child instanceof TFile && child.extension === "md") {
        files.push(child);
      }
    }

    return files;
  }

  private serializeEntry(entry: TimelineEntry): string {
    const frontmatter: FrontmatterRecord = {
      ...entry.extraFrontmatter,
      lc_id: entry.id,
      date: entry.date,
      title: entry.title,
      type: entry.type,
      links: entry.links.map((link) => link.raw),
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      favorite: entry.favorite
    };

    if (!entry.type) {
      delete frontmatter.type;
    }

    if (!entry.favorite) {
      delete frontmatter.favorite;
    }

    const yaml = stringifyYaml(frontmatter).trimEnd();
    const body = entry.note.trim();
    return `---\n${yaml}\n---\n${body ? `\n${body}\n` : ""}`;
  }

  private generateUniqueFilePath(date: string, title: string, currentPath?: string): string {
    const baseFolder = normalizePath(this.plugin.settings.entriesFolder);
    const slug = toSlug(title);
    let suffix = "";
    let attempt = 0;

    while (true) {
      const candidate = normalizePath(`${baseFolder}/${date}-${slug}${suffix}.md`);
      if (candidate === currentPath) {
        return candidate;
      }

      const existing = this.plugin.app.vault.getAbstractFileByPath(candidate);
      if (!existing) {
        return candidate;
      }

      attempt += 1;
      suffix = `-${attempt}`;
    }
  }

  private getRequiredFile(path: string): TFile {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Expected markdown file at ${path}`);
    }

    return file;
  }
}

function splitFrontmatter(content: string): FrontmatterSplitResult {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const parsed = parseYaml(match[1]) as Record<string, unknown> | undefined;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { frontmatter: {}, body: match[2] ?? "" };
  }

  return {
    frontmatter: parsed as FrontmatterRecord,
    body: match[2] ?? ""
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asDateOnlyString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return "";
}

function asIsoTimestampString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return "";
}

function normalizeLinks(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}
