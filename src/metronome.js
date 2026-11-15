'use strict';

// 确定性 PRNG，保证无头测试可复现
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const G = 9.81;
const DT = 1 / 480;
const L_MIN = 0.08;
const L_MAX = 0.3;
const TICK_THR = 0.08;      // 摆幅低于该值的过零点视为漏拍（擒纵空程）
const HARD_LIMIT = 0.52;    // 机械限位 (rad)
const SQUEAL_AMP = 0.38;    // 过紧时金属摩擦啸叫的幅值门限
const TARGET_BPM = 90;

class Metronome {
  constructor(opts = {}) {
    this.rnd = mulberry32(opts.seed ?? 42);
    this.params = {
      length: opts.length ?? 0.3,
      tension: opts.tension ?? 0.5,
      damping: opts.damping ?? 0.3,
    };
    this.reset();
  }

  reset() {
    this.t = 0;
    this.theta = 0.3;
    this.omega = 0;
    this.amp = Math.abs(this.theta);
    this.events = [];
    this.tickCount = 0;
    this.missCount = 0;
    this.squealCount = 0;
    this.knockCount = 0;
    this._lastMissAt = -1e9;
    this._peak = 0;
    this._lastZeroTime = null;
    this.eventHistory = [];
    this.lastTickTime = null;
    this.bpm = null;
    this.bpmEma = null;
    this.bpmWindow = [];      // {time, bpm}
    this.stableSince = 0;
    this.succeeded = false;
    this._prevOmega = 0;
  }

  setParams(p) {
    if (p.length != null) {
      this.params.length = Math.min(L_MAX, Math.max(L_MIN, p.length));
    }
    if (p.tension != null) {
      this.params.tension = Math.min(1, Math.max(0, p.tension));
    }
    if (p.damping != null) {
      this.params.damping = Math.min(1, Math.max(0, p.damping));
    }
  }

  // 发条提供的冲量 (rad/s)，高张力端轻微非线性（过上发条）
  _impulse() {
    const t = this.params.tension;
    const overwind = 1 + 1.0 * Math.max(0, (t - 0.85) / 0.15);
    return 0.055 * (0.3 + 0.7 * t) * overwind;
  }

  // 擒纵齿轮噪声标准差 (s)：松发条 / 小阻尼时忽快忽慢明显
  _gearNoiseSigma() {
    const { tension, damping } = this.params;
    return (0.01 * (1 + 1.5 * (1 - tension))) / (1 + 5 * damping);
  }

  // 过零点擒纵：真实机械节拍器在摆经过中心时获得发条冲量
  _escapement(sign) {
    const { tension, damping } = this.params;
    const amp = this._peak;
    this.amp = amp;
    this._peak = 0;

    if (amp < TICK_THR) {
      // 摆幅不足，擒纵机构空程 —— 漏拍，不给冲量
      this.missCount += 1;
      this._lastMissAt = this.t;
      this.events.push({ time: this.t, type: 'miss', amp });
      this.eventHistory.push({ time: this.t, type: 'miss' });
      return;
    }

    // 正常擒纵 tick：沿运动方向补冲量，不改变周期
    this.tickCount += 1;
    const j = this._impulse();
    this.omega += sign * j;
    this.omega += (gauss(this.rnd) * 0.006 * (1 + (1 - tension))) / (1 + 2 * damping);

    // 擒纵齿轮噪声：仅作用于发声时刻与 BPM 测量（无偏），不改物理周期
    const gear = gauss(this.rnd) * this._gearNoiseSigma();
    const heardAt = this.t + gear;
    this.events.push({ time: heardAt, type: 'tick', amp, gear, physTime: this.t });
    this.eventHistory.push({ time: heardAt, type: 'tick' });

    if (this.lastTickTime != null) {
      // 相邻同向过零间隔为一个整周期，即一个拍点间隔
      const interval = heardAt - this.lastTickTime;
      const bpm = 60 / interval;
      this.bpm = bpm;
      if (this.bpmEma == null || this.bpmWindow.length < 5) {
        this.bpmEma = bpm; // 前几个测量点跳过启动暂态
      } else {
        this.bpmEma = this.bpmEma + 0.2 * (bpm - this.bpmEma);
      }
      this.bpmWindow.push({ time: this.t, bpm: this.bpmEma });
      if (this.bpmWindow.length > 400) this.bpmWindow.shift();
    }
    this.lastTickTime = heardAt;

    // 过紧：高张力 + 大摆幅 -> 金属尖响
    if (tension > 0.85 && amp >= SQUEAL_AMP) {
      this.squealCount += 1;
      this.events.push({
        time: this.t,
        type: 'squeal',
        amp,
        intensity: Math.min(
          1,
          (amp - SQUEAL_AMP) / (HARD_LIMIT - SQUEAL_AMP) +
            0.25 * ((tension - 0.85) / 0.15),
        ),
      });
      this.eventHistory.push({ time: this.t, type: 'squeal', intensity: this.events[this.events.length - 1].intensity });
    }
  }

