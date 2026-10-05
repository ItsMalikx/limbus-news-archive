export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatDate(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("-");
  if (parts.length === 3) {
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }
  return dateString;
}

export function stripHtml(html = "") {
  const spacedHtml = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<\/h[1-6]>/gi, " ")
    .replace(/<\/li>/gi, " ");

  const temp = document.createElement("div");
  temp.innerHTML = spacedHtml;
  const rawText = temp.textContent || temp.innerText || "";

  return rawText.replace(/\s\s+/g, " ").trim();
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

  // The icon comes from CSS (html[data-theme]); keep the accessible label in sync.
  const label = theme => button.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  label(initial);

  button.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "light" ? "dark" : "light";

    // Switch every color at once: hover/background fades would otherwise lag behind the page.
    const root = document.documentElement;
    root.classList.add("theme-switching");
    applyTheme(next);
    saveTheme(next);
    label(next);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  });
}

export async function fetchNotices(url) {
  const response = await fetch(url, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`Failed to fetch notices: ${response.status}`);
  }

  return response.json();
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

    if (!line) {
      i += 1;
      continue;
    }

    if (blocks.length === 0 && /^-{3,}$/.test(line)) {
      i += 1;
      continue;
    }

    const next = lines[i + 1]?.trim() ?? "";
    const isHeaderUnderline = /^-{3,}$/.test(next);

    if (isHeaderUnderline) {
      const matchesTitle = line.toLowerCase() === noticeTitle.toLowerCase();
      if (!matchesTitle) {
        blocks.push(`<h2>${escapeHtml(line)}</h2><hr>`);
      }
      i += 2;
      continue;
    }

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

// `text` is the transcript; `content` its simple HTML, made only when something asks for it (the
// archive page never does: making it for every notice up front was most of the page's start-up time).
export function normalizeNotice(notice = {}) {
  const textContent = String(notice.content || "");
  const title = notice.title || `Untitled Notice ${notice.id ?? ""}`;
  const normalized = {
    ...notice,
    id: notice.id,
    title: title,
    date: notice.date || "",
    category: notice.category || "Uncategorized",
    tags: Array.isArray(notice.tags) ? notice.tags : [],
    summary: notice.summary || "",
    text: textContent,
    toc: notice.toc !== false
  };
  let html = null;
  Object.defineProperty(normalized, "content", {
    get: () => html ?? (html = convertPlainTextNoticeToHtml(textContent, title)),
    enumerable: true, configurable: true
  });
  return normalized;
}

export function sortNotices(notices, mode = "date-desc") {
  const compareDate = (a, b) => {
    if (!a.date && b.date) return 1;
    if (a.date && !b.date) return -1;
    const comparison = (a.date || "").localeCompare(b.date || "") ||
      Number(a.order ?? a.id) - Number(b.order ?? b.id) || Number(a.id) - Number(b.id);
    return mode === "date-asc" ? comparison : -comparison;
  };
  return [...notices].sort((a, b) => {
    switch (mode) {
      case "id-asc": return Number(a.number) - Number(b.number);
      case "id-desc": return Number(b.number) - Number(a.number);
      case "title-asc": return a.title.localeCompare(b.title) || Number(a.number) - Number(b.number);
      case "title-desc": return b.title.localeCompare(a.title) || Number(b.number) - Number(a.number);
      default: return compareDate(a, b);
    }
  });
}

// A notice's page: /notices/<slug>/ (the number shown on cards is its place in time order, not its address).
export function buildNoticeUrl(notice) {
  return `/notices/${encodeURIComponent(notice.slug)}/`;
}

// App shell menu. Wide screens: the button collapses or expands the sidebar for this page only
// (every page opens with it expanded). Small screens: it opens the sidebar as a drawer, closed by default.
export function initShell() {
  const button = document.getElementById("menuButton");
  const rail = document.querySelector(".app-layout .browse, .notice-layout .toc");
  const scrim = document.getElementById("shellScrim");
  if (!button || !rail || rail.hidden) {
    if (button) button.hidden = true;
    return;
  }
  const root = document.documentElement;
  const wide = () => window.matchMedia("(min-width: 760px)").matches;
  const setDrawer = open => {
    document.body.classList.toggle("drawer-open", open);
    button.setAttribute("aria-expanded", String(open));
    if (scrim) scrim.hidden = !open;
  };
  button.addEventListener("click", () => {
    if (wide()) {
      if (root.dataset.rail === "collapsed") delete root.dataset.rail; else root.dataset.rail = "collapsed";
    } else {
      setDrawer(!document.body.classList.contains("drawer-open"));
    }
  });
  rail.querySelector(".rail-close")?.addEventListener("click", () => setDrawer(false));
  scrim?.addEventListener("click", () => setDrawer(false));
  rail.addEventListener("click", event => { if (!wide() && event.target.closest("a")) setDrawer(false); });
  window.addEventListener("keydown", event => { if (event.key === "Escape") setDrawer(false); });
  // Crossing the breakpoint (a resize or browser zoom) always leaves the drawer closed, so the page
  // reflows like any other zoom level instead of opening under a scrim.
  let wasWide = wide();
  window.addEventListener("resize", () => {
    const now = wide();
    if (now === wasWide) return;
    if (now && document.body.classList.contains("drawer-open")) delete root.dataset.rail;
    setDrawer(false);
    wasWide = now;
  });
}
