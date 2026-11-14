import {
  BALANCED_FLOWS,
  EDGES,
  NODES,
  OVERLOAD_FLOWS,
  analyzeNetwork,
  clampFlow,
  cloneFlows,
  edgeById,
  findEdgeState,
  findNodeState,
  nodeById,
  simulateNetwork,
  solveBalancedFlows,
} from "./network.js";

const WIDTH = 1000;
const HEIGHT = 640;
const TWO_PI = Math.PI * 2;
const canvas = document.querySelector("#networkCanvas");
const canvasFrame = document.querySelector("#canvasFrame");
const context = canvas.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  flows: cloneFlows(BALANCED_FLOWS),
  scenario: "balanced",
  selectedNode: "w2",
  hoverNode: null,
  hoverEdge: null,
  activeEdge: null,
  drag: null,
  badgeLayout: [],
  analysis: analyzeNetwork(BALANCED_FLOWS),
  simulation: { status: "idle", step: 0, result: null, timer: null },
};

const elements = {
  totalSupply: document.querySelector("#totalSupply"),
  totalDemand: document.querySelector("#totalDemand"),
  balanceTrackFill: document.querySelector("#balanceTrackFill"),
  balanceCaption: document.querySelector("#balanceCaption"),
  balanceDelta: document.querySelector("#balanceDelta"),
  validationPill: document.querySelector("#validationPill"),
  capacityMark: document.querySelector("#capacityMark"),
  conservationMark: document.querySelector("#conservationMark"),
  demandMark: document.querySelector("#demandMark"),
  capacitySummary: document.querySelector("#capacitySummary"),
  conservationSummary: document.querySelector("#conservationSummary"),
  demandSummary: document.querySelector("#demandSummary"),
  warningBanner: document.querySelector("#warningBanner"),
  warningText: document.querySelector("#warningText"),
  fixButton: document.querySelector("#fixButton"),
  nodeCode: document.querySelector("#nodeCode"),
  nodeTypeIcon: document.querySelector("#nodeTypeIcon"),
  nodeName: document.querySelector("#nodeName"),
  nodeTypeLabel: document.querySelector("#nodeTypeLabel"),
  nodeHealth: document.querySelector("#nodeHealth"),
  nodeStock: document.querySelector("#nodeStock"),
  nodeGap: document.querySelector("#nodeGap"),
  nodeInflow: document.querySelector("#nodeInflow"),
  nodeOutflow: document.querySelector("#nodeOutflow"),
  flowBarIn: document.querySelector("#flowBarIn"),
  flowBarOut: document.querySelector("#flowBarOut"),
  nodeNote: document.querySelector("#nodeNote"),
  stepTrack: document.querySelector("#stepTrack"),
  simulationTag: document.querySelector("#simulationTag"),
  simulationStatus: document.querySelector("#simulationStatus"),
  simulationPercent: document.querySelector("#simulationPercent"),
  simulationFlag: document.querySelector("#simulationFlag"),
  simulationFlagStep: document.querySelector("#simulationFlagStep"),
  canvasStatus: document.querySelector("#canvasStatus"),
  canvasStatusText: document.querySelector("#canvasStatusText"),
  exportButton: document.querySelector("#exportButton"),
  topExportButton: document.querySelector("#topExportButton"),
  runButton: document.querySelector("#runButton"),
  runButtonSide: document.querySelector("#runButtonSide"),
  resetButton: document.querySelector("#resetButton"),
  eventFeed: document.querySelector("#eventFeed"),
  toast: document.querySelector("#toast"),
};

const nodeTypeIcon = { factory: "厂", warehouse: "仓", store: "店" };
const nodeTypeLabel = { factory: "生产工厂", warehouse: "区域仓库", store: "零售终端" };

function formatStock(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function currentTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function addFeed(message, alert = false) {
  const row = document.createElement("div");
  row.className = `feed-row${alert ? " is-alert" : ""}`;
  row.innerHTML = `<span>${currentTime()}</span><p></p>`;
  row.querySelector("p").textContent = message;
  elements.eventFeed.prepend(row);
  while (elements.eventFeed.children.length > 3) {
    elements.eventFeed.lastElementChild.remove();
  }
}

let toastTimer = 0;
function showToast(message, danger = false) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-danger", danger);
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

function resetSimulation() {
  window.clearInterval(state.simulation.timer);
  state.simulation = { status: "idle", step: 0, result: null, timer: null };
  elements.simulationFlag.hidden = true;
  elements.simulationTag.textContent = "待运行";
  elements.simulationStatus.textContent = "调整流量后运行十步压力测试";
  elements.simulationPercent.textContent = "0%";
  elements.exportButton.disabled = true;
  elements.topExportButton.disabled = true;
  [...elements.stepTrack.children].forEach((cell) => {
    cell.className = "step-cell";
  });
}

function currentSimulationStock(nodeId) {
  if (state.simulation.status === "complete") {
    return state.simulation.result.finalStocks[nodeId];
  }
  if (state.simulation.status === "running") {
    const step = state.simulation.result.steps[state.simulation.step - 1];
    return step?.stocks[nodeId] ?? nodeById[nodeId].stock;
  }
  return nodeById[nodeId].stock;
}

function setScenarioButton(id) {
  document.querySelectorAll(".scenario-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.scenario === id);
  });
}

