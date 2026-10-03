import { initThemeToggle, initShell } from "/assets/js/utils.js?v=fefa847c5c";
import { TAG_COLORS } from "/assets/js/config.js?v=9b10988a44";
import { createZoomView } from "/assets/js/zoomview.js?v=039b5feecb";
try { initThemeToggle(); } catch (error) { console.warn("Theme preference unavailable", error); }
try { initShell(); } catch (error) { /* shell menu optional */ }
for (const tag of document.querySelectorAll("[data-tag]")) {
  const color = TAG_COLORS[tag.dataset.tag];
  if (color) tag.style.setProperty("--tag-color", color);
}
window.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
  const relation = event.key === "ArrowLeft" ? "prev" : event.key === "ArrowRight" ? "next" : null;
  const link = relation && document.querySelector(`#noticePagination a[rel="${relation}"]`);
  if (link) window.location.assign(link.href);
});

async function initNavigation() {
  const navigation = document.getElementById("noticePagination");
  const match = window.location.pathname.match(/^\/notices\/([1-9][0-9]*)\/$/);
  if (!navigation || !match) return;
  try {
    const response = await fetch("/data/notice-order.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Notice order unavailable");
    const ids = await response.json();
    if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(ids).size !== ids.length) throw new Error("Invalid notice order");
    const index = ids.indexOf(Number(match[1]));
    if (index < 0) return;
    const links = [];
    for (const [offset, relation, label] of [[-1, "prev", "\u2190 Newer"], [1, "next", "Older \u2192"]]) {
      const id = ids[index + offset];
      if (id === undefined) continue;
      const link = document.createElement("a");
      link.className = "notice-pagination__link";
      link.rel = relation;
      link.href = `/notices/${id}/`;
      link.textContent = label;
      links.push(link);
    }
    navigation.replaceChildren(...links);
  } catch (error) {
    console.warn("Notice navigation unavailable", error);
  }
}

// "Back to results" returns to the archive view (query, tag, page, scroll) the reader came from.
function initBackLink() {
  const link = document.querySelector?.(".back-link");
  if (!link) return;
  let last = null;
  try { last = window.sessionStorage.getItem("lcna:last-archive"); } catch { return; }
  if (!last || !last.startsWith("/")) return;
  link.href = last;
  const label = link.querySelector?.(".back-link__label") || link;
  if (/[?&](q|tag|type)=/.test(last)) label.textContent = "Back to results";

}
try { initBackLink(); } catch (error) { console.warn("Back link unavailable", error); }

