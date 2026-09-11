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
initNavigation();