function markScenarioCustom() {
  state.scenario = "custom";
  setScenarioButton(null);
}

function refreshAnalysis({ keepSimulation = false } = {}) {
  state.analysis = analyzeNetwork(state.flows);
  if (!keepSimulation) resetSimulation();
  syncDashboard();
}

function applyScenario(scenarioId) {
  const source = scenarioId === "overload" ? OVERLOAD_FLOWS : BALANCED_FLOWS;
  state.flows = cloneFlows(source);
  state.scenario = scenarioId;
  setScenarioButton(scenarioId);
  refreshAnalysis();
  addFeed(scenarioId === "overload"
    ? "超载测试已载入：W-02 → S-01 计划 36 件"
    : "平衡方案已载入，全部线路校验通过", scenarioId === "overload");
  showToast(scenarioId === "overload" ? "已载入超载测试场景" : "已恢复供需平衡方案", scenarioId === "overload");
}

function applyBalancedSolution() {
  const solution = solveBalancedFlows();
  if (solution.maxFlow !== 210) {
    showToast("当前容量下无可行平衡方案", true);
    return;
  }
  state.flows = solution.flows;
  state.scenario = "custom";
  setScenarioButton(null);
  refreshAnalysis();
  addFeed("自动配平完成：210 件需求全部覆盖");
  showToast("网络流配平完成，容量与守恒校验通过");
}

function setupStepTrack() {
  elements.stepTrack.innerHTML = "";
  for (let step = 1; step <= 10; step += 1) {
    const cell = document.createElement("span");
    cell.className = "step-cell";
    cell.textContent = String(step).padStart(2, "0");
    elements.stepTrack.append(cell);
  }
}

function runSimulation() {
  if (state.simulation.status === "running") return;
  resetSimulation();
  const result = simulateNetwork(state.flows, 10);
  state.simulation = { status: "running", step: 0, result, timer: null };
  elements.simulationTag.textContent = "运行中";
  elements.simulationStatus.textContent = "正在计算每日库存与履约变化";
  elements.exportButton.disabled = true;
  elements.topExportButton.disabled = true;
  elements.runButton.disabled = true;
  elements.runButtonSide.disabled = true;
  elements.simulationFlag.hidden = false;
  addFeed("十步模拟启动，正在推演库存变化");

  state.simulation.timer = window.setInterval(() => {
    state.simulation.step += 1;
    const step = state.simulation.step;
    [...elements.stepTrack.children].forEach((cell, index) => {
      cell.className = index < step - 1
        ? "step-cell is-complete"
        : index === step - 1
          ? "step-cell is-running"
          : "step-cell";
    });
    elements.simulationFlagStep.textContent = `${String(step).padStart(2, "0")} / 10`;
    elements.simulationPercent.textContent = `${step * 10}%`;
    elements.simulationStatus.textContent = `第 ${step} 步 · 库存重算完成`;
    syncNodeCard();

    if (step >= 10) {
      window.clearInterval(state.simulation.timer);
      finishSimulation();
    }
  }, reducedMotion ? 110 : 280);
}

function finishSimulation() {
  state.simulation.status = "complete";
  state.simulation.step = 10;
  const { overloadCount } = state.simulation.result;
  elements.simulationTag.textContent = "已完成";
  elements.simulationStatus.textContent = overloadCount
    ? `10 步完成 · ${overloadCount} 条线路仍超载`
    : "10 步完成 · 全网库存稳定";
  elements.simulationFlag.hidden = true;
  [...elements.stepTrack.children].forEach((cell) => {
    cell.className = "step-cell is-complete";
  });
  elements.exportButton.disabled = false;
  elements.topExportButton.disabled = false;
  elements.runButton.disabled = false;
  elements.runButtonSide.disabled = false;
  addFeed(overloadCount
    ? `模拟完成，${overloadCount} 条超载线路需要处理`
    : "模拟完成，十步库存与履约保持稳定", overloadCount > 0);
  showToast(overloadCount ? "十步模拟完成，仍有线路超载" : "十步模拟完成，可导出 PNG", overloadCount > 0);
  syncNodeCard();
}

