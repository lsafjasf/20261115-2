// 纯逻辑核心：模板定义、状态模型、时间轴/动画数学、序列化。
// 不依赖 DOM，方便在 Node 下用 node --test 验证。

export const ENTRANCES = {
  none: { id: 'none', label: '无入场', duration: 0 },
  cut: { id: 'cut', label: '硬切', duration: 0.12 },
  slideUp: { id: 'slideUp', label: '上滑', duration: 0.45 },
  fadeIn: { id: 'fadeIn', label: '淡入', duration: 0.5 },
  zoomIn: { id: 'zoomIn', label: '缩放', duration: 0.4 },
  typewriter: { id: 'typewriter', label: '打字机', duration: 0.9 },
};

// 三种“节奏”不同的模板：新闻快而硬、剧情慢而柔、提示卡强调弹跳。
export const TEMPLATES = {
  news: {
    id: 'news',
    label: '新闻',
    pace: '快节奏 · 硬切 · 底部信息条',
    fontSize: 40,
    box: { enabled: true, fill: 'rgba(198, 40, 40, 0.92)', padding: 18, radius: 2 },
    stroke: { enabled: false, color: '#000000', width: 0 },
    textColor: '#ffffff',
    entrance: 'cut',
    accent: '#ffd54f',
    position: 'bottom',
  },
  drama: {
    id: 'drama',
    label: '剧情',
    pace: '慢节奏 · 淡入 · 底部居中',
    fontSize: 46,
    box: { enabled: false, fill: 'rgba(0, 0, 0, 0.55)', padding: 16, radius: 10 },
    stroke: { enabled: true, color: '#000000', width: 4 },
    textColor: '#ffffff',
    entrance: 'fadeIn',
    accent: '#ffffff',
    position: 'bottom',
  },
  card: {
    id: 'card',
    label: '提示卡',
    pace: '强调节奏 · 缩放弹入 · 屏幕中央',
    fontSize: 56,
    box: { enabled: true, fill: 'rgba(21, 101, 192, 0.88)', padding: 28, radius: 18 },
    stroke: { enabled: true, color: '#ffffff', width: 3 },
    textColor: '#ffffff',
    entrance: 'zoomIn',
    accent: '#90caf9',
    position: 'center',
  },
};

export const DEFAULT_CUES = [
  { id: 'cue-1', start: 0.5, end: 4.5, text: '本台消息：城市轨交新线今日开通运营', templateId: 'news',
    fontSize: 40, box: clone(TEMPLATES.news.box), stroke: clone(TEMPLATES.news.stroke),
    textColor: TEMPLATES.news.textColor, entrance: 'cut' },
  { id: 'cue-2', start: 5.0, end: 10.0, text: '那一夜，雨下得很安静', templateId: 'drama',
    fontSize: 46, box: clone(TEMPLATES.drama.box), stroke: clone(TEMPLATES.drama.stroke),
    textColor: TEMPLATES.drama.textColor, entrance: 'fadeIn' },
  { id: 'cue-3', start: 10.5, end: 14.5, text: '提示：末班车 23:30 发车', templateId: 'card',
    fontSize: 56, box: clone(TEMPLATES.card.box), stroke: clone(TEMPLATES.card.stroke),
    textColor: TEMPLATES.card.textColor, entrance: 'zoomIn' },
];

export const TIMELINE_DURATION = 15; // 节目时长（秒）

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let cueSeq = 100;
export function createCue(partial = {}) {
  const template = TEMPLATES[partial.templateId] || TEMPLATES.news;
  return {
    id: partial.id || `cue-${++cueSeq}-${Date.now().toString(36)}`,
    start: partial.start ?? 0,
    end: partial.end ?? 3,
    text: partial.text ?? '',
    templateId: template.id,
    fontSize: partial.fontSize ?? template.fontSize,
    box: partial.box ? clone(partial.box) : clone(template.box),
    stroke: partial.stroke ? clone(partial.stroke) : clone(template.stroke),
    textColor: partial.textColor ?? template.textColor,
    entrance: partial.entrance ?? template.entrance,
  };
}

