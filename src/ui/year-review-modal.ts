import { Modal } from "obsidian";
import type LifelongCalendarPlugin from "../main";

export class YearInReviewModal extends Modal {
  private year: number;

  constructor(private readonly plugin: LifelongCalendarPlugin, year?: number) {
    super(plugin.app);
    this.year = year || new Date().getFullYear();
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.addClass("lifelong-calendar-modal");

    const review = this.plugin.indexer.getYearInReview(this.year);

    contentEl.createEl("h2", {
      text: `${this.year} Year in Review`,
      cls: "lifelong-calendar-year-review-title"
    });

    contentEl.createEl("p", {
      text: `${review.totalEntries} memories logged`,
      cls: "lifelong-calendar-year-review-subtitle"
    });

    if (review.totalEntries === 0) {
      contentEl.createEl("p", {
        text: `No entries found for ${this.year}. Start logging your memories!`,
        cls: "lifelong-calendar-empty"
      });
      this.createCloseButton(contentEl);
      return;
    }

    const statsGrid = contentEl.createDiv("lifelong-calendar-stats-grid");

    const totalCard = statsGrid.createDiv("lifelong-calendar-stat-card");
    totalCard.createEl("div", {
      text: String(review.totalEntries),
      cls: "lifelong-calendar-stat-value"
    });
    totalCard.createEl("div", {
      text: "Total Entries",
      cls: "lifelong-calendar-stat-label"
    });

    if (review.firstEntry) {
      const firstCard = statsGrid.createDiv("lifelong-calendar-stat-card");
      firstCard.createEl("div", {
        text: review.firstEntry.date,
        cls: "lifelong-calendar-stat-value"
      });
      firstCard.createEl("div", {
        text: "First Entry",
        cls: "lifelong-calendar-stat-label"
      });
    }

    if (review.lastEntry) {
      const lastCard = statsGrid.createDiv("lifelong-calendar-stat-card");
      lastCard.createEl("div", {
        text: review.lastEntry.date,
        cls: "lifelong-calendar-stat-value"
      });
      lastCard.createEl("div", {
        text: "Last Entry",
        cls: "lifelong-calendar-stat-label"
      });
    }

    if (review.mostActiveMonth) {
      const activeCard = statsGrid.createDiv("lifelong-calendar-stat-card");
      const monthName = new Date(review.mostActiveMonth.month + "-01").toLocaleDateString(undefined, { month: "long" });
      activeCard.createEl("div", {
        text: monthName,
        cls: "lifelong-calendar-stat-value"
      });
      activeCard.createEl("div", {
        text: `Most Active (${review.mostActiveMonth.count})`,
        cls: "lifelong-calendar-stat-label"
      });
    }

    if (review.topCategories.length > 0) {
      const categoriesSection = contentEl.createDiv("lifelong-calendar-year-review-section");
      categoriesSection.createEl("h3", { text: "Top Categories" });
      const categoriesList = categoriesSection.createEl("ul");
      for (const cat of review.topCategories) {
        const item = categoriesList.createEl("li");
        item.createEl("span", { text: cat.type });
        item.createEl("span", { text: ` (${cat.count})`, cls: "lifelong-calendar-count" });
      }
    }

    if (review.entriesByMonth.length > 0) {
      const monthsSection = contentEl.createDiv("lifelong-calendar-year-review-section");
      monthsSection.createEl("h3", { text: "Entries by Month" });
      
      const chart = monthsSection.createDiv("lifelong-calendar-year-review-chart");
      const maxCount = Math.max(...review.entriesByMonth.map(m => m.count));
      
      for (const monthData of review.entriesByMonth) {
        const bar = chart.createDiv("lifelong-calendar-year-review-bar");
        const height = maxCount > 0 ? (monthData.count / maxCount) * 100 : 0;
        bar.style.height = `${Math.max(height, 2)}%`;
        bar.setAttribute("title", `${monthData.month}: ${monthData.count}`);
        
        const monthLabel = new Date(monthData.month + "-01").toLocaleDateString(undefined, { month: "short" });
        bar.createEl("span", { text: monthLabel, cls: "lifelong-calendar-bar-label" });
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
