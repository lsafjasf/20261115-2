(function(){
// Greedy first-fit line breaker with CJK kinsoku and overrun detection.
//
// Break opportunities:
//   - between two CJK/CJK or CJK/punct tokens (unless kinsoku forbids it)
//   - at spaces (the space itself is dropped when a break occurs there)
// A latin word token never breaks.

const tokenizerApi =
  typeof require !== "undefined"
    ? require("./tokenizer")
    : window.TypesetterTokenizer;
const { kinsokuClass } = tokenizerApi;

function isBreakableBefore(token, prevToken) {
  if (!prevToken) return false;
  if (token.kind === "space" || prevToken.kind === "space") return true;
  if (token.kind === "punct") {
    // closing punctuation must not begin a line
    if (token.kinsoku === "close" || token.kinsoku === "middle") return false;
  }
  if (prevToken.kind === "punct") {
    // opening punctuation must not end a line
    if (prevToken.kinsoku === "open" || prevToken.kinsoku === "middle") return false;
  }
  return true;
}

function lineWidthOf(tokens, start, end, measurer) {
  let width = 0;
  for (let i = start; i < end; i++) {
    const tk = tokens[i];
    if (tk.kind === "space") width += measurer.measure(tk.text === "　" ? "　" : " ");
    else width += measurer.measure(tk.text);
  }
  return width;
}

// Trim a leading/trailing space token from a candidate line range.
function trimSpaces(tokens, start, end) {
  let s = start;
  let e = end;
  while (s < e && tokens[s].kind === "space") s++;
  while (e > s && tokens[e - 1].kind === "space") e--;
  return [s, e];
}

function breakParagraph(tokens, maxWidthFn, measurer) {
  const lines = [];
  let cursor = 0;
  const diagnostics = [];
  let lineNo = 0;

  while (cursor < tokens.length) {
    let start = cursor;
    let end = start;
    let bestBreak = -1;
    let firstFits = true;

    while (end < tokens.length) {
      const [ts, te] = trimSpaces(tokens, start, end + 1);
      const width = lineWidthOf(tokens, ts, te, measurer);
      const avail = maxWidthFn(lineNo);
      if (width <= avail) {
        end++;
        if (end < tokens.length && isBreakableBefore(tokens[end], tokens[end - 1])) {
          bestBreak = end;
        }
        continue;
      }
      // Overflow. Break at the last legal opportunity.
      if (bestBreak > start) {
        end = bestBreak;
        firstFits = false;
      }
      break;
    }

    if (firstFits && end >= tokens.length) {
      // whole remainder fits
      end = tokens.length;
    } else if (firstFits) {
      // Nothing fit on this line at all: force one unbreakable unit,
      // then report an overrun so the caller can flag the overbox.
      end = Math.max(start + 1, bestBreak > start ? bestBreak : start + 1);
    }

    const [ls, le] = trimSpaces(tokens, start, end);
    const lineTokens = tokens.slice(ls, le);
    const width = lineWidthOf(tokens, ls, le, measurer);
    const avail = maxWidthFn(lineNo);
    if (width > avail + 0.5) {
      diagnostics.push({
        type: "overrun",
        line: lineNo,
        width: Math.round(width),
        available: Math.round(avail),
        by: Math.round(width - avail),
      });
    }
    lines.push({ tokens: lineTokens, width: Math.round(width), available: Math.round(avail) });
    cursor = end;
    lineNo++;
  }

  // Post-pass kinsoku verification (defense in depth).
  lines.forEach((line, idx) => {
    const first = line.tokens[0];
    const last = line.tokens[line.tokens.length - 1];
    if (first && first.kind === "punct" && (first.kinsoku === "close" || first.kinsoku === "middle")) {
      diagnostics.push({ type: "kinsoku-line-start", line: idx, char: first.text });
    }
    if (last && last.kind === "punct" && (last.kinsoku === "open" || last.kinsoku === "middle")) {
      diagnostics.push({ type: "kinsoku-line-end", line: idx, char: last.text });
    }
  });

  return { lines, diagnostics };
}

const api = { breakParagraph, isBreakableBefore, lineWidthOf, trimSpaces, kinsokuClass };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.TypesetterLinebreaker = api;

})();