export function createInitialState() {
  return {
    cues: DEFAULT_CUES.map((cue) => createCue({ ...cue, id: cue.id })),
    selectedCueId: DEFAULT_CUES[0].id,
    time: 0,
    playing: false,
    duration: TIMELINE_DURATION,
  };
}

// 关键需求：切换模板只替换外观（字号/背景框/描边/入场/文字颜色/位置），
// 文本与时间区间原样保留。
export function applyTemplate(cue, templateId) {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error(`未知模板: ${templateId}`);
  return {
    ...cue,
    templateId,
    fontSize: template.fontSize,
    box: clone(template.box),
    stroke: clone(template.stroke),
    textColor: template.textColor,
    entrance: template.entrance,
  };
}

export function getActiveCue(cues, time) {
  return cues.find((cue) => time >= cue.start && time <= cue.end) || null;
}

// 虚拟节目时钟：播放时由真实墙钟增量驱动，暂停即冻结；
// seek 直接跳时，动画状态完全由当前时间推导，因此与时间轴严格同步。
export class Clock {
  constructor(duration = TIMELINE_DURATION) {
    this.duration = duration;
    this.time = 0;
    this.playing = false;
    this._lastWall = null;
  }

  play(now = performance.now()) {
    if (this.playing) return;
    if (this.time >= this.duration) this.time = 0;
    this.playing = true;
    this._lastWall = now;
  }

  pause() {
    this.playing = false;
    this._lastWall = null;
  }

  seek(time) {
    this.time = Math.min(this.duration, Math.max(0, time));
  }

  tick(now = performance.now()) {
    if (!this.playing) return this.time;
    const delta = (now - this._lastWall) / 1000;
    this._lastWall = now;
    this.time += delta;
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.pause();
    }
    return this.time;
  }
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// 返回 cue 在给定时间的入场进度（0..1）以及是否处于可见区间。
export function entranceState(cue, time) {
  if (time < cue.start || time > cue.end) return { visible: false, progress: 0 };
  const spec = ENTRANCES[cue.entrance] || ENTRANCES.none;
  const elapsed = time - cue.start;
  const raw = spec.duration === 0 ? 1 : clamp01(elapsed / spec.duration);
  return { visible: true, progress: raw, elapsed };
}

// 由入场进度推导渲染变换（透明度/位移/缩放/打字机字符数）。
export function entranceTransform(cue, state) {
  const p = state.progress;
  const eased = cue.entrance === 'zoomIn' ? easeOutBack(clamp01(p * 1.15)) : easeOutCubic(p);
  const transform = { opacity: 1, translateY: 0, scale: 1, chars: null };
  switch (cue.entrance) {
    case 'cut':
      transform.opacity = p >= 1 ? 1 : 0;
      break;
    case 'fadeIn':
      transform.opacity = p;
      break;
    case 'slideUp':
      transform.opacity = p;
      transform.translateY = (1 - eased) * 48;
      break;
    case 'zoomIn':
      transform.opacity = clamp01(p * 1.6);
      transform.scale = 0.6 + 0.4 * eased;
      break;
    case 'typewriter':
      transform.chars = Math.round(p * cue.text.length);
      break;
    default:
      break;
  }
  return transform;
}

// 模板 JSON：既包含每条字幕的完整设置，也包含模板定义，可完整还原工程。
export function serializeProject(state) {
  return JSON.stringify({
    version: 1,
    kind: 'subtitle-studio-project',
    exportedAt: new Date().toISOString(),
    duration: state.duration,
    templates: TEMPLATES,
    cues: state.cues,
  }, null, 2);
}

export function parseProject(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.kind !== 'subtitle-studio-project' || !Array.isArray(data.cues)) {
    throw new Error('不是有效的字幕工程 JSON');
  }
  return {
    duration: data.duration || TIMELINE_DURATION,
    cues: data.cues.map((cue) => createCue(cue)),
  };
}
