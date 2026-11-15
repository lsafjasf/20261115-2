export const LAYOUTS = [
  { id: "poster", label: "整版", mark: "▣", hint: "满版大标题" },
  { id: "columns", label: "双栏", mark: "▥", hint: "两栏密排" },
  { id: "ticket", label: "票根", mark: "▤", hint: "窄边套号" }
];

export const INKS = [
  { id: "cyan", label: "午夜青", color: "#35d8ff", dark: "#087e9d" },
  { id: "magenta", label: "霓虹洋红", color: "#ff4f9d", dark: "#9d164c" },
  { id: "gold", label: "末班金", color: "#ffc857", dark: "#a46b0c" }
];

export const SPEEDS = [
  { level: 0, label: "停机", sheetsPerSecond: 0, drift: 0, pitch: 0 },
  { level: 1, label: "慢车", sheetsPerSecond: 1.1, drift: 1.1, pitch: 1 },
  { level: 2, label: "常速", sheetsPerSecond: 1.55, drift: 2.8, pitch: 2 },
  { level: 3, label: "冲刺", sheetsPerSecond: 2.15, drift: 18, pitch: 3 }
];

export const DEFAULT_JOBS = [
  {
    id: "midnight",
    code: "单 01",
    title: "午夜快讯",
    client: "城市晚报",
    note: "头版双面急送",
    copies: 4,
    layout: "columns",
    ink: "cyan",
    dryTime: 5.0,
    accent: "#5ee7ff"
  },
  {
    id: "neon",
    code: "单 02",
    title: "霓虹戏单",
    client: "红幕剧院",
    note: "海报双面压色",
    copies: 5,
    layout: "poster",
    ink: "magenta",
    dryTime: 6.4,
    accent: "#ff6bab"
  },
  {
    id: "lastbus",
    code: "单 03",
    title: "末班车票",
    client: "夜航巴士",
    note: "票根双面打码",
    copies: 6,
    layout: "ticket",
    ink: "gold",
    dryTime: 4.4,
    accent: "#ffd171"
  }
];

const SAFE_MIN = 41;
const SAFE_MAX = 59;
const EDGE_MIN = 13;
const EDGE_MAX = 87;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => JSON.parse(JSON.stringify(value));

export class PrintShopGame {
  constructor(options = {}) {
    this.jobsTemplate = clone(options.jobs || DEFAULT_JOBS);
    this.wasteLimit = options.wasteLimit ?? 6;
    this.mainRollSheets = options.mainRollSheets ?? 7;
    this.backupRollSheets = options.backupRollSheets ?? 14;
    this.restart();
  }

  restart() {
    this.jobs = this.jobsTemplate.map((job) => ({
      ...clone(job),
      stage: "queued",
      dryRemaining: 0,
      setup: { layout: null, ink: null },
      sideASetup: null
    }));
    this.selectedJobId = this.jobs[0].id;
    this.pressState = "idle";
    this.speed = 2;
    this.run = null;
    this.waste = 0;
    this.roll = {
      active: "main",
      main: this.mainRollSheets,
      backup: this.backupRollSheets
    };
    this.registration = 50;
    this.driftDirection = 1;
    this.driftClock = 0;
    this.edgeTime = 0;
    this._riskyNotice = false;
    this.outageTime = 0;
    this.outageWasteClock = 0;
    this.gameState = "playing";
    this.completed = 0;
    this.elapsed = 0;
    this.inkLevels = { cyan: 100, magenta: 100, gold: 100 };
    this.message = {
      tone: "info",
      text: "机器已预热。先核对版面与油墨，再装纸开印。",
      id: 0
    };
    this.eventId = 0;
    this.events = [];
  }

  emit(type, text, tone = "info") {
    this.eventId += 1;
    this.message = { tone, text, id: this.eventId };
    this.events.push({ type, text, tone, id: this.eventId });
    if (this.events.length > 30) this.events.shift();
  }

