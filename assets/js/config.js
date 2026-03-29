export const SITE_CONFIG = {
  siteName: "Limbus Company News Archive",
  dataUrl: new URL("../../data/notices.json", import.meta.url).href,
  pageSize: 50,
  maxIndexedContentLength: 12000
};

export const TAG_COLORS = {
  "refraction-railway": "#FF7300",
  "walpurgis-night": "#93F205",
  "mirror-dungeon": "#A855F7",
  "update": "#F8C200",
  "bug-fix": "#3B82F6",
  "notice": "#06B6D4",
  "announcement": "#A16B3B"
};