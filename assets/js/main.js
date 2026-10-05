import { SITE_CONFIG, TAG_COLORS } from "/assets/js/config.js?v=f79448758d";
import {
  buildNoticeUrl, fetchNotices, initThemeToggle, initShell, normalizeNotice, sortNotices,
  stripHtml, debounce, escapeHtml, formatDate
} from "/assets/js/utils.js?v=1aaa0d34d7";
import { buildSearchIndex, listIndex, startSearchIndex, noticePlainText, searchNotices, highlight, excerpt } from "/assets/js/search.js?v=e6b93eaddd";

const noticeList = document.getElementById("noticeList");
const searchInput = document.getElementById("searchInput");
const resultsSummary = document.getElementById("resultsSummary");
const tagFilters = document.getElementById("tagFilters");
const sortSelect = document.getElementById("searchSort");
const navigation = [...document.querySelectorAll('[aria-label="Archive pages"]')];
const archivePage = Number(noticeList.dataset.archivePage) || 1;
const pageSize = Number(noticeList.dataset.pageSize) || SITE_CONFIG.pageSize || 50;
let allNotices = [];
let searchIndex = null, indexing = null;
let animateNext = false;
// Results scoring below this share of the best match are tucked behind a button.
const LOOSE_RATIO = 0.15;

// Back/forward and "Back to results" return to the same scroll position.
const scrollKey = () => `lcna:scroll:${window.location.pathname}${window.location.search}`;
function storage(action) {
  try { return action(window.sessionStorage); } catch { return null; }
}
function saveScroll() {
  storage(store => store.setItem(scrollKey(), String(Math.round(window.scrollY || 0))));
}
// On arrival, only a return (back/forward, a reload, or "Back to results") goes back to where the
// reader was; opening a page from a link (the page numbers, a tag) starts at the top.
function returning() {
  const back = storage(store => store.getItem("lcna:restore-scroll"));
  if (back !== null) storage(store => store.removeItem("lcna:restore-scroll"));
  const type = window.performance?.getEntriesByType?.("navigation")?.[0]?.type;
  return type === "back_forward" || type === "reload" || back === `${window.location.pathname}${window.location.search}`;
}
function restoreScroll(arriving = false) {
  if (arriving && !returning()) return;
  const saved = Number(storage(store => store.getItem(scrollKey())));
  if (saved > 0 && typeof window.scrollTo === "function") window.requestAnimationFrame?.(() => window.scrollTo(0, saved));
}

try { initThemeToggle(); } catch (error) { console.warn("Theme preference unavailable", error); }
try { initShell(); } catch (error) { /* shell menu optional */ }

// Same slug rule as slugify() in scripts/build_site.py ("Identities & E.G.O" -> "identities-e-g-o").
const tagSlug = tag => String(tag).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Summary lines, one sentence per line (same as summary_html() in build_site.py).
const summaryHtml = text => String(text).split("\n").map(escapeHtml).join("\n");

// Same structure as card() in scripts/build_site.py.
function renderNoticeCard(notice, featured = false, words = []) {
  const article = document.createElement("a");
  article.className = featured ? "notice-card notice-card--featured" : "notice-card";
  article.href = buildNoticeUrl(notice);
  const typeColor = TAG_COLORS[tagSlug(notice.type || "")];
  const type = notice.type ? `<span class="type-label" data-tag="${tagSlug(notice.type)}" ${typeColor ? `style="--tag-color: ${typeColor}"` : ""}>${escapeHtml(notice.type)}</span>` : "";
  const tags = notice.tags.map(tag => {
    const color = TAG_COLORS[tagSlug(tag)];
    return `<span class="tag-pill" data-tag="${tagSlug(tag)}" ${color ? `style="--tag-color: ${color}"` : ""}>${escapeHtml(tag)}</span>`;
  }).join("");
  const plain = notice.summary?.trim() || noticePlainText(notice.text ?? stripHtml(notice.content)).slice(0, 600);
  const summary = plain;
  const date = notice.date
    ? `<time datetime="${escapeHtml(notice.date)}">${escapeHtml(formatDate(notice.date))}</time>` : "";
  article.innerHTML = `
    <div class="notice-card__meta">${date}<span class="notice-card__id">#${escapeHtml(notice.number)}</span></div>
    <div class="notice-card__body">
      ${notice.type ? `<span class="category-badge" data-icon="${tagSlug(notice.type)}" ${TAG_COLORS[tagSlug(notice.type)] ? `style="--tag-color: ${TAG_COLORS[tagSlug(notice.type)]}"` : ""}>${escapeHtml(notice.type)}</span>` : ""}
      <h2 class="notice-card__title">${words.length ? highlight(notice.title, words) : escapeHtml(notice.title)}</h2>
      <p class="notice-card__summary">${words.length ? excerpt(plain, words) : summaryHtml(summary)}</p>
      <div class="tag-list">${tags}</div>
    </div>`;
  return article;
}

