import { INKS, LAYOUTS, PrintShopGame, SPEEDS } from "./engine.js";
import { PrintAudio } from "./audio.js";
import { PressRenderer } from "./renderer.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const canvas = document.querySelector("#pressCanvas");
const game = new PrintShopGame();
const audio = new PrintAudio();
const renderer = new PressRenderer(canvas);
const queueRefs = new Map();
let modalMode = "intro";
let lastEventId = 0;
let resultShown = false;
let shiftStarted = false;
let lastUiAt = 0;
let lastAudioKey = "";
let dirty = true;

const el = {
  ordersList: document.querySelector("#ordersList"),
  queueCount: document.querySelector("#queueCount"),
  wasteValue: document.querySelector("#wasteValue"),
  wasteMeter: document.querySelector("#wasteMeter"),
  completeValue: document.querySelector("#completeValue"),
  rollValue: document.querySelector("#rollValue"),
  soundToggle: document.querySelector("#soundToggle"),
  soundIcon: document.querySelector("#soundIcon"),
  soundLabel: document.querySelector("#soundLabel"),
  statusLamp: document.querySelector("#statusLamp"),
  pressStatus: document.querySelector("#pressStatus"),
  speedReadout: document.querySelector("#speedReadout"),
  paperAlert: document.querySelector("#paperAlert"),
  outageCopy: document.querySelector("#outageCopy"),
  switchPaperBtn: document.querySelector("#switchPaperBtn"),
  canvasHint: document.querySelector("#canvasHint"),
  speedName: document.querySelector("#speedName"),
  speedButtons: document.querySelector("#speedButtons"),
  registrationLabel: document.querySelector("#registrationLabel"),
  registrationNeedle: document.querySelector("#registrationNeedle"),
  regLeft: document.querySelector("#regLeft"),
  regRight: document.querySelector("#regRight"),
  startBtn: document.querySelector("#startBtn"),
  startSide: document.querySelector("#startSide"),
  startLabel: document.querySelector("#startLabel"),
  activeJobCode: document.querySelector("#activeJobCode"),
  layoutOptions: document.querySelector("#layoutOptions"),
  layoutCheck: document.querySelector("#layoutCheck"),
  inkOptions: document.querySelector("#inkOptions"),
  inkCheck: document.querySelector("#inkCheck"),
  ticketCopies: document.querySelector("#ticketCopies"),
  ticketTitle: document.querySelector("#ticketTitle"),
  ticketClient: document.querySelector("#ticketClient"),
  ticketLayout: document.querySelector("#ticketLayout"),
  ticketInk: document.querySelector("#ticketInk"),
  ticketDry: document.querySelector("#ticketDry"),
  dryStatus: document.querySelector("#dryStatus"),
  dryLabel: document.querySelector("#dryLabel"),
  message: document.querySelector("#message"),
  modal: document.querySelector("#modal"),
  modalKicker: document.querySelector("#modalKicker"),
  modalTitle: document.querySelector("#modalTitle"),
  modalLead: document.querySelector("#modalLead"),
  modalStats: document.querySelector("#modalStats"),
  modalList: document.querySelector("#modalList"),
  modalAction: document.querySelector("#modalAction")
};

const stageInfo = {
  queued: { label: "待印正面", className: "hot" },
  drying: { label: "A 面晾干", className: "hot" },
  ready_flip: { label: "可翻面", className: "good" },
  ready_b: { label: "待印反面", className: "hot" },
  done: { label: "已交付", className: "good" }
};

el.ordersList.innerHTML = game.jobs
  .map(
    (job) => `
      <article class="order-card" data-job-id="${job.id}" tabindex="0" style="--job-accent:${job.accent}">
        <div class="order-top">
          <span class="order-code">${job.code}</span>
          <span class="order-stage" data-role="stage">待印正面</span>
        </div>
        <h3>${job.title}</h3>
        <p class="order-sub">${job.client} · ${job.note}</p>
        <div class="order-meta">
          <span>${job.copies} 张</span>
          <span>双面</span>
          <span>${job.dryTime.toFixed(1)}s 晾干</span>
        </div>
        <div class="order-progress"><i data-role="progress"></i></div>
        <div class="order-footer">
          <span class="dry-mini" data-role="detail">正面待印</span>
          <button class="flip-btn" type="button" data-flip-id="${job.id}" hidden>翻面 →</button>
        </div>
      </article>
    `
  )
  .join("");

