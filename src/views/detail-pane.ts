import { Notice } from "obsidian";
import type LifelongCalendarPlugin from "../main";
import { formatDateLabel } from "../lib/date-utils";
import type { TimelineEntry } from "../types";

export class DetailPane {
  constructor(
    private readonly plugin: LifelongCalendarPlugin,
    private readonly containerEl: HTMLElement,
    private readonly onEdit: (entry: TimelineEntry) => void
  ) {}

  render(entry: TimelineEntry | null): void {
    this.containerEl.empty();
    this.containerEl.addClass("lifelong-calendar-detail");

    if (!entry) {
      this.containerEl.createEl("div", {
        cls: "lifelong-calendar-empty",
        text: "Select an entry to preview it here."
      });
      return;
    }

    this.containerEl.createEl("div", {
      cls: "lifelong-calendar-detail-date",
      text: formatDateLabel(entry.date)
    });
    this.containerEl.createEl("h3", {
      cls: "lifelong-calendar-detail-title",
      text: entry.title
    });

    if (entry.type) {
      this.containerEl.createEl("div", {
        cls: "lifelong-calendar-type-pill",
        text: entry.type
      });
    }

    if (entry.note) {
      this.containerEl.createEl("p", {
        cls: "lifelong-calendar-detail-note",
        text: entry.note
      });
    }

    const linksSection = this.containerEl.createDiv("lifelong-calendar-links");
    linksSection.createEl("h4", { text: "Links" });

    if (!entry.links.length) {
      linksSection.createEl("div", {
        cls: "lifelong-calendar-empty",
        text: "No links attached."
      });
    }

    for (const link of entry.links) {
      const row = linksSection.createDiv("lifelong-calendar-link-row");
      row.createEl("div", {
        cls: "lifelong-calendar-link-raw",
        text: link.raw
      });
      const actions = row.createDiv("lifelong-calendar-link-actions");
      const openButton = actions.createEl("button", { text: "Open" });
      openButton.addEventListener("click", () => {
        void this.plugin.openTimelineLink(link, entry.filePath).then((opened: boolean) => {
          if (!opened) {
            new Notice(`Could not open ${link.raw}`);
          }
        });
      });
    }

    const actionRow = this.containerEl.createDiv("lifelong-calendar-detail-actions");
    const editButton = actionRow.createEl("button", { text: "Edit entry" });
    editButton.addEventListener("click", () => this.onEdit(entry));

    const fileButton = actionRow.createEl("button", { text: "Open entry file" });
    fileButton.addEventListener("click", () => {
      void this.plugin.openFileInLeaf(entry.filePath);
    });
  }
}
