export const SITE_CONFIG = {
  siteName: "Limbus Company News Archive",
  dataUrl: new URL("../../data/notices.json", import.meta.url).href,
  pageSize: 50,
  maxIndexedContentLength: 12000
};

// Defines the border/text color for each tag. The background is a lighter mix of this color.
export const TAG_COLORS = {
  "refraction-railway": "#FF7300", // Orange
  "walpurgis-night": "#93F205",    // Lime Green
  "mirror-dungeon": "#9300DB",     // Purple
  "update": "#F8C200",             // Yellow
  "bug-fix": "#0049D3",            // Blue
  "notice": "#0DC1EB",             // Cyan
  "announcement": "#A16B3B"        // Brown
};