game.jobs.forEach((job) => {
  const card = el.ordersList.querySelector(`[data-job-id="${job.id}"]`);
  queueRefs.set(job.id, {
    card,
    stage: card.querySelector('[data-role="stage"]'),
    progress: card.querySelector('[data-role="progress"]'),
    detail: card.querySelector('[data-role="detail"]'),
    flip: card.querySelector(`[data-flip-id="${job.id}"]`)
  });
  card.addEventListener("click", () => selectOrder(job.id));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") selectOrder(job.id);
  });
  queueRefs.get(job.id).flip.addEventListener("click", (event) => {
    event.stopPropagation();
    if (game.flipJob(job.id)) {
      audio.click();
      markDirty();
    }
  });
});

el.layoutOptions.innerHTML = LAYOUTS.map(
  (layout) => `
    <button class="layout-option" type="button" data-layout-id="${layout.id}">
      <b>${layout.mark}</b>
      <span>${layout.label}</span>
      <small>${layout.hint}</small>
    </button>
  `
).join("");

el.inkOptions.innerHTML = INKS.map(
  (ink) => `
    <button class="ink-option" type="button" data-ink-id="${ink.id}" style="--swatch:${ink.color}">
      <i class="ink-dot"></i>
      <span>${ink.label}</span>
      <span class="ink-level" data-ink-level="${ink.id}">100%</span>
    </button>
  `
).join("");

el.layoutOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-layout-id]");
  if (!button || button.disabled) return;
  if (game.chooseLayout(game.selectedJobId, button.dataset.layoutId)) {
    audio.click();
    markDirty();
  }
});

el.inkOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ink-id]");
  if (!button || button.disabled) return;
  if (game.chooseInk(game.selectedJobId, button.dataset.inkId)) {
    audio.click();
    markDirty();
  }
});

function markDirty() {
  dirty = true;
}

function selectOrder(jobId) {
  if (game.selectJob(jobId)) {
    audio.click();
    markDirty();
  } else if (game.pressState === "printing" || game.pressState === "out_of_paper") {
    game.emit("blocked", "滚筒还在转，当前订单不能切换。", "warn");
    markDirty();
  }
}

el.speedButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-speed]");
  if (!button) return;
  game.setSpeed(Number(button.dataset.speed));
  audio.click();
  audio.setMachine(game.speed, game.pressState);
  markDirty();
});

el.regLeft.addEventListener("click", () => nudgeRegistration(-1));
el.regRight.addEventListener("click", () => nudgeRegistration(1));

function nudgeRegistration(direction) {
  if (game.nudgeRegistration(direction)) {
    audio.click();
    markDirty();
  }
}

el.startBtn.addEventListener("click", () => {
  if (game.start(game.selectedJobId)) {
    audio.click();
    audio.setMachine(game.speed, game.pressState);
  }
  markDirty();
});

el.switchPaperBtn.addEventListener("click", () => {
  if (game.switchPaperRoll()) {
    audio.switchPaper();
    markDirty();
  }
});

el.soundToggle.addEventListener("click", async () => {
  const enabled = await audio.toggle();
  updateSoundButton(enabled);
  audio.setMachine(game.speed, game.pressState);
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    nudgeRegistration(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    nudgeRegistration(1);
  }
});

el.modalAction.addEventListener("click", async () => {
  if (modalMode === "intro") {
    shiftStarted = true;
    el.modal.hidden = true;
    const enabled = await audio.enable();
    updateSoundButton(enabled);
    audio.setMachine(game.speed, game.pressState);
    audio.click();
    markDirty();
    return;
  }
  restartShift();
});

function updateSoundButton(enabled) {
  el.soundToggle.setAttribute("aria-pressed", String(enabled));
  el.soundIcon.textContent = enabled ? "◉" : "◌";
  el.soundLabel.textContent = enabled ? "机声已开启" : "开启机声";
}

function restartShift() {
  game.restart();
  resultShown = false;
  lastEventId = 0;
  modalMode = "none";
  el.modal.hidden = true;
  shiftStarted = true;
  audio.setMachine(2, game.pressState);
  markDirty();
}

function processEvents() {
  const fresh = game.events.filter((event) => event.id > lastEventId);
  for (const event of fresh) {
    lastEventId = event.id;
    if (event.type === "paper_out" || event.type === "paper_jam") audio.alert();
    if (event.type === "paper_switch" || event.type === "resume") audio.switchPaper();
    if (event.type === "scrap" || event.type === "lost") audio.scrape();
    if (event.type === "win") audio.success();
  }
  if (game.gameState !== "playing" && !resultShown) {
    resultShown = true;
    showResultModal();
  }
}

