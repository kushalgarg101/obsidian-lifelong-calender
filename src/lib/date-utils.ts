import type { GroupedMonth, GroupedYear, TimelineEntry } from "../types";

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long" });

export function compareEntriesDesc(left: TimelineEntry, right: TimelineEntry): number {
  const dateCompare = right.date.localeCompare(left.date);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  return left.title.localeCompare(right.title);
}

export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "entry";
}

export function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(parsed);
}

export function groupEntries(entries: TimelineEntry[]): GroupedYear[] {
  const yearMap = new Map<string, Map<string, Map<string, TimelineEntry[]>>>();

  for (const entry of [...entries].sort(compareEntriesDesc)) {
    const [year, month, day] = entry.date.split("-");
    if (!year || !month || !day) {
      continue;
    }

    if (!yearMap.has(year)) {
      yearMap.set(year, new Map());
    }

    const monthMap = yearMap.get(year)!;
    const monthKey = `${year}-${month}`;

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, new Map());
    }

    const dayMap = monthMap.get(monthKey)!;
    if (!dayMap.has(day)) {
      dayMap.set(day, []);
    }

    dayMap.get(day)!.push(entry);
  }

  return [...yearMap.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((year): GroupedYear => {
      const monthMap = yearMap.get(year)!;
      const months: GroupedMonth[] = [...monthMap.keys()]
        .sort((a, b) => b.localeCompare(a))
        .map((monthKey) => {
          monthKey.split("-");
          const days = [...monthMap.get(monthKey)!.keys()]
            .sort((a, b) => b.localeCompare(a))
            .map((day) => ({
              day,
              entries: monthMap.get(monthKey)!.get(day)!
            }));

          const monthDate = new Date(`${monthKey}-01T00:00:00`);
          const label = Number.isNaN(monthDate.getTime())
            ? monthKey
            : `${monthFormatter.format(monthDate)} ${year}`;

          return {
            key: monthKey,
            label,
            days
          };
        });

      return { year, months };
    });
}

export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}
