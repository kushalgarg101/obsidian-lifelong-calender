import { Modal } from "obsidian";
import type LifelongCalendarPlugin from "../main";
import type { TimelineEntry } from "../types";

export class OnThisDayModal extends Modal {
  constructor(private readonly plugin: LifelongCalendarPlugin) {
    super(plugin.app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.addClass("lifelong-calendar-modal");

    const entries = this.plugin.indexer.getOnThisDay();
    const today = new Date();
    const monthName = today.toLocaleDateString(undefined, { month: "long" });

    contentEl.createEl("h2", {
      text: `On This Day - ${monthName} ${today.getDate()}`,
      cls: "lifelong-calendar-onthisday-title"
    });

    if (entries.length === 0) {
      contentEl.createEl("p", {
        text: "No entries from previous years on this date.",
        cls: "lifelong-calendar-empty"
      });
      return;
    }

    const list = contentEl.createDiv("lifelong-calendar-onthisday-list");

    for (const entry of entries) {
      const item = list.createDiv("lifelong-calendar-onthisday-item");
      const year = entry.date.substring(0, 4);
      
      item.createEl("div", {
        text: year,
        cls: "lifelong-calendar-onthisday-year"
      });

      const link = item.createEl("a", {
        text: entry.title,
        href: "#"
      });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.close();
        void this.plugin.activateView(entry.id);
      });

      if (entry.type) {
        item.createEl("span", {
          text: entry.type,
          cls: "lifelong-calendar-type-pill"
        });
      }
    }

    this.createCloseButton(contentEl);
  }

  private createCloseButton(contentEl: HTMLElement): void {
    const footer = contentEl.createDiv("modal-footer");
    const button = footer.createEl("button", { text: "Close" });
    button.addEventListener("click", () => this.close());
  }
}
