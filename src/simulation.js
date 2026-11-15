import {
  EDGE_BY_ID,
  NODE_BY_ID,
  findPath,
  getEdge,
  getNode,
  validateStops,
} from "./graph.js";

export const FIXED_SCENARIO = Object.freeze({
  id: "fixed",
  name: "四舱交班",
  scriptedFaultAt: 8.6,
  pods: Object.freeze([
    Object.freeze({
      id: "alpha",
      name: "ALPHA-01",
      color: "#8ff0c7",
      origin: "dawn",
      stops: Object.freeze(["ridge", "dome"]),
      priority: 2,
    }),
    Object.freeze({
      id: "beta",
      name: "BETA-02",
      color: "#ffc36c",
      origin: "deep",
      stops: Object.freeze(["tide", "ember"]),
      priority: 1,
    }),
    Object.freeze({
      id: "gamma",
      name: "GAMMA-03",
      color: "#7bc8ef",
      origin: "ridge",
      stops: Object.freeze(["deep", "dawn"]),
      priority: 4,
    }),
    Object.freeze({
      id: "delta",
      name: "DELTA-04",
      color: "#f0a0c8",
      origin: "dome",
      stops: Object.freeze(["dawn", "ember"]),
      priority: 3,
    }),
  ]),
});

export const WRONG_ROUTE_SCENARIO = Object.freeze({
  id: "conflict-test",
  name: "错误线路 / 对向争用",
  scriptedFaultAt: null,
  pods: Object.freeze([
    Object.freeze({
      id: "alpha",
      name: "ALPHA-01",
      color: "#8ff0c7",
      origin: "dawn",
      stops: Object.freeze(["ridge"]),
      priority: 1,
    }),
    Object.freeze({
      id: "beta",
      name: "BETA-02",
      color: "#ffc36c",
      origin: "deep",
      stops: Object.freeze(["ember"]),
      priority: 2,
    }),
    Object.freeze({
      id: "gamma",
      name: "GAMMA-03",
      color: "#7bc8ef",
      origin: "ridge",
      stops: Object.freeze(["dawn"]),
      priority: 9,
    }),
    Object.freeze({
      id: "delta",
      name: "DELTA-04",
      color: "#f0a0c8",
      origin: "dome",
      stops: Object.freeze(["tide"]),
      priority: 3,
    }),
  ]),
});

const CENTRAL_EDGE_IDS = new Set([
  "northeast--northwest",
  "northeast--south",
  "northwest--south",
]);

function clonePod(pod) {
  return {
    ...pod,
    stops: [...pod.stops],
    currentNode: pod.origin,
    nextNode: null,
    currentEdge: null,
    progress: 0,
    edgeIndex: 0,
    stopIndex: 0,
    state: "ready",
    legNodes: [],
    legEdges: [],
    dwellRemaining: 0,
    waitStartedAt: null,
    waitEdgeId: null,
    waitLogged: false,
    replanPending: false,
    completedAt: null,
  };
}

function publicPod(pod) {
  const target = pod.stops[pod.stopIndex] ?? null;
  return {
    id: pod.id,
    name: pod.name,
    color: pod.color,
    origin: pod.origin,
    stops: [...pod.stops],
    priority: pod.priority,
    state: pod.state,
    currentNode: pod.currentNode,
    nextNode: pod.nextNode,
    currentEdge: pod.currentEdge,
    progress: pod.progress,
    stopIndex: pod.stopIndex,
    targetStop: target,
    waitStartedAt: pod.waitStartedAt,
    completedAt: pod.completedAt,
  };
}

