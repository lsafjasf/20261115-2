/*
 * 贴标机调机模拟 —— 纯逻辑引擎（不依赖 DOM，可在 Node 中测试）
 * 浏览器中通过全局 LabelingCore 访问；Node 中通过 require 访问。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LabelingCore = factory();
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const TARGET = 12;

  // 初始参数（并非理想值，需要玩家调整）
  const DEFAULT_PARAMS = { spin: 60, glue: 40, angle: 0 };
  // 固定后的理想设备参数
  const IDEAL_PARAMS = { spin: 80, glue: 50, angle: 0 };

  const LIMITS = {
    spin: { min: 20, max: 140, step: 1, unit: 'rpm', label: '瓶体转速' },
    glue: { min: 0, max: 100, step: 1, unit: '%', label: '胶水量' },
    angle: { min: -15, max: 15, step: 0.5, unit: '°', label: '压轮角度' }
  };

  // 合格区间
  const TOLERANCE = {
    spinCenter: 80,
    spin: 12,        // |spin-80| <= 12 合格
    glueLow: 30,     // 30 <= glue <= 70 合格
    glueHigh: 70,
    angle: 5,        // |angle| <= 5 合格
    bubble: 0.8      // 气泡评分阈值
  };

  // 工位在输送方向上的归一化位置 (0~1)
  const STATION_X = {
    GLUE: 0.18,    // 上胶辊
    WRAP: 0.42,    // 标签缠绕（在此快照设备参数）
    PRESS: 0.62,   // 压轮
    INSPECT: 0.82, // 检查线
    EXIT: 1.03
  };

  const BELT_SPEED = 1 / 11;   // 每秒前进的归一化距离
  const SPAWN_INTERVAL = 2.0;  // 秒

  const DEFECT_TEXT = {
    edgeLift: '翘边',
    stringing: '拉丝',
    twist: '标签扭转',
    offset: '标签偏移',
    bubbles: '气泡'
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /*
   * 根据一组设备参数判定标签质量，返回缺陷列表与供渲染使用的量化指标。
   * 完全确定性：相同参数必然得到相同结果。
   */
  function judgeLabel(p) {
    const spinError = p.spin - TOLERANCE.spinCenter;
    const spinAbs = Math.abs(spinError);
    const angleAbs = Math.abs(p.angle);

    const defects = [];
    if (p.glue < TOLERANCE.glueLow) defects.push('edgeLift');
    if (p.glue > TOLERANCE.glueHigh) defects.push('stringing');
    if (spinAbs > TOLERANCE.spin) defects.push('twist');
    if (angleAbs > TOLERANCE.angle) defects.push('offset');

    // 气泡由转速失配与压轮角度共同决定（ trapped air ）
    const bubbleScore = Math.max(
      0.8 * Math.min(spinAbs / TOLERANCE.spin, 1),
      0.8 * Math.min(angleAbs / TOLERANCE.angle, 1)
    );
    if (bubbleScore >= TOLERANCE.bubble) defects.push('bubbles');

    const metrics = {
      spin: p.spin,
      glue: p.glue,
      angle: p.angle,
      spinError: spinError,
      twistDeg: spinError * 1.6,
      offsetUnits: p.angle * 1.4,
      bubbleScore: bubbleScore,
      bubbleCount: Math.round(bubbleScore * 6),
      lift: p.glue < TOLERANCE.glueLow
        ? (TOLERANCE.glueLow - p.glue) / TOLERANCE.glueLow : 0,
      strings: p.glue > TOLERANCE.glueHigh
        ? (p.glue - TOLERANCE.glueHigh) / (100 - TOLERANCE.glueHigh) : 0
    };

    return {
      pass: defects.length === 0,
      defects: defects,
      metrics: metrics
    };
  }

  class LabelingEngine {
    constructor(params) {
      this.reset(params);
    }

    reset(params) {
      const base = params || DEFAULT_PARAMS;
      this.params = {
        spin: clamp(base.spin, LIMITS.spin.min, LIMITS.spin.max),
        glue: clamp(base.glue, LIMITS.glue.min, LIMITS.glue.max),
        angle: clamp(base.angle, LIMITS.angle.min, LIMITS.angle.max)
      };
      this.bottles = [];
      this.events = [];
      this.time = 0;
      this.spawnTimer = 0;
      this.nextId = 1;
      this.paused = false;
      this.finished = false;
      this.passCount = 0;
      this.failCount = 0;
      this.judged = 0;
      this.lastResult = null;
      this.history = [];
    }

    setParam(key, value) {
      if (!LIMITS[key]) return;
      const limit = LIMITS[key];
      const step = limit.step;
      let next = clamp(value, limit.min, limit.max);
      next = Math.round(next / step) * step;
      if (key === 'angle') next = Math.round(next * 10) / 10;
      this.params[key] = next;
    }

    setPaused(value) {
      if (this.finished) return;
      this.paused = Boolean(value);
      this.events.push({ type: this.paused ? 'paused' : 'resumed', time: this.time });
    }

    _drainEvents() {
      const out = this.events;
      this.events = [];
      return out;
    }

    // dt 为秒；暂停或已完成时不推进任何状态
    step(dt) {
      if (this.paused || this.finished || dt <= 0) return this._drainEvents();
      const before = this.time;
      this.time += dt;

      // 生成新瓶（未凑满 12 瓶合格前持续供瓶）
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.bottles.push({
          id: this.nextId++,
          x: -0.04,
          rot: 0,
          wrapped: false,
          judged: false,
          result: null,
          snapshot: null,
          wrapTime: 0
        });
        this.spawnTimer = SPAWN_INTERVAL;
      }

      const belt = BELT_SPEED * dt;
      for (const bottle of this.bottles) {
        bottle.x += belt;
        bottle.rot += (this.params.spin / 60) * Math.PI * 2 * dt;

        // 标签缠绕工位：快照当前设备参数，决定这瓶标签的命运
        if (!bottle.wrapped && bottle.x >= STATION_X.WRAP) {
          bottle.wrapped = true;
          bottle.wrapTime = this.time;
          bottle.snapshot = Object.assign({}, this.params);
          bottle.result = judgeLabel(bottle.snapshot);
        }

        // 检查线：判定是否落在允许区域
        if (bottle.wrapped && !bottle.judged && bottle.x >= STATION_X.INSPECT) {
          bottle.judged = true;
          this.judged += 1;
          if (bottle.result.pass) {
            this.passCount += 1;
          } else {
            this.failCount += 1;
          }
          this.lastResult = {
            id: bottle.id,
            pass: bottle.result.pass,
            defects: bottle.result.defects.slice(),
            metrics: bottle.result.metrics,
            time: this.time
          };
          this.history.push(this.lastResult);
          if (this.history.length > 12) this.history.shift();
          this.events.push({
            type: 'judged',
            bottleId: bottle.id,
            pass: bottle.result.pass,
            defects: bottle.result.defects.slice()
          });
        }
      }

      // 移出已离场的瓶子
      this.bottles = this.bottles.filter((b) => b.x < STATION_X.EXIT);

      if (this.passCount >= TARGET) {
        this.finished = true;
        this.paused = false;
        this.events.push({ type: 'finished', time: this.time });
      }
      return this._drainEvents();
    }

    getState() {
      return {
        time: this.time,
        params: Object.assign({}, this.params),
        bottles: this.bottles.map((b) => ({
          id: b.id,
          x: b.x,
          rot: b.rot,
          wrapped: b.wrapped,
          judged: b.judged,
          pass: b.judged ? b.result.pass : null,
          result: b.result
        })),
        paused: this.paused,
        finished: this.finished,
        passCount: this.passCount,
        failCount: this.failCount,
        judged: this.judged,
        history: this.history.slice(),
        target: TARGET
      };
    }
  }

  return {
    TARGET,
    DEFAULT_PARAMS,
    IDEAL_PARAMS,
    LIMITS,
    TOLERANCE,
    STATION_X,
    BELT_SPEED,
    SPAWN_INTERVAL,
    DEFECT_TEXT,
    clamp,
    judgeLabel,
    LabelingEngine
  };
});
