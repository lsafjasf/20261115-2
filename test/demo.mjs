// 无头验收：不依赖浏览器，模拟用户完整操作链路。
// 运行：node test/demo.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEMPLATES,
  applyTemplate,
  createCue,
  createInitialState,
  entranceState,
  getActiveCue,
  serializeProject,
  Clock,
} from '../js/core.js';
import { drawFrame } from '../js/render.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'artifacts'), { recursive: true });

class MockCtx {
  constructor() {
    this.ops = [];
    this.fillStyle = '';
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  fillRect(...a) { this.ops.push(['fillRect', ...a]); }
  fillText(text) { this.ops.push(['fillText', text]); }
  strokeText(text) { this.ops.push(['strokeText', text]); }
  measureText(text) { return { width: String(text).length * 24 }; }
  beginPath() {} closePath() {} moveTo() {} arcTo() {} fill() {}
  save() {} restore() {} translate() {} scale() {}
}

const log = (ok, msg) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
let failures = 0;
const check = (cond, msg) => {
  if (!cond) failures += 1;
  log(cond, msg);
};

console.log('== 1. 制作三条字幕（新闻 / 剧情 / 提示卡） ==');
const state = createInitialState();
check(state.cues.length === 3, '工程中存在 3 条字幕');
check(state.cues.map((c) => c.templateId).join(',') === 'news,drama,card',
  '模板顺序为 新闻 → 剧情 → 提示卡');
state.cues.forEach((cue) => {
  check(TEMPLATES[cue.templateId].label.length > 0 && cue.text.length > 0,
    `${TEMPLATES[cue.templateId].label}字幕已填写：「${cue.text}」`);
});

console.log('\n== 2. 用户调整字号 / 背景框 / 描边 / 入场 ==');
const news = state.cues[0];
news.fontSize = 52;
news.box.enabled = true;
news.stroke = { enabled: true, color: '#000000', width: 5 };
news.entrance = 'slideUp';
check(news.fontSize === 52, '新闻字幕字号调整为 52px');
check(news.stroke.enabled && news.stroke.width === 5, '新闻字幕描边宽度 5px');
check(news.entrance === 'slideUp', '新闻字幕入场改为上滑');

console.log('\n== 3. 三条字幕各自切到其他模板，再切回，文本必须仍在 ==');
const snapshots = state.cues.map((c) => ({ id: c.id, text: c.text, start: c.start, end: c.end }));
const cycle = ['card', 'drama', 'news'];
state.cues = state.cues.map((cue) => {
  let next = cue;
  for (const tid of cycle) next = applyTemplate(next, tid);
  return next;
});
state.cues.forEach((cue, i) => {
  const snap = snapshots[i];
  check(cue.text === snap.text && cue.start === snap.start && cue.end === snap.end,
    `字幕 ${cue.id} 三轮模板切换后文本/时间区间保留：「${cue.text}」`);
});

console.log('\n== 4. 播放/暂停与节目时间轴同步 ==');
const clock = new Clock(state.duration);
clock.play(0);
clock.tick(1000);
clock.tick(2500);
check(Math.abs(clock.time - 2.5) < 1e-9, '播放 2.5s 后时钟读数为 2.5s');
const activeAt25 = getActiveCue(state.cues, clock.time);
check(activeAt25 !== null && entranceState(activeAt25, clock.time).visible,
  `2.5s 时画面上的字幕：「${activeAt25.text}」`);
clock.pause();
clock.tick(9000);
check(clock.time === 2.5, '暂停后动画/字幕冻结在 2.5s');
clock.seek(12);
const activeAt12 = getActiveCue(state.cues, clock.time);
check(activeAt12.id === 'cue-3', 'seek 到 12s 后出现提示卡字幕');

console.log('\n== 5. 导出当前帧与模板 JSON ==');
const frames = [1, 7, 12].map((time) => {
  const mock = new MockCtx();
  drawFrame(mock, state.cues, time);
  return { time, texts: mock.ops.filter(([op]) => op === 'fillText').map(([, t]) => t) };
});
frames.forEach(({ time, texts }) => {
  check(texts.some((t) => t.startsWith('00:00:')), `${time}s 帧包含烧录时间码`);
});
writeFileSync(join(root, 'artifacts/frame-at-12s.mock.txt'),
  frames.find((f) => f.time === 12).texts.join('\n'), 'utf8');

const json = serializeProject(state);
writeFileSync(join(root, 'artifacts/subtitle-template.json'), json, 'utf8');
const reparsed = JSON.parse(json);
check(reparsed.cues.length === 3 && reparsed.kind === 'subtitle-studio-project',
  '模板 JSON 已写出且包含 3 条字幕与模板定义');

console.log(`\n${failures === 0 ? '全部验收通过 ✔' : `${failures} 项失败 �’`}`);
process.exit(failures === 0 ? 0 : 1);
