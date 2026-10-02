export const SITE_CONFIG = {
  siteName: "Limbus Company News Archive",
  dataUrl: new URL("../../data/notices.json", import.meta.url).href,
  pageSize: 48
};

// Display order and colors for notice types (first) and topics. Keys are slugs.
// Display order for types (first, neutral badges) and tag colors. Keys are slugs.
export const TAG_COLORS = {
  "fixes": "#FF8577",
  "patch-notes": "#64C897",
  "announcements": "#68B7ED",
  "new-content": "#76C479",
  "balance": "#C198F0",
  "rewards": "#ED9658",
  "identities-e-g-o": "#EE8AB2",
  "mirror-dungeon": "#76B3F1",
  "main-story": "#C2AB7B",
  "events": "#ABB74F",
  "refraction-railway": "#46C6AA"
};