function selectNode(nodeId) {
  state.selectedNode = nodeId;
  syncNodeCard();
}

function handleFlowChange(edgeId, nextValue, final = false) {
  const value = clampFlow(edgeId, nextValue);
  if (state.flows[edgeId] === value) return;
  state.flows[edgeId] = value;
  markScenarioCustom();
  refreshAnalysis();
  if (final) {
    const edgeState = findEdgeState(state.analysis, edgeId);
    addFeed(
      edgeState.overload
        ? `${edgeState.id.toUpperCase()} 超载 ${edgeState.flow - edgeState.capacity} 件`
        : `线路 ${edgeState.id.toUpperCase()} 流量调整为 ${edgeState.flow} 件`,
      edgeState.overload,
    );
  }
}

setupStepTrack();
syncDashboard();
requestAnimationFrame(renderLoop);

function setMark(element, tone, symbol) {
  element.className = `check-mark${tone === "ok" ? "" : ` is-${tone}`}`;
  element.textContent = symbol;
}

function syncDashboard() {
  const { totals, overloadedEdges, balancedNodes, fulfilledStores, capacityValid, conservationValid, demandValid } = state.analysis;
  const supplyDelta = totals.actualSupply - totals.actualDemand;

  elements.totalSupply.textContent = totals.actualSupply;
  elements.totalDemand.textContent = totals.actualDemand;
  elements.balanceTrackFill.style.width = `${Math.min(100, totals.demandPlan ? (totals.actualDemand / totals.demandPlan) * 100 : 0)}%`;
  elements.balanceTrackFill.style.background = supplyDelta === 0
    ? "linear-gradient(90deg, #58d6ae, #8be3c5)"
    : "linear-gradient(90deg, #d49c52, #e5b96f)";
  elements.balanceCaption.textContent = supplyDelta === 0
    ? "全网总流入与总流出一致"
    : supplyDelta > 0 ? "网络流出高于终端流入" : "终端流入高于网络流出";
  elements.balanceDelta.textContent = `Δ ${supplyDelta > 0 ? "+" : ""}${supplyDelta}`;
  elements.balanceDelta.style.color = supplyDelta === 0 ? "var(--mint)" : "var(--amber)";

  elements.capacitySummary.textContent = capacityValid
    ? "18 / 18 合规"
    : `${18 - overloadedEdges.length} / 18 合规`;
  elements.conservationSummary.textContent = `${balancedNodes.length} / 9 守恒`;
  elements.demandSummary.textContent = `${fulfilledStores.length} / 4 满足`;

  setMark(elements.capacityMark, capacityValid ? "ok" : "danger", capacityValid ? "✓" : "!");
  setMark(elements.conservationMark, conservationValid ? "ok" : "warning", conservationValid ? "✓" : "!");
  setMark(elements.demandMark, demandValid ? "ok" : "warning", demandValid ? "✓" : "!");

  if (overloadedEdges.length > 0) {
    elements.validationPill.textContent = "超载告警";
    elements.validationPill.className = "validation-pill is-danger";
    elements.warningText.textContent = `${overloadedEdges[0].id.toUpperCase()} 超载 ${overloadedEdges[0].flow - overloadedEdges[0].capacity} 件`;
    elements.warningBanner.hidden = false;
  } else if (!conservationValid || !demandValid) {
    elements.validationPill.textContent = "待配平";
    elements.validationPill.className = "validation-pill is-warning";
    elements.warningText.textContent = `${9 - balancedNodes.length} 个节点流入流出未守恒`;
    elements.warningBanner.hidden = false;
  } else {
    elements.validationPill.textContent = "通过";
    elements.validationPill.className = "validation-pill";
    elements.warningBanner.hidden = true;
  }

  elements.canvasStatus.classList.toggle("is-danger", !capacityValid);
  elements.canvasStatusText.textContent = !capacityValid
    ? `${overloadedEdges.length} 条线路超载`
    : conservationValid && demandValid ? "供需平衡" : "待配平";

  syncNodeCard();
}

function incidentOverload(nodeId) {
  return state.analysis.overloadedEdges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}

