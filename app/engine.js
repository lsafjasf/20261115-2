/* 单一时间基准：播放、暂停、拖动播放头全部读写同一个 Clock 实例，
 * 画面渲染、音频调度与界面读数均取自 Clock.currentTime()。 */
(function () {
  "use strict";

  class Clock {
    constructor(durationSec) {
      this.durationSec = durationSec;
      this._timeSec = 0;
      this._playing = false;
      this._originPerf = 0;
      this._originTime = 0;
      this._listeners = [];
    }

    onChange(fn) {
      this._listeners.push(fn);
    }

    _emit() {
      for (const fn of this._listeners) fn(this);
    }

    currentTime() {
      if (!this._playing) return this._timeSec;
      const elapsed = (performance.now() - this._originPerf) / 1000;
      let t = this._originTime + elapsed;
      if (t >= this.durationSec) {
        t = this.durationSec;
      }
      return t;
    }

    get playing() {
      return this._playing;
    }

    play() {
      if (this._playing) return;
      if (this._timeSec >= this.durationSec) this._timeSec = 0;
      this._originPerf = performance.now();
      this._originTime = this._timeSec;
      this._playing = true;
      this._emit();
    }

    pause() {
      if (!this._playing) return;
      this._timeSec = this.currentTime();
      this._playing = false;
      this._emit();
    }

    toggle() {
      this._playing ? this.pause() : this.play();
    }

    seek(timeSec) {
      const clamped = Math.min(this.durationSec, Math.max(0, timeSec));
      this._timeSec = clamped;
      if (this._playing) {
        this._originPerf = performance.now();
        this._originTime = clamped;
      }
      this._emit();
    }
  }

  /* 简单合成器：用短促正弦“滴”声表示节拍，时刻由同一 Clock 推导，
   * 这样音频与画面不会出现各自独立的计时来源。 */
  class BeatAudio {
    constructor(clock, beatTimesSec, getOffsetSec) {
      this.clock = clock;
      this.beatTimesSec = beatTimesSec;
      this.getOffsetSec = getOffsetSec;
      this.ctx = null;
      this._fired = new Set();
      this._timer = null;
      clock.onChange(() => this._handleTransport());
    }

    _ensureContext() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    }

    _beatOnTimeline(rawBeatSec) {
      return rawBeatSec + this.getOffsetSec();
    }

    _handleTransport() {
      this._fired.clear();
      if (this.clock.playing) {
        this._ensureContext();
        this._startPolling();
      } else {
        this._stopPolling();
      }
    }

    _startPolling() {
      this._stopPolling();
      this._timer = setInterval(() => this._poll(), 25);
      this._poll();
    }

    _stopPolling() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }

    _poll() {
      if (!this.clock.playing) return;
      const now = this.clock.currentTime();
      const lookahead = now + 0.08;
      this.beatTimesSec.forEach((raw, index) => {
        const timeline = this._beatOnTimeline(raw);
        if (timeline < 0 || timeline > this.clock.durationSec) return;
        if (!this._fired.has(index) && timeline <= lookahead) {
          this._fired.add(index);
          const delay = Math.max(0, timeline - now);
          this._scheduleTone(delay);
        }
      });
      if (now >= this.clock.durationSec) {
        this.clock.pause();
      }
    }

    _scheduleTone(delaySec) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delaySec);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delaySec + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delaySec + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delaySec);
      osc.stop(ctx.currentTime + delaySec + 0.14);
    }
  }

  window.SyncEngine = { Clock, BeatAudio };
})();