function showResultModal() {
  modalMode = "result";
  const won = game.gameState === "won";
  const seconds = Math.max(0, Math.round(game.elapsed));
  el.modalKicker.textContent = won ? "SHIFT CLEAR · 05:42" : "SHIFT HALTED · WASTE LIMIT";
  el.modalTitle.textContent = won ? "天亮前，全部交单。" : "废纸箱满了，机器停班。";
  el.modalLead.textContent = won
    ? "三份急单完成双面印刷并装车。废页在限额之内，夜班顺利交班。"
    : `废页 ${game.waste} 张，超过 ${game.wasteLimit} 张上限。检查对版、缺纸切换与晾干节奏后重开一班。`;
  el.modalStats.innerHTML = `
    <div><span>交付</span><b>${game.completed} / ${game.jobs.length}</b></div>
    <div><span>废页</span><b>${game.waste} / ${game.wasteLimit}</b></div>
    <div><span>用时</span><b>${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}</b></div>
  `;
  el.modalList.innerHTML = won
    ? "<li><b>排程完成：</b>所有正面、晾干、翻面与反面工序全部闭环。</li><li><b>纸路稳定：</b>缺纸急停后的备用卷切换已记录在班次日志。</li>"
    : "<li><b>复盘：</b>套色针进入红边会整批报废，建议降低滚筒速度。</li><li><b>复盘：</b>缺纸后超过 6 秒未换卷，纸路会持续产生废页。</li>";
  el.modalAction.textContent = won ? "再开一班" : "重新接班";
  el.modal.hidden = false;
}

function syncOrders(snapshot) {
  const run = snapshot.run;
  snapshot.jobs.forEach((job) => {
    const refs = queueRefs.get(job.id);
    if (!refs) return;
    refs.card.classList.toggle("selected", job.id === snapshot.selectedJobId);
    refs.card.classList.toggle("done", job.stage === "done");
    const info = stageInfo[job.stage];
    refs.stage.textContent = info.label;
    refs.stage.className = `order-stage ${info.className}`;
    let progress = 0;
    if (job.stage === "done") progress = 100;
    else if (job.stage !== "queued") progress = 50;
    if (run?.jobId === job.id) {
      progress = (run.side === "A" ? 0 : 50) + (run.progress / job.copies) * 50;
    }
    refs.progress.style.width = `${clamp(progress, 0, 100)}%`;
    if (job.stage === "drying") refs.detail.textContent = `${job.dryRemaining.toFixed(1)}s 后翻面`;
    if (job.stage === "ready_flip") refs.detail.textContent = "油墨已干 · 等翻面";
    if (job.stage === "ready_b") refs.detail.textContent = "已翻面 · 等上机";
    if (job.stage === "done") refs.detail.textContent = "双面完成 · 已装车";
    if (job.stage === "queued") refs.detail.textContent = "正面待印";
    refs.flip.hidden = job.stage !== "ready_flip";
  });
  const done = snapshot.jobs.filter((job) => job.stage === "done").length;
  el.queueCount.textContent = `${snapshot.jobs.length - done} 单`;
}

