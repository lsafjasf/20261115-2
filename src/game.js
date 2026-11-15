export const STACK_IDS = ["A", "B", "C", "D"];
export const MAX_STACK = 3;
export const VIOLATION_PENALTY = 5;

export const STACKS = {
  A: { id: "A", label: "A 排", note: "限高排", limited: true },
  B: { id: "B", label: "B 排", note: "重箱区", limited: false },
  C: { id: "C", label: "C 排", note: "混装区", limited: false },
  D: { id: "D", label: "D 排", note: "缓冲位", limited: false }
};

export const SHIPS = [
  {
    id: "star",
    name: "星港号",
    english: "STAR HARBOR",
    berth: "01",
    deadline: 48,
    manifest: ["C1", "C3"],
    color: "#ffc45c"
  },
  {
    id: "wind",
    name: "海风号",
    english: "SEA BREEZE",
    berth: "02",
    deadline: 92,
    manifest: ["C2", "C4"],
    color: "#66d9c2"
  },
  {
    id: "horizon",
    name: "远洋号",
    english: "OPEN HORIZON",
    berth: "03",
    deadline: 138,
    manifest: ["C5", "C6"],
    color: "#8db7ff"
  }
];

export const CONTAINERS = {
  C1: {
    id: "C1",
    serial: "HXMU 2231",
    short: "C–01",
    weight: 24,
    height: "8'6",
    tall: false,
    shipId: "star",
    color: "#2f79c9",
    ink: "#d9efff"
  },
  C2: {
    id: "C2",
    serial: "MRKU 7042",
    short: "C–02",
    weight: 18,
    height: "8'6",
    tall: false,
    shipId: "wind",
    color: "#169c82",
    ink: "#dcfff4"
  },
  C3: {
    id: "C3",
    serial: "ONEU 3187",
    short: "C–03",
    weight: 31,
    height: "9'6",
    tall: true,
    shipId: "star",
    color: "#c84f48",
    ink: "#fff0dc"
  },
  C4: {
    id: "C4",
    serial: "TGHU 9084",
    short: "C–04",
    weight: 12,
    height: "9'6",
    tall: true,
    shipId: "wind",
    color: "#d19a32",
    ink: "#2c210d"
  },
  C5: {
    id: "C5",
    serial: "CMAU 6650",
    short: "C–05",
    weight: 27,
    height: "8'6",
    tall: false,
    shipId: "horizon",
    color: "#536c9f",
    ink: "#edf3ff"
  },
  C6: {
    id: "C6",
    serial: "OOLU 1419",
    short: "C–06",
    weight: 15,
    height: "8'6",
    tall: false,
    shipId: "horizon",
    color: "#9d5da3",
    ink: "#fff0ff"
  }
};

const initialStacks = {
  A: ["C6", "C1"],
  B: ["C5", "C4"],
  C: ["C3", "C2"],
  D: []
};

const fail = (code, reason) => ({ ok: false, code, reason });
const top = (stack) => stack?.at(-1) ?? null;

export function cloneState(state) {
  return structuredClone(state);
}

export function createGameState() {
  const ships = Object.fromEntries(
    SHIPS.map((ship) => [
      ship.id,
      { ...ship, manifest: [...ship.manifest], loaded: [], status: "open" }
    ])
  );
  return {
    elapsed: 0,
    phase: "playing",
    stacks: structuredClone(initialStacks),
    ships,
    delivered: [],
    missed: [],
    violations: [],
    laneClear: true,
    lastEvent: null,
    revision: 0
  };
}

export function getTopContainer(state, stackId) {
  const containerId = top(state.stacks[stackId]);
  return containerId ? CONTAINERS[containerId] : null;
}

export function getStackHeight(state, stackId) {
  return state.stacks[stackId]?.length ?? 0;
}

export function getCompletedCount(state) {
  return state.delivered.length;
}

export function getShipEta(state, shipId) {
  return Math.max(0, state.ships[shipId].deadline - state.elapsed);
}

export function getFinalEta(state) {
  const latest = Math.max(...SHIPS.map((ship) => ship.deadline));
  return Math.max(0, latest - state.elapsed);
}

export function getStackTopWeight(state, stackId) {
  const containerId = top(state.stacks[stackId]);
  return containerId ? CONTAINERS[containerId].weight : null;
}

