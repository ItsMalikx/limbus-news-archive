import { SITE_CONFIG } from "./config.js";
import {
  buildNoticeUrl,
  fetchNotices,
  getQueryParam,
  initThemeToggle,
  normalizeNotice,
  sortNotices,
  escapeHtml
} from "./utils.js";

const noticeContent = document.getElementById("noticeContent");

initThemeToggle();

function renderNotFound() {
  document.title = `Notice Not Found | ${SITE_CONFIG.siteName}`;
  noticeContent.innerHTML = `<p>Notice not found.</p>`;

  const paginationContainer = document.getElementById("noticePagination");
  if (paginationContainer) {
    paginationContainer.innerHTML = `
      <a class="notice-pagination__link nav-text" href="#" aria-disabled="true">← Prev</a>
      <a class="notice-pagination__link nav-text" href="#" aria-disabled="true">Next →</a>
    `;
  }
}

function buildArticleMarkup(notice) {
  return `
    <div class="notice-title-block">
      <h1 class="notice-inline-title">${escapeHtml(notice.title)}</h1>
      <hr class="notice-title-divider" />
    </div>
    ${notice.content}
  `;
}

function setPagination(notices, currentIndex) {
  const paginationContainer = document.getElementById("noticePagination");
  if (!paginationContainer) return;

  const total = notices.length;
  // Chronological page number (notices are sorted descending, so index 0 is the last page)
  const currentP = total - currentIndex;

  const nextNotice = notices[currentIndex - 1]; // Newer notice
  const prevNotice = notices[currentIndex + 1]; // Older notice

  // --- Desktop Pagination Logic ---
  let pagesToShow = [];
  if (total <= 5) {
    // If there are 5 or fewer pages, just show all of them
    for (let i = 1; i <= total; i++) pagesToShow.push(i);
  } else if (currentP <= 2) {
    // At the beginning (e.g., page 1 or 2), show the first 3 pages
    pagesToShow = [1, 2, 3];
  } else if (currentP >= total - 1) {
    // At the end (e.g., last or second-to-last page), show the last 3 pages
    pagesToShow = [total - 2, total - 1, total];
  } else {
    // In the middle, show a spread of 5 pages centered on the current one
    pagesToShow = [currentP - 2, currentP - 1, currentP, currentP + 1, currentP + 2];
  }

  let desktopHtml = '<div class="notice-pagination__desktop">';
  // Prev Button
  desktopHtml += prevNotice
    ? `<a class="notice-pagination__link" href="${buildNoticeUrl(prevNotice.id)}">← Prev</a>`
    : `<span class="notice-pagination__link" aria-disabled="true">← Prev</span>`;

  // Numbered Buttons
  pagesToShow.forEach(p => {
    const noticeIndex = total - p;
    if (p === currentP) {
      desktopHtml += `<span class="notice-pagination__link active" aria-current="page">${p}</span>`;
    } else {
      desktopHtml += `<a class="notice-pagination__link" href="${buildNoticeUrl(notices[noticeIndex].id)}">${p}</a>`;
    }
  });

  // Next Button
  desktopHtml += nextNotice
    ? `<a class="notice-pagination__link" href="${buildNoticeUrl(nextNotice.id)}">Next →</a>`
    : `<span class="notice-pagination__link" aria-disabled="true">Next →</span>`;
  desktopHtml += '</div>';

  // --- Mobile Pagination Logic ---
  let mobileHtml = '<div class="notice-pagination__mobile">';
  // Prev Button
  mobileHtml += prevNotice
    ? `<a class="notice-pagination__link" href="${buildNoticeUrl(prevNotice.id)}">← Prev</a>`
    : `<span class="notice-pagination__link" aria-disabled="true">← Prev</span>`;

  // Informational Text "X of Y"
  mobileHtml += `<span class="notice-pagination__info">${currentP} of ${total}</span>`;

  // Next Button
  mobileHtml += nextNotice
    ? `<a class="notice-pagination__link" href="${buildNoticeUrl(nextNotice.id)}">Next →</a>`
    : `<span class="notice-pagination__link" aria-disabled="true">Next →</span>`;
  mobileHtml += '</div>';

  // Render both versions to the DOM
  paginationContainer.innerHTML = desktopHtml + mobileHtml;
}

function initKeyboardNavigation(notices, currentIndex) {
  window.addEventListener("keydown", (event) => {
    if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) {
      return;
    }
    if (event.key === "ArrowRight" && notices[currentIndex - 1]) {
      window.location.href = buildNoticeUrl(notices[currentIndex - 1].id);
    }
    if (event.key === "ArrowLeft" && notices[currentIndex + 1]) {
      window.location.href = buildNoticeUrl(notices[currentIndex + 1].id);
    }
  });
}

async function init() {
  try {
    const id = getQueryParam("id");
    if (!id) {
      renderNotFound();
      return;
    }

    const raw = await fetchNotices(SITE_CONFIG.dataUrl);
    const notices = sortNotices(raw.map(normalizeNotice), "date-desc");
    const currentIndex = notices.findIndex((notice) => String(notice.id) === String(id));

    if (currentIndex === -1) {
      renderNotFound();
      return;
    }

    const notice = notices[currentIndex];

    document.title = `${notice.title} | ${SITE_CONFIG.siteName}`;
    noticeContent.innerHTML = buildArticleMarkup(notice);

    setPagination(notices, currentIndex);
    initKeyboardNavigation(notices, currentIndex);
  } catch (error) {
    console.error(error);
    renderNotFound();
  }
}

init();