function syncSetup(snapshot) {
  const job = snapshot.jobs.find((item) => item.id === snapshot.selectedJobId) || snapshot.jobs[0];
  const locked = job.stage !== "queued" || snapshot.run?.jobId === job.id;
  const layout = LAYOUTS.find((item) => item.id === job.layout);
  const ink = INKS.find((item) => item.id === job.ink) || INKS[0];
  el.activeJobCode.textContent = job.code;

  el.layoutOptions.querySelectorAll("[data-layout-id]").forEach((button) => {
    const selected = button.dataset.layoutId === job.setup.layout;
    button.classList.toggle("active", selected);
    button.disabled = locked || snapshot.gameState !== "playing";
  });
  el.inkOptions.querySelectorAll("[data-ink-id]").forEach((button) => {
    const selected = button.dataset.inkId === job.setup.ink;
    button.classList.toggle("active", selected);
    button.disabled = locked || snapshot.gameState !== "playing";
  });

  if (!job.setup.layout || !job.setup.ink) {
    el.layoutCheck.textContent = !job.setup.layout ? "未选择" : "已选";
    el.layoutCheck.className = "";
    el.inkCheck.textContent = !job.setup.ink ? "未选择" : "已选";
    el.inkCheck.className = "";
  } else {
    const matches = job.setup.layout === job.layout && job.setup.ink === job.ink;
    el.layoutCheck.textContent = job.setup.layout === job.layout ? "指定版面 ✓" : "版面错配";
    el.layoutCheck.className = job.setup.layout === job.layout ? "ok" : "wrong";
    el.inkCheck.textContent = job.setup.ink === job.ink ? "指定油墨 ✓" : "油墨错配";
    el.inkCheck.className = job.setup.ink === job.ink ? "ok" : "wrong";
    if (!matches) el.layoutCheck.textContent = "有错配";
  }

  el.inkOptions.querySelectorAll("[data-ink-level]").forEach((node) => {
    node.textContent = `${Math.round(snapshot.inkLevels[node.dataset.inkLevel])}%`;
  });
  el.ticketCopies.textContent = `${job.copies} 张`;
  el.ticketTitle.textContent = job.title;
  el.ticketClient.textContent = `${job.client} · ${job.note}`;
  el.ticketLayout.textContent = layout.label;
  el.ticketInk.textContent = ink.label;
  el.ticketDry.textContent = `${job.dryTime.toFixed(1)} 秒`;

  const allDrying = snapshot.jobs.filter((item) => item.stage === "drying");
  const selectedDrying = allDrying.find((item) => item.id === job.id);
  const readyToFlip = snapshot.jobs.find((item) => item.stage === "ready_flip" && item.id === job.id);
  el.dryStatus.classList.toggle("active", Boolean(selectedDrying));
  el.dryStatus.classList.toggle("ready", Boolean(readyToFlip));
  if (selectedDrying) {
    el.dryLabel.textContent = `${job.title} · 还剩 ${selectedDrying.dryRemaining.toFixed(1)}s`;
  } else if (readyToFlip) {
    el.dryLabel.textContent = `${job.title} · 已干，点订单卡翻面`;
  } else if (allDrying.length > 0) {
    el.dryLabel.textContent = `${allDrying.length} 批晾干中`;
  } else if (snapshot.jobs.some((item) => item.stage === "ready_flip")) {
    el.dryLabel.textContent = "有纸批可翻面";
  } else {
    el.dryLabel.textContent = "空置";
  }
}

