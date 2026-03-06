import { Modal, Notice, setTooltip } from "obsidian";
import type LifelongCalendarPlugin from "../main";
import { askProvider } from "../ai/providers";
import { RetrievalService } from "../ai/retrieval";
import type { Citation } from "../types";

export class AskCalendarModal extends Modal {
  private readonly retrievalService: RetrievalService;

  constructor(private readonly plugin: LifelongCalendarPlugin) {
    super(plugin.app);
    this.retrievalService = new RetrievalService(plugin);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("Ask Lifelong Calendar");
    contentEl.empty();
    contentEl.addClass("lifelong-calendar-ask-modal");

    const input = contentEl.createEl("textarea", {
      cls: "lifelong-calendar-ask-input"
    });
    input.rows = 5;
    input.placeholder = "Ask a question about your timeline and linked notes...";

    const actions = contentEl.createDiv("lifelong-calendar-ask-actions");
    const askButton = actions.createEl("button", {
      text: "Ask",
      cls: "mod-cta"
    });
    const resultsEl = contentEl.createDiv("lifelong-calendar-ask-results");

    askButton.addEventListener("click", async () => {
      const question = input.value.trim();
      if (!question) {
        new Notice("Enter a question first.");
        return;
      }

      askButton.disabled = true;
      resultsEl.empty();
      resultsEl.createEl("div", { text: "Searching your timeline..." });

      try {
        const chunks = await this.retrievalService.search(question, this.plugin.settings.aiMaxRetrievedChunks);
        if (!chunks.length) {
          resultsEl.empty();
          resultsEl.createEl("div", {
            cls: "lifelong-calendar-empty",
            text: "I couldn't find any relevant local sources."
          });
          return;
        }

        const answer = await askProvider(this.plugin.settings, question, chunks);
        this.renderAnswer(resultsEl, answer.answer, answer.citations);
      } catch (error) {
        resultsEl.empty();
        resultsEl.createEl("div", {
          cls: "lifelong-calendar-error",
          text: error instanceof Error ? error.message : "Unknown AI error."
        });
      } finally {
        askButton.disabled = false;
      }
    });
  }

  private renderAnswer(containerEl: HTMLElement, answer: string, citations: Citation[]): void {
    containerEl.empty();
    containerEl.createEl("p", {
      cls: "lifelong-calendar-ask-answer",
      text: answer
    });

    const citationsEl = containerEl.createDiv("lifelong-calendar-citations");
    citationsEl.createEl("h4", { text: "Citations" });

    if (!citations.length) {
      citationsEl.createEl("div", {
        cls: "lifelong-calendar-empty",
        text: "The model did not return grounded citations for this answer."
      });
      return;
    }

    for (const citation of citations) {
      const button = citationsEl.createEl("button", {
        cls: "lifelong-calendar-citation-button",
        text: citation.sourceDate ? `${citation.sourceTitle} (${citation.sourceDate})` : citation.sourceTitle
      });
      setTooltip(button, citation.excerpt || citation.sourceFilePath, { placement: "top" });
      button.addEventListener("click", async () => {
        await this.plugin.openFileInLeaf(citation.sourceFilePath);
      });
    }
  }
}
