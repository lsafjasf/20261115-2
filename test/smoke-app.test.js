// DOM 桩冒烟测试：验证 js/app.js 在“类浏览器”环境下可完成初始化、
// 模板切换、编辑与导出绑定，不依赖真实浏览器。
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const listeners = new Map();
const created = [];

function makeElement(tag = 'div') {
  const el = {
    tagName: tag,
    children: [],
    style: {},
    dataset: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      toggle(c, force) { force ? this._set.add(c) : this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    appendChild(child) { this.children.push(child); return child; },
    append(...kids) { this.children.push(...kids); },
    addEventListener(type, fn) {
      listeners.set(`${this._id}:${type}`, fn);
    },
    getBoundingClientRect() { return { left: 0, width: 1000 }; },
    click() { const fn = listeners.get(`${this._id}:click`); if (fn) fn({ stopPropagation() {}, clientX: 500 }); },
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html || ''; },
    set textContent(v) { this._text = v; },
    get textContent() {
      if (this._text !== undefined) return this._text;
      const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return [strip(this._html || ''), ...this.children.map((c) => c.textContent)].join(' ').trim();
    },
    getContext() {
      return {
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect() {}, fillText() {}, strokeText() {}, measureText: (t) => ({ width: t.length * 20 }),
        beginPath() {}, closePath() {}, moveTo() {}, arcTo() {}, fill() {},
        save() {}, restore() {}, translate() {}, scale() {},
      };
    },
    toBlob(cb) { cb(new Blob(['png-bytes'], { type: 'image/png' })); },
  };
  el._id = `el-${created.length}`;
  created.push(el);
  return el;
}

const staticIds = new Map();
const idList = ['stage', 'play-pause', 'stop', 'scrubber', 'timecode', 'timeline', 'cue-list',
  'add-cue', 'template-switch', 'template-pace', 'text-input', 'font-size', 'font-size-value',
  'box-enabled', 'box-color', 'box-radius', 'box-radius-value', 'stroke-enabled', 'stroke-color',
  'stroke-width', 'stroke-width-value', 'entrance-select', 'cue-start', 'cue-end',
  'export-frame', 'export-json'];
for (const id of idList) staticIds.set(id, makeElement(id));

globalThis.document = {
  getElementById: (id) => staticIds.get(id) || makeElement(id),
  createElement: (tag) => makeElement(tag),
  querySelector: () => makeElement('div'),
  querySelectorAll: () => [],
};
let rafCount = 0;
let wallNow = 1000;
globalThis.requestAnimationFrame = (fn) => {
  rafCount += 1;
  globalThis.__lastFrame = fn;
  if (rafCount <= 3) { wallNow += 16; fn(wallNow); }
};
globalThis.performance = { now: () => wallNow };
globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));
const downloads = [];
globalThis.Blob = class Blob {
  constructor(parts, opts) { this.parts = parts; this.type = opts?.type; }
};
globalThis.URL = {
  createObjectURL: () => 'blob:mock',
  revokeObjectURL() {},
};
// 截获导出下载的 anchor.click
const origCreate = globalThis.document.createElement;
globalThis.document.createElement = (tag) => {
  const el = origCreate(tag);
  if (tag === 'a') {
    el.click = () => downloads.push({ name: el.download, type: el.href });
  }
  return el;
};

await import(pathToFileURL(join(here, '..', 'js', 'app.js')).href);

const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL', msg); process.exit(1); }
  console.log('PASS', msg);
};

assert(rafCount >= 1, 'rAF 帧循环已启动并重绘');
assert(staticIds.get('cue-list').children.length === 3, '左侧渲染出 3 条字幕条目');
assert(staticIds.get('template-switch').children.length === 3, '渲染出 3 个模板切换按钮');
assert(staticIds.get('entrance-select').children.length >= 5, '入场方式下拉已填充');

// 模拟点击“提示卡”模板按钮
const cardBtn = staticIds.get('template-switch').children.find((b) => b.dataset.templateId === 'card');
cardBtn.click();
assert(staticIds.get('template-pace').textContent.includes('缩放'), '切换后模板节奏说明更新');
assert(staticIds.get('text-input').value === '本台消息：城市轨交新线今日开通运营', '切换模板后文本仍在输入框中');

// 模拟修改文字
const inputFn = listeners.get(`${staticIds.get('text-input')._id}:input`);
staticIds.get('text-input').value = '修改后的新闻台词';
inputFn({ target: staticIds.get('text-input') });
const cueListEl = staticIds.get('cue-list');
assert(cueListEl.children.some((li) => li.textContent.includes('修改后的新闻台词')), '文字编辑同步到条目与状态');

// 模拟两个导出
listeners.get(`${staticIds.get('export-json')._id}:click`)();
listeners.get(`${staticIds.get('export-frame')._id}:click`)();
assert(downloads.length === 2, 'JSON 与 PNG 两个导出均触发下载');
assert(downloads.some((d) => d.name.endsWith('.json')), '导出模板 JSON');
assert(downloads.some((d) => d.name.endsWith('.png')), '导出当前帧 PNG');

// 模拟播放按钮
listeners.get(`${staticIds.get('play-pause')._id}:click`)();
wallNow += 16;
globalThis.__lastFrame(wallNow);
assert(staticIds.get('play-pause').textContent.includes('暂停'), '播放按钮切换为暂停态');
console.log('\nDOM 冒烟测试全部通过');