export class TransitSimulation {
  constructor({ scenario = FIXED_SCENARIO, autoRepair = true, repairAfter = 9 } = {}) {
    this.scenario = scenario;
    this.autoRepair = autoRepair;
    this.autoRepairAfter = repairAfter;
    this.pods = scenario.pods.map(clonePod);
    this.podById = new Map(this.pods.map((pod) => [pod.id, pod]));
    this.occupancy = new Map();
    this.blockedEdges = new Set();
    this.elapsed = 0;
    this.running = false;
    this.paused = false;
    this.status = "ready";
    this.events = [];
    this.eventSequence = 0;
    this.scriptedFaultDone = scenario.scriptedFaultAt == null;
    this.fault = null;
    this.repairCountdown = 0;
    this.listeners = new Set();
    this.metrics = {
      completed: 0,
      reroutes: 0,
      yields: 0,
      headOnHolds: 0,
      faults: 0,
      deadlockEvents: 0,
    };
    this.conflictKeys = new Set();
    this.pendingFault = false;
    this.emit(
      "info",
      `场景载入：${scenario.name} / ${this.pods.length} 舱 / ${this.pods.reduce((sum, pod) => sum + pod.stops.length, 0)} 个运输节点`,
      "system",
    );
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, message, podId = null, extra = {}) {
    const event = {
      id: ++this.eventSequence,
      time: this.elapsed,
      type,
      level: extra.level ?? "info",
      podId,
      message,
      ...extra,
    };
    this.events.push(event);
    if (this.events.length > 180) this.events.shift();
    for (const listener of this.listeners) listener(event);
    return event;
  }

  start() {
    if (this.status === "success") return false;
    this.running = true;
    this.paused = false;
    this.status = "running";
    this.emit("info", "调度开始，自动寻径与区间独占已启用", "system");
    for (const pod of this.pods.slice().sort((a, b) => b.priority - a.priority)) {
      if (pod.state === "ready") this.beginLeg(pod);
    }
    return true;
  }

  pause() {
    if (!this.running || this.status === "success") return;
    this.paused = !this.paused;
    this.emit(
      "info",
      this.paused ? "调度已暂停，所有舱保持在当前区间" : "调度恢复",
      "system",
    );
  }

  setPriority(podId, priority) {
    const pod = this.podById.get(podId);
    if (!pod) return;
    pod.priority = Math.max(1, Math.min(9, Number(priority) || 1));
  }

  setStops(podId, stops) {
    const pod = this.podById.get(podId);
    if (!pod || this.running) return false;
    const error = validateStops(pod.origin, stops);
    if (error) return false;
    pod.stops = [...stops];
    return true;
  }

  step(dt) {
    if (!this.running || this.paused || this.status === "success") return;
    const delta = Math.max(0, Math.min(Number(dt) || 0, 0.25));
    if (delta === 0) return;
    this.elapsed += delta;

    this.maybeTriggerScriptedFault();
    this.updateFaultTimer(delta);

    for (const pod of this.pods.slice().sort((a, b) => b.priority - a.priority)) {
      this.updatePod(pod, delta);
    }

    if (this.metrics.completed === this.pods.length) {
      this.finishSuccess();
    }
  }

  updatePod(pod, dt) {
    if (pod.state === "faulted" || pod.state === "complete" || pod.state === "stranded") {
      return;
    }

    if (pod.state === "moving") {
      this.advancePod(pod, dt);
      return;
    }

    if (pod.state === "dwelling") {
      pod.dwellRemaining -= dt;
      if (pod.dwellRemaining <= 0) {
        pod.dwellRemaining = 0;
        this.beginLeg(pod);
      }
      return;
    }

    if (pod.state === "ready" || pod.state === "waiting") {
      if (pod.replanPending) {
        pod.replanPending = false;
        this.replanFromNode(pod, "故障区段绕行");
      } else if (pod.legNodes.length > 0) {
        this.tryDepart(pod);
      } else {
        this.beginLeg(pod);
      }
    }
  }

  beginLeg(pod) {
    if (pod.stopIndex >= pod.stops.length) {
      this.completePod(pod);
      return;
    }

    const target = pod.stops[pod.stopIndex];
    if (pod.currentNode === target) {
      this.arriveTaskNode(pod, target);
      return;
    }

    const path = findPath(pod.currentNode, target, { blockedEdges: this.blockedEdges });
    if (!path) {
      pod.state = "stranded";
      pod.legNodes = [];
      pod.legEdges = [];
      this.emit(
        "danger",
        `${pod.name} 在 ${getNode(pod.currentNode)?.name ?? "未知节点"} 找不到可用路径；等待故障区段恢复`,
        pod.id,
        { level: "danger" },
      );
      return;
    }

    pod.legNodes = path.nodes;
    pod.legEdges = path.edges;
    pod.edgeIndex = 0;
    pod.replanPending = false;
    pod.state = "waiting";
    this.tryDepart(pod);
  }

