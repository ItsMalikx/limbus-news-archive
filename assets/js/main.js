import { SITE_CONFIG, TAG_COLORS } from "./config.js";
import {
  buildNoticeUrl,
  fetchNotices,
  initThemeToggle,
  normalizeNotice,
  sortNotices,
  debounce,
  escapeHtml,
  formatDate,
  getContrastColor
} from "./utils.js";
import { filterNotices } from "./search.js";

const noticeList = document.getElementById("noticeList");
const searchInput = document.getElementById("searchInput");
const resultsSummary = document.getElementById("resultsSummary");
const loadSentinel = document.getElementById("loadSentinel");

// Advanced Filter Elements
const filterToggle = document.getElementById("filterToggle");
const filterPanel = document.getElementById("filterPanel");
const filterPanelInner = document.getElementById("filterPanelInner");
const scopePills = document.querySelectorAll(".scope-pill");
const tagPillsContainer = document.getElementById("tagPills");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");

// Date Picker Elements
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const calendarDropdown = document.getElementById("calendarDropdown");
const calMonthSelect = document.getElementById("calMonthSelect");
const calYearSelect = document.getElementById("calYearSelect");
const calendarDays = document.getElementById("calendarDays");

initThemeToggle();

let allNotices = [];
let currentSorted = [];
let currentPage = 1;
const PAGE_SIZE = SITE_CONFIG.pageSize || 50;

// Central Filter State
let filterState = {
  query: "",
  scope: { title: true, content: true },
  start: null,
  end: null,
  tags: new Set()
};

// Calendar State
let minDate = new Date();
let maxDate = new Date();
let currentCalMonth = 0;
let currentCalYear = 2024;
let activeDateField = null; 

function excerpt(notice) {
  const summary = notice.summary?.trim();
  if (summary) return summary;

  const plain = notice.plainContent.trim();
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

function renderChunk(notices, page, append = false) {
  if (!append) {
    noticeList.innerHTML = "";
    if (!notices.length) {
      noticeList.innerHTML = `
        <div class="empty-card">
          <h3 class="section-title">No notices matched your search or filters.</h3>
          <p class="section-subtitle">Try adjusting the filter criteria or search terms.</p>
        </div>
      `;
      return;
    }
  }

  const start = (page - 1) * PAGE_SIZE;
  const end = page * PAGE_SIZE;
  const chunk = notices.slice(start, end);

  if (chunk.length === 0) return;

  const fragment = document.createDocumentFragment();
  chunk.forEach((notice) => fragment.appendChild(renderNoticeCard(notice)));
  noticeList.appendChild(fragment);
}

function updateStats(filtered) {
  resultsSummary.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
}

function applyFilters() {
  filterState.query = searchInput.value || "";
  const filtered = filterNotices(allNotices, filterState);
  currentSorted = sortNotices(filtered, "date-desc");

  currentPage = 1;
  renderChunk(currentSorted, currentPage, false);
  updateStats(currentSorted);
}

const debouncedApplyFilters = debounce(applyFilters, 100);

// === Advanced Panel & Pill Logic ===

function initFilterToggles() {
  // Toggle Expanding Panel
  filterToggle.addEventListener("click", () => {
    const isOpening = !filterPanel.classList.contains("open");
    
    if (isOpening) {
      filterPanel.classList.add("open");
      filterToggle.setAttribute("aria-expanded", "true");
      
      // Allow calendar dropdown to visibly break bounds AFTER sliding animation finishes
      setTimeout(() => {
        if (filterPanel.classList.contains("open")) {
          filterPanelInner.style.overflow = "visible";
        }
      }, 300);
    } else {
      filterPanelInner.style.overflow = "hidden";
      calendarDropdown.style.display = "none";
      activeDateField = null;
      filterPanel.classList.remove("open");
      filterToggle.setAttribute("aria-expanded", "false");
    }
  });

  // Scope (Title/Content) Toggles
  scopePills.forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.scope;
      const otherType = type === "title" ? "content" : "title";

      // Prevent turning off both
      if (filterState.scope[type] && !filterState.scope[otherType]) return; 

      filterState.scope[type] = !filterState.scope[type];
      btn.classList.toggle("active", filterState.scope[type]);
      
      // Update locked state visuals
      btn.classList.toggle("locked", filterState.scope[type] && !filterState.scope[otherType]);
      const otherBtn = document.querySelector(`.scope-pill[data-scope="${otherType}"]`);
      otherBtn.classList.toggle("locked", filterState.scope[otherType] && !filterState.scope[type]);

      applyFilters();
    });
  });

  // Clear Filters Button
  clearFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    filterState.query = "";
    filterState.scope = { title: true, content: true };
    filterState.start = null;
    filterState.end = null;
    filterState.tags.clear();

    scopePills.forEach(btn => {
      btn.classList.add("active");
      btn.classList.remove("locked");
    });
    
    document.querySelectorAll(".filter-pill.tag-pill").forEach(btn => btn.classList.remove("active"));
    
    startDateInput.value = "";
    endDateInput.value = "";
    calendarDropdown.style.display = "none";
    activeDateField = null;

    applyFilters();
  });
}

