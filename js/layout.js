// 字幕排版引擎：分词 -> 贪心换行 -> 避头尾/单词完整性/最大行宽
// 纯逻辑模块，宽度由调用方通过 measure 回调注入，便于在 Node 中做单元测试

const CJK_RE = /[　-〿＀-￯㐀-䶿一-鿿豈-﫿]/;
const CJK_PUNC_RE = /[　-〿＀-￯]/;
const SPACE_RE = /\s/;
// 英文单词 / 数字串（内部允许 . , : - _ / + 等连接符）
const WORD_RE = /[A-Za-z0-9][A-Za-z0-9.,:/_+\\%&'@=-]*/y;

export const DEFAULT_NO_START = '、。，！？；：）】」』》〉.,!?;:)]}%';
export const DEFAULT_NO_END = '（【「『《〈([{';

export function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (SPACE_RE.test(ch)) {
      let j = i + 1;
      while (j < text.length && SPACE_RE.test(text[j])) j++;
      tokens.push({ type: 'space', text: text.slice(i, j) });
      i = j;
      continue;
    }
    WORD_RE.lastIndex = i;
    const m = WORD_RE.exec(text);
    if (m) {
      tokens.push({ type: 'word', text: m[0] });
      i = WORD_RE.lastIndex;
      continue;
    }
    const type = CJK_PUNC_RE.test(ch) ? 'cjkPunc'
      : CJK_RE.test(ch) ? 'cjk' : 'other';
    tokens.push({ type, text: ch });
    i++;
  }
  return tokens;
}

function canBreakBefore(tok, prevTok, opts) {
  if (!prevTok || prevTok.type === 'space' || tok.type === 'space') return true;
  if (opts.kinsoku) {
    if (opts.noStart.includes(tok.text)) return false;
    if (opts.noEnd.includes(prevTok.text)) return false;
  }
  if (tok.type === 'word' && prevTok.type === 'word' && opts.wordIntact) {
    return false;
  }
  return true;
}

function lineWidth(line, measure) {
  return line.reduce((sum, tok) => sum + measure(tok.text), 0);
}

function trimSpace(line) {
  while (line.length && line[line.length - 1].type === 'space') line.pop();
  while (line.length && line[0].type === 'space') line.shift();
  return line;
}

// 对单个段落排版，返回 { lines, violations(Set<token>), overflow }
function layoutSegment(text, measure, opts) {
  const tokens = tokenize(text);
  const lines = [];
  const violations = new Set();
  let line = [];
  let cursor = 0;
  let overflow = false;

  const emit = (tokensToEmit) => {
    trimSpace(tokensToEmit);
    lines.push({
      text: tokensToEmit.map((t) => t.text).join(''),
      width: lineWidth(tokensToEmit, measure),
      tokens: tokensToEmit
    });
  };
  const pushLine = () => {
    emit(line);
    line = [];
    cursor = 0;
  };
  const markOverflow = (tok) => {
    overflow = true;
    violations.add(tok);
  };

  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx];
    const w = measure(tok.text);
    if (line.length && cursor + w > opts.maxWidth) {
      const prev = line[line.length - 1];
      if (tok.type === 'word' && opts.wordIntact && w <= opts.maxWidth) {
        // 英文单词保持完整：整词挪到下一行
        pushLine();
      } else if (tok.type === 'word' && !opts.wordIntact) {
        // 允许单词内部断开：逐字符切分
        splitWord(tok, line, measure, opts, emit, (nl) => { line = nl; },
          (c) => { cursor = c; }, markOverflow);
        continue;
      } else if (!canBreakBefore(tok, prev, opts)) {
        // 避头尾：向前回退到最近的允许断点
        let k = line.length - 1;
        while (k > 0 && !canBreakBefore(line[k], line[k - 1], opts)) k--;
        if (k > 0) {
          const moved = line.splice(k);
          pushLine();
          line = moved;
          cursor = lineWidth(line, measure);
          violations.add(tok);
        } else {
          // 整行都无法回退，标点强制换行（行首/行尾违例）
          pushLine();
          violations.add(tok);
        }
      } else {
        pushLine();
      }
    }
    line.push(tok);
    cursor += w;
    if (cursor > opts.maxWidth + 0.01) markOverflow(tok);
  }
  if (line.length) pushLine();
  return { lines, violations, overflow };
}

function splitWord(tok, line, measure, opts, emit, setLine, setCursor, markOverflow) {
  const fill = (target, chars) => {
    let part = '';
    while (chars.length &&
      lineWidth(target, measure) + measure(part + chars[0]) <= opts.maxWidth) {
      part += chars.shift();
    }
    if (!part) {
      part = chars.shift();
      markOverflow({ text: part });
    }
    const piece = { type: 'word', text: part, split: true };
    target.push(piece);
    markOverflow(piece);
  };
  const chars = [...tok.text];
  fill(line, chars);
  emit(line);
  let nl = [];
  while (chars.length) {
    fill(nl, chars);
    if (chars.length) {
      emit(nl);
      nl = [];
    }
  }
  setLine(nl);
  setCursor(lineWidth(nl, measure));
}

export function layoutText(text, measure, opts) {
  // 支持手动换行 \n
  const segments = text.split('\n');
  const allLines = [];
  const allViolations = new Set();
  let overflow = false;
  for (const seg of segments) {
    const r = layoutSegment(seg, measure, opts);
    r.lines.forEach((l) => allLines.push(l));
    r.violations.forEach((v) => allViolations.add(v));
    overflow = overflow || r.overflow;
  }
  return { lines: allLines, violations: allViolations, overflow };
}
