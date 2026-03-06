import { normalizePath } from "obsidian";
import type { TimelineEntryLink } from "../types";

const EXTERNAL_URL_PATTERN = /^https?:\/\//i;
const WIKILINK_PATTERN = /^\[\[([^\]]+)\]\]$/;
const MARKDOWN_LINK_PATTERN = /^\[([^\]]*)\]\(([^)]+)\)$/;

export function parseStoredLink(raw: string): TimelineEntryLink {
  const trimmed = raw.trim();

  if (EXTERNAL_URL_PATTERN.test(trimmed)) {
    return {
      kind: "external",
      raw: trimmed,
      url: trimmed
    };
  }

  const markdownMatch = trimmed.match(MARKDOWN_LINK_PATTERN);
  if (markdownMatch) {
    const target = markdownMatch[2].trim();
    if (EXTERNAL_URL_PATTERN.test(target)) {
      return {
        kind: "external",
        raw: trimmed,
        url: target
      };
    }

    return {
      kind: "internal",
      raw: trimmed,
      path: normalizeInternalPath(target)
    };
  }

  const wikilinkMatch = trimmed.match(WIKILINK_PATTERN);
  if (wikilinkMatch) {
    const target = wikilinkMatch[1].split("|")[0].split("#")[0].trim();
    return {
      kind: "internal",
      raw: trimmed,
      path: normalizeInternalPath(target)
    };
  }

  return {
    kind: "internal",
    raw: trimmed,
    path: normalizeInternalPath(trimmed)
  };
}

export function normalizeInternalPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return normalizePath(trimmed);
}