function syncNodeCard() {
  const node = nodeById[state.selectedNode];
  if (!node) return;
  const nodeState = findNodeState(state.analysis, node.id);
  const stock = currentSimulationStock(node.id);
  const incident = incidentOverload(node.id);

  elements.nodeCode.textContent = node.code;
  elements.nodeName.textContent = node.name;
  elements.nodeTypeIcon.textContent = nodeTypeIcon[node.type];
  elements.nodeTypeLabel.textContent = `${nodeTypeLabel[node.type]} · ${node.sub.split("·").at(-1).trim()}`;
  elements.nodeStock.textContent = formatStock(stock);
  elements.nodeGap.textContent = nodeState.gap;
  elements.nodeInflow.textContent = nodeState.incoming;
  elements.nodeOutflow.textContent = nodeState.outgoing;

  const maxFlow = Math.max(nodeState.incoming, nodeState.outgoing, 1);
  elements.flowBarIn.style.width = `${Math.max(3, (nodeState.incoming / maxFlow) * 100)}%`;
  elements.flowBarOut.style.width = `${Math.max(3, (nodeState.outgoing / maxFlow) * 100)}%`;
  elements.nodeGap.classList.toggle("is-danger", nodeState.gap > 0);
  elements.nodeGap.classList.toggle("is-warning", nodeState.gap === 0 && !nodeState.balanced);

  let health = "守恒";
  let tone = "";
  if (incident.length) {
    health = "容量告警";
    tone = "is-danger";
  } else if (nodeState.gap > 0) {
    health = "存在缺口";
    tone = "is-danger";
  } else if (!nodeState.balanced) {
    health = "流入盈余";
    tone = "is-warning";
  }
  elements.nodeHealth.textContent = health;
  elements.nodeHealth.className = `node-health ${tone}`;

  let note = "";
  if (node.type === "factory") {
    note = nodeState.balanced
      ? `产出 ${node.production} 件全部出库，工厂端供需闭合。`
      : nodeState.gap > 0
        ? `仍有 ${nodeState.gap} 件产能未分配至下游。`
        : `出库量超出计划产能 ${nodeState.surplus} 件。`;
  } else if (node.type === "warehouse") {
    note = nodeState.balanced
      ? `流入与流出一致，仓内周转处于稳定状态。`
      : nodeState.gap > 0
        ? `流出高于流入 ${nodeState.gap} 件，正在消耗安全库存。`
        : `流入高出流出 ${nodeState.surplus} 件，库存将逐步累积。`;
  } else {
    note = nodeState.balanced
      ? `计划到货覆盖 ${node.demand} 件需求，终端履约完整。`
      : nodeState.gap > 0
        ? `计划到货不足，当前仍有 ${nodeState.gap} 件需求缺口。`
        : `到货超过需求 ${nodeState.surplus} 件，终端库存将增加。`;
  }
  if (state.simulation.status === "complete") {
    const delta = state.simulation.result.variance[node.id];
    note += ` 十步后库存 ${delta === 0 ? "持平" : `${delta > 0 ? "+" : ""}${formatStock(delta)} 件`}。`;
  }
  elements.nodeNote.textContent = note;
}

function edgeCurve(edge) {
  const from = nodeById[edge.from];
  const to = nodeById[edge.to];
  const start = { x: from.x + 34, y: from.y };
  const end = { x: to.x - 36, y: to.y };
  const reach = (end.x - start.x) * 0.47;
  return {
    start,
    end,
    c1: { x: start.x + reach, y: start.y },
    c2: { x: end.x - reach, y: end.y },
  };
}

function curvePoint(curve, t) {
  const inv = 1 - t;
  return {
    x: inv ** 3 * curve.start.x
      + 3 * inv ** 2 * t * curve.c1.x
      + 3 * inv * t ** 2 * curve.c2.x
      + t ** 3 * curve.end.x,
    y: inv ** 3 * curve.start.y
      + 3 * inv ** 2 * t * curve.c1.y
      + 3 * inv * t ** 2 * curve.c2.y
      + t ** 3 * curve.end.y,
  };
}

function curveTangent(curve, t) {
  const inv = 1 - t;
  return {
    x: 3 * inv ** 2 * (curve.c1.x - curve.start.x)
      + 6 * inv * t * (curve.c2.x - curve.c1.x)
      + 3 * t ** 2 * (curve.end.x - curve.c2.x),
    y: 3 * inv ** 2 * (curve.c1.y - curve.start.y)
      + 6 * inv * t * (curve.c2.y - curve.c1.y)
      + 3 * t ** 2 * (curve.end.y - curve.c2.y),
  };
}

