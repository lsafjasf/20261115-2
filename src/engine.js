import {
  MASTER_WIDTH, ORDERS, NOMINAL_TRIM, WASTE_TARGET_PERCENT,
  MAX_SPEED, TENSION_BREAK_MIN, WIDTH_TOLERANCE, DEFAULT_KNIVES,
} from './config.js';

// 纯逻辑仿真层：不依赖 DOM，可在 Node 与浏览器中直接运行
export class SlitterSim {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.status = 'idle'; // idle | running | complete | broken
    this.knives = [...DEFAULT_KNIVES];
    this.speed = 0; // m/min
    this.tension = 55;
    this.timeScale = 1;
    this.simTime = 0; // 累计仿真秒
    this.offset = 0; // 当前纸幅横向偏移 mm
    this.produced = ORDERS.map(() => 0); // 各收卷轴已收长度 m
    this.offspecMeters = 0; // 刀距不合格而报废的米数
    this.defectMeters = 0; // 偏移超差造成的边缘报废（折合全幅米数）
    this.processed = 0; // 已走纸总米数
    this.events = [];
    this.breakAt = null;
    this._log('系统就绪，请先对刀再开机');
  }

  _log(message, level = 'info') {
    this.events.push({ t: this.simTime, message, level });
    if (this.events.length > 200) this.events.shift();
  }

  // 刀位只允许停机时调整
  setKnife(index, position) {
    if (this.status === 'running') {
      throw new Error('运行中禁止移动分切刀');
    }
    const pos = Math.round(Number(position));
    if (!Number.isFinite(pos) || pos < 0 || pos > MASTER_WIDTH) return;
    const current = this.knives[index];
    // 以当前刀位为定位键原地替换，避免排序后输入框索引与刀位错位
    const at = this.knives.indexOf(current);
    this.knives[at] = pos;
    this.knives.sort((a, b) => a - b);
  }

  // 按 K1..K5 顺序直接设置整组刀位（数值输入框使用）
  setKnives(positions) {
    if (this.status === 'running') {
      throw new Error('运行中禁止移动分切刀');
    }
    const next = positions
      .map((p) => Math.round(Number(p)))
      .filter((p) => Number.isFinite(p) && p >= 0 && p <= MASTER_WIDTH);
    if (next.length !== this.knives.length) return;
    this.knives = next.sort((a, b) => a - b);
  }

  setSpeed(v) {
    this.speed = Math.max(0, Math.min(MAX_SPEED, Number(v) || 0));
  }

  setTension(v) {
    this.tension = Math.max(0, Math.min(100, Number(v) || 0));
  }

  start() {
    if (this.status === 'complete' || this.status === 'broken') return false;
    if (this.status === 'idle') {
      this.status = 'running';
      this._log('主电机启动，分切机开始运行');
    }
    return true;
  }

  stop(reason = '手动停机') {
    if (this.status !== 'running') return;
    this.status = 'idle';
    this.speed = 0;
    this._log(reason);
  }

  // 5 把刀之间形成 4 条订单带
  get stripWidths() {
    return this.knives.slice(1).map((x, i) => x - this.knives[i]);
  }

  get trimWidths() {
    return { left: this.knives[0], right: MASTER_WIDTH - this.knives[4] };
  }

  // 每条订单带是否在公差内
  get stripQualities() {
    return this.stripWidths.map((w, i) =>
      Math.abs(w - ORDERS[i].width) <= WIDTH_TOLERANCE);
  }

  get allKnivesAligned() {
    // 对刀合格：四条订单带宽全部在公差内（废边余量由偏移/废边率约束）
    return this.stripQualities.every(Boolean);
  }

  // 废边率：废边面积 / 母卷总面积
  get wastePercent() {
    if (this.processed === 0) return 0;
    const trimArea = (this.trimWidths.left + this.trimWidths.right) * this.processed;
    const wasteArea = trimArea +
      this.offspecMeters * MASTER_WIDTH +
      this.defectMeters * MASTER_WIDTH;
    return 100 * wasteArea / (MASTER_WIDTH * this.processed);
  }

  get wasteTargetMet() {
    return this.wastePercent <= WASTE_TARGET_PERCENT;
  }

  get allOrdersExact() {
    return ORDERS.every((o, i) => this.produced[i] === o.target);
  }

  get succeeded() {
    return this.status === 'complete' && this.allOrdersExact &&
      this.allKnivesAligned && this.wasteTargetMet;
  }
  get succeeded() {
    return this.status === 'complete' && this.allOrdersExact &&
      this.allKnivesAligned && this.wasteTargetMet;
  }

  // 推进 dt 秒（真实时间，内部乘以 timeScale）
  tick(dt) {
    if (this.status !== 'running') return;
    const sdt = dt * this.timeScale;
    this.simTime += sdt;
    if (this.speed <= 0) return;

    // —— 纸幅横向偏移：张力越低、卷速越高，抖动越大 ——
    const tensionFactor = (60 - this.tension) / 60; // 张力 60 时为 0
    const speedFactor = this.speed / MAX_SPEED;
    const sigma = 2.2 + Math.max(0, tensionFactor) * 26 + speedFactor * 7;
    const noise = (this.rng() * 2 - 1) * sigma * 0.55;
    const restoring = -0.35 * this.offset;
    const lowTensionWander = Math.max(0, tensionFactor) * 18 *
      Math.sin(this.simTime * 1.7);
    this.offset += (restoring + lowTensionWander + noise) * sdt;
    this.offset = Math.max(-60, Math.min(60, this.offset));

    // —— 高张力断纸判定 ——
    if (this.tension >= TENSION_BREAK_MIN) {
      const excess = this.tension - TENSION_BREAK_MIN;
      const span = 100 - TENSION_BREAK_MIN;
      const hazardPerSec = 0.35 * (excess / span) ** 2;
      if (this.rng() < hazardPerSec * sdt) {
        this.status = 'broken';
        this.breakAt = this.simTime;
        this.speed = 0;
        this._log(`断纸！张力 ${this.tension} 超过安全极限，设备急停`, 'danger');
        return;
      }
    }

    const meters = this.speed / 60 * sdt; // 本步走纸米数
    this.processed += meters;

    // —— 偏移超过废边余量 → 边缘缺陷报废 ——
    const minTrim = Math.min(this.trimWidths.left, this.trimWidths.right);
    if (Math.abs(this.offset) > minTrim) {
      this.defectMeters += meters;
    }

    // —— 各收卷轴：刀距不合格计入废品，合格且未达量才计入订单 ——
    const qualities = this.stripQualities;
    qualities.forEach((ok, i) => {
      if (!ok) {
        this.offspecMeters += meters;
        return;
      }
      const remaining = ORDERS[i].target - this.produced[i];
      if (remaining > 0) {
        this.produced[i] += Math.min(remaining, meters);
      }
    });

    if (this.allOrdersExact) {
      this.status = 'complete';
      this.speed = 0;
      const wasteText = this.wastePercent.toFixed(2);
      if (this.wasteTargetMet && this.allKnivesAligned) {
        this._log(`四种订单全部精确完成，废边率 ${wasteText}%，分切成功`, 'success');
      } else {
        this._log(`订单完成但废边率 ${wasteText}% 或刀距不合格，未达标`, 'warn');
      }
    }
  }

  // 一键自动对刀（标准布局），方便 UI 按钮与测试复用
  autoAlignKnives() {
    if (this.status === 'running') return false;
    let x = NOMINAL_TRIM;
    this.knives = [x];
    for (const o of ORDERS) {
      x += o.width;
      this.knives.push(x);
    }
    this._log('已按订单宽度自动对刀');
    return true;
  }
}