export function previewMove(state, sourceStackId, destination) {
  if (state.phase !== "playing") return fail("ROUND_ENDED", "本班作业已经结束");
  if (!STACK_IDS.includes(sourceStackId)) return fail("BAD_SOURCE", "请选择货柜堆位");
  const sourceStack = state.stacks[sourceStackId];
  const containerId = top(sourceStack);
  if (!containerId) return fail("EMPTY_STACK", `${sourceStackId} 排没有可抓取的货柜`);
  const container = CONTAINERS[containerId];

  if (destination?.type === "stack") {
    const destinationId = destination.stackId;
    if (!STACK_IDS.includes(destinationId)) return fail("BAD_TARGET", "目标堆位不存在");
    if (sourceStackId === destinationId) {
      return fail("SAME_STACK", "该箱已经在当前垛顶，请选择其他落点");
    }
    if (STACKS[destinationId].limited && container.tall) {
      return fail("HIGH_CUBE_LIMIT", `${container.short} 为 9'6 高箱，不能进入 A 排限高区`);
    }
    if (state.stacks[destinationId].length >= MAX_STACK) {
      return fail("STACK_FULL", `${destinationId} 排已叠到 3 层上限`);
    }
    const supportWeight = getStackTopWeight(state, destinationId);
    if (supportWeight !== null && supportWeight < container.weight) {
      return fail(
        "HEAVY_ON_LIGHT",
        `${container.weight}t 重箱不能压在 ${supportWeight}t 轻箱上`
      );
    }
    return {
      ok: true,
      kind: "stack",
      container,
      sourceStackId,
      destinationId,
      reason: `移至 ${destinationId} 排`
    };
  }

  if (destination?.type === "ship") {
    const ship = state.ships[destination.shipId];
    if (!ship) return fail("BAD_TARGET", "目标船舶不存在");
    if (ship.status !== "open") return fail("SHIP_DEPARTED", `${ship.name} 已离港，无法装船`);
    if (!ship.manifest.includes(containerId)) {
      return fail("WRONG_SHIP", `${container.short} 不属于 ${ship.name}`);
    }
    if (ship.loaded.includes(containerId)) return fail("DUPLICATE", "该箱已经装船");
    return {
      ok: true,
      kind: "load",
      container,
      sourceStackId,
      shipId: ship.id,
      reason: `装往 ${ship.name}`
    };
  }

  if (destination?.type === "lane") {
    return fail("LANE_BLOCKED", "装卸通道禁止落箱，必须保持畅通");
  }
  return fail("BAD_TARGET", "请选择货柜堆或船舶作为落点");
}

export function registerViolation(state, result, container = null) {
  const entry = {
    code: result.code,
    reason: result.reason,
    containerId: container?.id ?? null,
    at: roundTime(state.elapsed)
  };
  state.violations.push(entry);
  state.lastEvent = { type: "violation", ...entry, penalty: VIOLATION_PENALTY };
  state.elapsed = Math.min(
    Math.max(...SHIPS.map((ship) => ship.deadline)),
    state.elapsed + VIOLATION_PENALTY
  );
  advanceTime(state, 0);
  return entry;
}

export function attemptMove(state, sourceStackId, destination) {
  const result = previewMove(state, sourceStackId, destination);
  if (!result.ok) {
    const container = top(state.stacks[sourceStackId])
      ? CONTAINERS[top(state.stacks[sourceStackId])]
      : null;
    registerViolation(state, result, container);
    return result;
  }

  state.stacks[sourceStackId].pop();
  if (result.kind === "stack") {
    state.stacks[result.destinationId].push(result.container.id);
  } else {
    state.ships[result.shipId].loaded.push(result.container.id);
    state.delivered.push(result.container.id);
  }
  state.revision += 1;
  state.lastEvent = {
    type: result.kind,
    containerId: result.container.id,
    to: result.kind === "stack" ? result.destinationId : result.shipId
  };
  settleIfDecided(state);
  return result;
}

export function advanceTime(state, seconds) {
  if (state.phase !== "playing" || seconds < 0) return;
  state.elapsed = Math.min(
    Math.max(...SHIPS.map((ship) => ship.deadline)),
    state.elapsed + seconds
  );

  for (const ship of Object.values(state.ships)) {
    if (ship.status === "open" && state.elapsed >= ship.deadline) {
      ship.status = "departed";
      for (const containerId of ship.manifest) {
        if (!ship.loaded.includes(containerId)) {
          state.missed.push(containerId);
          state.revision += 1;
        }
      }
      state.lastEvent = { type: "departure", shipId: ship.id };
    }
  }

  if (state.delivered.length + state.missed.length >= Object.keys(CONTAINERS).length) {
    const remainingShip = Object.values(state.ships).some((ship) => ship.status === "open");
    const remainingContainer = Object.keys(CONTAINERS).some(
      (id) => !state.delivered.includes(id) && !state.missed.includes(id)
    );
    if (!remainingContainer || !remainingShip) {
      finalize(state);
      return;
    }
  }
}

function settleIfDecided(state) {
  if (state.delivered.length === Object.keys(CONTAINERS).length) {
    state.phase = "won";
    return;
  }
  const openShip = Object.values(state.ships).some((ship) => ship.status === "open");
  const undelivered = Object.keys(CONTAINERS).filter(
    (id) => !state.delivered.includes(id) && !state.missed.includes(id)
  );
  if (!openShip && undelivered.length) finalize(state);
}

function finalize(state) {
  const completed = state.delivered.length;
  state.phase = completed >= 5 && state.laneClear ? "won" : "lost";
}

export function roundTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function clockTime(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function getSummary(state) {
  const completed = getCompletedCount(state);
  return {
    completed,
    missed: state.missed.length,
    violations: state.violations.length,
    phase: state.phase,
    laneClear: state.laneClear,
    passed: completed >= 5 && state.laneClear,
    elapsed: roundTime(state.elapsed),
    finalEta: clockTime(getFinalEta(state))
  };
}
