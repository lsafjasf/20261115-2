export const LIMIT_TEMP = 8;
export const DEADLINE_SECONDS = 68;
export const END_SECONDS = 82;
export const AMBIENT_START = 24.6;
export const AMBIENT_END = 36.8;
export const AMBIENT_RAMP_SECONDS = 88;
export const SWAP_SECONDS = 9;
export const RECHARGED_BATTERY = 94;

export const ROUTES = {
  north: {
    id: "north",
    label: "北线",
    km: 31.6,
    duration: 47,
    station: "north",
    stationAt: 0.56,
    driveDraw: 0.46,
    color: "#5be2d4",
  },
  direct: {
    id: "direct",
    label: "中线",
    km: 24.2,
    duration: 39,
    station: null,
    stationAt: null,
    driveDraw: 0.38,
    color: "#62b7c8",
  },
  south: {
    id: "south",
    label: "南线",
    km: 34.1,
    duration: 53,
    station: "south",
    stationAt: 0.52,
    driveDraw: 0.5,
    color: "#f1b85f",
  },
};

export const COOLING_MODES = {
  eco: {
    id: "eco",
    label: "ECO",
    setpoint: 7.05,
    heatBias: 0.12,
    draw: 0.15,
    load: 0.24,
  },
  norm: {
    id: "norm",
    label: "NORM",
    setpoint: 5.15,
    heatBias: 0.07,
    draw: 0.28,
    load: 0.55,
  },
  max: {
    id: "max",
    label: "MAX",
    setpoint: 3.0,
    heatBias: 0.04,
    draw: 0.58,
    load: 1,
  },
};

export const STATIONS = {
  north: { id: "north", label: "北岭换电站", code: "SWAP N-01" },
  south: { id: "south", label: "南港换电站", code: "SWAP S-02" },
};

const TRUCK_BLUEPRINTS = [
  {
    id: "T-01",
    callsign: "雪隼",
    driver: "周岚",
    route: "north",
    cooling: "norm",
    temperature: 6.4,
    battery: 34,
    color: "#5be2d4",
  },
  {
    id: "T-02",
    callsign: "白鲸",
    driver: "陆遥",
    route: "direct",
    cooling: "norm",
    temperature: 5.1,
    battery: 63,
    color: "#62b7c8",
  },
  {
    id: "T-03",
    callsign: "海燕",
    driver: "许宁",
    route: "south",
    cooling: "norm",
    temperature: 4.7,
    battery: 88,
    color: "#f1b85f",
  },
];

function cloneTruck(truck) {
  return {
    ...truck,
    progress: 0,
    state: "idle",
    doorOpenCount: 0,
    doorRemaining: 0,
    swapped: false,
    swapElapsed: 0,
    arrivalTime: null,
    finalTemp: null,
    powerLost: false,
    minBattery: truck.battery,
    status: "待发车",
  };
}

function initialState() {
  return {
    phase: "planning",
    paused: false,
    time: 0,
    ambient: AMBIENT_START,
    finished: false,
    result: null,
    trucks: TRUCK_BLUEPRINTS.map(cloneTruck),
    stations: {
      north: { active: null, elapsed: 0, queue: [] },
      south: { active: null, elapsed: 0, queue: [] },
    },
    priorities: {
      north: ["T-01", "T-02", "T-03"],
      south: ["T-01", "T-02", "T-03"],
    },
    events: [],
    eventSerial: 0,
  };
}

function ambientAt(time) {
  const progress = Math.min(1, Math.max(0, time / AMBIENT_RAMP_SECONDS));
  return AMBIENT_START + (AMBIENT_END - AMBIENT_START) * progress;
}

function heatFactor(ambient) {
  return 1 + Math.max(0, ambient - AMBIENT_START) * 0.012;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `T+${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60,
  ).padStart(2, "0")}`;
}

function temperatureState(temp) {
  if (temp >= LIMIT_TEMP) return "breach";
  if (temp >= 7.1) return "warning";
  if (temp >= 5.8) return "watch";
  return "stable";
}

