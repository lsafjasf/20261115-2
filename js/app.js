import { DrumEngine, VOICE_IDS } from "./audio/engine.js";
import { GraphView } from "./ui/graph-view.js";
import { StepView } from "./ui/step-view.js";

const engine = new DrumEngine();
const graphCanvas = document.getElementById("graphCanvas");
const stepCanvas = document.getElementById("stepCanvas");
const msgEl = document.getElementById("graphMsg");
const muteEl = document.getElementById("muteState");

const graphView = new GraphView(graphCanvas, engine, showMessage);
const stepView = new StepView(stepCanvas, engine);

engine.onStep = (step) => {
  stepView.currentStep = step;
  stepView.draw();
};

engine.onMute = (peak) => {
  muteEl.textContent = `峰值保护：已自动静音（峰值 ${peak.toFixed(2)}）`;
  muteEl.className = "mute-tripped";
};

function showMessage(text, kind = "") {
  msgEl.textContent = text;
  msgEl.className = `graph-msg ${kind}`;
}

document.getElementById("playBtn").addEventListener("click", async () => {
  if (engine.muted) engine.resetMute();
  await engine.play();
  showMessage("正在播放 16 步循环……", "ok");
});

document.getElementById("stopBtn").addEventListener("click", () => {
  engine.stop();
  stepView.currentStep = -1;
  stepView.draw();
  showMessage("已停止", "ok");
});

document.getElementById("tempo").addEventListener("change", (ev) => {
  engine.bpm = Math.min(200, Math.max(60, Number(ev.target.value) || 112));
});

buildControls();
engine._refreshReachability();
graphView.draw();
stepView.draw();

function buildControls() {
  const host = document.getElementById("nodeControls");
  const cards = [
    ...VOICE_IDS.map((id) => ({ id, voice: true })),
    { id: "filter", fx: true },
    { id: "delay", fx: true },
    { id: "bus", bus: true },
  ];
  for (const card of cards) host.appendChild(buildCard(card));
}

function buildCard({ id, voice, fx, bus }) {
  const card = document.createElement("div");
  card.className = "ctl-card";
  const title = {
    kick: "底鼓", snare: "军鼓", hihat: "踩镲", clap: "拍手",
    filter: "滤波", delay: "延迟", bus: "总线增益",
  }[id];
  card.innerHTML = `<h3>${title}</h3>`;

  if (voice || bus) {
    card.appendChild(slider("增益", 0, 1, 0.01, defaultGain(id), (v) => {
      engine.setParam(id, "gain", v);
    }));
  }
  if (fx && id === "filter") {
    card.appendChild(slider("截止频率", 200, 8000, 50, 1800, (v) => {
      engine.setParam("filter", "filterFreq", v);
    }));
    card.appendChild(bypassButton("filter"));
  }
  if (fx && id === "delay") {
    card.appendChild(slider("延迟时间(s)", 0.05, 0.6, 0.01, 0.19, (v) => {
      engine.setParam("delay", "delayTime", v);
    }));
    card.appendChild(slider("反馈量", 0, 0.9, 0.01, 0.35, (v) => {
      engine.setParam("delay", "feedback", v);
    }));
    card.appendChild(bypassButton("delay"));
  }
  return card;
}

function defaultGain(id) {
  return { kick: 0.9, snare: 0.7, hihat: 0.45, clap: 0.7, bus: 0.8 }[id];
}

function slider(label, min, max, step, initial, onChange) {
  const row = document.createElement("div");
  row.className = "ctl-row";
  row.innerHTML = `<label>${label}</label>`;
  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = initial;
  const val = document.createElement("span");
  val.className = "val";
  val.textContent = Number(initial).toFixed(2);
  input.addEventListener("input", () => {
    val.textContent = Number(input.value).toFixed(2);
    onChange(Number(input.value));
  });
  row.append(input, val);
  return row;
}

function bypassButton(id) {
  const row = document.createElement("div");
  row.className = "ctl-row";
  const btn = document.createElement("button");
  btn.textContent = "旁路：关";
  btn.dataset.id = id;
  btn.classList.add("bypass-btn");
  btn.addEventListener("click", () => {
    const next = !engine.isBypassed(id);
    engine.setBypass(id, next);
    btn.textContent = `旁路：${next ? "开" : "关"}`;
    btn.dataset.on = String(next);
    graphView.draw();
  });
  row.appendChild(btn);
  return row;
}

// 暴露给无头测试使用
window.__drum = { engine, graphView, stepView };
