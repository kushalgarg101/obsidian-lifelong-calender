export const LIFELONG_CALENDAR_VIEW = "lifelong-calendar-view";

export type TimelineLinkKind = "internal" | "external";
export type ChatProviderId = "openai" | "groq" | "gemini" | "ollama" | "custom";

export interface TimelineEntryLink {
  kind: TimelineLinkKind;
  raw: string;
  path?: string;
  url?: string;
}

export interface TimelineEntry {
  id: string;
  date: string;
  title: string;
  type?: string;
  links: TimelineEntryLink[];
  note: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  extraFrontmatter: Record<string, unknown>;
}

export interface TimelineEntryInput {
  date: string;
  title: string;
  type?: string;
  links: string[];
  note: string;
}

export interface TimelineFilter {
  query: string;
  type: string;
  year: string;
}

export interface TimelineSettings {
  entriesFolder: string;
  defaultCategories: string[];
  openInternalInNewLeaf: boolean;
  backendUrl: string;
  backendToken: string;
  reminderEmail: string;
  reminderTimeLocal: string;
  reminderTimezone: string;
  remindersEnabled: boolean;
  aiProvider: ChatProviderId;
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  aiMaxRetrievedChunks: number;
}

export interface GroupedDay {
  day: string;
  entries: TimelineEntry[];
}

export interface GroupedMonth {
  key: string;
  label: string;
  days: GroupedDay[];
}

export interface GroupedYear {
  year: string;
  months: GroupedMonth[];
}

export interface ReminderConfigPayload {
  email: string;
  reminderTimeLocal: string;
  timezone: string;
  enabled: boolean;
}

export interface ReminderStatusPayload {
  email: string;
  date: string;
  complete: boolean;
  source: "obsidian" | "web";
  observedAt: string;
}

export interface SourceChunk {
  id: string;
  sourceType: "timeline-entry" | "linked-note";
  sourceFilePath: string;
  sourceTitle: string;
  sourceDate?: string;
  excerpt: string;
  text: string;
  score?: number;
}

export interface Citation {
  id: string;
  sourceType: "timeline-entry" | "linked-note";
  sourceFilePath: string;
  sourceTitle: string;
  sourceDate?: string;
  excerpt: string;
}

export interface ChatAnswer {
  answer: string;
  citations: Citation[];
}
