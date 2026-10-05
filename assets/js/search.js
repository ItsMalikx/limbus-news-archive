import { stripHtml, escapeHtml } from "/assets/js/utils.js?v=ba2deb1b4c";

// Ranked search: weighted fields, prefix and typo-tolerant matching, "quoted phrases",
// and highlighted excerpts. Only `export function` declarations: tests load this as a script.

// Words as the index and the query both see them: accents dropped, possessives removed ("Ryōshū's"),
// dotted acronyms joined ("E.G.O" -> "ego"), everything else split at punctuation.
function normalizeText(text) {
  return String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\{\/?(?:gold|red|orange|yellow|green|blue|purple|brown|gray|plain)\}/g, " ")
    .replace(/['’]s\b/g, "")
    .replace(/(?<![\p{L}\p{N}])(?:\p{L}\.){2,}\p{L}?(?![\p{L}\p{N}])/gu, match => match.replace(/\./g, ""))
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Extra index words kept whole: version numbers and dates ("1.116.1", "2025.11.20") and hyphenated
// words joined ("re-run" -> "rerun", "log-in" -> "login").
function compoundWords(text) {
  const lower = String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return [...lower.matchAll(/\d+(?:\.\d+)+/g)].map(match => match[0])
    .concat([...lower.matchAll(/\p{L}+(?:-\p{L}+)+/gu)].map(match => match[0].replace(/-/g, "")));
}

function countTerms(text) {
  const counts = new Map();
  for (const word of [...normalizeText(text).split(" "), ...compoundWords(text)]) {
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

// A notice transcript (the archive's text syntax) as plain words: colour and emphasis markup, table
// syntax, divider lines and image lines removed. Straight from the text: no HTML is built or parsed.
export function noticePlainText(text) {
  return String(text || "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/^\[\/?Table\b[^\]\n]*\]\s*$/gim, " ")
    .replace(/\{\/?[a-z]+\}/g, "").replace(/\*\*|__/g, "").replace(/^\s*-{3,}\s*$/gm, " ")
    .replace(/(^|\s)[|^](?=\s|$)/gm, " ").replace(/\\([\\|^])/g, "$1").replace(/\s+/g, " ").trim();
}

// The headings of a transcript: the lines underlined with dashes.
export function noticeHeadings(text) {
  return [...String(text || "").matchAll(/^(.+)\r?\n\s*-{3,}\s*$/gm)].map(match => noticePlainText(match[1])).join(" ");
}

// One notice's entry in the index (its words added to `vocabulary`). The transcript text is used when
// the notice has it; otherwise its HTML content.
export function indexNotice(notice, order, vocabulary) {
  const fromText = typeof notice.text === "string";
  const html = fromText ? "" : String(notice.content || "");
  const plain = fromText ? noticePlainText(notice.text) : stripHtml(html);
  const headings = fromText ? noticeHeadings(notice.text)
    : [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map(match => stripHtml(match[1])).join(" ");
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
    title: ` ${normalizeText(notice.title)} `, key: `${normalizeText(notice.title)}|${notice.date || ""}` };
}

export function buildSearchIndex(notices) {
  const vocabulary = new Map();
  const docs = notices.map((notice, order) => indexNotice(notice, order, vocabulary));
  return { docs, vocabulary, words: [...vocabulary.keys()], ready: true };
}

// The list without word lookups (enough to show every notice in order, before the index is built).
export function listIndex(notices) {
  return { docs: notices.map((notice, order) => ({ notice, order, plain: "", fields: null, text: "", title: "" })),
    vocabulary: new Map(), words: [], ready: false };
}

// The same index built a few notices at a time after the page has shown, giving the page back between
// slices (no long task blocks scrolling or typing). `onReady(index, later)` gets the finished index;
// `finishNow()` completes it at once (a search typed before it is done).
export function startSearchIndex(notices, onReady, budget = 8) {
  const vocabulary = new Map(), docs = [];
  let order = 0, finished = false;
  const done = later => { finished = true; onReady({ docs, vocabulary, words: [...vocabulary.keys()], ready: true }, later); };
  const step = () => {
    if (finished) return;
    const started = Date.now();
    while (order < notices.length && Date.now() - started < budget) docs.push(indexNotice(notices[order], order++, vocabulary));
    if (order < notices.length) setTimeout(step, 0); else done(true);
  };
  const api = { finishNow() {
    if (finished) return;
    while (order < notices.length) docs.push(indexNotice(notices[order], order++, vocabulary));
    done(false);
  } };
  // (Where there is no timer, as in a bare script context, it is built at once.)
  if (typeof setTimeout === "function") setTimeout(step, 0); else api.finishNow();
  return api;
}

const FIELD_WEIGHTS = { title: 10, tags: 7, headings: 5, lead: 2.5, body: 1 };
const STOPWORDS = new Set("a an and are as at be by for from in is it of on or the to with".split(" "));
// Shorthand players type: a term also matches notices that spell it out.
const ALIASES = { md: "mirror dungeon", rr: "refraction railway", bp: "battle pass", wn: "walpurgis night",
  lux: "luxcavation", s: "season", ch: "chapter" };

export function parseQuery(query) {
  const raw = String(query);
  const phrases = [...raw.matchAll(/"([^"]+)"/g)].map(match => normalizeText(match[1])).filter(Boolean);
  const rest = raw.replace(/"[^"]*"/g, " ");
  const versions = compoundWords(rest).filter(word => /\d/.test(word));  // "1.116" stays one term
  // Hyphenated words are one term ("re-run" finds "rerun" and "re-run").
  const joined = compoundWords(rest).filter(word => !/\d/.test(word));
  let words = normalizeText(rest.replace(/\d+(?:\.\d+)+/g, " ").replace(/\p{L}+(?:-\p{L}+)+/gu, " ")).split(" ").filter(Boolean);
  words.push(...joined);
  // "MD6", "RR6", "S8": shorthand followed by a number is two terms; a one-letter shorthand means its
  // full words ("S8" -> season 8), never a prefix.
  words = words.flatMap(word => {
    const parts = word.match(/^([a-z]{1,3})(\d+)$/);
    if (!parts || !ALIASES[parts[1]]) return [word];
    return parts[1].length === 1 ? [...ALIASES[parts[1]].split(" "), parts[2]] : [parts[1], parts[2]];
  });
  const longer = words.filter(word => word.length > 1 || /\d/.test(word) || ALIASES[word]);
  // A lone letter is a prefix search ("w" while typing); next to other words it is ignored.
  words = longer.length || versions.length ? longer : words;
  const meaningful = words.filter(word => !STOPWORDS.has(word));
  return { phrases, terms: [...new Set([...(meaningful.length ? meaningful : words), ...versions])] };
}

// Exact word, then word prefixes, then (only if the word is absent) close misspellings.
function expandTerm(term, index) {
  const matches = [];
  if (index.vocabulary.has(term)) matches.push([term, 1]);
  const numeric = /^\d+$/.test(term);
  // Words of 2+ letters, numbers of 3+ digits ("202" -> 2025, 2026) and versions ("1.11" -> 1.116.1).
  if (numeric ? term.length >= 3 : true) {
    const quality = numeric ? 0.6 : term.length >= 3 ? 0.75 : term.length === 2 ? 0.6 : 0.4;
    for (const word of index.words) {
      if (word !== term && word.startsWith(term) && (!numeric || /^\d+$/.test(word))) matches.push([word, quality]);
    }
  }
  if (!matches.length && !numeric && term.length >= 4 && !term.includes(".")) {
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
    expansions.forEach((options, position) => {
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
      const alias = ALIASES[terms[position]];
      if (alias && doc.text.includes(` ${alias} `)) {
        termScore = Math.max(termScore, doc.title.includes(` ${alias} `) ? 25 : 4);
        if (!words.includes(alias)) words.push(alias);
      }
      if (!termScore) everyTerm = false;
      score += termScore;
    });
    if (!everyTerm) continue;
    for (const phrase of phrases) score += doc.title.includes(` ${phrase} `) ? 30 : 8;
    if (terms.length > 1 && terms.every((_, i) => expansions[i].some(([word]) => doc.fields.title.has(word)))) score *= 1.5;
    // Words typed together ("chapter 10", "season 8") rank notices that say them together first.
    const together = ` ${terms.map(term => ALIASES[term] && !doc.text.includes(` ${term} `) ? ALIASES[term] : term).join(" ")} `;
    if (terms.length > 1 && !together.includes(".") && doc.text.includes(together)) score *= doc.title.includes(together) ? 4 : 3;
    results.push({ doc, score, words: [...words, ...phrases] });
  }
  // Stable: equal scores keep archive (newest-first) order.
  results.sort((a, b) => b.score - a.score || a.doc.order - b.doc.order);
  const seen = new Set();
  return { results: results.filter(result => !seen.has(result.doc.key) && seen.add(result.doc.key)), terms };
}

// Highlighting matches the way search does: on accent-free lowercase text ("ryoshu" marks "Ryōshū"),
// with dots and hyphens allowed between letters ("ego" marks "E.G.O", "rerun" marks "re-run").
function folded(text) {
  let out = "";
  const map = [];
  for (let i = 0; i < text.length; i++) {
    for (const char of text[i].normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()) {
      out += char;
      map.push(i);
    }
  }
  map.push(text.length);
  return { out, map };
}

function matcher(words) {
  const parts = [...new Set(words.filter(Boolean))].sort((a, b) => b.length - a.length).map(word =>
    word.split(" ").map(piece => [...piece].map(char => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[.\\-]?")).join("\\W+"));
  return parts.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${parts.join("|")})`, "gu") : null;
}

// [start, end) ranges of matches in the original text.
function matchRanges(text, words) {
  const pattern = matcher(words);
  if (!pattern) return [];
  const { out, map } = folded(text);
  return [...out.matchAll(pattern)].map(match => {
    const at = match.index + match[1].length;
    return [map[at], map[at + match[2].length]];
  });
}

export function highlight(text, words) {
  text = String(text);
  let html = "";
  let last = 0;
  for (const [start, end] of matchRanges(text, words)) {
    if (start < last) continue;
    html += escapeHtml(text.slice(last, start)) + `<mark>${escapeHtml(text.slice(start, end))}</mark>`;
    last = end;
  }
  return html + escapeHtml(text.slice(last));
}

// Excerpt around the first body match, so it is clear why a result was returned.
export function excerpt(plain, words, length = 220) {
  const text = String(plain).replace(/\s+/g, " ").trim();
  const first = matchRanges(text, words)[0];
  if (!first) return highlight(text.slice(0, length) + (text.length > length ? "…" : ""), words);
  const at = first[0];
  let start = Math.max(0, at - 70);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  const slice = text.slice(start, start + length);
  return (start > 0 ? "…" : "") + highlight(slice, words) + (start + length < text.length ? "…" : "");
}
