import { normalizePath, PluginSettingTab, Setting } from "obsidian";
import type LifelongCalendarPlugin from "./main";
import type { TimelineSettings } from "./types";

export const DEFAULT_SETTINGS: TimelineSettings = {
  entriesFolder: "Lifelong Calendar/Entries",
  defaultCategories: ["reading", "learning", "work", "health", "travel", "personal"],
  openInternalInNewLeaf: true,
  backendUrl: "",
  backendToken: "",
  reminderEmail: "",
  reminderTimeLocal: "20:00",
  reminderTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  remindersEnabled: false,
  aiProvider: "openai",
  aiApiKey: "",
  aiBaseUrl: "",
  aiModel: "",
  aiMaxRetrievedChunks: 6
};

export class LifelongCalendarSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: LifelongCalendarPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    let pendingEntriesFolder = this.plugin.settings.entriesFolder;

    ;
    this.renderHelpSection(containerEl);

    new Setting(containerEl)
      .setName("Entries folder")
      .setDesc("Folder used for timeline entry Markdown files. Click apply after editing.")
      .addText((text) =>
        text
          .setPlaceholder("Lifelong calendar/entries")
          .setValue(this.plugin.settings.entriesFolder)
          .onChange((value) => {
            pendingEntriesFolder = normalizePath(value.trim() || DEFAULT_SETTINGS.entriesFolder);
          })
      )
      .addButton((button) =>
        button.setButtonText("Apply").onClick(async () => {
          if (pendingEntriesFolder === this.plugin.settings.entriesFolder) {
            return;
          }

          this.plugin.settings.entriesFolder = pendingEntriesFolder;
          await this.plugin.saveSettings();
          await this.plugin.refreshTimeline();
        })
      );

    new Setting(containerEl)
      .setName("Default categories")
      .setDesc("Comma-separated categories shown when creating entries.")
      .addTextArea((text) =>
        text
          .setValue(this.plugin.settings.defaultCategories.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.defaultCategories = value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName("Open internal links in new tab")
      .setDesc("When enabled, opening an internal note from the preview uses a new leaf.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.openInternalInNewLeaf)
          .onChange(async (value) => {
            this.plugin.settings.openInternalInNewLeaf = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reminder cloud")
      .setHeading();

    new Setting(containerEl)
      .setName("Backend URL")
      .setDesc("Base URL for the reminder worker.")
      .addText((text) =>
        text
          .setPlaceholder("https://your-worker.example.workers.dev")
          .setValue(this.plugin.settings.backendUrl)
          .onChange(async (value) => {
            this.plugin.settings.backendUrl = value.trim().replace(/\/+$/, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Backend token")
      .setDesc("Shared bearer token used by the plugin when talking to the reminder backend.")
      .addText((text) =>
        text
          .setPlaceholder("Secret-token")
          .setValue(this.plugin.settings.backendToken)
          .onChange(async (value) => {
            this.plugin.settings.backendToken = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reminder email")
      .setDesc("Email address that receives the daily reminder.")
      .addText((text) =>
        text
          .setPlaceholder("You@example.com")
          .setValue(this.plugin.settings.reminderEmail)
          .onChange(async (value) => {
            this.plugin.settings.reminderEmail = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reminder timezone")
      .setDesc("Iana timezone used for deciding whether today is complete.")
      .addText((text) =>
        text
          .setPlaceholder("Asia/kolkata")
          .setValue(this.plugin.settings.reminderTimezone)
          .onChange(async (value) => {
            this.plugin.settings.reminderTimezone = value.trim() || DEFAULT_SETTINGS.reminderTimezone;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reminder time")
      .setDesc("Daily local reminder time in hh:mm 24-hour format.")
      .addText((text) =>
        text
          .setPlaceholder("20:00")
          .setValue(this.plugin.settings.reminderTimeLocal)
          .onChange(async (value) => {
            this.plugin.settings.reminderTimeLocal = value.trim() || DEFAULT_SETTINGS.reminderTimeLocal;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable reminders")
      .setDesc("When enabled, the plugin will sync today's completion state to the backend.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.remindersEnabled)
          .onChange(async (value) => {
            this.plugin.settings.remindersEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reminder actions")
      .setDesc("Push current config and today's completion state to the backend.")
      .addButton((button) =>
        button.setButtonText("Save config").setCta().onClick(async () => {
          await this.plugin.syncReminderConfig();
        })
      )
      .addButton((button) =>
        button.setButtonText("Sync today").onClick(async () => {
          await this.plugin.syncTodayCompletionStatus("obsidian");
        })
      )
      .addButton((button) =>
        button.setButtonText("Test email").onClick(async () => {
          await this.plugin.sendTestReminder();
        })
      );

    new Setting(containerEl)
      .setName("AI chat")
      .setHeading();

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Cloud or local llm provider used by ask lifelong calendar.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("openai", "OpenAI")
          .addOption("groq", "Groq")
          .addOption("gemini", "Gemini")
          .addOption("ollama", "Ollama")
          .addOption("custom", "Custom openai-compatible")
          .setValue(this.plugin.settings.aiProvider)
          .onChange(async (value) => {
            this.plugin.settings.aiProvider = value as TimelineSettings["aiProvider"];
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("API key")
      .setDesc("Required for cloud providers. Leave blank for local ollama if not needed.")
      .addText((text) =>
        text
          .setPlaceholder("Api-key")
          .setValue(this.plugin.settings.aiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.aiApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("Optional override. Use for ollama or a custom openai-compatible endpoint.")
      .addText((text) =>
        text
          .setPlaceholder("HTTP://localhost:11434")
          .setValue(this.plugin.settings.aiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.aiBaseUrl = value.trim().replace(/\/+$/, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Chat model used for grounded answers.")
      .addText((text) =>
        text
          .setPlaceholder("Gpt-4.1-mini")
          .setValue(this.plugin.settings.aiModel)
          .onChange(async (value) => {
            this.plugin.settings.aiModel = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max retrieved chunks")
      .setDesc("How many local sources are sent to the model per question.")
      .addText((text) =>
        text
          .setPlaceholder("6")
          .setValue(String(this.plugin.settings.aiMaxRetrievedChunks))
          .onChange(async (value) => {
            const parsed = Number(value);
            this.plugin.settings.aiMaxRetrievedChunks = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.aiMaxRetrievedChunks;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderHelpSection(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Help")
      .setHeading();
    containerEl.createEl("p", {
      text: "Use this section as a quick setup guide. The full project guide is in README.md, but the essentials are summarized here."
    });

    this.renderHelpBlock(containerEl, "Quick Start", [
      "Open the command palette and run Open.",
      "Create entries with Add Timeline Entry or Add Current Note to Timeline.",
      "Each entry is stored as one Markdown file in your entries folder.",
      "A day counts as complete for reminders if at least one entry exists for that date."
    ]);

    this.renderHelpBlock(containerEl, "Reminder Setup", [
      "Deploy the Cloudflare Worker from backend/ and apply backend/schema.sql to D1.",
      "Add AUTH_TOKEN, CHECKIN_SECRET, RESEND_API_KEY, and RESEND_FROM_EMAIL as Worker secrets.",
      "Paste the deployed Worker URL into Backend URL and paste the AUTH_TOKEN value into Backend token.",
      "Fill Reminder email, Reminder timezone, and Reminder time, then enable reminders.",
      "Click Save config, then Sync today, then Test email."
    ]);

    this.renderHelpBlock(containerEl, "Resend Self-Test", [
      "For personal testing, onboarding@resend.dev can be used as the sender address.",
      "When using onboarding@resend.dev, send only to the same email address associated with your Resend account.",
      "For broader production use, verify your own sending domain in Resend."
    ]);

    this.renderHelpBlock(containerEl, "AI Setup", [
      "Choose a provider, enter the API key if required, and set a valid model name.",
      "Leave Base URL blank for built-in OpenAI, Groq, or Gemini unless you specifically need a custom endpoint.",
      "For Ollama, set Base URL to http://localhost:11434 and make sure Ollama is running."
    ]);

    this.renderHelpBlock(containerEl, "Gemini Note", [
      "When Provider is set to Gemini, leave Base URL blank.",
      "The built-in Gemini provider uses Gemini's native API, not the OpenAI-compatible Gemini endpoint.",
      "If you want Gemini's OpenAI-compatible endpoint, choose Custom OpenAI-compatible instead."
    ]);
  }

  private renderHelpBlock(containerEl: HTMLElement, title: string, items: string[]): void {
    new Setting(containerEl)
      .setName(title)
      .setHeading();
    const listEl = containerEl.createEl("ul");
    for (const item of items) {
      listEl.createEl("li", { text: item });
    }
  }
}