function pageUrl(page, query, filters, extra = {}) {
  if (!query && !filters.type && !filters.topics.length && !extra.sort) return page === 1 ? "/" : `/archive/${page}/`;
  const url = new URL(window.location.href);
  url.search = "";
  if (query) url.searchParams.set("q", query);
  if (filters.type) url.searchParams.set("type", filters.type);
  if (filters.topics.length) url.searchParams.set("tag", filters.topics.join(","));
  for (const [name, value] of Object.entries(extra)) if (value) url.searchParams.set(name, value);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.pathname + url.search;
}

// Every label is a tag; a notice's tags are its main type plus its other tags.
const noticeTags = notice => [notice.type, ...(notice.tags || [])].filter(Boolean);

// Tags combine: selecting several shows notices that have all of them.
function renderFilters(filters, pool) {
  if (!tagFilters) return;
  const inType = notice => !filters.type || tagSlug(notice.type || "") === filters.type;
  const inTags = notice => {
    const slugs = noticeTags(notice).map(tagSlug);
    return filters.topics.every(slug => slugs.includes(slug));
  };
  const typeCounts = new Map();
  const tagCounts = new Map();
  for (const notice of allNotices) {
    if (notice.type && !typeCounts.has(notice.type)) typeCounts.set(notice.type, 0);
    for (const tag of notice.tags) if (!tagCounts.has(tag)) tagCounts.set(tag, 0);
  }
  let allCount = 0;
  for (const notice of pool) {
    if (!inTags(notice)) continue;
    allCount += 1;
    if (notice.type) typeCounts.set(notice.type, typeCounts.get(notice.type) + 1);
    if (inType(notice)) for (const tag of notice.tags) tagCounts.set(tag, tagCounts.get(tag) + 1);
  }
  const order = Object.keys(TAG_COLORS);
  const rank = name => { const index = order.indexOf(tagSlug(name)); return index < 0 ? order.length : index; };
  const sorted = counts => [...counts].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  const item = (kind, name, slug, count, pressed) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `browse-item browse-item--${kind}`;
    button.dataset[kind] = slug;
    button.setAttribute("aria-pressed", String(pressed));
    if (count === 0) button.dataset.empty = "";
    const color = TAG_COLORS[slug];
    if (color) button.style.setProperty("--tag-color", color);
    button.dataset.icon = slug || "all";
    button.title = name;
    button.innerHTML = `<span class="browse-item__name">${escapeHtml(name)}</span><span class="browse-item__count">${count}</span>`;
    return button;
  };
  const group = (label, items, extra) => {
    const section = document.createElement("div");
    section.className = "browse-group";
    section.setAttribute("role", "group");
    section.setAttribute("aria-label", label);
    const heading = document.createElement("p");
    heading.className = "browse-group__label";
    const text = document.createElement("span");
    text.textContent = label;
    heading.append(text, ...(extra ? [extra] : []));
    section.append(heading, ...items);
    return section;
  };
  // Type: one choice. Tags: any number, narrowing within the type.
  const types = [item("type", "All", "", allCount, !filters.type),
    ...sorted(typeCounts).map(([name, count]) => item("type", name, tagSlug(name), count, tagSlug(name) === filters.type))];
  const tags = sorted(tagCounts).map(([name, count]) => item("tag", name, tagSlug(name), count, filters.topics.includes(tagSlug(name))));
  // Clear sits in the Tags label row (fixed height) and only clears tag selections.
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "filter-clear";
  clear.dataset.clear = "";
  clear.textContent = "Clear";
  clear.hidden = !filters.topics.length;
  tagFilters.replaceChildren(group("Type", types), group("Tags", tags, clear));
}


