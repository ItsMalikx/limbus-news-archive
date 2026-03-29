import { SITE_CONFIG, TAG_COLORS } from "./config.js";
import {
  buildNoticeUrl,
  fetchNotices,
  initThemeToggle,
  normalizeNotice,
  sortNotices,
  stripHtml,
  debounce,
  escapeHtml,
  formatDate
} from "./utils.js";
import { buildSearchIndex, filterNotices } from "./search.js";

const noticeList = document.getElementById("noticeList");
const searchInput = document.getElementById("searchInput");
const resultsSummary = document.getElementById("resultsSummary");

initThemeToggle();

let allNotices = [];
let searchIndex = [];

function excerpt(notice) {
  const summary = notice.summary?.trim();
  if (summary) return summary;

  const plain = stripHtml(notice.content).trim();
  if (!plain) return "No preview available.";

  return plain.slice(0, 220).trim() + (plain.length > 220 ? "..." : "");
}

function renderNoticeCard(notice) {
  const article = document.createElement("a");
  article.className = "notice-card reveal";
  article.href = buildNoticeUrl(notice.id);

  const tagToSlug = (tag) => tag.toLowerCase().replace(/\s+/g, '-');

  const tagsHtml = notice.tags && notice.tags.length > 0
    ? `<div class="tag-list">${notice.tags.map(tag => {
        const slug = tagToSlug(tag);
        const color = TAG_COLORS[slug];
        const style = color ? `style="--tag-color: ${color}"` : "";
        return `<span class="tag-pill" ${style}>${escapeHtml(tag)}</span>`;
      }).join("")}</div>`
    : "";

  const dateHtml = notice.date
    ? `<div class="notice-card__date">${escapeHtml(formatDate(notice.date))}</div>`
    : "";

  article.innerHTML = `
    ${tagsHtml}
    <h2 class="notice-card__title">${escapeHtml(notice.title)}</h2>
    ${dateHtml}
    <p class="notice-card__summary">${escapeHtml(excerpt(notice))}</p>
  `;

  return article;
}

function renderList(notices) {
  noticeList.innerHTML = "";

  if (!notices.length) {
    noticeList.innerHTML = `
      <div class="empty-card">
        <h3 class="section-title">No notices matched your search.</h3>
        <p class="section-subtitle">Try adjusting the search terms.</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  notices.forEach((notice) => fragment.appendChild(renderNoticeCard(notice)));
  noticeList.appendChild(fragment);
}

function updateStats(filtered) {
  resultsSummary.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
}

function applyFilters() {
  const query = searchInput.value || "";
  const filtered = filterNotices(allNotices, searchIndex, query);
  const sorted = sortNotices(filtered, "date-desc");

  renderList(sorted);
  updateStats(sorted);
}

const debouncedApplyFilters = debounce(applyFilters, 100);

async function init() {
  try {
    const raw = await fetchNotices(SITE_CONFIG.dataUrl);
    allNotices = raw.map(normalizeNotice);
    allNotices = sortNotices(allNotices, "date-desc");
    searchIndex = buildSearchIndex(allNotices);

    renderList(allNotices);
    updateStats(allNotices);

    if (searchInput) {
      searchInput.addEventListener("input", debouncedApplyFilters);
    }
  } catch (error) {
    console.error(error);
    noticeList.innerHTML = `
      <div class="empty-card">
        <h3 class="section-title">Could not load notices.</h3>
        <p class="section-subtitle">Check that <code>data/notices.json</code> exists and is valid JSON.</p>
      </div>
    `;
    if (resultsSummary) resultsSummary.textContent = "Load failed";
  }
}

init();