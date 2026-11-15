import { createKick, createSnare, createHihat, createClap } from "./voices.js";

const VOICE_IDS = ["kick", "snare", "hihat", "clap"];
const PEAK_LIMIT = 0.98;

export class DrumEngine {
  constructor() {
    this.ctx = null;
    this.nodes = new Map();
    this.edges = [];
    this.bypassed = new Map([["filter", false], ["delay", false]]);
    this.playing = false;
    this.currentStep = -1;
    this.bpm = 112;
    this.pattern = defaultPattern();
    this.onStep = null;
    this.onMessage = null;
    this.onMute = null;
    this.muted = false;
    this._timer = null;
    this._nextStepTime = 0;
    this._stepIndex = 0;
    this._recorder = null;
    this.nodes = new Map([
      ["kick", { id: "kick", kind: "voice", label: "底鼓" }],
      ["snare", { id: "snare", kind: "voice", label: "军鼓" }],
      ["hihat", { id: "hihat", kind: "voice", label: "踩镲" }],
      ["clap", { id: "clap", kind: "voice", label: "拍手" }],
      ["filter", { id: "filter", kind: "fx", label: "滤波" }],
      ["delay", { id: "delay", kind: "fx", label: "延迟" }],
      ["bus", { id: "bus", kind: "bus", label: "总线增益" }],
    ]);
    this.swallowed = [];
    this.edges = defaultEdges().map(([src, dst]) => ({ src, dst }));
    this._refreshReachability();
  }

