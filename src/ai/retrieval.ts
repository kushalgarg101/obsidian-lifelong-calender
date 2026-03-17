import { TFile } from "obsidian";
import type LifelongCalendarPlugin from "../main";
import type { SourceChunk, TimelineEntry } from "../types";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
  "i", "in", "is", "it", "my", "of", "on", "or", "that", "the", "to", "was", "what", "when", "where", "which", "with"
]);

export class RetrievalService {
  constructor(private readonly plugin: LifelongCalendarPlugin) {}

  async search(question: string, limit: number): Promise<SourceChunk[]> {
    const chunks = await this.buildChunks();
    const queryTokens = tokenize(question);

    return chunks
      .map((chunk) => ({
        ...chunk,
        score: scoreChunk(chunk, queryTokens)
      }))
      .filter((chunk) => (chunk.score ?? 0) > 0)
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, limit);
  }

  private async buildChunks(): Promise<SourceChunk[]> {
    const chunks: SourceChunk[] = [];
    const entries = this.plugin.indexer.getAll();

    for (const entry of entries) {
      chunks.push(entryToChunk(entry));
    }

    const linkedNotes = await this.collectLinkedNotes(entries);
    for (const noteFile of linkedNotes) {
      const content = await this.plugin.app.vault.cachedRead(noteFile);
      const plain = toPlainText(content);
      chunks.push({
        id: `note:${noteFile.path}`,
        sourceType: "linked-note",
        sourceFilePath: noteFile.path,
        sourceTitle: noteFile.basename,
        excerpt: plain.slice(0, 280),
        text: plain
      });
    }

    return chunks;
  }

  private async collectLinkedNotes(entries: TimelineEntry[]): Promise<TFile[]> {
    const files = new Map<string, TFile>();

    for (const entry of entries) {
      for (const link of entry.links) {
        if (link.kind !== "internal" || !link.path) {
          continue;
        }

        const file = this.plugin.app.metadataCache.getFirstLinkpathDest(link.path, entry.filePath);
        if (file instanceof TFile) {
          files.set(file.path, file);
        }
      }
    }

    return [...files.values()];
  }
}

function entryToChunk(entry: TimelineEntry): SourceChunk {
  const linksText = entry.links.map((link) => link.raw).join(" ");
  const text = [entry.title, entry.type ?? "", entry.note, linksText, entry.date].join(" ");

  return {
    id: `entry:${entry.id}`,
    sourceType: "timeline-entry",
    sourceFilePath: entry.filePath,
    sourceTitle: entry.title,
    sourceDate: entry.date,
    excerpt: entry.note || linksText || entry.title,
    text
  };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token && !STOP_WORDS.has(token));
}

function scoreChunk(chunk: SourceChunk, queryTokens: string[]): number {
  const haystack = chunk.text.toLowerCase();
  const title = chunk.sourceTitle.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (title.includes(token)) {
      score += 6;
    }
    if (haystack.includes(token)) {
      score += 2;
    }
    if (chunk.sourceDate?.includes(token)) {
      score += 4;
    }
  }

  return score;
}

function toPlainText(content: string): string {
  return content
    .replace(/^---[\s\S]*?---/, " ")
    .replace(/!\[\[.*?\]\]/g, " ")
    .replace(/\[\[(.*?)\]\]/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 $2")
    .replace(/[#>*`_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