  replanFromNode(pod, reason = "重新寻径") {
    if (pod.state === "faulted" || pod.state === "complete") return;
    const oldSignature = pod.legEdges.join("|");
    const target = pod.stops[pod.stopIndex];
    if (!target) return;

    const path = findPath(pod.currentNode, target, { blockedEdges: this.blockedEdges });
    if (!path) {
      pod.state = "stranded";
      pod.legNodes = [];
      pod.legEdges = [];
      return;
    }

    if (oldSignature && oldSignature !== path.edges.join("|")) {
      this.metrics.reroutes += 1;
      this.emit(
        "warn",
        `${pod.name} 改道：${reason}，备用路径 ${path.edges.length} 区间`,
        pod.id,
        { level: "warn", edgeIds: path.edges },
      );
    }

    pod.legNodes = path.nodes;
    pod.legEdges = path.edges;
    pod.edgeIndex = 0;
    pod.replanPending = false;
    pod.state = "waiting";
    this.tryDepart(pod);
  }

  tryDepart(pod) {
    if (pod.stopIndex >= pod.stops.length) {
      this.completePod(pod);
      return;
    }

    if (!pod.legNodes.length || pod.edgeIndex >= pod.legNodes.length - 1) {
      if (pod.currentNode === pod.stops[pod.stopIndex]) {
        this.arriveTaskNode(pod, pod.stops[pod.stopIndex]);
      } else {
        this.beginLeg(pod);
      }
      return;
    }

    const from = pod.legNodes[pod.edgeIndex];
    const to = pod.legNodes[pod.edgeIndex + 1];
    const edge = getEdge(from, to);
    if (!edge) {
      this.replanFromNode(pod, "线路数据缺失");
      return;
    }

    if (this.blockedEdges.has(edge.id)) {
      this.replanFromNode(pod, "前方区间闭锁");
      return;
    }

    const holder = this.occupancy.get(edge.id);
    if (holder && holder !== pod.id) {
      this.waitForEdge(pod, edge, holder);
      return;
    }

    if (pod.waitStartedAt != null) {
      const waited = this.elapsed - pod.waitStartedAt;
      if (waited > 0.35) {
        this.metrics.yields += 1;
        this.emit(
          "info",
          `${pod.name} 等待 ${waited.toFixed(1)}s 后获得 ${this.edgeLabel(edge)} 通行权`,
          pod.id,
        );
      }
      pod.waitStartedAt = null;
      pod.waitEdgeId = null;
      pod.waitLogged = false;
    }

    this.occupancy.set(edge.id, pod.id);
    pod.currentEdge = edge.id;
    pod.currentNode = from;
    pod.nextNode = to;
    pod.progress = 0;
    pod.state = "moving";
  }

  waitForEdge(pod, edge, holderId) {
    const holder = this.podById.get(holderId);
    pod.state = "waiting";
    pod.waitEdgeId = edge.id;
    if (pod.waitStartedAt == null) pod.waitStartedAt = this.elapsed;

    const opposed =
      holder &&
      holder.currentEdge === edge.id &&
      holder.state === "moving" &&
      holder.nextNode === pod.currentNode;
    const conflictKey = `${edge.id}:${pod.id}:${opposed ? "opposed" : "busy"}`;
    if (opposed && !this.conflictKeys.has(conflictKey)) {
      this.conflictKeys.add(conflictKey);
      this.metrics.headOnHolds += 1;
      this.emit(
        "danger",
        `交会闭锁：${pod.name} 在 ${getNode(pod.currentNode)?.name} 等待 ${holder.name} 驶离 ${this.edgeLabel(edge)}`,
        pod.id,
        { level: "warn", edgeId: edge.id, holderId },
      );
    } else if (!pod.waitLogged && !this.conflictKeys.has(conflictKey)) {
      this.conflictKeys.add(conflictKey);
      pod.waitLogged = true;
      this.emit(
        "warn",
        `${pod.name} 区间等待：${this.edgeLabel(edge)} 由 ${holder?.name ?? "未知舱"} 占用`,
        pod.id,
        { level: "warn", edgeId: edge.id, holderId },
      );
    }
  }

