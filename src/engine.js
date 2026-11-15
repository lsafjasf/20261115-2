// 药片灌装线仿真引擎：纯逻辑、可确定性回放（seed + 固定步长），不依赖 DOM。
export const SIZES = { SMALL: 'small', LARGE: 'large' };
const OTHER = { small: 'large', large: 'small' };

export const CONFIG = {
  PILLS_PER_BOTTLE: 5,
  BUFFER_CAPACITY: 8,
  TARGET_BOTTLES: 12,
  MAX_WASTE_BOTTLES: 2,
  BATCH_SIZES: [3, 3, 3, 3],
  BATCH_ORDER: [SIZES.SMALL, SIZES.LARGE, SIZES.SMALL, SIZES.LARGE],
  RELEASE_INTERVAL_MS: 300,
  BASE_ERROR_RATE: 0.05,
  ERROR_RATE_PER_FREQ: 0.04,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor(opts = {}) {
    this.config = { ...CONFIG, ...(opts.config || {}) };
    this.rng = mulberry32(opts.seed ?? (Date.now() & 0xffffffff));
    this.reset();
  }

  reset() {
    const c = this.config;
    this.time = 0;
    this.frequency = 2;
    this.hoppers = {
      small: { paused: false, acc: 0, spawned: 0, misfeed: 0 },
      large: { paused: false, acc: 0, spawned: 0, misfeed: 0 },
    };
    this.buffer = [];
    this.releaseAcc = 0;
    this.divert = false;
    this.batchIndex = 0;
    this.bottlesInBatch = 0;
    this.batchCleared = c.BATCH_ORDER.map((_, i) => i === 0);
    this.bottleLog = [];
    this.activeBottle = this._newBottle();
    this.goodBottles = 0;
    this.wasteBottles = 0;
    this.divertedPills = 0;
    this.clearedPills = 0;
    this.clearActions = 0;
    this.mixedBatchContaminations = 0;
    this.status = 'running';
    this.lossReason = null;
    this.events = [];
  }

  get requiredSize() {
    return this.config.BATCH_ORDER[this.batchIndex];
  }

  get previousSize() {
    return this.batchIndex > 0 ? this.config.BATCH_ORDER[this.batchIndex - 1] : null;
  }

  _newBottle() {
    return { id: this.bottleLog.length + 1, pills: [], bad: false, reason: null };
  }

  _emit(type, detail = {}) {
    this.events.push({ type, time: this.time, ...detail });
  }

  setPaused(size, paused) {
    if (this.hoppers[size]) this.hoppers[size].paused = paused;
  }

  setFrequency(freq) {
    this.frequency = Math.max(1, Math.min(5, Number(freq) || 1));
  }

  setDivert(on) {
    this.divert = !!on;
  }

  clearBuffer() {
    const n = this.buffer.length;
    this.buffer = [];
    this.clearedPills += n;
    this.clearActions += 1;
    this.batchCleared[this.batchIndex] = true;
    this._emit('clear', { count: n });
  }

  rejectBottle() {
    const b = this.activeBottle;
    if (!b || !b.bad || this.status !== 'running') return false;
    this.bottleLog.push({ id: b.id, good: false, reason: b.reason, batch: this.batchIndex });
    this.wasteBottles += 1;
    this.activeBottle = this._newBottle();
    this._emit('bottle-reject', { id: b.id, reason: b.reason });
    if (this.wasteBottles > this.config.MAX_WASTE_BOTTLES) {
      this.status = 'lost';
      this.lossReason = 'waste_bottle_limit';
      this._emit('lose', { reason: this.lossReason });
    }
    return true;
  }

  _spawn(hopperSize) {
    const c = this.config;
    if (this.buffer.length >= c.BUFFER_CAPACITY) return;
    const errorRate = c.BASE_ERROR_RATE + (this.frequency - 1) * c.ERROR_RATE_PER_FREQ;
    const size = this.rng() < errorRate ? OTHER[hopperSize] : hopperSize;
    if (size !== hopperSize) this.hoppers[hopperSize].misfeed += 1;
    this.hoppers[hopperSize].spawned += 1;
    this.buffer.push({ size, bornAt: this.time });
    this._emit('spawn', { size });
  }

  _release() {
    const c = this.config;
    if (!this.activeBottle) this.activeBottle = this._newBottle();
    const bottle = this.activeBottle;
    if (bottle.pills.length >= c.PILLS_PER_BOTTLE) return;
    const pill = this.buffer.shift();
    if (this.divert) {
      this.divertedPills += 1;
      this._emit('divert', { size: pill.size });
      return;
    }
    bottle.pills.push(pill);
    if (pill.size !== this.requiredSize) {
      bottle.bad = true;
      if (!this.batchCleared[this.batchIndex] && pill.size === this.previousSize) {
        bottle.reason = 'mixed_batch';
        this.mixedBatchContaminations += 1;
        this._emit('contaminate', { kind: 'mixed_batch', size: pill.size });
      } else {
        bottle.reason = bottle.reason || 'wrong_pill';
        this._emit('contaminate', { kind: 'wrong_pill', size: pill.size });
      }
    }
    this._emit('fill', { size: pill.size, count: bottle.pills.length });
    if (bottle.pills.length >= c.PILLS_PER_BOTTLE) {
      if (bottle.bad) {
        this._emit('bottle-bad-full', { id: bottle.id, reason: bottle.reason });
      } else {
        this._acceptBottle();
      }
    }
  }

  _acceptBottle() {
    const c = this.config;
    const b = this.activeBottle;
    this.bottleLog.push({ id: b.id, good: true, batch: this.batchIndex });
    this.goodBottles += 1;
    this.bottlesInBatch += 1;
    this._emit('bottle-good', { id: b.id, total: this.goodBottles });
    if (this.goodBottles >= c.TARGET_BOTTLES) {
      this.status = 'won';
      this.activeBottle = null;
      this._emit('win', { good: this.goodBottles, waste: this.wasteBottles });
      return;
    }
    if (this.bottlesInBatch >= c.BATCH_SIZES[this.batchIndex]) {
      this.batchIndex += 1;
      this.bottlesInBatch = 0;
      this.batchCleared[this.batchIndex] = false;
      this._emit('batch-change', {
        batch: this.batchIndex,
        required: this.requiredSize,
      });
    }
    this.activeBottle = this._newBottle();
  }

  update(dtMs) {
    if (this.status !== 'running') return;
    const c = this.config;
    const dt = Math.max(0, dtMs);
    this.time += dt;
    // 先释放缓存队首，再让料斗进料：保证队首药片至少存在一个步长，
    // 玩家（或自动操作）有机会在它进瓶前看到尺寸并决定是否剔除。
    this.releaseAcc += dt;
    while (this.releaseAcc >= c.RELEASE_INTERVAL_MS) {
      this.releaseAcc -= c.RELEASE_INTERVAL_MS;
      if (this.buffer.length > 0) this._release();
      if (this.status !== 'running') break;
    }
    if (this.status !== 'running') return;
    const interval = 1000 / this.frequency;
    for (const size of [SIZES.SMALL, SIZES.LARGE]) {
      const h = this.hoppers[size];
      if (h.paused) {
        h.acc = 0;
        continue;
      }
      h.acc += dt;
      while (h.acc >= interval) {
        h.acc -= interval;
        if (this.buffer.length < c.BUFFER_CAPACITY) this._spawn(size);
      }
    }
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
