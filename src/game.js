export const STAGES = [
  {
    id: "SUB MERGE",
    title: "低频汇流",
    bpm: 84,
    lamps: [0, 1, 2, 0],
    frequency: [52, 68],
    gain: [36, 58],
    note: "慢拍 · 逐灯下沉",
  },
  {
    id: "CROSSFADE",
    title: "交叠切光",
    bpm: 112,
    lamps: [2, 0, 1, 2, 0],
    frequency: [70, 86],
    gain: [38, 66],
    note: "切分 · 三灯折返",
  },
  {
    id: "OVERDRIVE",
    title: "过载尾声",
    bpm: 144,
    lamps: [1, 2, 0, 1, 2, 0],
    frequency: [46, 62],
    gain: [42, 72],
    note: "高速 · 全灯轮转",
  },
];

export const TARGET_WINDOW = 0.2;
export const PAIR_WINDOW = 0.18;
const COUNT_IN_BEATS = 4;
const MISS_GRACE = 0.26;

export class DualSyncGame {
  constructor(audio, callbacks = {}) {
    this.audio = audio;
    this.callbacks = callbacks;
    this.reset();
  }

  reset() {
    this.phase = "idle";
    this.paused = false;
    this.stageIndex = 0;
    this.stage = null;
    this.stageStart = 0;
    this.spb = 1;
    this.targets = [];
    this.stageHits = 0;
    this.stageFailed = false;
    this.totalHits = 0;
    this.totalAlarms = 0;
    this.frequency = 46;
    this.volume = 44;
    this.lastLock = null;
    this.lastInputA = null;
    this.lastInputB = null;
    this.lastAlarm = null;
    this.nextCueIndex = 0;
    this.clearUntil = 0;
    this.failureUntil = 0;
    this.completionStats = null;
    this.stageAttempts = [0, 0, 0];
  }

  get now() {
    return this.audio.now;
  }

  get isRunning() {
    return this.phase !== "idle" && this.phase !== "complete";
  }

  async start() {
    await this.audio.connect();
    const preservedStats = null;
    this.reset();
    this.completionStats = preservedStats;
    this.beginStage(0);
    this.notify();
  }

  beginStage(index) {
    const stage = STAGES[index];
    this.stageIndex = index;
    this.stage = stage;
    this.stageAttempts[index] += 1;
    this.spb = 60 / stage.bpm;
    this.stageStart = this.now + 0.16;
    this.phase = "countin";
    this.stageHits = 0;
    this.stageFailed = false;
    this.nextCueIndex = 0;
    this.lastLock = null;
    this.lastAlarm = null;
    this.targets = stage.lamps.map((lamp, targetIndex) => ({
      index: targetIndex,
      lamp,
      time: this.stageStart + (COUNT_IN_BEATS + 0.55 + targetIndex) * this.spb,
      status: "pending",
      aAt: null,
      bAt: null,
      bLamp: null,
      scoreAt: null,
    }));

    this.scheduleCues();
    this.callbacks.onStage?.(stage, index);
    this.callbacks.onFeedback?.({
      tone: "info",
      title: `${stage.id} / ${stage.title}`,
      detail: "四拍预备 · 调节低频，观察下一灯位",
    });
    this.notify();
  }

  scheduleCues() {
    for (let beat = 0; beat < COUNT_IN_BEATS; beat += 1) {
      this.audio.scheduleTick(this.stageStart + beat * this.spb, beat === 0);
    }
    for (const target of this.targets) {
      this.audio.scheduleTargetPing(target.time);
    }
  }

  setPaused(paused) {
    if (!this.isRunning || this.paused === paused) return;
    this.paused = paused;
    this.callbacks.onPause?.(paused);
    this.notify();
  }

  adjustFrequency(direction) {
    if (!this.canOperate()) return false;
    this.frequency = clamp(round(this.frequency + direction * 1.5), 35, 105);
    this.callbacks.onInputA?.("frequency");
    this.notify();
    return true;
  }

  adjustVolume(direction) {
    if (!this.canOperate()) return false;
    this.volume = clamp(round(this.volume + direction * 2), 18, 92);
    this.callbacks.onInputA?.("volume");
    this.notify();
    return true;
  }

  canOperate() {
    return this.isRunning && !this.paused && this.phase !== "failure" && this.phase !== "stageClear";
  }

