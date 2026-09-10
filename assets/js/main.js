import { SITE_CONFIG, TAG_COLORS } from "./config.js";
import {
  buildNoticeUrl, fetchNotices, initThemeToggle, normalizeNotice, sortNotices,
  stripHtml, debounce, escapeHtml, formatDate
} from "./utils.js";
import { buildSearchIndex, filterNotices } from "./search.js";

const noticeList = document.getElementById("noticeList");
const searchInput = document.getElementById("searchInput");
const resultsSummary = document.getElementById("resultsSummary");
const navigation = [...document.querySelectorAll('[aria-label="Archive pages"]')];
const archivePage = Number(noticeList.dataset.archivePage) || 1;
const pageSize = Number(noticeList.dataset.pageSize) || SITE_CONFIG.pageSize || 50;
let allNotices = [];
let searchIndex = [];

try { initThemeToggle(); } catch (error) { console.warn("Theme preference unavailable", error); }

function renderNoticeCard(notice) {
  const article = document.createElement("a");
  article.className = "notice-card";
  article.href = buildNoticeUrl(notice.id);
  const tags = notice.tags.map(tag => {
    const color = TAG_COLORS[tag.toLowerCase().replace(/\s+/g, "-")];
    return `<span class="tag-pill" ${color ? `style="--tag-color: ${color}"` : ""}>${escapeHtml(tag)}</span>`;
  }).join("");
  const plain = notice.summary?.trim() || stripHtml(notice.content).trim();
  const summary = plain.slice(0, 220) + (plain.length > 220 ? "…" : "");
  article.innerHTML = `
    <div class="tag-list">${tags}</div>
    <h2 class="notice-card__title">${escapeHtml(notice.title)}</h2>
    ${notice.date ? `<div class="notice-card__date">${escapeHtml(formatDate(notice.date))}</div>` : ""}
    <p class="notice-card__summary">${escapeHtml(summary)}</p>`;
  return article;
}

function pageUrl(page, query) {
  if (!query) return page === 1 ? "/" : `/archive/${page}/`;
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("q", query);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.pathname + url.search;
}

function renderFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const query = (params.get("q") || "").trim();
  searchInput.value = query;
  const filtered = filterNotices(allNotices, searchIndex, query);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requested = query ? Number(params.get("page") || 1) : archivePage;
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  const fragment = document.createDocumentFragment();
  filtered.slice((page - 1) * pageSize, page * pageSize)
    .forEach(notice => fragment.appendChild(renderNoticeCard(notice)));
  noticeList.replaceChildren(fragment);
  if (!filtered.length) {
    noticeList.innerHTML = '<div class="empty-card"><h2 class="section-title">No notices matched your search.</h2><p>Try adjusting the search terms.</p></div>';
  }
  resultsSummary.textContent = filtered.length
    ? `${filtered.length} ${query ? "results" : "notices"} · Page ${page} of ${pages}`
    : "0 results";

  for (const nav of navigation) {
    const links = document.createDocumentFragment();
    for (let target = 1; target <= pages; target++) {
      const link = document.createElement("a");
      link.className = "notice-pagination__link";
      link.href = pageUrl(target, query);
      link.textContent = String(target);
      if (target === page) {
        link.className += " active";
        link.setAttribute("aria-current", "page");
      }
      if (query) link.dataset.searchPage = String(target);
      links.appendChild(link);
    }
    nav.replaceChildren(links);
    nav.hidden = filtered.length === 0;
    nav.style.display = filtered.length ? "flex" : "none";
  }
}

function applySearch() {
  const url = new URL(window.location.href);
  const query = searchInput.value.trim();
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  url.searchParams.delete("page");
  window.history.replaceState(null, "", url.pathname + url.search);
  renderFromLocation();
}

async function init() {
  searchInput.value = new URLSearchParams(window.location.search).get("q") || "";
  searchInput.disabled = true;
  try {
    const raw = await fetchNotices(SITE_CONFIG.dataUrl);
    allNotices = sortNotices(raw.map(normalizeNotice), "date-desc");
    searchIndex = buildSearchIndex(allNotices);
    renderFromLocation();
    searchInput.disabled = false;
    searchInput.addEventListener("input", debounce(applySearch, 100));
    window.addEventListener("popstate", renderFromLocation);
    for (const nav of navigation) {
      nav.addEventListener("click", event => {
        const link = event.target.closest("a[data-search-page]");
        if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.history.pushState(null, "", link.href);
        renderFromLocation();
        navigation[0]?.scrollIntoView({ block: "start" });
      });
    }
  } catch (error) {
    console.error(error);
    // Static cards and page links remain usable when the search data cannot load.
    resultsSummary.textContent = "Search is temporarily unavailable. Browse the archive below.";
  }
}

init();
