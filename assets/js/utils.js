export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function stripHtml(html = "") {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

export function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

export function debounce(fn, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function saveTheme(theme) {
  localStorage.setItem("limbus-archive-theme", theme);
}

export function getSavedTheme() {
  return localStorage.getItem("limbus-archive-theme");
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function initThemeToggle(buttonId = "themeToggle") {
  const saved = getSavedTheme();
  const initial = saved || "dark";
  applyTheme(initial);

  const button = document.getElementById(buttonId);
  if (!button) return;

  button.textContent = initial === "dark" ? "🌙" : "☀️";

  button.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "light" ? "dark" : "light";

    applyTheme(next);
    saveTheme(next);
    button.textContent = next === "dark" ? "🌙" : "☀️";
  });
}

export async function fetchNotices(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch notices: ${response.status}`);
  }

  return response.json();
}

function looksLikeRealHtml(content) {
  // Only triggers if it sees actual tag structures like <p> or <br/>
  return /<(p|br|hr|ul|ol|li|strong|em|blockquote|h1|h2|h3|h4|h5|h6)\b[^>]*>/i.test(content);
}

function convertPlainTextNoticeToHtml(text, noticeTitle = "") {
  const normalized = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  const lines = normalized.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      i += 1;
      continue;
    }

    // NEW: If the very first thing we find is a separator line (---), skip it.
    // This removes the "leftover" underline from the raw title block.
    if (blocks.length === 0 && /^-{3,}$/.test(line)) {
      i += 1;
      continue;
    }

    const next = lines[i + 1]?.trim() ?? "";
    const isHeaderUnderline = /^-{3,}$/.test(next);

    if (isHeaderUnderline) {
      // Check if this is the notice title repeated at the top
      const matchesTitle = line.toLowerCase() === noticeTitle.toLowerCase();
      
      // Only add header if it's NOT the title (deduplication)
      if (!matchesTitle) {
        blocks.push(`<h2>${escapeHtml(line)}</h2><hr>`);
      }
      
      i += 2; // Skip both the text and the underline
      continue;
    }

    // Paragraph logic
    const paragraphLines = [];
    while (i < lines.length) {
      const currentLine = lines[i].trim();
      if (currentLine === "") break;
      if (lines[i+1] && /^-{3,}$/.test(lines[i+1].trim())) break;

      paragraphLines.push(lines[i]);
      i += 1;
    }

    if (paragraphLines.length > 0) {
      const paragraph = paragraphLines
        .map((part) => escapeHtml(part))
        .join("<br>");
      blocks.push(`<p>${paragraph}</p>`);
    }
  }

  return blocks.join("");
}

export function normalizeNotice(notice = {}) {
  const rawContent = notice.content || "";
  const textContent = String(rawContent);
  const title = notice.title || `Untitled Notice ${notice.id ?? ""}`;

  const content = looksLikeRealHtml(textContent)
    ? textContent
    : convertPlainTextNoticeToHtml(textContent, title);

  return {
    id: notice.id,
    title: title,
    date: notice.date || "",
    category: notice.category || "Uncategorized",
    tags: Array.isArray(notice.tags) ? notice.tags : [],
    summary: notice.summary || "",
    content,
    toc: notice.toc !== false
  };
}

export function sortNotices(notices, mode) {
  const items = [...notices];

  switch (mode) {
    case "date-asc":
      return items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    case "date-desc":
      return items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    case "id-asc":
      return items.sort((a, b) => Number(a.id) - Number(b.id));
    case "id-desc":
      return items.sort((a, b) => Number(b.id) - Number(a.id));
    case "title-desc":
      return items.sort((a, b) => b.title.localeCompare(a.title));
    case "title-asc":
      return items.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
}

export function buildNoticeUrl(id) {
  return `notice.html?id=${encodeURIComponent(id)}`;
}