export function temperatureColor(temp) {
  const bounded = clamp(temp, 2, 10);
  if (bounded < 4.5) return "#48cee4";
  if (bounded < 6) return "#7ee5ce";
  if (bounded < 7.25) return "#b9e96b";
  if (bounded < 8) return "#f0b664";
  return "#ff6d65";
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function createColdChainGame() {
  let state = initialState();

  function emit(type, message, truckId = null) {
    state.eventSerial += 1;
    state.events.push({
      id: state.eventSerial,
      type,
      message,
      truckId,
      time: state.time,
      clock: formatClock(state.time),
    });
    if (state.events.length > 60) state.events.shift();
  }

  function truckById(id) {
    return state.trucks.find((truck) => truck.id === id);
  }

  function setRoute(truckId, routeId) {
    const truck = truckById(truckId);
    if (!truck || !ROUTES[routeId] || state.phase !== "planning") return false;
    if (truck.route === routeId) return true;
    truck.route = routeId;
    emit(
      "info",
      `${truck.id} ${truck.callsign} 改走${ROUTES[routeId].label}，全程 ${ROUTES[routeId].km} km`,
      truck.id,
    );
    return true;
  }

  function setCooling(truckId, modeId) {
    const truck = truckById(truckId);
    if (!truck || !COOLING_MODES[modeId]) return false;
    if (state.phase === "planning" || state.phase === "running" || state.phase === "paused") {
      if (truck.state === "arrived") return false;
      if (truck.cooling !== modeId) {
        truck.cooling = modeId;
        emit(
          "info",
          `${truck.id} 制冷档位切换为 ${COOLING_MODES[modeId].label}`,
          truck.id,
        );
      }
      return true;
    }
    return false;
  }

  function setPriority(stationId, truckId, direction) {
    const order = state.priorities[stationId];
    if (!order || !order.includes(truckId)) return false;
    const index = order.indexOf(truckId);
    const target = index + direction;
    if (target < 0 || target >= order.length) return false;
    [order[index], order[target]] = [order[target], order[index]];
    emit(
      "info",
      `${STATIONS[stationId].label} 队列：${order.join(" → ")}`,
    );
    return true;
  }

  function openDoor(truckId) {
    const truck = truckById(truckId);
    if (!truck || state.phase !== "running" || truck.state === "arrived") return false;
    const ambientHeat = Math.max(0, state.ambient - 26) * 0.025;
    truck.temperature += 0.48 + ambientHeat;
    truck.doorOpenCount += 1;
    truck.doorRemaining = Math.max(truck.doorRemaining, 3.5);
    emit(
      "warning",
      `${truck.id} 执行开箱核验，货温瞬时 +${(0.48 + ambientHeat).toFixed(2)}°C`,
      truck.id,
    );
    if (truck.temperature >= LIMIT_TEMP) {
      emit("danger", `${truck.id} 开箱后货温越过 8.0°C 上限`, truck.id);
    }
    return true;
  }

  function start() {
    if (state.phase !== "planning") return false;
    state.phase = "running";
    for (const truck of state.trucks) {
      truck.state = "moving";
      truck.status = "运输中";
    }
    emit("success", "三车同步发车，温控与换电队列已接管");
    return true;
  }

  function togglePause() {
    if (state.phase === "running") {
      state.phase = "paused";
      state.paused = true;
      emit("info", "仿真已暂停");
      return true;
    }
    if (state.phase === "paused") {
      state.phase = "running";
      state.paused = false;
      emit("info", "仿真继续");
      return true;
    }
    return false;
  }

  function reset() {
    state = initialState();
    emit("info", "调度台归零，固定场景等待重新规划");
  }

  function updateThermal(truck, dt) {
    const mode = COOLING_MODES[truck.cooling];
    const stationPower = truck.state === "swapping";
    const coolingActive = stationPower || truck.battery > 0;
    const doorOpen = truck.doorRemaining > 0;

    if (doorOpen) {
      truck.doorRemaining = Math.max(0, truck.doorRemaining - dt);
    }

    if (coolingActive) {
      const target = doorOpen
        ? state.ambient + 3
        : mode.setpoint + Math.max(0, state.ambient - 26) * mode.heatBias;
      const rate = doorOpen ? 0.01 : 0.035;
      truck.temperature += (target - truck.temperature) * rate * dt;
    } else {
      const rate = doorOpen ? 0.017 : 0.0095;
      truck.temperature += (state.ambient - truck.temperature) * rate * dt;
    }
  }

  function updateBattery(truck, dt) {
    if (truck.state === "swapping" || truck.state === "arrived" || truck.battery <= 0) {
      return;
    }
    const route = ROUTES[truck.route];
    const mode = COOLING_MODES[truck.cooling];
    const thermalFactor = heatFactor(state.ambient);
    const doorFactor = truck.doorRemaining > 0 ? 1.24 : 1;
    const travelDraw =
      truck.state === "moving" ? route.driveDraw : 0;
    const draw =
      (travelDraw + mode.draw * doorFactor) * thermalFactor * dt;
    truck.battery = Math.max(0, truck.battery - draw);
    truck.minBattery = Math.min(truck.minBattery, truck.battery);

    if (truck.battery <= 0 && !truck.powerLost) {
      truck.powerLost = true;
      truck.battery = 0;
      emit(
        "danger",
        `${truck.id} 电量耗尽，制冷压缩机停机，车辆进入跛行`,
        truck.id,
      );
    }
  }

  function arrive(truck) {
    truck.progress = 1;
    truck.state = "arrived";
    truck.arrivalTime = state.time;
    truck.finalTemp = round(truck.temperature, 2);
    const onTime = state.time <= DEADLINE_SECONDS;
    truck.status = onTime ? "已抵达" : "迟到抵达";
    emit(
      onTime ? "success" : "warning",
      `${truck.id} ${truck.callsign}抵达机场，货温 ${truck.finalTemp.toFixed(1)}°C${
        onTime ? "，准点" : "，已超时"
      }`,
      truck.id,
    );
    if (truck.finalTemp >= LIMIT_TEMP) {
      emit(
        "danger",
        `${truck.id} 到场货温超限，药品冷链失效`,
        truck.id,
      );
    }
  }

  function enterStationQueue(truck) {
    const route = ROUTES[truck.route];
    if (!route.station) return;
    truck.progress = route.stationAt;
    truck.state = "queued";
    state.stations[route.station].queue.push(truck.id);
    emit(
      "info",
      `${truck.id} 抵达${STATIONS[route.station].label}，电池 ${Math.round(
        truck.battery,
      )}%`,
      truck.id,
    );
  }

  function updateStation(stationId, dt) {
    const station = state.stations[stationId];
    if (station.active) {
      station.elapsed += dt;
      if (station.elapsed >= SWAP_SECONDS) {
        const truck = truckById(station.active);
        truck.battery = RECHARGED_BATTERY;
        truck.swapped = true;
        truck.state = "moving";
        truck.swapElapsed = SWAP_SECONDS;
        emit("success", `${truck.id} 换电完成，电量恢复至 ${RECHARGED_BATTERY}%`, truck.id);
        station.active = null;
        station.elapsed = 0;
      }
    }

    if (!station.active && station.queue.length) {
      const priority = state.priorities[stationId];
      station.queue.sort(
        (left, right) => priority.indexOf(left) - priority.indexOf(right),
      );
      const nextId = station.queue.shift();
      const truck = truckById(nextId);
      truck.state = "swapping";
      truck.swapElapsed = 0;
      station.active = nextId;
      station.elapsed = 0;
      emit("info", `${truck.id} 进入${STATIONS[stationId].label}换电工位`, truck.id);
    }
  }

  function updateTruck(truck, dt) {
    if (truck.state === "arrived") return;

    updateThermal(truck, dt);
    updateBattery(truck, dt);

    if (truck.temperature >= LIMIT_TEMP && !truck.overLimitAlert) {
      truck.overLimitAlert = true;
      emit(
        "danger",
        `${truck.id} 货温升至 ${truck.temperature.toFixed(1)}°C，超过 8.0°C 上限`,
        truck.id,
      );
    }

    if (truck.state !== "moving") return;

    const route = ROUTES[truck.route];
    const speedFactor = truck.battery > 0 ? 1 : 0.25;
    const previous = truck.progress;
    truck.progress = Math.min(
      1,
      truck.progress + (dt / route.duration) * speedFactor,
    );

    if (
      route.station &&
      !truck.swapped &&
      previous < route.stationAt &&
      truck.progress >= route.stationAt
    ) {
      enterStationQueue(truck);
      return;
    }

    if (truck.progress >= 1) arrive(truck);
  }

  function truckStatus(truck) {
    if (truck.state === "idle") return "待发车";
    if (truck.state === "arrived") {
      return truck.arrivalTime <= DEADLINE_SECONDS ? "已抵达" : "迟到抵达";
    }
    if (truck.state === "swapping") return "换电中";
    if (truck.state === "queued") return "换电排队";
    if (truck.battery <= 0) return "缺电跛行";
    if (truck.doorRemaining > 0) return "开箱作业";
    return "运输中";
  }

  function estimatedArrival(truck) {
    if (truck.state === "arrived") return truck.arrivalTime;
    const route = ROUTES[truck.route];
    let remainingDistance = Math.max(0, 1 - truck.progress);
    let stationDelay = 0;

    if (
      route.station &&
      !truck.swapped &&
      truck.state !== "queued" &&
      truck.state !== "swapping"
    ) {
      remainingDistance += route.stationAt - truck.progress > 0 ? 0 : 0;
      stationDelay = SWAP_SECONDS;
    }
    if (truck.state === "queued") stationDelay = SWAP_SECONDS;
    if (truck.state === "swapping") stationDelay = Math.max(0, SWAP_SECONDS - truck.swapElapsed);

    const speedFactor = truck.battery > 0 ? 1 : 0.25;
    return state.time + (remainingDistance * route.duration) / speedFactor + stationDelay;
  }

  function checkFinished() {
    const allArrived = state.trucks.every((truck) => truck.state === "arrived");
    if (!allArrived && state.time < END_SECONDS) return;

    state.finished = true;
    state.phase = "complete";
    const arrived = state.trucks.filter((truck) => truck.state === "arrived");
    const unsafe = state.trucks.filter((truck) => {
      const measured = truck.finalTemp ?? truck.temperature;
      return measured >= LIMIT_TEMP;
    });
    const onTime = arrived.filter(
      (truck) => truck.arrivalTime <= DEADLINE_SECONDS,
    );
    const powerRelated = unsafe.some((truck) => truck.powerLost);
    const success =
      allArrived && unsafe.length === 0 && onTime.length >= 2;

    let outcome = "success";
    if (!success && unsafe.length) outcome = "cold-chain-breach";
    else if (!success && !allArrived) outcome = "timeout";
    else if (!success) outcome = "late";

    let summary = "三车药品全部到场且低于温控上限，至少两车准点。";
    if (outcome === "cold-chain-breach") {
      summary = powerRelated
        ? "电力不足导致压缩机关闭，货温在到场前越过上限。"
        : "至少一车到场货温越过 8.0°C，药品不得放行。";
    } else if (outcome === "timeout") {
      summary = "仍有车辆未抵达机场，任务时钟耗尽。";
    } else if (outcome === "late") {
      summary = "到场药品均未超温，但准点车辆不足两辆。";
    }

    state.result = {
      success,
      outcome,
      summary,
      elapsed: round(state.time, 1),
      arrived: arrived.length,
      safe: Math.max(0, arrived.length - unsafe.length),
      onTime: onTime.length,
      unsafe: unsafe.map((truck) => truck.id),
      powerFailure: state.trucks
        .filter((truck) => truck.powerLost)
        .map((truck) => truck.id),
      powerRelatedBreach: powerRelated,
      trucks: state.trucks.map((truck) => ({
        id: truck.id,
        arrived: truck.state === "arrived",
        temperature: round(truck.finalTemp ?? truck.temperature, 2),
        battery: Math.round(truck.battery),
        arrivalTime: truck.arrivalTime,
        powerLost: truck.powerLost,
      })),
    };
    emit(
      success ? "success" : "danger",
      success ? "任务完成：药品安全交付" : `任务失败：${summary}`,
    );
  }

  function advance(seconds) {
    if (state.phase !== "running" || state.finished) return false;
    let remaining = Math.max(0, seconds);
    const maxStep = 0.05;
    while (remaining > 0 && !state.finished) {
      const dt = Math.min(maxStep, remaining);
      state.time += dt;
      state.ambient = ambientAt(state.time);

      for (const truck of state.trucks) {
        updateTruck(truck, dt);
      }
      updateStation("north", dt);
      updateStation("south", dt);

      if (state.time >= END_SECONDS) {
        state.time = END_SECONDS;
        state.ambient = ambientAt(state.time);
      }
      checkFinished();
      remaining -= dt;
    }
    return true;
  }

  function stationSnapshot(stationId) {
    const station = state.stations[stationId];
    const priority = state.priorities[stationId];
    const display = [];
    if (station.active) display.push(station.active);
    for (const id of station.queue) {
      if (!display.includes(id)) display.push(id);
    }
    const assigned = state.trucks
      .filter((truck) => {
        if (truck.route !== "north" && truck.route !== "south") return false;
        if (ROUTES[truck.route].station !== stationId) return false;
        if (truck.state === "arrived" || truck.swapped) return false;
        return (
          truck.state === "idle" ||
          (truck.state === "moving" && truck.progress < ROUTES[truck.route].stationAt)
        );
      })
      .map((truck) => truck.id)
      .sort((left, right) => priority.indexOf(left) - priority.indexOf(right));
    for (const id of assigned) {
      if (!display.includes(id)) display.push(id);
    }

    return {
      ...STATIONS[stationId],
      active: station.active,
      elapsed: round(station.elapsed, 1),
      queue: [...station.queue],
      display,
      entries: display.map((id, index) => {
        const truck = truckById(id);
        let status = "inbound";
        if (id === station.active) status = "swapping";
        else if (station.queue.includes(id)) status = "waiting";
        return {
          id,
          callsign: truck.callsign,
          color: truck.color,
          priority: priority.indexOf(id) + 1,
          rank: index + 1,
          status,
        };
      }),
    };
  }

  function getSnapshot() {
    const audioTotal = state.trucks.reduce((sum, truck) => {
      if (truck.state === "arrived" || truck.battery <= 0) return sum;
      const mode = COOLING_MODES[truck.cooling];
      const doorBoost = truck.doorRemaining > 0 ? 0.28 : 0;
      const planningReduction = state.phase === "planning" ? 0.3 : 1;
      return sum + (mode.load + doorBoost) * planningReduction;
    }, 0);

    return {
      phase: state.phase,
      paused: state.phase === "paused",
      complete: state.finished,
      time: round(state.time, 2),
      clock: formatClock(state.time),
      ambient: round(state.ambient, 2),
      deadline: DEADLINE_SECONDS,
      limit: LIMIT_TEMP,
      eventSerial: state.eventSerial,
      events: state.events.map((event) => ({ ...event })),
      result: state.result ? structuredClone(state.result) : null,
      progress:
        state.trucks.reduce((sum, truck) => sum + truck.progress, 0) /
        state.trucks.length,
      onTimeCount: state.trucks.filter(
        (truck) =>
          truck.state === "arrived" &&
          truck.arrivalTime <= DEADLINE_SECONDS,
      ).length,
      safeCount: state.trucks.filter(
        (truck) =>
          truck.state === "arrived" &&
          (truck.finalTemp ?? truck.temperature) < LIMIT_TEMP,
      ).length,
      audioLoad: clamp(audioTotal / 2.5, 0, 1),
      stations: {
        north: stationSnapshot("north"),
        south: stationSnapshot("south"),
      },
      priorities: {
        north: [...state.priorities.north],
        south: [...state.priorities.south],
      },
      trucks: state.trucks.map((truck) => ({
        ...truck,
        status: truckStatus(truck),
        routeInfo: ROUTES[truck.route],
        coolingInfo: COOLING_MODES[truck.cooling],
        temperature: round(truck.temperature, 2),
        finalTemp:
          truck.finalTemp === null ? null : round(truck.finalTemp, 2),
        temperatureState: temperatureState(
          truck.finalTemp ?? truck.temperature,
        ),
        estimatedArrival: round(estimatedArrival(truck), 1),
      })),
    };
  }

  emit("info", "控制台就绪：三车待发，外温上升曲线已锁定");

  return {
    start,
    reset,
    advance,
    togglePause,
    setRoute,
    setCooling,
    setPriority,
    openDoor,
    getSnapshot,
    routeDefinition: ROUTES,
    coolingDefinition: COOLING_MODES,
  };
}