function initTagsFilter() {
  const tagToSlug = (tag) => tag.toLowerCase().replace(/\s+/g, '-');
  const allTags = [...new Set(allNotices.flatMap(n => n.tags || []))].sort();

  allTags.forEach(tag => {
    const slug = tagToSlug(tag);
    const hex = TAG_COLORS[slug] || "#6B7280";
    const contrast = getContrastColor(hex);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-pill tag-pill";
    btn.textContent = tag;
    
    // Pass the colors to the unique CSS color-mix variables
    btn.style.setProperty("--pill-color", hex);
    btn.style.setProperty("--pill-contrast", contrast);

    btn.addEventListener("click", () => {
      if (filterState.tags.has(tag)) {
        filterState.tags.delete(tag);
        btn.classList.remove("active");
      } else {
        filterState.tags.add(tag);
        btn.classList.add("active");
      }
      applyFilters();
    });

    tagPillsContainer.appendChild(btn);
  });
}

// === Custom Calendar Logic ===

function formatDateString(date) {
  if (!date) return "";
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}

function updateCalendarSelects() {
  calYearSelect.innerHTML = "";
  calMonthSelect.innerHTML = "";

  const minYear = minDate.getFullYear();
  const maxYear = maxDate.getFullYear();

  for (let y = minYear; y <= maxYear; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    calYearSelect.appendChild(opt);
  }
  calYearSelect.value = currentCalYear;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let m = 0; m < 12; m++) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = monthNames[m];
    
    if (currentCalYear === minYear && m < minDate.getMonth()) opt.disabled = true;
    if (currentCalYear === maxYear && m > maxDate.getMonth()) opt.disabled = true;
    calMonthSelect.appendChild(opt);
  }
  calMonthSelect.value = currentCalMonth;

  document.getElementById("calPrevYear").disabled = currentCalYear <= minYear;
  document.getElementById("calPrevMonth").disabled = (currentCalYear === minYear && currentCalMonth <= minDate.getMonth());
  document.getElementById("calNextYear").disabled = currentCalYear >= maxYear;
  document.getElementById("calNextMonth").disabled = (currentCalYear === maxYear && currentCalMonth >= maxDate.getMonth());
}

function renderCalendar() {
  calendarDays.innerHTML = "";
  const firstDayIndex = new Date(currentCalYear, currentCalMonth, 1).getDay();
  const totalDays = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();

  for (let i = 0; i < firstDayIndex; i++) {
    const empty = document.createElement("div");
    calendarDays.appendChild(empty);
  }

  for (let i = 1; i <= totalDays; i++) {
    const dateObj = new Date(currentCalYear, currentCalMonth, i);
    dateObj.setHours(0,0,0,0);
    
    const wrap = document.createElement("div");
    wrap.className = "cal-day-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-day-btn";
    btn.textContent = i;

    // Strict bounds
    if (dateObj < minDate || dateObj > maxDate) {
      btn.disabled = true;
    }

    // Range highlight visuals
    if (filterState.start && filterState.end) {
      if (dateObj >= filterState.start && dateObj <= filterState.end) wrap.classList.add("in-range");
      if (dateObj.getTime() === filterState.start.getTime()) wrap.classList.add("range-start");
      if (dateObj.getTime() === filterState.end.getTime()) wrap.classList.add("range-end");
    } else if (filterState.start && dateObj.getTime() === filterState.start.getTime()) {
      wrap.classList.add("range-start", "in-range", "range-end");
    } else if (filterState.end && dateObj.getTime() === filterState.end.getTime()) {
      wrap.classList.add("range-start", "in-range", "range-end");
    }

    // Click Flow Logic
    btn.addEventListener("click", () => {
      if (activeDateField === "start") {
        filterState.start = dateObj;
        if (filterState.end && dateObj > filterState.end) {
          filterState.end = null;
          endDateInput.value = "";
        }
        startDateInput.value = formatDateString(dateObj);
        
        // Auto shift to End Date
        activeDateField = "end";
        endDateInput.focus(); 
        
      } else if (activeDateField === "end") {
        if (filterState.start && dateObj < filterState.start) {
          // If clicked before start, overwrite start instead
          filterState.start = dateObj;
          startDateInput.value = formatDateString(dateObj);
        } else {
          filterState.end = dateObj;
          endDateInput.value = formatDateString(dateObj);
          calendarDropdown.style.display = "none";
          activeDateField = null;
        }
      }
      renderCalendar();
      applyFilters();
    });

    wrap.appendChild(btn);
    calendarDays.appendChild(wrap);
  }
}