function renderFromLocation({ syncInput = true } = {}) {
  const params = new URLSearchParams(window.location.search);
  const query = (params.get("q") || "").trim();
  const filters = { type: (params.get("type") || "").trim(),
    topics: [...new Set((params.get("tag") || "").split(",").map(value => value.trim()).filter(Boolean))] };
  const labelFor = slug => [...allNotices.map(notice => notice.type || ""), ...allNotices.flatMap(notice => notice.tags)]
    .find(name => name && tagSlug(name) === slug) || "";
  const filterLabel = [filters.type, ...filters.topics].filter(Boolean).map(labelFor).filter(Boolean).join(", ");
  if (syncInput) searchInput.value = query;
  const defaultSort = query ? "relevance" : "newest";
  const requestedSort = params.get("sort");
  const sort = ["newest", "oldest"].includes(requestedSort) || (requestedSort === "relevance" && query) ? requestedSort : defaultSort;
  if (query && !searchIndex.ready) indexing?.finishNow();
  const { results } = searchNotices(searchIndex, query);
  const ranked = sort === "newest" && query ? [...results].sort((a, b) => a.doc.order - b.doc.order)
    : sort === "oldest" ? [...results].sort((a, b) => b.doc.order - a.doc.order) : results;
  const matching = ranked.filter(({ doc: { notice } }) => {
    const slugs = noticeTags(notice).map(tagSlug);
    return (!filters.type || tagSlug(notice.type || "") === filters.type) && filters.topics.every(slug => slugs.includes(slug));
  });
  const top = matching.reduce((best, result) => Math.max(best, result.score), 0);
  // Weak matches follow the strong ones under a divider (relevance order only).
  const strongCount = query && sort === "relevance"
    ? matching.filter(result => result.score >= top * LOOSE_RATIO).length : matching.length;
  const ordered = query && sort === "relevance"
    ? [...matching.filter(result => result.score >= top * LOOSE_RATIO), ...matching.filter(result => result.score < top * LOOSE_RATIO)]
    : matching;
  const filtered = ordered.map(result => result.doc.notice);
  const wordsById = new Map(ordered.map(result => [result.doc.notice.id, result.words]));
  if (sortSelect) {
    const relevance = sortSelect.querySelector?.('option[value="relevance"]');
    if (relevance) { relevance.hidden = !query; relevance.disabled = !query; }
    sortSelect.value = sort;
    syncSortMenu?.();
  }
  const sortParam = sort === defaultSort ? "" : sort;
  const filteredView = Boolean(query || filters.type || filters.topics.length || sortParam);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requested = filteredView ? Number(params.get("page") || 1) : archivePage;
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  // Must match the server-rendered titles in build_site.py; crawlers render this script.
  const short = SITE_CONFIG.shortName || "LCNA";
  const title = query ? `${query} | ${short}` : filterLabel ? `${filterLabel} | ${short}` : short;
  document.title = page === 1 ? title : `Page ${page} | ${title}`;
  const fragment = document.createDocumentFragment();
  const offset = (page - 1) * pageSize;
  filtered.slice(offset, page * pageSize).forEach((notice, index) => {
    if (offset + index === strongCount && strongCount > 0) {
      const divider = document.createElement("p");
      divider.className = "results-divider";
      divider.textContent = "Less closely related";
      fragment.appendChild(divider);
    }
    fragment.appendChild(renderNoticeCard(notice, false, wordsById.get(notice.id) || []));
  });
  noticeList.replaceChildren(fragment);
  // A short entrance only after a deliberate change (filter, sort, page), never while typing.
  noticeList.classList?.remove("is-updating");
  if (animateNext) {
    animateNext = false;
    requestAnimationFrame?.(() => noticeList.classList?.add("is-updating"));
  }
  if (!filtered.length) {
    noticeList.innerHTML = '<div class="empty-card"><h2 class="section-title">No notices matched your search.</h2><p>Try different words or fewer filters.</p></div>';
  }
  // Just where you are in the list; a single page of matches gives its count instead.
  const noun = filtered.length === 1 ? "result" : "results";
  resultsSummary.textContent = pages > 1 ? `Page ${page} of ${pages}` : `${filtered.length} ${noun}`;
  resultsSummary.hidden = false;
  if (document.documentElement?.dataset) delete document.documentElement.dataset.pending;
  renderFilters(filters, results.map(result => result.doc.notice));
  storage(store => store.setItem("lcna:last-archive", window.location.pathname + window.location.search));

  for (const nav of navigation) {
    const links = document.createDocumentFragment();
    for (let target = 1; target <= pages; target++) {
      const link = document.createElement("a");
      link.className = "notice-pagination__link";
      link.href = pageUrl(target, query, filters, { sort: sortParam });
      link.textContent = String(target);
      if (target === page) {
        link.className += " active";
        link.setAttribute("aria-current", "page");
      }
      if (filteredView) link.dataset.searchPage = String(target);
      links.appendChild(link);
    }
    nav.replaceChildren(links);
    // A single page needs no page links.
    nav.hidden = pages <= 1;
    nav.style.display = pages > 1 ? "flex" : "none";
  }
}