  playerAInput() {
    if (!this.canOperate()) return false;
    const at = this.now;
    this.lastInputA = at;
    this.callbacks.onInputA?.("fire");

    const target = this.findOpenTarget(at);
    if (!target) {
      this.audio.playOffbeat();
      this.callbacks.onFeedback?.({
        tone: "warn",
        title: "低频脱拍",
        detail: "空格没有落在当前目标拍窗口内",
      });
      this.notify();
      return false;
    }

    target.aAt = at;
    this.tryResolve(target);
    this.notify();
    return true;
  }

  playerBInput(lamp) {
    if (!this.canOperate() || lamp < 0 || lamp > 2) return false;
    const at = this.now;
    this.lastInputB = at;
    this.callbacks.onInputB?.(lamp);

    const target = this.findOpenTarget(at);
    if (!target) {
      this.audio.playOffbeat();
      this.callbacks.onFeedback?.({
        tone: "warn",
        title: "灯光脱拍",
        detail: `第 ${lamp + 1} 灯没有落在目标拍窗口内`,
      });
      this.notify();
      return false;
    }

    target.bAt = at;
    target.bLamp = lamp;
    this.tryResolve(target);
    this.notify();
    return true;
  }

  findOpenTarget(at) {
    let nearest = null;
    for (const target of this.targets) {
      if (target.status !== "pending") continue;
      const distance = Math.abs(at - target.time);
      if (distance <= TARGET_WINDOW && (!nearest || distance < nearest.distance)) {
        nearest = { target, distance };
      }
    }
    return nearest?.target ?? null;
  }

  tuningIsValid() {
    const [frequencyMin, frequencyMax] = this.stage.frequency;
    const [gainMin, gainMax] = this.stage.gain;
    return (
      this.frequency >= frequencyMin &&
      this.frequency <= frequencyMax &&
      this.volume >= gainMin &&
      this.volume <= gainMax
    );
  }

  tryResolve(target) {
    if (target.status !== "pending" || target.aAt === null || target.bAt === null) return;
    if (target.bLamp !== target.lamp) return;

    const difference = Math.abs(target.aAt - target.bAt);
    const bothInWindow =
      Math.abs(target.aAt - target.time) <= TARGET_WINDOW &&
      Math.abs(target.bAt - target.time) <= TARGET_WINDOW;

    if (difference > PAIR_WINDOW || !bothInWindow || !this.tuningIsValid()) return;

    const at = this.now;
    target.status = "hit";
    target.scoreAt = at;
    this.stageHits += 1;
    this.totalHits += 1;
    this.lastLock = {
      target: target.index,
      lamp: target.lamp,
      aAt: target.aAt,
      bAt: target.bAt,
      difference,
      at,
    };

    this.audio.playBassPulse(this.frequency, this.volume);
    this.audio.playLampChime(target.lamp);
    this.audio.playLockSweep();
    this.callbacks.onLock?.(this.lastLock, target);
    this.callbacks.onFeedback?.({
      tone: "lock",
      title: `DUAL LOCK / 第 ${target.index + 1} 拍`,
      detail: `灯位 ${target.lamp + 1} · 双键差 ${Math.round(difference * 1000)} ms`,
    });
  }

  resolveMissedTarget(target) {
    if (target.status !== "pending") return;
    target.status = "fail";
    this.stageFailed = true;
    this.totalAlarms += 1;
    this.lastAlarm = {
      target: target.index,
      at: this.now,
      reason: target.bLamp === null ? "no-light" : target.aAt === null ? "no-bass" : "out-of-sync",
    };
    this.audio.playAlarm();
    const reason =
      this.lastAlarm.reason === "no-light"
        ? "灯位未触发"
        : this.lastAlarm.reason === "no-bass"
          ? "低频未触发"
          : "双键未同步或调音越界";
    this.callbacks.onAlarm?.(this.lastAlarm, target, reason);
    this.callbacks.onFeedback?.({
      tone: "alarm",
      title: "PHASE FAULT / 装置报警",
      detail: `第 ${target.index + 1} 拍 · ${reason}`,
    });
  }