  get selectedJob() {
    return this.jobs.find((job) => job.id === this.selectedJobId) || this.jobs[0];
  }

  get activeRollSheets() {
    return this.roll[this.roll.active];
  }

  selectJob(jobId) {
    if (!this.jobs.some((job) => job.id === jobId)) return false;
    if (this.pressState === "printing" || this.pressState === "out_of_paper") return false;
    this.selectedJobId = jobId;
    return true;
  }

  chooseLayout(jobId, layoutId) {
    if (this.gameState !== "playing") return false;
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job || this._isJobLocked(job)) return false;
    if (!LAYOUTS.some((item) => item.id === layoutId)) return false;
    job.setup.layout = layoutId;
    return true;
  }

  chooseInk(jobId, inkId) {
    if (this.gameState !== "playing") return false;
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job || this._isJobLocked(job)) return false;
    if (!INKS.some((item) => item.id === inkId)) return false;
    job.setup.ink = inkId;
    return true;
  }

  setSpeed(level) {
    const next = clamp(Number(level) || 0, 0, 3);
    this.speed = next;
    this.emit("speed", `滚筒切换到「${SPEEDS[next].label}」档。`, "info");
    return true;
  }

  _isJobLocked(job) {
    return (
      (this.run && this.run.jobId === job.id) ||
      job.stage === "drying" ||
      job.stage === "ready_flip" ||
      job.stage === "ready_b" ||
      job.stage === "done"
    );
  }

  start(jobId = this.selectedJobId) {
    if (this.gameState !== "playing") return false;
    if (this.pressState !== "idle") {
      this.emit("blocked", "滚筒仍在转动，先等本次印刷结束。", "warn");
      return false;
    }
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job || job.stage === "drying" || job.stage === "ready_flip" || job.stage === "done") {
      this.emit("blocked", "这份订单现在不能上机。", "warn");
      return false;
    }

    if (job.stage === "queued" && !this._setupMatches(job)) {
      const missing = !job.setup.layout || !job.setup.ink;
      if (missing) {
        this.emit("setup", "版面或油墨尚未设定，机器不会启动。", "warn");
        return false;
      }
      this._scrapBatch(job, "套色对版错误，整批报废。", job.copies);
      return false;
    }

    if (job.stage === "queued" && this.activeRollSheets <= 0) {
      this.pressState = "out_of_paper";
      this.run = {
        jobId: job.id,
        side: "A",
        progress: 0,
        paperFed: 0,
        startedAt: this.elapsed
      };
      this.outageTime = 0;
      this.outageWasteClock = 0;
      this.emit("paper_out", "主纸卷已空，滚筒已急停。立即切换备用纸卷。", "bad");
      return false;
    }

    const side = job.stage === "ready_b" ? "B" : "A";
    this.selectedJobId = job.id;
    this.run = {
      jobId: job.id,
      side,
      progress: 0,
      paperFed: 0,
      startedAt: this.elapsed
    };
    this.pressState = "printing";
    this.driftDirection = this.eventId % 2 === 0 ? 1 : -1;
    this.registration = this.driftDirection > 0 ? 58 : 42;
    this.driftClock = 0;
    this.edgeTime = 0;
    if (side === "B" && !job.sideASetup) job.sideASetup = clone(job.setup);
    const sideLabel = side === "A" ? "正面" : "反面";
    this.emit("start", `${job.title} ${sideLabel}开印，滚筒升至「${SPEEDS[this.speed].label}」。`, "good");
    return true;
  }

  _setupMatches(job) {
    return job.setup.layout === job.layout && job.setup.ink === job.ink;
  }

  _scrapBatch(job, reason, wasteAdded) {
    const wasSideB = job.stage === "ready_b";
    this.waste += wasteAdded;
    if (job.stage === "queued" || job.stage === "drying" || job.stage === "ready_flip") {
      job.stage = "queued";
      job.dryRemaining = 0;
    }
    this.pressState = "idle";
    this.run = null;
    this.edgeTime = 0;
    this.registration = 50;
    this.emit("scrap", `${reason} 计入 ${job.copies} 张废页。`, "bad");
    this._checkLoss();
    if (this.gameState === "playing") {
      this.message = {
        tone: "bad",
        text: wasSideB ? "反面对版失败，纸垛退回待翻面区。" : "整批已送入废纸箱，请重新校版。",
        id: this.eventId
      };
    }
    return false;
  }

  nudgeRegistration(direction, amount = 7) {
    if (this.pressState !== "printing") return false;
    const delta = direction < 0 ? -amount : amount;
    const before = this.registration;
    this.registration = clamp(this.registration + delta, 0, 100);
    if (before < SAFE_MIN || before > SAFE_MAX) {
      if (this.registration >= SAFE_MIN && this.registration <= SAFE_MAX) {
        this.emit("registration", "对版针回到绿色容差区。", "good");
      }
    }
    this.edgeTime = Math.max(0, this.edgeTime - 0.12);
    return true;
  }

  flipJob(jobId = this.selectedJobId) {
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job || job.stage !== "ready_flip") return false;
    job.stage = "ready_b";
    job.sideASetup = clone(job.setup);
    this.selectedJobId = job.id;
    this.emit("flip", `${job.title} 墨已干透，纸垛完成翻面。`, "good");
    return true;
  }

  switchPaperRoll() {
    if (this.roll.active !== "main" || this.roll.main > 0) return false;
    if (this.roll.backup <= 0) {
      this.gameState = "lost";
      this.pressState = "stopped";
      this.emit("lost", "备用纸卷也已耗尽，夜班无法交单。", "bad");
      return false;
    }
    this.roll.active = "backup";
    this.waste += 1;
    this.outageTime = 0;
    this.outageWasteClock = 0;
    this.emit("paper_switch", "备用纸卷接入，接纸损耗 1 张。", "warn");
    this._checkLoss();
    if (this.gameState !== "playing") return false;
    if (this.pressState === "out_of_paper") {
      this.pressState = "printing";
      this.edgeTime = 0;
      this.emit("resume", "纸路恢复，滚筒重新起步。", "good");
    }
    return true;
  }

  tick(dt = 0) {
    if (this.gameState !== "playing") return;
    const step = clamp(Number(dt) || 0, 0, 0.25);
    if (step <= 0) return;
    this.elapsed += step;
    this._advanceDrying(step);
    if (this.gameState !== "playing") return;

    if (this.pressState === "out_of_paper") {
      this.outageTime += step;
      this.outageWasteClock += step;
      if (this.outageTime > 6 && this.outageWasteClock >= 2) {
        this.outageWasteClock -= 2;
        this.waste += 1;
        this.emit("paper_jam", "空转的纸路开始起皱，增加 1 张废页。", "warn");
        this._checkLoss();
      }
      return;
    }
    if (this.pressState === "printing") this._advancePress(step);
  }

  _advanceDrying(dt) {
    for (const job of this.jobs) {
      if (job.stage !== "drying") continue;
      job.dryRemaining = Math.max(0, job.dryRemaining - dt);
      if (job.dryRemaining <= 0.0001) {
        job.stage = "ready_flip";
        this.emit("dried", `${job.title} 的油墨已干透，可以翻面。`, "good");
      }
    }
  }

  _advancePress(dt) {
    const run = this.run;
    const job = this.jobs.find((item) => item.id === run?.jobId);
    if (!run || !job) return;
    const speed = SPEEDS[this.speed];
    if (speed.sheetsPerSecond <= 0) return;

    this.driftClock += dt;
    const wobble = Math.sin(this.driftClock * 3.1) * 0.7;
    this.registration = clamp(
      this.registration + (this.driftDirection * speed.drift + wobble) * dt,
      0,
      100
    );
    this._trackRegistration(dt);
    if (this.gameState !== "playing" || this.pressState !== "printing") return;

    const target = Math.min(job.copies, run.progress + speed.sheetsPerSecond * dt);
    if (run.side === "A") {
      const needed = Math.min(job.copies, Math.floor(target + 1e-6) + 1);
      while (run.paperFed < needed) {
        if (this.activeRollSheets <= 0) {
          run.progress = Math.min(target, run.paperFed);
          this.pressState = "out_of_paper";
          this.outageTime = 0;
          this.outageWasteClock = 0;
          this.edgeTime = 0;
          this.emit("paper_out", "纸卷见底，滚筒急停。立即切换备用纸卷！", "bad");
          return;
        }
        this.roll[this.roll.active] -= 1;
        run.paperFed += 1;
      }
    }

    run.progress = target;
    const ink = this.inkLevels[job.ink];
    this.inkLevels[job.ink] = Math.max(0, ink - dt * 0.24);
    if (run.progress >= job.copies - 1e-6) this._finishRun(job, run);
  }

  _trackRegistration(dt) {
    const risky = this.registration < SAFE_MIN || this.registration > SAFE_MAX;
    const atEdge = this.registration <= EDGE_MIN || this.registration >= EDGE_MAX;
    if (atEdge) {
      this.edgeTime += dt;
    } else {
      this.edgeTime = Math.max(0, this.edgeTime - dt * 1.8);
    }
    if (this.edgeTime >= 0.75 && this.run) {
      const job = this.jobs.find((item) => item.id === this.run.jobId);
      if (job) this._scrapBatch(job, "套色针冲出红色边缘，整批报废。", job.copies);
      return;
    }
    if (risky && !this._riskyNotice) {
      this._riskyNotice = true;
      this.emit("registration", "套色正在跑偏，用「← / →」把对版针拉回绿区。", "warn");
    } else if (!risky) {
      this._riskyNotice = false;
    }
  }

  _finishRun(job, run) {
    const wasSide = run.side;
    this.pressState = "idle";
    this.run = null;
    this.edgeTime = 0;
    this.registration = 50;
    if (wasSide === "A") {
      job.sideASetup = clone(job.setup);
      job.stage = "drying";
      job.dryRemaining = job.dryTime;
      this.emit("dried_start", `${job.title} 正面完成，送入晾纸架等待 ${job.dryTime.toFixed(1)} 秒。`, "good");
    } else {
      job.stage = "done";
      this.completed += 1;
      this.emit("complete", `${job.title} 双面完成，已装车。`, "good");
      if (this.completed >= this.jobs.length) this._checkWin();
    }
  }

  _checkLoss() {
    if (this.waste <= this.wasteLimit) return false;
    this.gameState = "lost";
    this.pressState = "stopped";
    this.run = null;
    this.emit("lost", `废页 ${this.waste} 张，超过上限 ${this.wasteLimit} 张，夜班被叫停。`, "bad");
    return true;
  }

  _checkWin() {
    if (this.waste > this.wasteLimit) {
      this._checkLoss();
      return;
    }
    this.gameState = "won";
    this.pressState = "stopped";
    this.run = null;
    this.emit("win", `三份急单全部交付，废页 ${this.waste}/${this.wasteLimit}。`, "good");
  }

  snapshot() {
    return {
      gameState: this.gameState,
      pressState: this.pressState,
      speed: this.speed,
      elapsed: this.elapsed,
      waste: this.waste,
      wasteLimit: this.wasteLimit,
      completed: this.completed,
      selectedJobId: this.selectedJobId,
      registration: this.registration,
      safeMin: SAFE_MIN,
      safeMax: SAFE_MAX,
      edgeMin: EDGE_MIN,
      edgeMax: EDGE_MAX,
      edgeTime: this.edgeTime,
      outageTime: this.outageTime,
      roll: clone(this.roll),
      rollCaps: { main: this.mainRollSheets, backup: this.backupRollSheets },
      inkLevels: clone(this.inkLevels),
      run: this.run ? clone(this.run) : null,
      jobs: clone(this.jobs),
      message: clone(this.message)
    };
  }
}