  async init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this._buildGraph(ctx);
    this._startPeakGuard(ctx);
    this._refreshReachability();
  }

  _buildGraph(ctx) {
    // 总线：master -> analyser/录制 -> destination
    const master = ctx.createGain();
    master.gain.value = 0.8;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    this.analyser = analyser;
    this.master = master;

    // 滤波节点：湿路经低通，干路直通；旁路 = 湿 0、干 1
    const fIn = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    const fWet = ctx.createGain();
    const fDry = ctx.createGain();
    const fOut = ctx.createGain();
    fIn.connect(filter).connect(fWet).connect(fOut);
    fIn.connect(fDry).connect(fOut);
    fWet.gain.value = 1;
    fDry.gain.value = 0;

    // 延迟节点：干路直通 + 湿路带回授；旁路 = 湿 0、干 1
    const dIn = ctx.createGain();
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.19;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const dWet = ctx.createGain();
    dWet.gain.value = 0.5;
    const dDry = ctx.createGain();
    dDry.gain.value = 1;
    const dOut = ctx.createGain();
    dIn.connect(dDry).connect(dOut);
    dIn.connect(delay).connect(dWet).connect(dOut);
    delay.connect(feedback).connect(delay);

    const voiceGains = {};
    for (const id of VOICE_IDS) voiceGains[id] = ctx.createGain();
    const voices = {
      kick: createKick(ctx, voiceGains.kick),
      snare: createSnare(ctx, voiceGains.snare),
      hihat: createHihat(ctx, voiceGains.hihat),
      clap: createClap(ctx, voiceGains.clap),
    };

    const registry = {
      kick: { id: "kick", kind: "voice", label: "底鼓", input: null, output: voiceGains.kick, gain: voiceGains.kick },
      snare: { id: "snare", kind: "voice", label: "军鼓", input: null, output: voiceGains.snare, gain: voiceGains.snare },
      hihat: { id: "hihat", kind: "voice", label: "踩镲", input: null, output: voiceGains.hihat, gain: voiceGains.hihat },
      clap: { id: "clap", kind: "voice", label: "拍手", input: null, output: voiceGains.clap, gain: voiceGains.clap },
      filter: { id: "filter", kind: "fx", label: "滤波", input: fIn, output: fOut, wet: fWet, dry: fDry, filter },
      delay: { id: "delay", kind: "fx", label: "延迟", input: dIn, output: dOut, wet: dWet, dry: dDry, delay, feedback },
      bus: { id: "bus", kind: "bus", label: "总线增益", input: master, output: null, gain: master },
    };
    for (const [id, node] of Object.entries(registry)) this.nodes.set(id, node);
    this.voices = voices;

    for (const edge of this.edges) {
      const src = this.nodes.get(edge.src);
      const dst = this.nodes.get(edge.dst);
      src.output.connect(dst.input);
    }
    for (const [id, on] of this.bypassed) {
      const n = this.nodes.get(id);
      if (n && n.wet) {
        n.wet.gain.value = on ? 0 : 1;
        n.dry.gain.value = on ? 1 : 0;
      }
    }
  }

  _wire(srcId, dstId) {
    const src = this.nodes.get(srcId);
    const dst = this.nodes.get(dstId);
    src.output.connect(dst.input);
    this.edges.push({ src: srcId, dst: dstId });
  }

  // ---- 连线管理与校验 ----
  canConnect(srcId, dstId) {
    const src = this.nodes.get(srcId);
    const dst = this.nodes.get(dstId);
    if (!src || !dst) return { ok: false, reason: "节点不存在" };
    if (srcId === dstId) return { ok: false, reason: "节点不能连到自身" };
    if (dst.kind === "voice") return { ok: false, reason: `${dst.label}是声源，没有输入端口` };
    if (src.kind === "bus") return { ok: false, reason: "总线是终点，没有输出端口" };
    if (this.edges.some((e) => e.src === srcId && e.dst === dstId)) {
      return { ok: false, reason: "该连线已存在" };
    }
    const cycle = this._wouldCycle(srcId, dstId);
    if (cycle && !cycle.includes("delay")) {
      return { ok: false, reason: `连接会形成无延迟反馈环：${cycle.join(" → ")}` };
    }
    return { ok: true, warning: cycle ? `提示：经延迟节点的反馈环（${cycle.join(" → ")}），由反馈增益限幅` : null };
  }

  addEdge(srcId, dstId) {
    const check = this.canConnect(srcId, dstId);
    if (!check.ok) return check;
    this._wire(srcId, dstId);
    this._refreshReachability();
    return { ok: true, warning: check.warning, swallowed: this.swallowed };
  }

  removeEdge(srcId, dstId) {
    const idx = this.edges.findIndex((e) => e.src === srcId && e.dst === dstId);
    if (idx < 0) return { ok: false, reason: "连线不存在" };
    const [edge] = this.edges.splice(idx, 1);
    const src = this.nodes.get(edge.src);
    const dst = this.nodes.get(edge.dst);
    src.output.disconnect(dst.input);
    this._refreshReachability();
    return { ok: true, swallowed: this.swallowed };
  }

  resetGraph() {
    const current = this.edges.map((e) => ({ ...e }));
    for (const e of current) {
      const src = this.nodes.get(e.src);
      const dst = this.nodes.get(e.dst);
      if (src && dst && src.output && dst.input) src.output.disconnect(dst.input);
    }
    this.edges = [];
    if (this.ctx) {
      this.edges = defaultEdges().map(([src, dst]) => ({ src, dst }));
      for (const edge of this.edges) {
        const src = this.nodes.get(edge.src);
        const dst = this.nodes.get(edge.dst);
        src.output.connect(dst.input);
      }
    }
    this._refreshReachability();
  }

  edgeAt(x, y, ports) {
    // 命中距点击位置 6px 内的连线
    for (let i = this.edges.length - 1; i >= 0; i--) {
      const e = this.edges[i];
      const a = ports.out[e.src];
      const b = ports.in[e.dst];
      if (a && b && distToSegment(x, y, a.x, a.y, b.x, b.y) <= 6) return e;
    }
    return null;
  }

  _wouldCycle(srcId, dstId) {
    const adj = new Map();
    for (const e of [...this.edges, { src: srcId, dst: dstId }]) {
      if (!adj.has(e.src)) adj.set(e.src, []);
      adj.get(e.src).push(e.dst);
    }
    const stack = [dstId];
    const seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (id === srcId) {
        // 重建环路径
        return this._cyclePath(srcId, dstId, adj);
      }
      if (seen.has(id)) continue;
      seen.add(id);
      for (const n of adj.get(id) || []) stack.push(n);
    }
    return null;
  }

  _cyclePath(srcId, dstId, adj) {
    const prev = new Map([[dstId, srcId]]);
    const q = [dstId];
    while (q.length) {
      const id = q.shift();
      if (id === srcId) break;
      for (const n of adj.get(id) || []) {
        if (!prev.has(n)) {
          prev.set(n, id);
          q.push(n);
        }
      }
    }
    const path = [srcId];
    let cur = dstId;
    const back = [cur];
    while (cur !== srcId && prev.has(cur)) {
      cur = prev.get(cur);
      back.push(cur);
    }
    back.reverse();
    return [...path, ...back.slice(1)];
  }

  _refreshReachability() {
    // 从每个节点沿边出发，无法到达 bus 的声源 = 被吞掉的节拍
    const adj = new Map();
    for (const e of this.edges) {
      if (!adj.has(e.src)) adj.set(e.src, []);
      adj.get(e.src).push(e.dst);
    }
    const reachesBus = (start) => {
      const stack = [start];
      const seen = new Set();
      while (stack.length) {
        const id = stack.pop();
        if (id === "bus") return true;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const n of adj.get(id) || []) stack.push(n);
      }
      return false;
    };
    this.swallowed = VOICE_IDS.filter((id) => !reachesBus(id));
  }

  // ---- 旁路与参数 ----
  setBypass(id, on) {
    const node = this.nodes.get(id);
    this.bypassed.set(id, on);
    if (!this.ctx || !node || !node.wet) return;
    const t = this.ctx.currentTime;
    node.wet.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
    node.dry.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
  }

  isBypassed(id) {
    return !!this.bypassed.get(id);
  }

  setParam(id, key, value) {
    const node = this.nodes.get(id);
    if (!node || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (key === "gain" && node.gain) {
      node.gain.gain.setTargetAtTime(value, t, 0.01);
    } else if (key === "filterFreq" && node.filter) {
      node.filter.frequency.setTargetAtTime(value, t, 0.01);
    } else if (key === "delayTime" && node.delay) {
      node.delay.delayTime.setTargetAtTime(value, t, 0.01);
    } else if (key === "feedback" && node.feedback) {
      node.feedback.gain.setTargetAtTime(Math.min(value, 0.95), t, 0.01);
    }
  }

  triggerVoice(id, time = this.ctx.currentTime, velocity = 1) {
    const voice = this.voices[id];
    if (voice) voice.trigger(time, velocity);
  }

  toggleStep(id, step) {
    this.pattern[id][step] = !this.pattern[id][step];
  }

  // ---- 十六步循环调度 ----
  async play() {
    await this.init();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.playing) return;
    this._refreshReachability();
    this.playing = true;
    this._stepIndex = 0;
    this._nextStepTime = this.ctx.currentTime + 0.08;
    this._timer = setInterval(() => this._schedulerTick(), 25);
  }

  stop() {
    this.playing = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.currentStep = -1;
    if (this.onStep) this.onStep(-1);
  }

  _schedulerTick() {
    const secondsPerStep = 60 / this.bpm / 4;
    while (this._nextStepTime < this.ctx.currentTime + 0.12) {
      const step = this._stepIndex;
      const time = this._nextStepTime;
      for (const id of VOICE_IDS) {
        if (this.pattern[id][step]) this.voices[id].trigger(time, 1);
      }
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      setTimeout(() => {
        this.currentStep = step;
        if (this.onStep) this.onStep(step);
      }, delayMs);
      this._stepIndex = (this._stepIndex + 1) % 16;
      this._nextStepTime += secondsPerStep;
    }
  }

  // ---- 峰值保护：Analyser 监测，越线即静音 ----
  _startPeakGuard(ctx) {
    const buf = new Float32Array(this.analyser.fftSize);
    this.peakLevel = 0;
    this._overSince = null;
    const poll = () => {
      this.analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        if (v > peak) peak = v;
      }
      this.peakLevel = peak;
      if (peak > PEAK_LIMIT) {
        if (this._overSince == null) this._overSince = performance.now();
        if (!this.muted && performance.now() - this._overSince >= 0) {
          this._tripMute(peak);
        }
      } else {
        this._overSince = null;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  _tripMute(peak) {
    this.muted = true;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.005);
    this.tripPeak = peak;
    if (this.onMute) this.onMute(peak);
  }

  resetMute() {
    this.muted = false;
    this._overSince = null;
    this.master.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.01);
  }

  // ---- 录制主输出，便于无头验证导出 WAV ----
  startRecording(maxSeconds = 8) {
    const ctx = this.ctx;
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    const chunks = [];
    processor.onaudioprocess = (e) => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    this.master.connect(processor);
    processor.connect(ctx.destination);
    this._recorder = { processor, chunks, maxSeconds, start: ctx.currentTime };
  }

  stopRecording() {
    const rec = this._recorder;
    if (!rec) return null;
    this.master.disconnect(rec.processor);
    rec.processor.disconnect();
    rec.processor.onaudioprocess = null;
    this._recorder = null;
    const total = rec.chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const c of rec.chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    return { samples: merged, sampleRate: this.ctx.sampleRate };
  }
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

export function defaultPattern() {
  const p = {};
  for (const id of VOICE_IDS) p[id] = new Array(16).fill(false);
  p.kick[0] = p.kick[4] = p.kick[8] = p.kick[12] = true;
  p.snare[4] = p.snare[12] = true;
  p.clap[12] = true;
  for (let i = 0; i < 16; i += 2) p.hihat[i] = true;
  return p;
}

export function defaultEdges() {
  return [
    ["kick", "filter"],
    ["snare", "filter"],
    ["clap", "filter"],
    ["hihat", "delay"],
    ["filter", "bus"],
    ["delay", "bus"],
  ];
}

export { VOICE_IDS, PEAK_LIMIT };
