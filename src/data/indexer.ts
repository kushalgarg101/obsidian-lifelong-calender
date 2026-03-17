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

      if (filter.showFavoritesOnly && !entry.favorite) {
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

  getStats(): import("../types").TimelineStats {
    const entries = this.getAll();
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisYear = now.getFullYear().toString();

    const entriesThisMonth = entries.filter(e => e.date.startsWith(thisMonth)).length;
    const entriesThisYear = entries.filter(e => e.date.startsWith(thisYear)).length;

    const typeCounts = new Map<string, number>();
    for (const entry of entries) {
      const type = entry.type || "uncategorized";
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    const topCategories = [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const monthCounts = new Map<string, number>();
    for (const entry of entries) {
      const month = entry.date.substring(0, 7);
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    }
    const entriesPerMonth = [...monthCounts.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    const sortedByDate = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const firstEntryDate = sortedByDate[0]?.date || null;
    const lastEntryDate = sortedByDate[sortedByDate.length - 1]?.date || null;

    const { currentStreak, longestStreak } = this.calculateStreaks(entries);

    return {
      totalEntries: entries.length,
      entriesThisMonth,
      entriesThisYear,
      currentStreak,
      longestStreak,
      topCategories,
      entriesPerMonth,
      firstEntryDate,
      lastEntryDate
    };
  }

  private calculateStreaks(entries: TimelineEntry[]): { currentStreak: number; longestStreak: number } {
    if (entries.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }

    const uniqueDates = [...new Set(entries.map(e => e.date))].sort().reverse();
    const today = new Date().toISOString().split("T")[0];
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split("T")[0];

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;

    if (uniqueDates[0] === today || uniqueDates[0] === yesterday) {
      currentStreak = 1;
      for (let i = 1; i < uniqueDates.length; i++) {
        const prevDate = new Date(uniqueDates[i - 1]);
        const currDate = new Date(uniqueDates[i]);
        const diffDays = Math.round((prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    for (let i = 1; i < uniqueDates.length; i++) {
      const prevDate = new Date(uniqueDates[i - 1]);
      const currDate = new Date(uniqueDates[i]);
      const diffDays = Math.round((prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

    return { currentStreak, longestStreak };
  }

  getOnThisDay(): TimelineEntry[] {
    const entries = this.getAll();
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const currentYear = today.getFullYear();

    return entries.filter(entry => {
      const entryDate = new Date(entry.date);
      return entryDate.getMonth() + 1 === month && 
             entryDate.getDate() === day && 
             entryDate.getFullYear() < currentYear;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }

  getYearInReview(year: number): import("../types").YearInReview {
    const entries = this.getAll().filter(e => e.date.startsWith(year.toString()));
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

    const typeCounts = new Map<string, number>();
    for (const entry of entries) {
      const type = entry.type || "uncategorized";
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    const topCategories = [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const monthCounts = new Map<string, number>();
    for (const entry of entries) {
      const month = entry.date.substring(0, 7);
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    }
    const entriesByMonth = [...monthCounts.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const mostActiveMonth = entriesByMonth.length > 0 
      ? [...entriesByMonth].sort((a, b) => b.count - a.count)[0] 
      : null;

    return {
      year,
      totalEntries: entries.length,
      topCategories,
      mostActiveMonth,
      firstEntry: sorted[0] || null,
      lastEntry: sorted[sorted.length - 1] || null,
      entriesByMonth
    };
  }
}
