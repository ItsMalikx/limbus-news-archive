import { stripHtml } from "./utils.js";
import { SITE_CONFIG } from "./config.js";

export function buildSearchIndex(notices) {
  return notices.map((notice) => {
    const text = [
      notice.title,
      notice.summary,
      ...(notice.tags || []),
      stripHtml(notice.content).slice(0, SITE_CONFIG.maxIndexedContentLength)
    ]
      .join(" \n ")
      .toLowerCase();

    return {
      id: notice.id,
      text
    };
  });
}

export function filterNotices(notices, searchIndex, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...notices];

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  const allowedIds = new Set(
    searchIndex
      .filter((entry) => tokens.every((token) => entry.text.includes(token)))
      .map((entry) => entry.id)
  );

  return notices.filter((notice) => allowedIds.has(notice.id));
}