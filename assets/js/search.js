import { stripHtml, escapeHtml } from "./utils.js";

// Ranked search: weighted fields, prefix and typo-tolerant matching, "quoted phrases",
// and highlighted excerpts. Only `export function` declarations: tests load this as a script.

function normalizeText(text) {
  return String(text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function countTerms(text) {
  const counts = new Map();
  for (const word of normalizeText(text).split(" ")) {
    if (word) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return counts;
}

function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

export function buildSearchIndex(notices) {
  const vocabulary = new Map();
  const docs = notices.map((notice, order) => {
    const html = String(notice.content || "");
    const plain = stripHtml(html);
    const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map(match => stripHtml(match[1])).join(" ");
    const fields = {
      title: countTerms(notice.title),
      tags: countTerms([notice.type || "", ...(notice.tags || [])].join(" ")),
      headings: countTerms(headings),
      lead: countTerms(plain.slice(0, 300)),
      body: countTerms(plain)
    };
    for (const counts of Object.values(fields)) {
      for (const word of counts.keys()) {
        if (!vocabulary.has(word)) vocabulary.set(word, new Set());
        vocabulary.get(word).add(order);
      }
    }
    return { notice, order, plain, fields, text: ` ${normalizeText(`${notice.title} ${plain}`)} `,
      key: `${normalizeText(notice.title)}|${notice.date || ""}` };
  });
  return { docs, vocabulary, words: [...vocabulary.keys()] };
}

const FIELD_WEIGHTS = { title: 10, tags: 7, headings: 5, lead: 2.5, body: 1 };
const STOPWORDS = new Set("a an and are as at be by for from in is it of on or the to with".split(" "));

export function parseQuery(query) {
  const phrases = [...String(query).matchAll(/"([^"]+)"/g)].map(match => normalizeText(match[1])).filter(Boolean);
  const words = normalizeText(String(query).replace(/"[^"]*"/g, " ")).split(" ")
    .filter(word => word && (word.length > 1 || /\d/.test(word)));
  const meaningful = words.filter(word => !STOPWORDS.has(word));
  return { phrases, terms: [...new Set(meaningful.length ? meaningful : words)] };
}

// Exact word, then word prefixes, then (only if the word is absent) close misspellings.
function expandTerm(term, index) {
  const matches = [];
  if (index.vocabulary.has(term)) matches.push([term, 1]);
  const numeric = /^\d+$/.test(term);
  if (!numeric && term.length >= 3) {
    for (const word of index.words) {
      if (word !== term && word.startsWith(term)) matches.push([word, 0.75]);
    }
  }
  if (!matches.length && !numeric && term.length >= 4) {
    const limit = term.length <= 6 ? 1 : 2;
    for (const word of index.words) {
      if (editDistance(term, word, limit) <= limit) matches.push([word, 0.5]);
    }
  }
  return matches;
}

export function searchNotices(index, query) {
  const { phrases, terms } = parseQuery(query);
  if (!terms.length && !phrases.length) return { results: index.docs.map(doc => ({ doc, score: 0, words: [] })), terms };
  const total = index.docs.length;
  const expansions = terms.map(term => expandTerm(term, index));
  const results = [];
  for (const doc of index.docs) {
    if (phrases.some(phrase => !doc.text.includes(` ${phrase} `))) continue;
    let score = 0;
    const words = [];
    let everyTerm = true;
    expansions.forEach(options => {
      let termScore = 0;
      for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
        let best = 0;
        for (const [word, quality] of options) {
          const count = doc.fields[field].get(word);
          if (!count) continue;
          const rarity = Math.log(1 + total / index.vocabulary.get(word).size);
          best = Math.max(best, weight * quality * (1 + Math.log(count)) * rarity);
          if (!words.includes(word)) words.push(word);
        }
        termScore += best;
      }
      if (!termScore) everyTerm = false;
      score += termScore;
    });
    if (!everyTerm) continue;
    const title = ` ${normalizeText(doc.notice.title)} `;
    for (const phrase of phrases) score += title.includes(` ${phrase} `) ? 30 : 8;
    if (terms.length > 1 && terms.every((_, i) => expansions[i].some(([word]) => doc.fields.title.has(word)))) score *= 1.5;
    results.push({ doc, score, words: [...words, ...phrases] });
  }
  // Stable: equal scores keep archive (newest-first) order.
  results.sort((a, b) => b.score - a.score || a.doc.order - b.doc.order);
  const seen = new Set();
  return { results: results.filter(result => !seen.has(result.doc.key) && seen.add(result.doc.key)), terms };
}

function matcher(words) {
  const parts = words.filter(Boolean).sort((a, b) => b.length - a.length)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\W+"));
  return parts.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${parts.join("|")})`, "giu") : null;
}

export function highlight(text, words) {
  const pattern = matcher(words);
  if (!pattern) return escapeHtml(text);
  let html = "";
  let last = 0;
  for (const match of String(text).matchAll(pattern)) {
    const start = match.index + match[1].length;
    html += escapeHtml(text.slice(last, start)) + `<mark>${escapeHtml(match[2])}</mark>`;
    last = start + match[2].length;
  }
  return html + escapeHtml(String(text).slice(last));
}

// Excerpt around the first body match, so it is clear why a result was returned.
export function excerpt(plain, words, length = 220) {
  const text = String(plain).replace(/\s+/g, " ").trim();
  const pattern = matcher(words);
  const match = pattern ? pattern.exec(text) : null;
  if (!match) return highlight(text.slice(0, length) + (text.length > length ? "…" : ""), words);
  const at = match.index + match[1].length;
  let start = Math.max(0, at - 70);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  const slice = text.slice(start, start + length);
  return (start > 0 ? "…" : "") + highlight(slice, words) + (start + length < text.length ? "…" : "");
}