  advancePod(pod, dt) {
    const edge = EDGE_BY_ID[pod.currentEdge];
    if (!edge) return;
    pod.progress = Math.min(1, pod.progress + dt / edge.duration);
    if (pod.progress < 1) return;

    const arrivedAt = pod.nextNode;
    const completedEdge = pod.currentEdge;
    const nextIndex = pod.edgeIndex + 1;
    const hasNextEdge = nextIndex < pod.legNodes.length - 1;

    if (hasNextEdge) {
      const followingEdge = getEdge(pod.legNodes[nextIndex], pod.legNodes[nextIndex + 1]);
      const followingHolder = followingEdge ? this.occupancy.get(followingEdge.id) : null;

      if (
        followingEdge &&
        !this.blockedEdges.has(followingEdge.id) &&
        (!followingHolder || followingHolder === pod.id)
      ) {
        this.occupancy.delete(completedEdge);
        this.occupancy.set(followingEdge.id, pod.id);
        pod.currentEdge = followingEdge.id;
        pod.currentNode = arrivedAt;
        pod.nextNode = pod.legNodes[nextIndex + 1];
        pod.edgeIndex = nextIndex;
        pod.progress = 0;
        pod.state = "moving";
        return;
      }

      this.occupancy.delete(completedEdge);
      pod.currentNode = arrivedAt;
      pod.currentEdge = null;
      pod.nextNode = null;
      pod.edgeIndex = nextIndex;
      pod.progress = 0;
      pod.state = "waiting";

      if (pod.waitStartedAt == null) pod.waitStartedAt = this.elapsed;
      if (followingEdge && this.blockedEdges.has(followingEdge.id)) {
        this.replanFromNode(pod, "前方故障区段闭锁");
        return;
      }
      if (followingEdge) {
        this.waitForEdge(pod, followingEdge, followingHolder ?? "unknown");
      }
      return;
    }

    this.occupancy.delete(completedEdge);
    pod.currentNode = arrivedAt;
    pod.currentEdge = null;
    pod.nextNode = null;
    pod.progress = 0;
    pod.edgeIndex = pod.legNodes.length - 1;
    this.arriveTaskNode(pod, arrivedAt);
  }

  arriveTaskNode(pod, nodeId) {
    const expected = pod.stops[pod.stopIndex];
    if (nodeId === expected) {
      pod.stopIndex += 1;
      if (pod.stopIndex >= pod.stops.length) {
        this.completePod(pod);
        return;
      }
      pod.state = "dwelling";
      pod.dwellRemaining = 0.72;
      this.emit(
        "success",
        `${pod.name} 到达 ${getNode(nodeId)?.name ?? nodeId}，开始上下客`,
        pod.id,
        { level: "success" },
      );
      return;
    }
    this.beginLeg(pod);
  }

  completePod(pod) {
    if (pod.state === "complete") return;
    this.occupancy.delete(pod.currentEdge);
    pod.currentEdge = null;
    pod.nextNode = null;
    pod.progress = 0;
    pod.state = "complete";
    pod.completedAt = this.elapsed;
    pod.waitStartedAt = null;
    this.metrics.completed += 1;
    this.emit(
      "success",
      `${pod.name} 完成全部 ${pod.stops.length} 个运输节点`,
      pod.id,
      { level: "success" },
    );
  }

  finishSuccess() {
    if (this.status === "success") return;
    this.status = "success";
    this.running = false;
    this.emit(
      "success",
      "任务完成：4 / 4 舱到站，正面相遇 0 次，区间全部释放",
      "system",
      {
        level: "success",
        metrics: { ...this.metrics },
      },
    );
  }

