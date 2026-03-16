import { ItemView, WorkspaceLeaf } from "obsidian";
import type LifelongCalendarPlugin from "../main";
import { groupEntries, todayIsoDate } from "../lib/date-utils";
import type { TimelineFilter } from "../types";
import { LIFELONG_CALENDAR_VIEW } from "../types";
import { DetailPane } from "./detail-pane";

export class TimelineView extends ItemView {
  private filter: TimelineFilter = {
    query: "",
    type: "",
    year: ""
  };

  private selectedEntryId: string | null = null;
  private detailPane?: DetailPane;
  private shouldRestoreSearchFocus = false;
  private searchSelectionStart = 0;
  private searchSelectionEnd = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LifelongCalendarPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return LIFELONG_CALENDAR_VIEW;
  }

  getDisplayText(): string {
    return "Lifelong calendar";
  }

  getIcon(): string {
    return "calendar-days";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("lifelong-calendar-view");
    this.render();
  }

  refresh(): void {
    this.render();
  }

  setSelectedEntry(entryId: string | null): void {
    this.selectedEntryId = entryId;
  }

  private render(): void {
    this.contentEl.empty();

    const toolbar = this.contentEl.createDiv("lifelong-calendar-toolbar");
    const searchInput = toolbar.createEl("input", {
      type: "search",
      placeholder: "Search entries"
    });
    searchInput.value = this.filter.query;
    searchInput.addEventListener("input", () => {
      this.filter.query = searchInput.value;
      this.shouldRestoreSearchFocus = true;
      this.searchSelectionStart = searchInput.selectionStart ?? searchInput.value.length;
      this.searchSelectionEnd = searchInput.selectionEnd ?? searchInput.value.length;
      this.render();
    });
    if (this.shouldRestoreSearchFocus) {
      searchInput.focus();
      searchInput.setSelectionRange(this.searchSelectionStart, this.searchSelectionEnd);
      this.shouldRestoreSearchFocus = false;
    }

    const typeSelect = toolbar.createEl("select");
    renderSelectOptions(typeSelect, ["All types", ...this.plugin.indexer.getTypes()], this.filter.type || "All types");
    typeSelect.addEventListener("change", () => {
      this.filter.type = typeSelect.value === "All types" ? "" : typeSelect.value;
      this.render();
    });

    const yearSelect = toolbar.createEl("select");
    renderSelectOptions(yearSelect, ["All years", ...this.plugin.indexer.getYears()], this.filter.year || "All years");
    yearSelect.addEventListener("change", () => {
      this.filter.year = yearSelect.value === "All years" ? "" : yearSelect.value;
      this.render();
    });

    const actions = toolbar.createDiv("lifelong-calendar-toolbar-actions");
    const todayButton = actions.createEl("button", { text: "Today" });
    todayButton.addEventListener("click", () => {
      const today = todayIsoDate();
      this.filter.query = "";
      this.filter.type = "";
      this.filter.year = today.slice(0, 4);
      const entry = this.plugin.indexer.getAll().find((item) => item.date === today) ?? null;
      this.selectedEntryId = entry?.id ?? null;
      this.render();
    });

    const addButton = actions.createEl("button", { text: "Add entry" });
    addButton.addEventListener("click", () => {
      void this.plugin.openEntryModal();
    });

    const askButton = actions.createEl("button", { text: "Ask" });
    askButton.addEventListener("click", () => {
      this.plugin.openAskModal();
    });

    const layout = this.contentEl.createDiv("lifelong-calendar-layout");
    const listPane = layout.createDiv("lifelong-calendar-list");
    const detailEl = layout.createDiv("lifelong-calendar-detail-host");
    this.detailPane = new DetailPane(this.plugin, detailEl, (entry) => {
      void this.plugin.openEntryModal(entry);
    });

    const filtered = this.plugin.indexer.applyFilter(this.filter);
    const grouped = groupEntries(filtered);
    const selectedEntry = this.plugin.indexer.getById(this.selectedEntryId) ?? filtered[0] ?? null;
    this.selectedEntryId = selectedEntry?.id ?? null;

    if (!grouped.length) {
      listPane.createEl("div", {
        cls: "lifelong-calendar-empty",
        text: "No timeline entries yet."
      });
    }

    for (const year of grouped) {
      const yearSection = listPane.createDiv("lifelong-calendar-year");
      yearSection.createEl("h3", { text: year.year });

      for (const month of year.months) {
        const monthSection = yearSection.createDiv("lifelong-calendar-month");
        monthSection.createEl("h4", { text: month.label });

        for (const day of month.days) {
          const daySection = monthSection.createDiv("lifelong-calendar-day");
          daySection.createEl("div", {
            cls: "lifelong-calendar-day-label",
            text: `${day.day} (${day.entries.length})`
          });

          for (const entry of day.entries) {
            const entryButton = daySection.createEl("button", {
              cls: "lifelong-calendar-entry-button",
              text: entry.title
            });
            if (entry.id === this.selectedEntryId) {
              entryButton.addClass("is-selected");
            }

            entryButton.addEventListener("click", () => {
              this.selectedEntryId = entry.id;
              this.render();
            });
          }
        }
      }
    }

    this.detailPane.render(selectedEntry);
  }
}

function renderSelectOptions(selectEl: HTMLSelectElement, values: string[], selected: string): void {
  selectEl.empty();
  for (const value of values) {
    const option = selectEl.createEl("option", { text: value, value });
    option.selected = value === selected;
  }
}