function buildBadgeLayout() {
  const width = 62;
  const height = 20;
  const items = state.analysis.edges.map((edge) => {
    const curve = edgeCurve(edge);
    const anchor = curvePoint(curve, 0.5);
    return { edge, curve, anchor, width, height, x: anchor.x - width / 2, y: anchor.y - height / 2 };
  });

  [items.filter((item) => item.edge.from.startsWith("f")), items.filter((item) => item.edge.from.startsWith("w"))]
    .forEach((group) => {
      group.sort((a, b) => a.anchor.y - b.anchor.y);
      let floor = -Infinity;
      group.forEach((item) => {
        const desired = item.anchor.y - height / 2;
        item.y = Math.max(desired, floor);
        floor = item.y + height + 3;
      });
    });
  return items;
}

function drawStageHeader(ctx, x, number, title, subtitle) {
  ctx.save();
  ctx.font = "500 8px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "rgba(139, 227, 197, 0.58)";
  ctx.fillText(number, x, 51);
  ctx.fillStyle = "rgba(220, 234, 231, 0.8)";
  ctx.font = "500 11px 'IBM Plex Sans', 'Noto Sans SC', sans-serif";
  ctx.fillText(title, x + 19, 52);
  ctx.fillStyle = "rgba(106, 126, 130, 0.7)";
  ctx.font = "400 7px 'IBM Plex Mono', monospace";
  ctx.fillText(subtitle, x + 19, 64);
  ctx.restore();
}

function drawBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#0e161b");
  gradient.addColorStop(0.52, "#0c1318");
  gradient.addColorStop(1, "#0b1116");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(500, 320, 25, 500, 320, 410);
  glow.addColorStop(0, "rgba(69, 130, 112, 0.045)");
  glow.addColorStop(0.5, "rgba(43, 74, 74, 0.018)");
  glow.addColorStop(1, "rgba(9, 14, 18, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.strokeStyle = "rgba(160, 191, 189, 0.035)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 20; x < WIDTH; x += 40) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, HEIGHT);
  }
  for (let y = 20; y < HEIGHT; y += 40) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(WIDTH, y + 0.5);
  }
  ctx.stroke();

  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = "rgba(148, 179, 181, 0.1)";
  ctx.beginPath();
  ctx.moveTo(309, 78);
  ctx.lineTo(309, 596);
  ctx.moveTo(687, 78);
  ctx.lineTo(687, 596);
  ctx.stroke();
  ctx.restore();
}

