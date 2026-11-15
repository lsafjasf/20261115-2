// Web Audio 节拍器：lookahead 调度，提供播放时的节奏脉冲

export class BeatEngine {
  constructor(onBeat) {
    this.onBeat = onBeat;
    this.ctx = null;
    this.bpm = 120;
    this.playing = false;
    this.timer = null;
    this.nextBeatTime = 0;
    this.beatIndex = 0;
  }

  async ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  async start() {
    await this.ensureContext();
    if (this.playing) return;
    this.playing = true;
    this.beatIndex = 0;
    this.nextBeatTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.scheduler(), 25);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setBpm(bpm) {
    this.bpm = bpm;
  }

  scheduler() {
    const scheduleAhead = 0.12;
    while (this.nextBeatTime < this.ctx.currentTime + scheduleAhead) {
      const index = this.beatIndex;
      const when = this.nextBeatTime;
      this.tick(when, index % 4 === 0);
      const delay = (when - this.ctx.currentTime) * 1000;
      window.setTimeout(() => this.onBeat?.(index), Math.max(0, delay));
      this.nextBeatTime += 60 / this.bpm;
      this.beatIndex++;
    }
  }

  tick(when, accented) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = accented ? 'triangle' : 'square';
    osc.frequency.value = accented ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accented ? 0.22 : 0.12, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + 0.1);
  }
}
