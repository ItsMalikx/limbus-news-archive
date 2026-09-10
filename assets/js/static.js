import { initThemeToggle } from "/assets/js/utils.js";
import { TAG_COLORS } from "/assets/js/config.js";
try { initThemeToggle(); } catch (error) { console.warn("Theme preference unavailable", error); }
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
