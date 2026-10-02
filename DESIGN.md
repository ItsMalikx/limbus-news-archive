# Design system: LCNA (lcna.whosmalikx.com)

The Limbus Company News Archive. Dark by default with an optional light theme; an app-style
shell (header, sidebar, content) in the spirit of YouTube and Kick, with Project Moon's notice
conventions (gold tables, colored notes) inside each notice. whosmalikx.com shares the chrome,
tokens, font and scale but keeps its own page design (see that repo's DESIGN.md).

## Principles

1. **Color means category, once per element.** The notice type is the only filled color on a
   card; tags carry their color in an icon. Selection uses the same tint + left bar everywhere.
2. **One rule per thing.** The same element looks and behaves the same in the sidebar, on cards
   and on notice pages (a selected tag looks like the tag on a card).
3. **Official notice conventions inside notices.** Gold tables with spaced tiles, ※ notes in
   orange (red only for money, availability or access), Before/After, ▶ markers.
4. **Nothing is cut off.** Summaries are whole sentences; tables scale to fit their column.
5. **Fast by construction.** One self-hosted variable font, served sidebars, no layout flash.

## Tokens (dark default)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0a0a` | Page and sidebar background |
| `--surface` | `#141414` | Inputs, buttons |
| `--surface-2` | `#1c1c1c` | Hover and neutral selection |
| `--line` / `--line-strong` | `#262626` / `#3a3a3a` | Rules / control borders |
| `--text` / `--text-soft` / `--text-muted` | `#f2f2f2` / `#c4c4c4` / `#8f8f8f` | Headings / body / meta |
| `--gold-cell` | `#f2bf1a` | Table header and label cells |
| Accent | `#e2b13c` | Contents (notice page) selection only |
| "All" type | `#b2a1e7` | The All row's selection color |

Category colors share one OKLCH lightness (0.75) and chroma (~0.13), defined in
`limbus-news-pipeline/site_templates/js/config.js`:

| Category | Color | | Category | Color |
|---|---|---|---|---|
| Fixes (type) | `#FF8577` | | Rewards | `#ED9658` |
| Patch Notes (type) | `#64C897` | | Identities & E.G.O | `#EE8AB2` |
| Announcements (type) | `#68B7ED` | | Mirror Dungeon | `#76B3F1` |
| New Content | `#76C479` | | Main Story | `#C2AB7B` |
| Balance | `#C198F0` | | Events | `#ABB74F` |
| | | | Refraction Railway | `#46C6AA` |

Shape: rows, fields and menus 8px radius; label pills 6px; the type block 4px.
Motion: 160–220ms `cubic-bezier(0.2, 0, 0, 1)`; transitions are disabled while the theme flips.

## Type and scale

**Schibsted Grotesk** (variable, self-hosted). Base text 16px, 17px at 1200px+; the whole layout
zooms 1.08 at 1920px+ (large displays).

Card scale, stepping up from the label size:

| Element | Size | Style |
|---|---|---|
| Type block / tag pill | 0.72rem | 700 (tags 650), uppercase, tracked (type 0.06em, tags 0.085em) |
| Date and #id | 0.9rem | muted |
| Summary | 1rem | soft, one sentence per line, max three lines |
| Card title | 1.375rem (1.25rem phones) | 750 |

Type block: solid fill in the type color, dark text, 22px (matches a tag's inner area).
Tag pill: neutral outline, colored solid icon, 24px.

Hero: "The [ Limbus Company ] News Archive" (one line on desktop; "The [ Limbus Company ]" sized to
fit the first line on phones), brackets muted, "[ Limbus Company ]" one weight heavier. Below it
the description and search; the results line shows only "Page X of Y".

## Shell

- Header: menu button, LCNA brand (1.2rem, 22px mark), theme toggle.
- Sidebar: fixed rail, `clamp(264px, 20vw, 320px)` on desktop, `clamp(220px, 28vw, 284px)` at
  760–1199px (still a rail that pushes the content). Below 760px it is a full-height drawer over
  the page, closed by default. Collapsing is per page view (not remembered).
- Archive sidebar: Type list (single choice; clicking the selected type does nothing) and Tags
  list (combinable, Clear in the Tags label row). Icons are solid; type icons gray until selected,
  tag icons always in color. Selection: item-color tint + 3px left bar.
- Notice sidebar: Contents list; the clicked entry stays selected through its smooth scroll.

## Cards

Left column date and #id (9rem); body: type block, title, summary, tags (10px steps); a drawn
chevron at the right. Card rows have equal 16px inner padding; the list bleeds 16px so text
aligns with the search bar.

## Notice tables

Gold header/label cells and black cells with gold borders, separated by spaced tiles. Gold labels
wrap at 6–11em, plain cells at 12em; list lines and bracket groups never break. A table wider than
its column is scaled down evenly as a whole (CSS zoom, by `fitTables()` in `static.js`), measured
at its natural width; below ~10px text it stays at 10px and scrolls instead. Empty header corners
are transparent.