function drawChevron(ctx, curve, t, color, size = 3.4) {
  const point = curvePoint(curve, t);
  const tangent = curveTangent(curve, t);
  const angle = Math.atan2(tangent.y, tangent.x);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.72, size * 0.74);
  ctx.lineTo(-size * 0.4, 0);
  ctx.lineTo(-size * 0.72, -size * 0.74);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawEdges(ctx, time) {
  state.analysis.edges.forEach((edge) => {
    const curve = edgeCurve(edge);
    const overloaded = edge.overload;
    const warning = edge.nearCapacity;
    const color = overloaded
      ? "rgba(255, 117, 108, 0.94)"
      : warning ? "rgba(229, 185, 111, 0.72)" : "rgba(102, 213, 182, 0.62)";

    ctx.save();
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(curve.start.x, curve.start.y);
    ctx.bezierCurveTo(curve.c1.x, curve.c1.y, curve.c2.x, curve.c2.y, curve.end.x, curve.end.y);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.34)";
    ctx.lineWidth = 4.5 + Math.min(edge.ratio, 1) * 2.4;
    ctx.stroke();

    if (overloaded) {
      ctx.shadowColor = "rgba(255, 95, 85, 0.7)";
      ctx.shadowBlur = 12;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = overloaded ? 2.4 : 0.9 + Math.min(edge.ratio, 1) * 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (overloaded) {
      ctx.setLineDash([5, 6]);
      ctx.lineDashOffset = -time * 0.025;
      ctx.strokeStyle = "rgba(255, 203, 199, 0.72)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    const arrowColor = overloaded
      ? "rgba(255, 143, 136, 0.92)"
      : warning ? "rgba(229, 185, 111, 0.85)" : "rgba(126, 229, 199, 0.82)";
    drawChevron(ctx, curve, 0.27, arrowColor);
    drawChevron(ctx, curve, 0.78, arrowColor);
  });
}

function drawBadges(ctx, time) {
  state.badgeLayout = buildBadgeLayout();
  state.badgeLayout.forEach((item) => {
    const { edge, anchor, width, height, x, y } = item;
    const hovered = state.hoverEdge === edge.id;
    const active = state.activeEdge === edge.id;
    const shifted = Math.abs((y + height / 2) - anchor.y) > 2;

    if (shifted) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(x + width / 2, y + height / 2);
      ctx.strokeStyle = "rgba(142, 175, 175, 0.18)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    if (edge.overload) {
      ctx.shadowColor = "rgba(255, 103, 94, 0.35)";
      ctx.shadowBlur = hovered || active ? 14 : 8;
    }
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 6);
    ctx.fillStyle = edge.overload
      ? "rgba(51, 23, 24, 0.96)"
      : active || hovered ? "rgba(31, 47, 52, 0.98)" : "rgba(16, 26, 31, 0.94)";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = edge.overload
      ? "rgba(255, 117, 108, 0.62)"
      : active || hovered ? "rgba(139, 227, 197, 0.48)" : "rgba(151, 181, 181, 0.14)";
    ctx.lineWidth = edge.overload ? 1 : 0.8;
    ctx.stroke();

    const flowText = String(edge.flow);
    ctx.font = "600 9px 'IBM Plex Mono', monospace";
    const flowWidth = ctx.measureText(flowText).width;
    const capacityText = `/${edge.capacity}`;
    ctx.font = "400 7.5px 'IBM Plex Mono', monospace";
    const capacityWidth = ctx.measureText(capacityText).width;
    const totalWidth = flowWidth + capacityWidth;
    const startX = x + (width - totalWidth) / 2;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "600 9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = edge.overload ? "#ff9d96" : "#e0ece9";
    ctx.fillText(flowText, startX, y + height / 2 + 0.5);
    ctx.font = "400 7.5px 'IBM Plex Mono', monospace";
    ctx.fillStyle = edge.overload ? "rgba(255, 157, 150, 0.65)" : "rgba(142, 164, 165, 0.72)";
    ctx.fillText(capacityText, startX + flowWidth, y + height / 2 + 0.7);

    if (edge.overload) {
      const pulse = reducedMotion ? 1 : 0.72 + Math.sin(time * 0.006) * 0.28;
      ctx.beginPath();
      ctx.arc(x + width - 2.5, y + 2.5, 2.2, 0, TWO_PI);
      ctx.fillStyle = `rgba(255, 117, 108, ${pulse})`;
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawNodeGlyph(ctx, node, color) {
  ctx.save();
  ctx.translate(node.x, node.y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.35;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (node.type === "factory") {
    ctx.beginPath();
    ctx.moveTo(-10, 8);
    ctx.lineTo(-10, -2);
    ctx.lineTo(-3.5, 1.5);
    ctx.lineTo(-3.5, -2);
    ctx.lineTo(3, 1.5);
    ctx.lineTo(3, -4);
    ctx.lineTo(9, -4);
    ctx.lineTo(9, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(-7.5, 4, 2.1, 4);
    ctx.fillRect(-2.5, 4, 2.1, 4);
    ctx.fillRect(2.5, 4, 2.1, 4);
  } else if (node.type === "warehouse") {
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(0, -8);
    ctx.lineTo(10, 0);
    ctx.lineTo(8, 0);
    ctx.lineTo(8, 8);
    ctx.lineTo(-8, 8);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 3);
    ctx.lineTo(-5, 8);
    ctx.moveTo(0, 3);
    ctx.lineTo(0, 8);
    ctx.moveTo(5, 3);
    ctx.lineTo(5, 8);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.lineTo(-7, -8);
    ctx.lineTo(7, -8);
    ctx.lineTo(9, -3);
    ctx.lineTo(9, 8);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, -3);
    ctx.lineTo(-5, 8);
    ctx.moveTo(0, -3);
    ctx.lineTo(0, 8);
    ctx.moveTo(6, -3);
    ctx.lineTo(5, 8);
    ctx.stroke();
    ctx.fillRect(-4, 3, 3, 3);
  }
  ctx.restore();
}

function drawNodes(ctx, time) {
  state.analysis.nodes.forEach((node) => {
    const selected = state.selectedNode === node.id;
    const hovered = state.hoverNode === node.id;
    const incident = incidentOverload(node.id);
    const danger = incident.length > 0 || node.gap > 0;
    const warning = !danger && !node.balanced;
    const color = danger
      ? "#ff8b83"
      : node.type === "factory" ? "#8be3c5" : node.type === "warehouse" ? "#8cc3e8" : "#dfbd7e";
    const typeFill = node.type === "factory"
      ? "rgba(48, 98, 83, 0.34)"
      : node.type === "warehouse" ? "rgba(44, 81, 101, 0.28)" : "rgba(98, 77, 44, 0.24)";

    ctx.save();
    if (selected || hovered) {
      const glow = ctx.createRadialGradient(node.x, node.y, 25, node.x, node.y, 49);
      glow.addColorStop(0, danger ? "rgba(255, 117, 108, 0.12)" : "rgba(106, 224, 190, 0.1)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 50, 0, TWO_PI);
      ctx.fill();
    }

    if (selected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 37, 0, TWO_PI);
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = reducedMotion ? 0 : -time * 0.012;
      ctx.strokeStyle = danger ? "rgba(255, 117, 108, 0.48)" : "rgba(139, 227, 197, 0.42)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const fill = ctx.createRadialGradient(node.x - 8, node.y - 11, 2, node.x, node.y, 31);
    fill.addColorStop(0, node.type === "store" ? "rgba(88, 77, 55, 0.9)" : "rgba(42, 67, 66, 0.92)");
    fill.addColorStop(0.7, "rgba(17, 28, 32, 0.98)");
    fill.addColorStop(1, "rgba(12, 21, 25, 1)");
    ctx.beginPath();
    ctx.arc(node.x, node.y, 29, 0, TWO_PI);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = danger
      ? "rgba(255, 117, 108, 0.88)"
      : selected || hovered ? "rgba(139, 227, 197, 0.5)" : "rgba(134, 165, 166, 0.23)";
    ctx.lineWidth = danger ? 1.7 : 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(node.x, node.y, 24.5, 0, TWO_PI);
    ctx.strokeStyle = typeFill;
    ctx.lineWidth = 1;
    ctx.stroke();
    drawNodeGlyph(ctx, node, danger ? "#ffb0aa" : color);

    const statusColor = danger ? "#ff756c" : warning ? "#e5b96f" : "#58d6ae";
    ctx.beginPath();
    ctx.arc(node.x + 21, node.y - 21, 3.1, 0, TWO_PI);
    ctx.fillStyle = "#0e171b";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(node.x + 21, node.y - 21, 2, 0, TWO_PI);
    ctx.fillStyle = statusColor;
    ctx.fill();
    if (danger) {
      const pulse = reducedMotion ? 1 : 0.62 + Math.sin(time * 0.006) * 0.38;
      ctx.beginPath();
      ctx.arc(node.x + 21, node.y - 21, 5.5, 0, TWO_PI);
      ctx.strokeStyle = `rgba(255, 117, 108, ${pulse * 0.35})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "500 11px 'IBM Plex Sans', 'Noto Sans SC', sans-serif";
    ctx.fillStyle = selected || hovered ? "#eff7f5" : "rgba(219, 232, 229, 0.9)";
    ctx.fillText(node.name, node.x, node.y + 45);
    ctx.font = "500 7px 'IBM Plex Mono', monospace";
    ctx.fillStyle = danger ? "rgba(255, 154, 147, 0.72)" : "rgba(108, 132, 135, 0.8)";
    ctx.fillText(node.code, node.x, node.y + 57);
    ctx.restore();
  });
}

function paintScene(ctx, time, exportMode = false) {
  drawBackground(ctx);
  drawStageHeader(ctx, 27, "01", "生产供给", "PRODUCTION");
  drawStageHeader(ctx, 369, "02", "区域仓储", "WAREHOUSING");
  drawStageHeader(ctx, 733, "03", "零售履约", "FULFILLMENT");
  drawEdges(ctx, time);
  drawNodes(ctx, time);
  drawBadges(ctx, time);

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = "400 7px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "rgba(103, 125, 128, 0.62)";
  ctx.textAlign = "left";
  ctx.fillText("FLOW / CAPACITY", 28, 611);
  ctx.fillStyle = "rgba(139, 227, 197, 0.55)";
  ctx.fillText("●", 128, 610);
  ctx.fillStyle = "rgba(103, 125, 128, 0.62)";
  ctx.fillText("LIVE NODE", 138, 611);
  ctx.textAlign = "right";
  const stamp = state.simulation.status === "complete"
    ? `10-STEP SIMULATION · ${state.analysis.capacityValid ? "CAPACITY OK" : "OVERLOAD"}`
    : "PLAN VIEW · EDITABLE FLOWS";
  ctx.fillText(stamp, 972, 611);
  if (exportMode) {
    ctx.fillStyle = "rgba(139, 227, 197, 0.72)";
    ctx.fillText("NEXUS SUPPLY NETWORK · EXPORTED SNAPSHOT", 972, 623);
  }
  ctx.restore();
}

function resizeCanvas() {
  const rect = canvasFrame.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width: rect.width, height: rect.height, dpr };
}

function renderLoop(time = 0) {
  const { width, height, dpr } = resizeCanvas();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const scale = Math.min(width / WIDTH, height / HEIGHT);
  const offsetX = (width - WIDTH * scale) / 2;
  const offsetY = (height - HEIGHT * scale) / 2;
  context.save();
  context.translate(offsetX, offsetY);
  context.scale(scale, scale);
  paintScene(context, time);
  context.restore();
  requestAnimationFrame(renderLoop);
}

function toLogicalPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
  const offsetX = (rect.width - WIDTH * scale) / 2;
  const offsetY = (rect.height - HEIGHT * scale) / 2;
  return {
    x: (event.clientX - rect.left - offsetX) / scale,
    y: (event.clientY - rect.top - offsetY) / scale,
  };
}

function hitBadge(point) {
  return state.badgeLayout.find((item) => (
    point.x >= item.x
    && point.x <= item.x + item.width
    && point.y >= item.y
    && point.y <= item.y + item.height
  ));
}

function hitNode(point) {
  return NODES.find((node) => Math.hypot(point.x - node.x, point.y - node.y) <= 33);
}

function beginDrag(event) {
  const point = toLogicalPoint(event);
  const badge = hitBadge(point);
  if (badge) {
    event.preventDefault();
    state.drag = {
      edgeId: badge.edge.id,
      startY: point.y,
      startValue: state.flows[badge.edge.id],
    };
    state.activeEdge = badge.edge.id;
    state.hoverEdge = badge.edge.id;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "ns-resize";
    return;
  }
  const node = hitNode(point);
  if (node) {
    selectNode(node.id);
    state.activeEdge = null;
    addFeed(`已查看节点 ${node.code} ${node.name}`);
  }
}

function movePointer(event) {
  const point = toLogicalPoint(event);
  if (state.drag) {
    event.preventDefault();
    const value = state.drag.startValue + (state.drag.startY - point.y) * 0.42;
    handleFlowChange(state.drag.edgeId, value);
    return;
  }
  const badge = hitBadge(point);
  const node = hitNode(point);
  state.hoverEdge = badge?.edge.id ?? null;
  state.hoverNode = node?.id ?? null;
  canvas.style.cursor = badge ? "ns-resize" : node ? "pointer" : "default";
}

function endDrag(event) {
  if (!state.drag) return;
  const edgeId = state.drag.edgeId;
  const edgeState = findEdgeState(state.analysis, edgeId);
  state.drag = null;
  state.activeEdge = null;
  canvas.style.cursor = state.hoverEdge ? "ns-resize" : "default";
  if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  if (edgeState.overload) {
    showToast(`${edgeState.id.toUpperCase()} 已超载 ${edgeState.flow - edgeState.capacity} 件`, true);
  }
  addFeed(
    edgeState.overload
      ? `${edgeState.id.toUpperCase()} 超载 ${edgeState.flow - edgeState.capacity} 件`
      : `线路流量更新为 ${edgeState.flow} / ${edgeState.capacity} 件`,
    edgeState.overload,
  );
}

function exportPng() {
  if (state.simulation.status !== "complete") {
    showToast("请先运行十步模拟再导出", true);
    return;
  }
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 2000;
  exportCanvas.height = 1280;
  const exportContext = exportCanvas.getContext("2d");
  exportContext.scale(2, 2);
  paintScene(exportContext, performance.now(), true);

  exportContext.save();
  exportContext.beginPath();
  exportContext.roundRect(16, 16, 968, 608, 14);
  exportContext.strokeStyle = "rgba(139, 227, 197, 0.18)";
  exportContext.lineWidth = 1;
  exportContext.stroke();
  exportContext.restore();

  exportCanvas.toBlob((blob) => {
    if (!blob) {
      showToast("PNG 导出失败，请重试", true);
      return;
    }
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    link.href = URL.createObjectURL(blob);
    link.download = `nexus-supply-network-${stamp}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    showToast("网络快照 PNG 已导出");
    addFeed("十步模拟快照已导出为 PNG");
  }, "image/png");
}

canvas.addEventListener("pointerdown", beginDrag);
canvas.addEventListener("pointermove", movePointer);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => {
  if (!state.drag) {
    state.hoverEdge = null;
    state.hoverNode = null;
  }
});

document.querySelectorAll(".scenario-button").forEach((button) => {
  button.addEventListener("click", () => applyScenario(button.dataset.scenario));
});
elements.runButton.addEventListener("click", runSimulation);
elements.runButtonSide.addEventListener("click", runSimulation);
elements.exportButton.addEventListener("click", exportPng);
elements.topExportButton.addEventListener("click", exportPng);
elements.resetButton.addEventListener("click", () => applyScenario("balanced"));
elements.fixButton.addEventListener("click", applyBalancedSolution);

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
    event.preventDefault();
    exportPng();
  }
});
