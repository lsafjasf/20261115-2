import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutText, tokenize, DEFAULT_NO_START, DEFAULT_NO_END } from '../js/layout.js';
import { RAW_CUES, buildCues, formatVttTime, TOTAL_DURATION } from '../js/cues.js';

// 模拟等宽测量：全角字符 16，半角 8，空格 4
function makeMeasure() {
  return (text) => [...text].reduce((sum, ch) => {
    if (/\s/.test(ch)) return sum + 4;
    return sum + (/[^\x00-\xff]/.test(ch) ? 16 : 8);
  }, 0);
}

const baseOpts = (over = {}) => ({
  maxWidth: 160,
  wordIntact: true,
  kinsoku: true,
  noStart: DEFAULT_NO_START,
  noEnd: DEFAULT_NO_END,
  ...over
});

test('tokenizer 区分中文、英文单词、数字串与标点', () => {
  const toks = tokenize('iPhone 16 Pro，售价 7999 元');
  assert.deepEqual(toks.map((t) => t.type),
    ['word', 'space', 'word', 'space', 'word', 'cjkPunc', 'cjk', 'cjk',
      'space', 'word', 'space', 'cjk']);
});

test('避头尾：行首不出现闭合标点、行尾不出现开括号', () => {
  const r = layoutText('增长百分之二十三（海外市场贡献超过六成）谢谢观看',
    makeMeasure(), baseOpts({ maxWidth: 80 }));
  for (const line of r.lines) {
    assert.ok(!DEFAULT_NO_START.includes(line.text[0]), `行首违例: ${line.text}`);
    assert.ok(!DEFAULT_NO_END.includes(line.text[line.text.length - 1]),
      `行尾违例: ${line.text}`);
  }
});

test('英文完整性开启时单词整体换行，不会被截断', () => {
  const r = layoutText('aaa bbb synchronization ccc', makeMeasure(),
    baseOpts({ maxWidth: 64 }));
  for (const line of r.lines) {
    const words = line.text.split(/\s+/).filter(Boolean);
    for (const w of words) assert.ok(['aaa', 'bbb', 'synchronization', 'ccc'].includes(w));
  }
});

test('英文完整性关闭时允许单词内部断行并标记溢出', () => {
  const r = layoutText('x synchronization', makeMeasure(),
    baseOpts({ maxWidth: 40, wordIntact: false }));
  assert.ok(r.overflow);
  const joined = r.lines.map((l) => l.text).join('');
  assert.ok(joined.includes('synchronization'));
});

test('超长单词在完整性开启时整体保留并标红', () => {
  const r = layoutText('internationalization', makeMeasure(),
    baseOpts({ maxWidth: 40 }));
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].text, 'internationalization');
  assert.ok(r.overflow);
});

test('最大行宽：普通行不超过限制，强制超限才标记 overflow', () => {
  const r = layoutText('中英 mixed 数字 12345 排版测试 abc', makeMeasure(),
    baseOpts({ maxWidth: 96 }));
  for (const line of r.lines) {
    if (line.width > 96) assert.ok(r.overflow);
  }
});

test('关闭避头尾后允许标点出现在行首', () => {
  // 112 单位 = 7 个全角字，行满后“（”自然落到下一行行首
  const on = layoutText('一二三四五六七（测试）', makeMeasure(),
    baseOpts({ maxWidth: 112, kinsoku: true }));
  const off = layoutText('一二三四五六七（测试）', makeMeasure(),
    baseOpts({ maxWidth: 112, kinsoku: false }));
  assert.ok(on.lines.every((l) => !DEFAULT_NO_START.includes(l.text[0])));
  assert.ok(off.lines.some((l) => l.text.startsWith('（')));
});

test('十条字幕全部可排版且文字无丢失', () => {
  const measure = makeMeasure();
  const cues = buildCues();
  assert.equal(cues.length, 10);
  for (const cue of cues) {
    const r = layoutText(cue.text, measure, baseOpts({ maxWidth: 200 }));
    const joined = r.lines.map((l) => l.text).join('').replace(/\s+/g, '');
    assert.equal(joined, cue.text.replace(/\s+/g, ''));
    assert.ok(r.lines.length >= 1);
  }
});

test('VTT 时间格式与总时长', () => {
  assert.equal(formatVttTime(0), '00:00:00.000');
  assert.equal(formatVttTime(65.25), '00:01:05.250');
  assert.equal(formatVttTime(3661.5), '01:01:01.500');
  assert.ok(TOTAL_DURATION > 40 && TOTAL_DURATION < 60);
  assert.equal(RAW_CUES.length, 10);
});
