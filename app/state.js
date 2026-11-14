(function () {
// Document state model and assignment rules.

const PANEL_NAMES = ['cover', 'inner', 'back'];
const PANEL_LABELS = { cover: '封面', inner: '内页', back: '背页' };

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function textBlock(type, text) {
  return { id: uid(type), type, text };
}

function imageBlock(src) {
  return { id: uid('img'), type: 'image', src: src || null, h: 180 };
}

// Three user entries -> fixed cover / inner / back assignment.
function createDocument(entries) {
  const list = entries && entries.length ? entries : defaultEntries();
  return {
    version: 1,
    panels: PANEL_NAMES.map((name, i) => ({
      id: uid('panel'),
      name,
      blocks: [
        textBlock('title', list[i].title),
        textBlock('body', list[i].body),
        imageBlock(list[i].image || null),
      ],
    })),
  };
}

function defaultEntries() {
  return [
    {
      title: 'Aurora 智能香薰机',
      body: '超声波雾化与环境光联动，三档雾量配合静音结构，为卧室、书房与瑜伽空间营造稳定而克制的氛围。支持 App 定时与场景模式。',
      image: null,
    },
    {
      title: '核心功能与使用方式',
      body: '长按开机，短按切换雾量；顶部旋钮调节暖色光亮度。水箱容量 300 毫升，单次续航最长 12 小时，缺水自动断电并提示清洁。',
      image: null,
    },
    {
      title: '规格与售后承诺',
      body: '尺寸 120 × 120 × 190 毫米，额定功率 12 瓦，Type-C 供电。整机两年质保，七天无理由退换，全国联保网点覆盖主要城市。',
      image: null,
    },
  ];
}

function findBlock(doc, blockId) {
  for (const panel of doc.panels) {
    const index = panel.blocks.findIndex((b) => b.id === blockId);
    if (index >= 0) return { panel, index, block: panel.blocks[index] };
  }
  return null;
}

function moveBlock(doc, blockId, direction) {
  const hit = findBlock(doc, blockId);
  if (!hit) return doc;
  const blocks = hit.panel.blocks;
  const target = hit.index + direction;
  if (target < 0 || target >= blocks.length) return doc;
  const next = structuredClone(doc);
  const panel = next.panels.find((p) => p.id === hit.panel.id);
  const [item] = panel.blocks.splice(hit.index, 1);
  panel.blocks.splice(target, 0, item);
  return next;
}

// Reassign a whole block (e.g. an image) to another panel.
function reassignBlock(doc, blockId, panelName) {
  const hit = findBlock(doc, blockId);
  if (!hit || hit.panel.name === panelName) return doc;
  const next = structuredClone(doc);
  const from = next.panels.find((p) => p.id === hit.panel.id);
  const to = next.panels.find((p) => p.name === panelName);
  const [item] = from.blocks.splice(hit.index, 1);
  to.blocks.push(item);
  return next;
}

function updateText(doc, blockId, text) {
  const next = structuredClone(doc);
  const hit = findBlock(next, blockId);
  if (hit) hit.block.text = text;
  return next;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PANEL_NAMES, PANEL_LABELS, uid, textBlock, imageBlock,
    createDocument, defaultEntries, findBlock, moveBlock, reassignBlock, updateText,
  };
} else {
  window.state = {
    PANEL_NAMES, PANEL_LABELS, uid, textBlock, imageBlock,
    createDocument, defaultEntries, findBlock, moveBlock, reassignBlock, updateText,
  };
}
})();
