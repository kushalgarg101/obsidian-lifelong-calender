import { App, Modal, Notice, Setting } from "obsidian";
import type { TimelineEntry, TimelineEntryInput } from "../types";
import { isValidIsoDate, todayIsoDate } from "../lib/date-utils";

interface EntryModalOptions {
  app: App;
  categories: string[];
  entry?: TimelineEntry;
  presetLink?: string;
  presetTitle?: string;
  onSubmit: (input: TimelineEntryInput) => Promise<void>;
}

export class EntryModal extends Modal {
  private dateValue = todayIsoDate();
  private titleValue = "";
  private typeValue = "";
  private linksValue = "";
  private noteValue = "";

  constructor(private readonly options: EntryModalOptions) {
    super(options.app);

    if (options.entry) {
      this.dateValue = options.entry.date;
      this.titleValue = options.entry.title;
      this.typeValue = options.entry.type ?? "";
      this.linksValue = options.entry.links.map((link) => link.raw).join("\n");
      this.noteValue = options.entry.note;
    } else {
      this.linksValue = options.presetLink ?? "";
      this.titleValue = options.presetTitle ?? "";
    }
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.options.entry ? "Edit timeline entry" : "Add timeline entry");
    contentEl.empty();
    contentEl.addClass("lifelong-calendar-modal");

    new Setting(contentEl)
      .setName("Date")
      .addText((text) =>
        text.setPlaceholder("Yyyy-mm-dd").setValue(this.dateValue).onChange((value) => {
          this.dateValue = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("Title")
      .addText((text) =>
        text.setPlaceholder("What happened?").setValue(this.titleValue).onChange((value) => {
          this.titleValue = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("Category")
      .setDesc(this.options.categories.length ? `Suggestions: ${this.options.categories.join(", ")}` : "")
      .addText((text) =>
        text.setPlaceholder("Reading").setValue(this.typeValue).onChange((value) => {
          this.typeValue = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("Links")
      .setDesc("One internal or external link per line.")
      .addTextArea((text) => {
        text.inputEl.rows = 5;
        text.setValue(this.linksValue).onChange((value) => {
          this.linksValue = value;
        });
      });

    new Setting(contentEl)
      .setName("Note")
      .addTextArea((text) => {
        text.inputEl.rows = 8;
        text.setValue(this.noteValue).onChange((value) => {
          this.noteValue = value;
        });
      });

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText(this.options.entry ? "Save changes" : "Create entry").setCta().onClick(async () => {
          const input = this.toInput();
          if (!input) {
            return;
          }

          await this.options.onSubmit(input);
          this.close();
        })
      )
      .addExtraButton((button) =>
        button.setIcon("cross").setTooltip("Cancel").onClick(() => {
          this.close();
        })
      );
  }

  private toInput(): TimelineEntryInput | null {
    const links = this.linksValue
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (!isValidIsoDate(this.dateValue)) {
      new Notice("Use a real date in yyyy-mm-dd format.");
      return null;
    }

    if (!this.titleValue) {
      new Notice("A title is required.");
      return null;
    }

    if (!links.length && !this.noteValue.trim()) {
      new Notice("Add at least one link or a short note.");
      return null;
    }

    return {
      date: this.dateValue,
      title: this.titleValue,
      type: this.typeValue || undefined,
      links,
      note: this.noteValue.trim()
    };
  }
}