function initDateControls() {
  const validDates = allNotices.map(n => new Date(n.date + "T00:00:00")).filter(d => !isNaN(d));
  if (validDates.length > 0) {
    minDate = new Date(Math.min(...validDates));
    maxDate = new Date(Math.max(...validDates));
    minDate.setHours(0,0,0,0);
    maxDate.setHours(0,0,0,0);
  }

  function openCalendar(type) {
    activeDateField = type;
    calendarDropdown.style.display = "block";
    
    let referenceDate = type === "start" ? filterState.start : filterState.end;
    if (!referenceDate && type === "end" && filterState.start) referenceDate = filterState.start;
    if (!referenceDate) referenceDate = maxDate;

    currentCalMonth = referenceDate.getMonth();
    currentCalYear = referenceDate.getFullYear();

    updateCalendarSelects();
    renderCalendar();
  }

  startDateInput.addEventListener("click", () => openCalendar("start"));
  endDateInput.addEventListener("click", () => openCalendar("end"));

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".date-range-container") && activeDateField !== null) {
      calendarDropdown.style.display = "none";
      activeDateField = null;
    }
  });

  calMonthSelect.addEventListener("change", (e) => {
    currentCalMonth = parseInt(e.target.value, 10);
    updateCalendarSelects();
    renderCalendar();
  });

  calYearSelect.addEventListener("change", (e) => {
    currentCalYear = parseInt(e.target.value, 10);
    if (currentCalYear === minDate.getFullYear() && currentCalMonth < minDate.getMonth()) currentCalMonth = minDate.getMonth();
    if (currentCalYear === maxDate.getFullYear() && currentCalMonth > maxDate.getMonth()) currentCalMonth = maxDate.getMonth();
    updateCalendarSelects();
    renderCalendar();
  });

  document.getElementById("calPrevMonth").addEventListener("click", () => {
    currentCalMonth--;
    if (currentCalMonth < 0) { currentCalMonth = 11; currentCalYear--; }
    updateCalendarSelects();
    renderCalendar();
  });

  document.getElementById("calNextMonth").addEventListener("click", () => {
    currentCalMonth++;
    if (currentCalMonth > 11) { currentCalMonth = 0; currentCalYear++; }
    updateCalendarSelects();
    renderCalendar();
  });

  document.getElementById("calPrevYear").addEventListener("click", () => {
    currentCalYear--;
    if (currentCalYear === minDate.getFullYear() && currentCalMonth < minDate.getMonth()) currentCalMonth = minDate.getMonth();
    updateCalendarSelects();
    renderCalendar();
  });

  document.getElementById("calNextYear").addEventListener("click", () => {
    currentCalYear++;
    if (currentCalYear === maxDate.getFullYear() && currentCalMonth > maxDate.getMonth()) currentCalMonth = maxDate.getMonth();
    updateCalendarSelects();
    renderCalendar();
  });
}

function initObserver() {
  if (!loadSentinel) return;

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (currentPage * PAGE_SIZE < currentSorted.length) {
        currentPage++;
        renderChunk(currentSorted, currentPage, true);
      }
    }
  }, { rootMargin: "200px" });

  observer.observe(loadSentinel);
}

async function init() {
  try {
    const raw = await fetchNotices(SITE_CONFIG.dataUrl);
    allNotices = raw.map(normalizeNotice);
    currentSorted = sortNotices(allNotices, "date-desc");

    currentPage = 1;
    renderChunk(currentSorted, currentPage, false);
    updateStats(currentSorted);
    initObserver();

    initFilterToggles();
    initTagsFilter();
    initDateControls();

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