function syncControls(snapshot) {
  const wasteRatio = snapshot.waste / snapshot.wasteLimit;
  el.wasteValue.textContent = `${snapshot.waste} / ${snapshot.wasteLimit}`;
  el.wasteMeter.style.width = `${clamp(wasteRatio, 0, 1) * 100}%`;
  el.wasteMeter.style.backgroundColor =
    snapshot.waste >= snapshot.wasteLimit ? "#ff655f" : wasteRatio >= 0.5 ? "#ffc45c" : "#6ce7a8";
  el.completeValue.textContent = `${snapshot.completed} / ${snapshot.jobs.length}`;
  el.rollValue.textContent = `${snapshot.roll.active === "main" ? "主卷" : "备用卷"} · ${snapshot.roll[snapshot.roll.active]} 张`;

  const activeJob = snapshot.jobs.find((job) => job.id === snapshot.run?.jobId);
  let statusText = "主电源待机";
  let lampClass = "";
  if (snapshot.pressState === "printing") {
    statusText = `滚筒运行 · ${activeJob?.title || "作业"} ${snapshot.run?.side || "A"} 面`;
  } else if (snapshot.pressState === "out_of_paper") {
    statusText = "纸卷耗尽 · 滚筒急停";
    lampClass = "bad";
  } else if (snapshot.gameState === "won") {
    statusText = "三单交付 · 班次完成";
  } else if (snapshot.gameState === "lost") {
    statusText = "废页超限 · 机器停机";
    lampClass = "bad";
  } else if (snapshot.jobs.some((job) => job.stage === "drying")) {
    statusText = "晾纸计时中 · 滚筒可接下一单";
    lampClass = "warn";
  }
  el.pressStatus.textContent = statusText;
  el.statusLamp.className = `status-lamp ${lampClass}`;
  el.speedReadout.textContent = String(snapshot.speed).padStart(2, "0");
  el.speedName.textContent = SPEEDS[snapshot.speed].label;
  el.speedButtons.querySelectorAll("[data-speed]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.speed) === snapshot.speed);
  });

  el.registrationNeedle.style.left = `${snapshot.registration}%`;
  if (
    snapshot.registration <= snapshot.edgeMin ||
    snapshot.registration >= snapshot.edgeMax
  ) {
    el.registrationLabel.textContent = "危险";
    el.registrationLabel.style.color = "#ff655f";
  } else if (
    snapshot.registration < snapshot.safeMin ||
    snapshot.registration > snapshot.safeMax
  ) {
    el.registrationLabel.textContent = "跑偏";
    el.registrationLabel.style.color = "#ffc45c";
  } else {
    el.registrationLabel.textContent = "居中";
    el.registrationLabel.style.color = "#6ce7a8";
  }

  const out = snapshot.pressState === "out_of_paper";
  el.paperAlert.hidden = !out;
  if (out) {
    el.outageCopy.textContent =
      snapshot.outageTime > 6
        ? `纸路已空转 ${snapshot.outageTime.toFixed(1)} 秒，正在持续增加废页！`
        : "立即切换备用纸卷，别让纸路空转。";
    el.switchPaperBtn.innerHTML = `切换备用纸卷 <b>备用卷 ${snapshot.roll.backup} 张 · −1 废页</b>`;
  }
  el.canvasHint.hidden = Boolean(snapshot.run) || snapshot.gameState !== "playing" || out;

  const job = snapshot.jobs.find((item) => item.id === snapshot.selectedJobId) || snapshot.jobs[0];
  let disabled = false;
  let side = "装版待命";
  let label = "开印正面";
  if (snapshot.pressState === "printing") {
    disabled = true;
    side = "滚筒运行中";
    label = "正在印刷";
  } else if (out) {
    disabled = true;
    side = "缺纸急停";
    label = "先换纸卷";
  } else if (snapshot.gameState !== "playing") {
    disabled = true;
    side = "班次结束";
    label = snapshot.gameState === "won" ? "全部交付" : "机器停机";
  } else if (job.stage === "drying") {
    disabled = true;
    side = `还需晾 ${job.dryRemaining.toFixed(1)}s`;
    label = "等待干燥";
  } else if (job.stage === "ready_flip") {
    disabled = true;
    side = "油墨已干";
    label = "先翻面";
  } else if (job.stage === "ready_b") {
    side = "A 面已干 · 翻面就绪";
    label = "开印反面";
  } else if (job.stage === "done") {
    disabled = true;
    side = "双面已完成";
    label = "订单已交付";
  } else {
    side = job.setup.layout && job.setup.ink ? "贴合工单后开印" : "版面 / 油墨待设定";
  }
  el.startBtn.disabled = disabled;
  el.startSide.textContent = side;
  el.startLabel.textContent = label;
  el.message.textContent = snapshot.message.text;
  el.message.className = ["warn", "bad", "good"].includes(snapshot.message.tone)
    ? snapshot.message.tone
    : "";
}

function syncUI(snapshot = game.snapshot()) {
  processEvents();
  syncOrders(snapshot);
  syncSetup(snapshot);
  syncControls(snapshot);
}

function advanceSimulation(seconds) {
  let remaining = Math.max(0, Number(seconds) || 0);
  while (remaining > 0) {
    const step = Math.min(0.05, remaining);
    game.tick(step);
    remaining -= step;
  }
  const snapshot = game.snapshot();
  syncUI(snapshot);
  renderer.draw(snapshot, performance.now());
  return snapshot;
}

let previousFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - previousFrame) / 1000));
  previousFrame = now;
  if (shiftStarted && game.gameState === "playing") game.tick(dt);
  const snapshot = game.snapshot();
  processEvents();
  renderer.draw(snapshot, now);
  if (dirty || now - lastUiAt > 120) {
    syncUI(snapshot);
    dirty = false;
    lastUiAt = now;
  }
  const audioKey = `${snapshot.pressState}:${snapshot.speed}`;
  if (audioKey !== lastAudioKey) {
    lastAudioKey = audioKey;
    audio.setMachine(snapshot.speed, snapshot.pressState);
  }
  requestAnimationFrame(frame);
}

window.__nightPress = {
  game,
  audio,
  renderer,
  getState: () => game.snapshot(),
  getAudio: () => audio.debugInfo(),
  advance: advanceSimulation,
  startShift: () => {
    shiftStarted = true;
    el.modal.hidden = true;
    modalMode = "none";
    markDirty();
  }
};

syncUI(game.snapshot());
requestAnimationFrame(frame);
