export const SITE_CONFIG = {
  siteName: "Limbus Company News Archive",
  dataUrl: new URL("../../data/notices.json", import.meta.url).href,
  pageSize: 50,
  maxIndexedContentLength: 12000
};

// Defines the border/text color for each tag. The background is a lighter mix of this color.
export const TAG_COLORS = {
  "refraction-railway": "#FF7A00", // Orange
  "walpurgis-night": "#93F205",    // Lime Green
  "mirror-dungeon": "#A855F7",     // Purple
  "update": "#F2B807",             // Blue
  "bug-fix": "#3B82F6",            // Amber
  "notice": "#06B6D4",             // Cyan
  "announcement": "#6B7280"        // Gray
};