// Contents panel (HoYoLAB-style): section list with a marker, current section highlighted.
function initContents() {
  const toc = document.getElementById("noticeToc");
  const list = document.getElementById("noticeTocList");
  const headings = [...document.querySelectorAll("#noticeContent .notice-section-heading:not(.notice-label-heading)")]
    .filter(heading => !/^index$|^contents$/i.test(heading.textContent.trim()));
  if (!toc || !list || headings.length < 2) return;
  // The list is served in the HTML; build it only if it is missing.
  const served = [...list.querySelectorAll("a")];
  const links = served.length ? served : headings.map((heading, index) => {
    heading.id ||= `section-${index + 1}`;
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent.trim();
    item.appendChild(link);
    list.appendChild(item);
    return link;
  });
  const linkedHeadings = links.map(link => document.getElementById(link.getAttribute("href").slice(1))).filter(Boolean);
  if (linkedHeadings.length === links.length) headings.splice(0, headings.length, ...linkedHeadings);
  toc.hidden = false;
  document.querySelector(".notice-layout")?.classList.add("has-toc");
  const setActive = index => links.forEach((link, i) => link.toggleAttribute("aria-current", i === index));
  // Current section: the last heading scrolled past the top band; at the page bottom, the last one.
  let pinned = null;
  const update = () => {
    if (pinned !== null) return;
    const band = 140;
    let current = 0;
    headings.forEach((heading, index) => { if (heading.getBoundingClientRect().top <= band) current = index; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      const lastVisible = headings.findLastIndex(heading => heading.getBoundingClientRect().top < window.innerHeight);
      if (lastVisible > current) current = lastVisible;
    }
    setActive(current);
  };
  // A clicked entry stays selected through the whole smooth scroll: the pin lifts only once
  // scrolling has been still for a moment, so passing sections never light up on the way.
  let frame = 0;
  let settle = 0;
  const release = () => { clearTimeout(settle); settle = setTimeout(() => { pinned = null; }, 160); };
  window.addEventListener("scroll", () => {
    if (pinned !== null) { release(); return; }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }, { passive: true });
  const unpin = () => { if (pinned !== null) { pinned = null; update(); } };
  ["wheel", "touchstart", "keydown"].forEach(type => window.addEventListener(type, unpin, { passive: true }));
  links.forEach((link, index) => link.addEventListener("click", () => {
    setActive(index);
    // Set after the click's own event handling so it is not cleared by the unpin listeners.
    setTimeout(() => { pinned = index; release(); }, 0);
  }));
  // A fresh visit starts at the top, so mark the section now. On refresh / back / forward (or a
  // #section link) the browser restores the scroll position first: choose the section after load,
  // so the first entry never flashes. A timer (not a frame callback) so it always runs.
  const restoring = location.hash || ["reload", "back_forward"].includes(performance.getEntriesByType?.("navigation")?.[0]?.type);
  if (!restoring || document.readyState === "complete") update();
  else window.addEventListener("load", () => setTimeout(update, 0), { once: true });
}
try { initContents(); } catch (error) { console.warn("Contents unavailable", error); }

// A table wider than its column is scaled down evenly as a whole (text, padding, borders and gaps
// together, like a picture) until it fits. It is measured at its natural width (every line on one
// line, columns unsqueezed) so the scaled table keeps the official proportions. Text is never scaled
// below ~10px: past that point the table stays at 10px and scrolls sideways instead.
const MIN_TABLE_TEXT = 10;
function fitTables() {
  document.querySelectorAll(".notice-table-wrap").forEach(wrap => {
    const table = wrap.querySelector("table");
    if (!table) return;
    table.style.zoom = "";
    table.style.maxWidth = "none";
    wrap.classList.remove("is-scrolling");
    const natural = table.getBoundingClientRect().width;
    const room = wrap.clientWidth;
    if (natural <= room + 1) return;
    const text = parseFloat(getComputedStyle(table).fontSize) || 16;
    const fit = room / natural;
    const floor = MIN_TABLE_TEXT / text;
    if (fit >= floor) {
      table.style.zoom = String(Math.floor(fit * 1000) / 1000);
    } else {
      table.style.zoom = String(Math.ceil(floor * 1000) / 1000);
      wrap.classList.add("is-scrolling");
    }
  });
}
try {
  fitTables();
  if (document.fonts?.ready) document.fonts.ready.then(fitTables);
  // Re-fit whenever the text column changes width: window resize, rotation, zoom, or the
  // sidebar opening/closing (which resizes the column without resizing the window).
  let fitFrame = 0;
  const refit = () => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(fitTables); };
  const column = document.getElementById("noticeContent");
  if (column && "ResizeObserver" in window) new ResizeObserver(refit).observe(column);
  window.addEventListener("resize", refit);
  window.addEventListener("load", refit, { once: true });
} catch (error) { /* tables keep their default size */ }

