export function filterNotices(notices, filterState) {
  const { query, scope, start, end, tags } = filterState;
  const normalizedQuery = (query || "").trim().toLowerCase();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return notices.filter((notice) => {
    // 1. Tag Array Match (Must include ALL active tags)
    if (tags.size > 0) {
      const noticeTags = notice.tags || [];
      if (![...tags].every(t => noticeTags.includes(t))) return false;
    }

    // 2. Strict Date Bounds
    if (start || end) {
      const nd = new Date(notice.date + "T00:00:00");
      if (start && nd < start) return false;
      if (end && nd > end) return false;
    }

    // 3. Scope & Query Match
    if (tokens.length > 0) {
      const titleText = (notice.title || "").toLowerCase();
      const contentText = (notice.plainContent || "").toLowerCase();

      const match = tokens.every(token => {
        let found = false;
        if (scope.title) found = found || titleText.includes(token);
        if (scope.content) found = found || contentText.includes(token);
        return found;
      });
      
      if (!match) return false;
    }

    return true;
  });
}