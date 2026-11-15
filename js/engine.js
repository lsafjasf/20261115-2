// 空间音频引擎：左右声像 + 前后低通 + 距离衰减/风噪遮蔽 + 水面反射延迟
import { buildWorld, relativeGeometry, windMaskDb, reflectionPath, WORLD } from './world.js';
import { makeReedBuffer, makeShoalBuffer, makeDockBuffer, makeWindBuffer } from './synth.js';

const BUILDERS = {
  reed: makeReedBuffer,
  shoal: makeShoalBuffer,
  dock: makeDockBuffer,
};

const BEHIND_CUTOFF = 480; // 后方声源被岸坡遮挡，低通截止频率（中高频几乎全失）
const REFLECTION_CUTOFF = 900;
const REFLECTION_DELAY_BASE = 0.018;

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

export class LakeAudioEngine {
  constructor(ctx, world = buildWorld()) {
    this.ctx = ctx;
    this.world = world;
    this.nodes = [];
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // 多声源叠加时防止削波
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.master.connect(this.limiter).connect(ctx.destination);
    this._buildWind();
    this._buildSources();
  }

  _buildWind() {
    const windBuf = makeWindBuffer(this.ctx, this.world.seed);
    const src = this.ctx.createBufferSource();
    src.buffer = windBuf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.08;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    src.connect(lp).connect(gain).connect(this.master);
    src.start(0);
    this.nodes.push(src);
  }

  _buildSources() {
    for (const source of this.world.sources) {
      const buffer = BUILDERS[source.id](this.ctx, source.seed);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const panner = this.ctx.createStereoPanner();
      const frontBack = this.ctx.createBiquadFilter();
      frontBack.type = 'lowpass';
      frontBack.frequency.value = 20000;
      const directGain = this.ctx.createGain();
      src.connect(panner).connect(frontBack).connect(directGain).connect(this.master);

      // 反射通路：延迟 + 低通 + 衰减
      const delay = this.ctx.createDelay(1);
      delay.delayTime.value = REFLECTION_DELAY_BASE;
      const reflFilter = this.ctx.createBiquadFilter();
      reflFilter.type = 'lowpass';
      reflFilter.frequency.value = REFLECTION_CUTOFF;
      const reflGain = this.ctx.createGain();
      frontBack.connect(delay).connect(reflFilter).connect(reflGain).connect(this.master);

      const entry = { source, src, panner, frontBack, directGain, delay, reflGain, started: false };
      this.nodes.push(src);
      this.sourceNodes = this.sourceNodes || [];
      this.sourceNodes.push(entry);
      this.updateSource(entry, this.world.listener);
    }
  }

  updateSource(entry, listener) {
    const geo = relativeGeometry(entry.source, listener);
    const refl = reflectionPath(entry.source, listener);
    const now = this.ctx.currentTime;

    // 声像：用方位角映射到 -1..1
    const pan = Math.max(-1, Math.min(1, Math.sin(geo.azimuth)));
    entry.panner.pan.setTargetAtTime(pan, now, 0.08);

    // 前后：后方声源整体低通，失去高频细节
    entry.frontBack.frequency.setTargetAtTime(geo.behind ? BEHIND_CUTOFF : 20000, now, 0.08);

    // 距离衰减 + 风的遮蔽（120m 处约 -18dB，仍可闻）
    const distanceGain = dbToGain(-6 * Math.pow(geo.distance / 26, 1.25));
    const maskGain = dbToGain(windMaskDb(geo.distance));
    const direct = Math.max(0.0001, distanceGain * maskGain);
    entry.directGain.gain.setTargetAtTime(direct, now, 0.1);

    entry.delay.delayTime.setTargetAtTime(REFLECTION_DELAY_BASE + refl.delay, now, 0.1);
    entry.reflGain.gain.setTargetAtTime(direct * refl.strength, now, 0.1);
  }

  setListenerX(x) {
    const clamped = Math.max(WORLD.listenerMinX, Math.min(WORLD.listenerMaxX, x));
    this.world.listener.x = clamped;
    for (const entry of this.sourceNodes) this.updateSource(entry, this.world.listener);
    return clamped;
  }

  // 按发生顺序逐个激活声源（模拟“事件发生”）
  startEvents() {
    const t0 = this.ctx.currentTime + 0.15;
    for (const entry of this.sourceNodes) {
      if (!entry.started) {
        entry.src.start(t0 + entry.source.onset);
        entry.started = true;
      }
    }
    this.eventsStartAt = t0;
  }

  async stop() {
    try {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      for (const node of this.nodes) {
        try { node.stop(this.ctx.currentTime + 0.15); } catch { /* 已停止 */ }
      }
    } finally {
      if (this.ctx.state !== 'closed') await this.ctx.close();
    }
  }
}

// 离线渲染：仅返回 PCM，供无头盲听探针使用，不暴露任何声源位置信息
export async function renderOffline(seed, listenerX, durationSeconds, sampleRate = 32000) {
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineCtx(2, Math.ceil(durationSeconds * sampleRate), sampleRate);
  const world = buildWorld(seed);
  world.listener.x = listenerX;
  const engine = new LakeAudioEngine(ctx, world);
  // 离线上下文 currentTime 恒为 0，事件在绝对时间点排程
  for (const entry of engine.sourceNodes) {
    entry.src.start(entry.source.onset);
    entry.started = true;
  }
  const rendered = await ctx.startRendering();
  return {
    sampleRate: rendered.sampleRate,
    length: rendered.length,
    left: rendered.getChannelData(0).slice(),
    right: rendered.getChannelData(1).slice(),
  };
}
