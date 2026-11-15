/* live.js — 实时播放引擎：与离线渲染共用 buildGraph，暂停即 suspend */
(function (global) {
  'use strict';
  const { DURATION } = global.Scape;

  class LiveEngine {
    constructor(sample, events) {
      this.sample = sample;
      this.events = events;
      this.ctx = null;
      this.graph = null;
      this.analyser = null;
      this.startVirtual = 0;
      this.startCtxTime = 0;
      this.playing = false;
      this.suspended = false;
      this.loop = true;
      this._timer = null;
    }

    _ensureContext() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
      }
    }

    // 从虚拟时间 pos 开始构建与离线完全相同的图（所有源 offset 由 pos 决定）
    async _build(pos) {
      this._teardownGraph();
      // buildGraph 对实时/离线上下文使用完全一致的节点与自动化逻辑
      this.graph = await global.Render.buildGraph(this.ctx, this.sample, this.events,
        { start: pos, end: DURATION, margin: 0 });
      // buildGraph 内部已将 shaper 接到 destination；改为经 analyser 输出
      try { this.graph.master.disconnect(); } catch (e) { /* noop */ }
      this.graph.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    _teardownGraph() {
      if (this.graph && this.graph.master) {
        try { this.graph.master.disconnect(); } catch (e) { /* noop */ }
      }
      this.graph = null;
    }

    async play(pos) {
      this._ensureContext();
      if (this.ctx.state === 'closed') {
        this.ctx = null; this._ensureContext();
      }
      if (this.suspended) {
        await this.ctx.resume();
        this.suspended = false;
        this.playing = true;
        return;
      }
      const startAt = pos == null ? this.getVirtualTime() : pos;
      const at = Math.min(Math.max(0, startAt), DURATION - 0.001);
      await this._build(at);
      this.startVirtual = at;
      this.startCtxTime = this.ctx.currentTime + 0.06;
      await this.ctx.resume();
      this.playing = true;
      this._armLoop();
    }

    async pause() {
      if (!this.playing || this.suspended) return this.getVirtualTime();
      this._clearTimer();
      await this.ctx.suspend();
      this.suspended = true;
      this.playing = false;
      return this.getVirtualTime();
    }

    async stop() {
      this._clearTimer();
      if (this.ctx) await this.ctx.suspend().catch(() => {});
      this._teardownGraph();
      this.playing = false;
      this.suspended = false;
      this.startVirtual = 0;
      this.startCtxTime = 0;
    }

    async seek(pos) {
      const wasPlaying = this.playing;
      this._clearTimer();
      if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend().catch(() => {});
      this._teardownGraph();
      this.playing = false;
      this.suspended = false;
      this.startVirtual = Math.min(Math.max(0, pos), DURATION);
      this.startCtxTime = 0;
      if (wasPlaying) await this.play(this.startVirtual);
    }

    getVirtualTime() {
      if (!this.ctx) return 0;
      if (this.suspended || !this.playing) return this.startVirtual;
      const t = this.startVirtual + (this.ctx.currentTime - this.startCtxTime);
      return Math.min(t, DURATION);
    }

    getLevels() {
      if (!this.analyser) return null;
      const arr = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteTimeDomainData(arr);
      return arr;
    }

    _armLoop() {
      this._clearTimer();
      if (!this.loop) return;
      this._timer = setInterval(() => {
        if (this.playing && this.getVirtualTime() >= DURATION - 0.02) {
          this._clearTimer();
          this._teardownGraph();
          this.suspended = false;
          this.play(0);
        }
      }, 30);
    }

    _clearTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
  }

  global.LiveEngine = LiveEngine;
})(window);
