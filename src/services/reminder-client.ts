import { Notice, requestUrl } from "obsidian";
import type LifelongCalendarPlugin from "../main";
import type { ReminderConfigPayload, ReminderStatusPayload } from "../types";

export class ReminderClient {
  constructor(private readonly plugin: LifelongCalendarPlugin) {}

  isConfigured(): boolean {
    return Boolean(
      this.plugin.settings.backendUrl &&
      this.plugin.settings.backendToken &&
      this.plugin.settings.reminderEmail
    );
  }

  async syncConfig(): Promise<void> {
    if (!this.isConfigured()) {
      new Notice("Reminder backend settings are incomplete.");
      return;
    }

    const payload: ReminderConfigPayload = {
      email: this.plugin.settings.reminderEmail,
      reminderTimeLocal: this.plugin.settings.reminderTimeLocal,
      timezone: this.plugin.settings.reminderTimezone,
      enabled: this.plugin.settings.remindersEnabled
    };

    await this.postJson("/reminders/config", payload);
    new Notice("Reminder config synced.");
  }

  async syncStatus(payload: ReminderStatusPayload): Promise<void> {
    if (!this.plugin.settings.remindersEnabled || !this.isConfigured()) {
      return;
    }

    await this.postJson("/status/sync", payload);
  }

  async sendTestEmail(): Promise<void> {
    if (!this.isConfigured()) {
      new Notice("Reminder backend settings are incomplete.");
      return;
    }

    await this.postJson("/reminders/test", {
      email: this.plugin.settings.reminderEmail
    });
    new Notice("Test reminder requested.");
  }

  private async postJson(path: string, body: unknown): Promise<void> {
    const response = await requestUrl({
      url: `${this.plugin.settings.backendUrl}${path}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.plugin.settings.backendToken}`
      },
      body: JSON.stringify(body)
    }) as { status: number; json?: { error?: unknown }; text: string };

    if (response.status >= 400) {
      const message = typeof response.json?.error === "string"
        ? response.json.error
        : response.text;
      throw new Error(`Reminder backend error (${response.status}): ${message}`);
    }
  }
}
