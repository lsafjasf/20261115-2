(function(){
// Mixed CJK/Latin tokenizer with kinsoku (line-start / line-end prohibition) metadata.
//
// Token kinds:
//   cjk   - one CJK ideograph or kana (break allowed on either side, subject to kinsoku)
//   word  - a run of latin letters/digits, unbreakable
//   space - collapsible whitespace
//   punct - punctuation carrying kinsoku class: open | close | middle

const CJK_RE = /[⺀-⻿㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/;

// Line-closing punctuation: must not start a line (JIS kinshi).
const LINE_CLOSE = new Set(
  "、。，．・：；！？）】》〉｝」』〙〛”’%‰℃…—·,.!?;:)]}’”".split("")
);
// Line-opening punctuation: must not end a line.
const LINE_OPEN = new Set("（【《〈｛「『〘〚“‘([{‘“".split(""));
// Middle dots / dashes: prefer not at either boundary.
const LINE_MIDDLE = new Set(["…", "—", "–", "·", "・"]);

const LATIN_RE = /[A-Za-z0-9_’'’\-]/;
const SPACE_RE = /\s/;

function kinsokuClass(ch) {
  if (LINE_CLOSE.has(ch)) return "close";
  if (LINE_OPEN.has(ch)) return "open";
  if (LINE_MIDDLE.has(ch)) return "middle";
  return null;
}

function isCjk(ch) {
  return CJK_RE.test(ch);
}

function normalize(text) {
  return text.replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/ /g, " ");
}

// Tokenize a single paragraph (no newline inside).
function tokenizeParagraph(text) {
  const src = normalize(text);
  const tokens = [];
  let i = 0;
  let id = 0;
  while (i < src.length) {
    const ch = src[i];
    if (SPACE_RE.test(ch)) {
      while (i < src.length && SPACE_RE.test(src[i])) i++;
      tokens.push({ id: id++, kind: "space", text: " " });
      continue;
    }
    if (ch === "　") {
      tokens.push({ id: id++, kind: "space", text: "　" });
      i++;
      continue;
    }
    const kc = kinsokuClass(ch);
    if (kc) {
      tokens.push({ id: id++, kind: "punct", text: ch, kinsoku: kc });
      i++;
      continue;
    }
    if (isCjk(ch)) {
      tokens.push({ id: id++, kind: "cjk", text: ch });
      i++;
      continue;
    }
    if (LATIN_RE.test(ch)) {
      let j = i + 1;
      while (j < src.length && LATIN_RE.test(src[j])) j++;
      tokens.push({ id: id++, kind: "word", text: src.slice(i, j) });
      i = j;
      continue;
    }
    tokens.push({ id: id++, kind: "cjk", text: ch });
    i++;
  }
  return tokens;
}

function splitParagraphs(text) {
  return normalize(text)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const api = { tokenizeParagraph, splitParagraphs, kinsokuClass, isCjk, LINE_CLOSE, LINE_OPEN, LINE_MIDDLE };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.TypesetterTokenizer = api;

})();