function applySearch() {
  const url = new URL(window.location.href);
  const query = searchInput.value.trim();
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  url.searchParams.delete("page");
  window.history.replaceState(null, "", url.pathname + url.search);
  // Preserve the typed text and caret; normalize only the search query.
  renderFromLocation({ syncInput: false });
}

// Small screens: a panel becomes a drawer opened (and closed) by an icon button in the header.
// Sort menu: a button that opens a styled list (replaces the native select popup).
function initSortMenu(select) {
  if (!select || !select.parentElement) return;
  const wrapper = select.parentElement;
  // The button and menu are served in the page; build them only if missing.
  let button = wrapper.querySelector(".sort-button");
  let menu = wrapper.querySelector(".sort-menu");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "sort-button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.append(document.createElement("span"));
    wrapper.append(button);
  }
  if (!menu) {
    menu = document.createElement("ul");
    menu.className = "sort-menu";
    menu.setAttribute("role", "listbox");
    wrapper.append(menu);
  }
  const label = button.querySelector("span");
  select.hidden = true;
  const sync = () => {
    label.textContent = select.selectedOptions?.[0]?.textContent || "";
    menu.replaceChildren(...[...select.options].filter(option => !option.hidden).map(option => {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.setAttribute("aria-selected", String(option.value === select.value));
      item.innerHTML = `<span>${escapeHtml(option.textContent)}</span><svg class="sort-menu__check" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>`;
      return item;
    }));
  };
  const setOpen = open => {
    wrapper.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => { sync(); setOpen(!wrapper.classList.contains("is-open")); });
  menu.addEventListener("click", event => {
    const item = event.target.closest("li[data-value]");
    if (!item) return;
    select.value = item.dataset.value;
    setOpen(false);
    select.dispatchEvent(new Event("change"));
  });
  document.addEventListener("click", event => { if (!wrapper.contains(event.target)) setOpen(false); });
  window.addEventListener("keydown", event => { if (event.key === "Escape") setOpen(false); });
  return sync;
}
let syncSortMenu = null;