  update() {
    if (!this.isRunning || this.paused) return this.snapshot();
    const now = this.now;

    if (this.phase === "countin") {
      const firstTarget = this.targets[0];
      if (firstTarget && now >= firstTarget.time - this.spb * 0.62) {
        this.phase = "playing";
        this.callbacks.onFeedback?.({
          tone: "info",
          title: `第 ${this.stageIndex + 1} 段进行中`,
          detail: `目标灯位 ${firstTarget.lamp + 1} · 等待双键同拍`,
        });
        this.notify();
      }
    }

    if (this.phase === "playing") {
      for (const target of this.targets) {
        if (target.status === "pending" && now > target.time + MISS_GRACE) {
          this.resolveMissedTarget(target);
          this.notify();
        }
      }

      const lastTarget = this.targets[this.targets.length - 1];
      if (lastTarget && now > lastTarget.time + MISS_GRACE + 0.62) {
        if (this.stageFailed) {
          this.phase = "failure";
          this.failureUntil = now + 1.55;
          this.callbacks.onStageFail?.(this.stage, this.stageIndex);
          this.callbacks.onFeedback?.({
            tone: "alarm",
            title: `${this.stage.id} / 段失败`,
            detail: "装置冷却后重试本段，完成全部目标拍才能进入下一段",
          });
        } else if (this.stageIndex < STAGES.length - 1) {
          this.phase = "stageClear";
          this.clearUntil = now + 1.85;
          this.callbacks.onStageClear?.(this.stage, this.stageIndex);
          this.callbacks.onFeedback?.({
            tone: "lock",
            title: `${this.stage.id} / 段落锁定`,
            detail: `${this.stageHits} / ${this.targets.length} 拍 · 准备进入下一段`,
          });
        } else {
          this.phase = "complete";
          this.completionStats = {
            hits: this.totalHits,
            alarms: this.totalAlarms,
            attempts: this.stageAttempts.reduce((sum, count) => sum + count, 0),
          };
          this.callbacks.onComplete?.(this.completionStats);
          this.callbacks.onFeedback?.({
            tone: "lock",
            title: "THREE MOVEMENTS COMPLETE",
            detail: "三段节奏展示完成，声光装置已锁定",
          });
        }
        this.notify();
      }
    }

    if (this.phase === "failure" && now >= this.failureUntil) {
      this.beginStage(this.stageIndex);
    }

    if (this.phase === "stageClear" && now >= this.clearUntil) {
      this.beginStage(this.stageIndex + 1);
    }

    return this.snapshot();
  }

  getNextTarget() {
    return this.targets.find((target) => target.status === "pending") ?? null;
  }

  getCountIn() {
    if (this.phase !== "countin") return null;
    const elapsed = this.now - this.stageStart;
    const beat = Math.floor(elapsed / this.spb);
    return {
      beat: clamp(beat + 1, 1, COUNT_IN_BEATS),
      remaining: Math.max(0, COUNT_IN_BEATS - beat),
    };
  }

  snapshot() {
    const nextTarget = this.getNextTarget();
    return {
      phase: this.phase,
      paused: this.paused,
      stageIndex: this.stageIndex,
      stageId: this.stage?.id ?? STAGES[0].id,
      stageTitle: this.stage?.title ?? STAGES[0].title,
      bpm: this.stage?.bpm ?? STAGES[0].bpm,
      frequency: this.frequency,
      volume: this.volume,
      frequencyTarget: this.stage?.frequency ?? STAGES[0].frequency,
      gainTarget: this.stage?.gain ?? STAGES[0].gain,
      tuningValid: this.stage ? this.tuningIsValid() : false,
      stageHits: this.stageHits,
      requiredHits: this.targets.length || STAGES[0].lamps.length,
      totalHits: this.totalHits,
      totalAlarms: this.totalAlarms,
      stageAttempts: [...this.stageAttempts],
      targets: this.targets.map((target) => ({
        index: target.index,
        lamp: target.lamp,
        time: target.time,
        status: target.status,
        aAt: target.aAt,
        bAt: target.bAt,
        bLamp: target.bLamp,
      })),
      nextTarget: nextTarget
        ? {
            index: nextTarget.index,
            lamp: nextTarget.lamp,
            time: nextTarget.time,
          }
        : null,
      lastLock: this.lastLock ? { ...this.lastLock } : null,
      lastAlarm: this.lastAlarm ? { ...this.lastAlarm } : null,
      lastInputA: this.lastInputA,
      lastInputB: this.lastInputB,
      countIn: this.getCountIn(),
      completionStats: this.completionStats ? { ...this.completionStats } : null,
      audio: this.audio.debug(),
      canOperate: this.canOperate(),
    };
  }

  notify() {
    this.callbacks.onUpdate?.(this.snapshot());
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 10) / 10;
}