// Notice images open full size in a viewer: × / Esc / a click beside a fitted image closes it, arrows
// step through the notice's images (and do not change notice while it is open). zoomview.js does the
// zooming: the wheel or Ctrl + wheel zooms at the pointer, drag pans, pinch on touch screens, double
// click zooms in (or back to fit); the slider and −/+ / Fit drive the same camera.
try {
  const images = [...document.querySelectorAll(".notice-figure img")];
  if (images.length) {
    const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
    const viewer = document.createElement("dialog");
    viewer.className = "image-viewer";
    viewer.setAttribute("aria-label", "Image viewer");
    viewer.innerHTML = `<div class="image-viewer__bar">`
      + `<button type="button" class="image-viewer__button image-viewer__close" aria-label="Close">${icon("M6 6l12 12M18 6L6 18")}</button></div>`
      + `<div class="image-viewer__zoom" role="group" aria-label="Zoom">`
      + `<button type="button" class="image-viewer__button image-viewer__out" aria-label="Zoom out">${icon("M6 12h12")}</button>`
      + `<input type="range" class="image-viewer__slider" min="0" max="100" step="0.1" value="0" aria-label="Zoom level">`
      + `<button type="button" class="image-viewer__button image-viewer__in" aria-label="Zoom in">${icon("M6 12h12M12 6v12")}</button>`
      + `<output class="image-viewer__level">100%</output>`
      + `<button type="button" class="image-viewer__fit">Fit</button></div>`
      + `<button type="button" class="image-viewer__button image-viewer__nav image-viewer__nav--prev" aria-label="Previous image">${icon("M15 5l-7 7 7 7")}</button>`
      + `<figure class="image-viewer__figure"><div class="image-viewer__stage"><img class="image-viewer__image" alt="" draggable="false"></div>`
      + `<figcaption class="image-viewer__count"></figcaption></figure>`
      + `<button type="button" class="image-viewer__button image-viewer__nav image-viewer__nav--next" aria-label="Next image">${icon("M9 5l7 7-7 7")}</button>`;
    document.body.append(viewer);
    const $ = selector => viewer.querySelector(selector);
    const stage = $(".image-viewer__stage"), picture = $(".image-viewer__image"), count = $(".image-viewer__count");
    const slider = $(".image-viewer__slider"), level = $(".image-viewer__level");
    let index = 0;
    // The slider is logarithmic: equal steps feel like equal zooms. 0 = fitted, 100 = the most zoom.
    const view = createZoomView(stage, picture, { onChange: state => {
      const position = Math.log(state.zoom) / Math.log(state.maxZoom) * 100 || 0;
      slider.value = position;
      slider.style.setProperty("--fill", `${position}%`);
      level.textContent = `${Math.round(state.zoom * 100)}%`;
      $(".image-viewer__fit").disabled = state.zoom < 1.005;
    } });
    const show = next => {
      index = (next + images.length) % images.length;
      picture.src = images[index].currentSrc || images[index].src;
      picture.alt = images[index].alt;
      count.textContent = images.length > 1 ? `${index + 1} / ${images.length}` : "";
    };
    viewer.classList.toggle("image-viewer--single", images.length < 2);
    images.forEach((image, position) => image.closest("a")?.addEventListener("click", event => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey) return;  // new-tab clicks still work
      event.preventDefault();
      show(position);
      viewer.showModal();
      if (picture.complete) view.load();  // sized now that the dialog is open
    }));
    slider.addEventListener("input", () => {
      const state = view.getViewportState();
      view.setZoom(state.fitScale * state.maxZoom ** (slider.value / 100), undefined, false);
    });
    $(".image-viewer__in").addEventListener("click", () => view.zoomIn());
    $(".image-viewer__out").addEventListener("click", () => view.zoomOut());
    $(".image-viewer__fit").addEventListener("click", () => view.fitToView());
    $(".image-viewer__close").addEventListener("click", () => viewer.close());
    $(".image-viewer__nav--prev").addEventListener("click", () => show(index - 1));
    $(".image-viewer__nav--next").addEventListener("click", () => show(index + 1));
    viewer.addEventListener("click", event => {
      const fitted = view.getViewportState().zoom < 1.005;
      if (fitted && !view.moved() && [viewer, stage, $(".image-viewer__figure")].includes(event.target)) viewer.close();
    });
    viewer.addEventListener("keydown", event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        show(index + (event.key === "ArrowRight" ? 1 : -1));
      } else if (event.key === "+" || event.key === "=") view.zoomIn();
      else if (event.key === "-") view.zoomOut();
      else if (event.key === "0") view.fitToView();
    });
  }
} catch (error) { /* images still open in a new tab */ }

initNavigation();