  maybeTriggerScriptedFault() {
    if (this.scriptedFaultDone || this.scenario.id !== "fixed" || this.fault) return;
    if (this.elapsed < this.scenario.scriptedFaultAt) return;

    const candidate = this.pickFaultCandidate();
    if (!candidate) {
      this.pendingFault = true;
      return;
    }
    this.scriptedFaultDone = true;
    this.pendingFault = false;
    this.injectFault(candidate.id, { scripted: true, repairAfter: 8.2 });
  }

  pickFaultCandidate() {
    const moving = this.pods.filter(
      (pod) => pod.state === "moving" && pod.currentEdge && pod.progress > 0.12,
    );
    if (moving.length === 0) return null;
    const central = moving.filter((pod) => CENTRAL_EDGE_IDS.has(pod.currentEdge));
    const pool = central.length > 0 ? central : moving;
    return pool.sort((a, b) => b.progress - a.progress)[0];
  }

  injectFault(podId = null, options = {}) {
    if (this.fault) return false;
    let pod = podId ? this.podById.get(podId) : this.pickFaultCandidate();
    if (!pod || pod.state !== "moving" || !pod.currentEdge) {
      pod = this.pickFaultCandidate();
    }
    if (!pod) {
      this.pendingFault = true;
      return false;
    }

    const edgeId = pod.currentEdge;
    pod.state = "faulted";
    this.blockedEdges.add(edgeId);
    this.fault = {
      podId: pod.id,
      edgeId,
      occurredAt: this.elapsed,
      scripted: Boolean(options.scripted),
      repairedAt: null,
    };
    this.repairCountdown = options.repairAfter ?? this.autoRepairAfter;
    this.metrics.faults += 1;
    this.emit(
      "danger",
      `前车故障：${pod.name} 在 ${this.edgeLabel(EDGE_BY_ID[edgeId])} 失速，区间已闭锁`,
      pod.id,
      { level: "danger", edgeId },
    );
    this.rerouteOthersForFault(pod.id);
    return true;
  }

  rerouteOthersForFault(faultedPodId) {
    for (const pod of this.pods) {
      if (pod.id === faultedPodId || pod.state === "complete" || pod.state === "faulted") continue;
      if (pod.state === "moving") {
        pod.replanPending = true;
        this.emit(
          "warn",
          `${pod.name} 收到前车故障警报，将在下一岔点搜索备用路径`,
          pod.id,
          { level: "warn" },
        );
      } else if (pod.state === "waiting" && pod.legNodes.length) {
        const remaining = pod.legNodes
          .slice(pod.edgeIndex)
          .map((node, index, list) =>
            index < list.length - 1 ? `${node}--${list[index + 1]}` : null,
          )
          .filter(Boolean)
          .map((entry) => {
            const [a, b] = entry.split("--");
            return [a, b].sort().join("--");
          });
        if (remaining.includes(this.fault.edgeId)) {
          this.replanFromNode(pod, "前车故障 / 备用路径");
        }
      }
    }
  }

  updateFaultTimer(dt) {
    if (!this.fault || this.fault.repairedAt != null || !this.autoRepair) return;
    this.repairCountdown -= dt;
    if (this.repairCountdown <= 0) this.repairFault(true);
  }

  repairFault(automatic = false) {
    if (!this.fault) return false;
    const faultPod = this.podById.get(this.fault.podId);
    const edgeId = this.fault.edgeId;
    this.fault.repairedAt = this.elapsed;
    this.blockedEdges.delete(edgeId);
    if (faultPod && faultPod.state === "faulted") {
      faultPod.state = "moving";
    }
    this.emit(
      "success",
      `${automatic ? "自动救援" : "人工救援"}完成：${this.edgeLabel(EDGE_BY_ID[edgeId])} 恢复通行`,
      faultPod?.id,
      { level: "success", edgeId },
    );
    this.fault = { ...this.fault, active: false };
    this.fault = null;
    this.repairCountdown = 0;
    for (const pod of this.pods) {
      if (pod.state === "stranded") {
        pod.state = "waiting";
        this.beginLeg(pod);
      } else if (pod.state === "waiting" && pod.replanPending) {
        pod.replanPending = false;
        this.replanFromNode(pod, "故障恢复");
      }
    }
    return true;
  }