// The served page already shows its list, filters and page links, so the notice data (a few MB) is
// only fetched when something needs it: a search, filter, sort or results page, or an address that
// asks for one. (Fetching and indexing it at load was most of the start-up time on phones.)
let loading = null;
function loadNotices() {
  loading ||= fetchNotices(SITE_CONFIG.dataUrl).then(raw => {
    allNotices = sortNotices(raw.map(normalizeNotice), "date-desc");
    // The search index: at once when the page opens on a search; otherwise built in slices.
    const query = new URLSearchParams(window.location.search).get("q") || searchInput.value.trim();
    searchIndex = query ? buildSearchIndex(allNotices) : listIndex(allNotices);
    if (!searchIndex.ready) indexing = startSearchIndex(allNotices, (built, later) => {
      searchIndex = built;
      if (later && new URLSearchParams(window.location.search).get("q")) renderFromLocation({ syncInput: false });
    });
  });
  return loading;
}

function searchUnavailable(error) {
  console.error(error);
  // Static cards and page links remain usable when the search data cannot load.
  resultsSummary.textContent = "Search is temporarily unavailable. Browse the archive below.";
  if (document.documentElement?.dataset) delete document.documentElement.dataset.pending;
}

// Runs `action` with the data: at once once loaded (so later updates stay synchronous), else after it loads.
function withNotices(action) {
  return (...args) => {
    if (searchIndex) return action(...args);
    return loadNotices().then(() => action(...args), searchUnavailable);
  };
}

async function init() {
  const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
  searchInput.value = initialQuery;
  syncSortMenu = initSortMenu(sortSelect) || null;
  if (window.history && "scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  window.addEventListener("pagehide", saveScroll);
  noticeList.addEventListener?.("click", saveScroll);
  sortSelect?.addEventListener("change", withNotices(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("sort", sortSelect.value);
    animateNext = true;
    url.searchParams.delete("page");
    window.history.replaceState(null, "", url.pathname + url.search);
    renderFromLocation();
  }));
  // The box stays usable while the data loads (no dimming); anything typed meanwhile is applied then.
  // Focusing it starts the download, so it is usually ready by the first letter.
  searchInput.addEventListener("focus", () => { loadNotices().catch(() => {}); });
  searchInput.addEventListener("input", debounce(withNotices(applySearch), 100));
  window.addEventListener("popstate", withNotices(() => { renderFromLocation(); restoreScroll(); }));
  const onFilterClick = event => {
    const button = event.target.closest("button[data-type], button[data-tag], button[data-clear]");
    if (!button) return;
    const url = new URL(window.location.href);
    const pressed = button.getAttribute("aria-pressed") === "true";
    if ("clear" in button.dataset) {
      url.searchParams.delete("tag");
    } else if ("type" in button.dataset) {
      if (pressed) return;
      if (!button.dataset.type) url.searchParams.delete("type");
      else url.searchParams.set("type", button.dataset.type);
    } else {
      const topics = new Set((url.searchParams.get("tag") || "").split(",").filter(Boolean));
      if (pressed) topics.delete(button.dataset.tag); else topics.add(button.dataset.tag);
      if (topics.size) url.searchParams.set("tag", [...topics].join(","));
      else url.searchParams.delete("tag");
    }
    url.searchParams.delete("page");
    saveScroll();
    animateNext = true;
    window.history.pushState(null, "", url.pathname + url.search);
    return withNotices(() => renderFromLocation())();
  };
  tagFilters?.addEventListener("click", onFilterClick);
  for (const nav of navigation) {
    nav.addEventListener("click", event => {
      const link = event.target.closest("a[data-search-page]");
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      saveScroll();
      window.history.pushState(null, "", link.href);
      return withNotices(() => { renderFromLocation(); noticeList.scrollIntoView({ block: "start" }); })();
    });
  }
  // An address with a search, filter, sort or results page is shown from the data (the served list
  // is hidden meanwhile: html[data-pending]); a plain page keeps what was served.
  if (/[?&](q|type|tag|sort|page)=/.test(window.location.search)) {
    await withNotices(() => {
      renderFromLocation();
      if (searchInput.value.trim() !== initialQuery.trim()) applySearch();
    })();
  }
  restoreScroll(true);
}

init();
