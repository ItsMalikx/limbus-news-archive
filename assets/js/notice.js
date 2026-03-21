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
const prevNotice = document.getElementById("prevNotice");
const nextNotice = document.getElementById("nextNotice");

initThemeToggle();

function renderNotFound() {
  document.title = `Notice Not Found | ${SITE_CONFIG.siteName}`;
  noticeContent.innerHTML = `<p>Notice not found.</p>`;

  prevNotice.href = "#";
  nextNotice.href = "#";
  prevNotice.setAttribute("aria-disabled", "true");
  nextNotice.setAttribute("aria-disabled", "true");
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
  const next = notices[currentIndex - 1]; 
  const prev = notices[currentIndex + 1];

  if (prev) {
    prevNotice.href = buildNoticeUrl(prev.id);
    prevNotice.removeAttribute("aria-disabled");
    prevNotice.textContent = "← Previous";
  } else {
    prevNotice.href = "#";
    prevNotice.setAttribute("aria-disabled", "true");
    prevNotice.textContent = "← Previous";
  }

  if (next) {
    nextNotice.href = buildNoticeUrl(next.id);
    nextNotice.removeAttribute("aria-disabled");
    nextNotice.textContent = "Next →";
  } else {
    nextNotice.href = "#";
    nextNotice.setAttribute("aria-disabled", "true");
    nextNotice.textContent = "Next →";
  }
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