  edgeLabel(edge) {
    if (!edge) return "未知区间";
    return `${getNode(edge.a)?.name ?? edge.a}—${getNode(edge.b)?.name ?? edge.b}`;
  }

  snapshot() {
    return {
      scenario: this.scenario.id,
      elapsed: this.elapsed,
      status: this.status,
      running: this.running,
      paused: this.paused,
      pods: this.pods.map(publicPod),
      occupancy: Object.fromEntries(this.occupancy),
      blockedEdges: [...this.blockedEdges],
      fault: this.fault ? { ...this.fault } : null,
      metrics: { ...this.metrics },
    };
  }
}

export function runBlockingTest() {
  const simulation = new TransitSimulation({
    scenario: WRONG_ROUTE_SCENARIO,
    autoRepair: false,
  });
  simulation.start();

  let maxOccupancyPerEdge = 0;
  let firstOpposedEvent = null;
  let firstWaitEdge = null;
  let waitedPodId = null;
  const maxSeconds = 36;
  const step = 0.05;
  let elapsed = 0;

  while (elapsed < maxSeconds && simulation.status !== "success") {
    simulation.step(step);
    elapsed += step;
    const holdersPerEdge = new Map();
    for (const pod of simulation.pods) {
      if (!pod.currentEdge) continue;
      holdersPerEdge.set(pod.currentEdge, (holdersPerEdge.get(pod.currentEdge) ?? 0) + 1);
      maxOccupancyPerEdge = Math.max(
        maxOccupancyPerEdge,
        holdersPerEdge.get(pod.currentEdge),
      );
    }
    for (const pod of simulation.pods) {
      if (
        !firstOpposedEvent &&
        pod.state === "waiting" &&
        pod.waitEdgeId &&
        simulation.pods.some(
          (other) =>
            other.id !== pod.id &&
            other.currentEdge === pod.waitEdgeId &&
            other.state === "moving",
        )
      ) {
        const opposing = simulation.events.find(
          (event) =>
            event.type === "danger" &&
            event.podId === pod.id &&
            event.edgeId === pod.waitEdgeId,
        );
        if (opposing) {
          firstOpposedEvent = opposing;
          firstWaitEdge = pod.waitEdgeId;
          waitedPodId = pod.id;
        }
      }
    }
  }

  const podStates = simulation.pods.map((pod) => ({
    id: pod.id,
    state: pod.state,
    completedAt: pod.completedAt,
  }));
  const waitEvent = firstOpposedEvent;
  const waitOutcome = simulation.events.find(
    (event) =>
      event.type === "info" &&
      event.podId === waitedPodId &&
      event.message.includes("等待") &&
      event.time > (waitEvent?.time ?? Infinity),
  );
  const allCompleted = simulation.status === "success";
  const conflictEdgeLabel = firstWaitEdge
    ? simulation.edgeLabel(EDGE_BY_ID[firstWaitEdge])
    : "中央单线区间";

  return {
    pass: Boolean(waitEvent) && maxOccupancyPerEdge <= 1 && allCompleted,
    scenario: WRONG_ROUTE_SCENARIO.name,
    conflictEdge: firstWaitEdge,
    conflictEdgeLabel,
    waitedPodId,
    waitSeconds: waitOutcome && waitEvent ? waitOutcome.time - waitEvent.time : null,
    headOnHolds: simulation.metrics.headOnHolds,
    yields: simulation.metrics.yields,
    allCompleted,
    maxOccupancyPerEdge,
    elapsed: simulation.elapsed,
    podStates,
    assertions: [
      {
        pass: Boolean(waitEvent),
        label: "对向争用同一区间，低优先级舱进入等待",
      },
      {
        pass: maxOccupancyPerEdge <= 1,
        label: "任一时刻每个区间最多只有一个舱占用",
      },
      {
        pass: allCompleted,
        label: "阻塞随前车驶离解除，四舱全部完成",
      },
    ],
  };
}