  step() {
    const { length, damping } = this.params;
    const b = 0.02 + 0.12 * damping;
    const w0sq = G / length;

    const prevTheta = this.theta;

    // 半隐式欧拉
    this.omega += -w0sq * Math.sin(this.theta) * DT;
    this.omega *= Math.exp(-b * DT);
    this.theta += this.omega * DT;

    // 机械限位：非弹性碰撞
    if (Math.abs(this.theta) >= HARD_LIMIT) {
      const sign = Math.sign(this.theta);
      this.theta = sign * HARD_LIMIT;
      this.omega = -0.3 * this.omega;
      this.knockCount += 1;
      this.events.push({ time: this.t, type: 'knock', amp: HARD_LIMIT });
      this.eventHistory.push({ time: this.t, type: 'knock' });
    }

    // 包络峰值跟踪
    if (Math.abs(this.theta) > this._peak) this._peak = Math.abs(this.theta);

    // 过零检测（仅上行过零，一拍一次）
    if (prevTheta <= 0 && this.theta > 0) {
      this._escapement(1);
    }
    this.t += DT;
    this._evaluateStability();
  }

  run(seconds) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) this.step();
  }

  flushEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  recentEvents(withinSeconds) {
    const cutoff = this.t - withinSeconds;
    this.eventHistory = this.eventHistory.filter((e) => e.time >= cutoff);
    return this.eventHistory;
  }

  _evaluateStability() {
    const recent = this.bpmWindow.filter((s) => s.time >= this.t - 20);
    // 必须有覆盖整个 20s 窗口的测量数据，且近期无漏拍/尖响/撞限位
    const windowOk =
      this.t >= 20 &&
      recent.length >= 30 &&
      recent[0].time <= this.t - 19.5;
    let ok = false;
    if (windowOk) {
      const mean = recent.reduce((s, x) => s + x.bpm, 0) / recent.length;
      const spread = Math.max(...recent.map((x) => Math.abs(x.bpm - mean)));
      const noMiss = this.t - this._lastMissAt > 20;
      const clean = this.squealCount === 0 && this.knockCount === 0;
      ok =
        noMiss &&
        clean &&
        Math.abs(mean - TARGET_BPM) <= 1 &&
        spread <= 1.5;
      if (!ok) this.stableSince = this.t;
    }
    if (ok && !this.succeeded && this.t - this.stableSince >= 20) this.succeeded = true;
  }

  getStatus() {
    return {
      time: this.t,
      theta: this.theta,
      omega: this.omega,
      amp: this.amp,
      bpm: this.bpmEma,
      tickCount: this.tickCount,
      missCount: this.missCount,
      squealCount: this.squealCount,
      knockCount: this.knockCount,
      stableFor: Math.max(0, this.t - this.stableSince),
      succeeded: this.succeeded,
      params: { ...this.params },
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Metronome, TARGET_BPM, L_MIN, L_MAX, DT, G, mulberry32 };
} else if (typeof globalThis !== 'undefined') {
  globalThis.MET = { Metronome, TARGET_BPM, L_MIN, L_MAX, DT, G, mulberry32 };
}
