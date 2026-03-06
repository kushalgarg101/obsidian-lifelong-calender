import type LifelongCalendarPlugin from "../main";
import { compareEntriesDesc } from "../lib/date-utils";
import type { TimelineEntry, TimelineFilter } from "../types";

export class EntryIndexer {
  private entries = new Map<string, TimelineEntry>();

  constructor(private readonly plugin: LifelongCalendarPlugin) {}

  async rebuild(): Promise<void> {
    const entries = await this.plugin.repository.loadAllEntries();
    this.entries = new Map(entries.map((entry) => [entry.id, entry]));
  }

  getAll(): TimelineEntry[] {
    return [...this.entries.values()].sort(compareEntriesDesc);
  }

  getById(id: string | null): TimelineEntry | null {
    if (!id) {
      return null;
    }

    return this.entries.get(id) ?? null;
  }

  applyFilter(filter: TimelineFilter): TimelineEntry[] {
    const query = filter.query.trim().toLowerCase();
    const type = filter.type.trim().toLowerCase();
    const year = filter.year.trim();

    return this.getAll().filter((entry) => {
      if (type && (entry.type ?? "").toLowerCase() !== type) {
        return false;
      }

      if (year && !entry.date.startsWith(`${year}-`)) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        entry.title,
        entry.note,
        entry.type ?? "",
        ...entry.links.map((link) => link.raw)
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  getTypes(): string[] {
    return [...new Set(this.getAll().map((entry) => entry.type).filter((value): value is string => !!value))].sort();
  }

  getYears(): string[] {
    return [...new Set(this.getAll().map((entry) => entry.date.slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  }

  getRandomEntry(): TimelineEntry | null {
    const entries = this.getAll();
    if (!entries.length) {
      return null;
    }

    const index = Math.floor(Math.random() * entries.length);
    return entries[index] ?? null;
  }
}
