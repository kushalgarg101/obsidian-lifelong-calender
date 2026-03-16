import {
  MarkdownView,
  Notice,
  normalizePath,
  Plugin,
  TAbstractFile,
  TFile,
  WorkspaceLeaf
} from "obsidian";
import { EntryRepository } from "./data/entry-repository";
import { EntryIndexer } from "./data/indexer";
import { parseStoredLink } from "./lib/link-parser";
import { todayInTimezone } from "./lib/timezone-utils";
import { ReminderClient } from "./services/reminder-client";
import { DEFAULT_SETTINGS, LifelongCalendarSettingTab } from "./settings";
import type { ReminderStatusPayload, TimelineEntry, TimelineEntryInput, TimelineEntryLink, TimelineSettings } from "./types";
import { LIFELONG_CALENDAR_VIEW } from "./types";
import { AskCalendarModal } from "./ui/ask-modal";
import { EntryModal } from "./ui/entry-modal";
import { TimelineView } from "./views/timeline-view";

export default class LifelongCalendarPlugin extends Plugin {
  settings: TimelineSettings = DEFAULT_SETTINGS;
  repository = new EntryRepository(this);
  indexer = new EntryIndexer(this);
  reminderClient = new ReminderClient(this);

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.repository.ensureEntriesFolder();
    await this.indexer.rebuild();

    this.registerView(
      LIFELONG_CALENDAR_VIEW,
      (leaf) => new TimelineView(leaf, this)
    );

    this.addSettingTab(new LifelongCalendarSettingTab(this));

    this.addCommand({
      id: "open",
      name: "Open",
      callback: () => {
        void this.activateView();
      }
    });

    this.addCommand({
      id: "add-entry",
      name: "Add entry",
      callback: () => {
        void this.openEntryModal();
      }
    });

    this.addCommand({
      id: "add-current-note",
      name: "Add current note to timeline",
      callback: () => {
        const activeFile = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (!activeFile) {
          new Notice("Open a note first.");
          return;
        }

        void this.openEntryModal(undefined, `[[${activeFile.path}]]`, activeFile.basename);
      }
    });

    this.addCommand({
      id: "add-link",
      name: "Add external link to timeline",
      callback: () => {
        void this.openEntryModal();
      }
    });

    this.addCommand({
      id: "random",
      name: "Open random memory",
      callback: () => {
        const entry = this.indexer.getRandomEntry();
        if (!entry) {
          new Notice("No timeline entries found.");
          return;
        }

        void this.activateView(entry.id);
      }
    });

    this.addCommand({
      id: "ask",
      name: "Ask",
      callback: () => {
        this.openAskModal();
      }
    });

    this.addCommand({
      id: "sync-status",
      name: "Sync today's reminder status",
      callback: () => {
        void this.syncTodayCompletionStatus("obsidian");
      }
    });

    this.addCommand({
      id: "test-email",
      name: "Send test reminder email",
      callback: () => {
        void this.sendTestReminder();
      }
    });

    this.registerEvent(this.app.vault.on("create", (file) => void this.maybeRefreshTimeline(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => void this.maybeRefreshTimeline(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => void this.maybeRefreshTimeline(file)));
    this.registerEvent(this.app.vault.on("rename", (file) => void this.maybeRefreshTimeline(file)));

    void this.syncTodayCompletionStatus("obsidian");
  }

  onunload(): void {
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData() as Partial<TimelineSettings>;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded
    };
    this.settings.entriesFolder = normalizePath(this.settings.entriesFolder || DEFAULT_SETTINGS.entriesFolder);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async refreshTimeline(): Promise<void> {
    await this.indexer.rebuild();
    this.refreshViews();
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(LIFELONG_CALENDAR_VIEW)) {
      if (leaf.view instanceof TimelineView) {
        leaf.view.refresh();
      }
    }
  }

  async activateView(selectedEntryId?: string): Promise<void> {
    let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(LIFELONG_CALENDAR_VIEW)[0] ?? null;
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice("Could not create a lifelong calendar pane.");
        return;
      }
      await leaf.setViewState({
        type: LIFELONG_CALENDAR_VIEW,
        active: true
      });
    }

    void this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof TimelineView) {
      leaf.view.setSelectedEntry(selectedEntryId ?? null);
      leaf.view.refresh();
    }
  }

  async openEntryModal(entry?: TimelineEntry, presetLink?: string, presetTitle?: string): Promise<void> {
    const modal = new EntryModal({
      app: this.app,
      entry,
      categories: this.settings.defaultCategories,
      presetLink,
      presetTitle,
      onSubmit: async (input: TimelineEntryInput) => {
        const savedEntry = entry
          ? await this.repository.updateEntry(entry, input)
          : await this.repository.createEntry(input);

        await this.refreshTimeline();
        await this.syncTodayCompletionStatus("obsidian");
        await this.activateView(savedEntry.id);
      }
    });

    modal.open();
  }

  async openTimelineLink(link: TimelineEntryLink, sourcePath: string): Promise<boolean> {
    if (link.kind === "external" && link.url) {
      window.open(link.url, "_blank", "noopener");
      return true;
    }

    const parsed = parseStoredLink(link.raw);
    const destination = parsed.path
      ? this.app.metadataCache.getFirstLinkpathDest(parsed.path, sourcePath)
      : null;

    if (!(destination instanceof TFile)) {
      return false;
    }

    const leaf = this.settings.openInternalInNewLeaf
      ? this.app.workspace.getLeaf("tab")
      : this.app.workspace.getLeaf(false);
    await leaf.openFile(destination);
    return true;
  }

  async openFileInLeaf(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice("File not found.");
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
  }

  async syncReminderConfig(): Promise<void> {
    try {
      await this.reminderClient.syncConfig();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Failed to sync reminder config.");
    }
  }

  async syncTodayCompletionStatus(source: ReminderStatusPayload["source"]): Promise<void> {
    try {
      const date = todayInTimezone(this.settings.reminderTimezone);
      const payload: ReminderStatusPayload = {
        email: this.settings.reminderEmail,
        date,
        complete: this.indexer.getAll().some((entry) => entry.date === date),
        source,
        observedAt: new Date().toISOString()
      };
      await this.reminderClient.syncStatus(payload);
    } catch (error) {
      console.error("Lifelong Calendar reminder sync failed", error);
    }
  }

  async sendTestReminder(): Promise<void> {
    try {
      await this.reminderClient.sendTestEmail();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Failed to request test reminder.");
    }
  }

  openAskModal(): void {
    new AskCalendarModal(this).open();
  }

  private async maybeRefreshTimeline(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile)) {
      return;
    }

    const entriesFolder = normalizePath(this.settings.entriesFolder);
    if (!file.path.startsWith(entriesFolder)) {
      return;
    }

    await this.refreshTimeline();
    await this.syncTodayCompletionStatus("obsidian");
  }
}
