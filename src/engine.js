/*
 * 月面基地四层货梯 —— 纯逻辑引擎（无 DOM / Canvas 依赖）。
 * 浏览器与 Node 测试共用同一份物理与规则，保证“实际完成一局”的判定可被自动化验证。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoonLift = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const G = 1.62;                 // 月面重力 m/s²
  const FLOOR_HEIGHT = 30;        // 层高 m
  const FLOORS = [0, 30, 60, 90]; // 底层 + 三层
  const CRUISE_SPEED = 6;         // 巡航速度 m/s
  const CREEP_SPEED = 1.5;        // 制动后残余爬行 m/s
  const ACCEL = 2.0;              // 电机加减速度 m/s²
  const PRESSURE_TIME = 4.0;      // 气闸压力平衡耗时 s
  const DOCK_TOLERANCE = 0.35;    // 精确停靠容差 m

  const EQUIPMENT = {
    seismograph: { id: 'seismograph', name: '月震仪', weight: 120, toFloor: 1 },
    drill:       { id: 'drill',       name: '钻探机', weight: 340, toFloor: 2 },
    reactor:     { id: 'reactor',     name: '核电池', weight: 520, toFloor: 3 },
  };
  const EQUIP_IDS = Object.keys(EQUIPMENT);

  // 三种缓冲装置：制动力越大，重载下降的制动距离越短、碰撞损伤越小
  const BUFFERS = {
    spring:   { id: 'spring',   name: '弹簧缓冲', brakeForce: 1800, absorb: 0.25 },
    hydraulic:{ id: 'hydraulic',name: '液压缓冲', brakeForce: 3000, absorb: 0.55 },
    magnetic: { id: 'magnetic', name: '电磁缓冲', brakeForce: 4600, absorb: 0.85 },
  };
  const BUFFER_IDS = Object.keys(BUFFERS);
  const CAR_MASS = 1000;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round3 = (v) => Math.round(v * 1000) / 1000;

  function createGame(options = {}) {
    return {
      time: 0,
      car: {
        y: 0, velocity: 0, direction: 0,
        status: 'idle',          // idle | accelerating | cruising | braking | impact
        buffer: options.buffer || 'hydraulic',
      },
      doors: {
        open: false,
        // 每层气闸的平衡计时（秒），PRESSURE_TIME 表示已平衡
        pressure: [PRESSURE_TIME, 0, 0, 0],
        equalizing: [false, false, false, false],
      },
      cargo: [],                  // 电梯内设备 id
      delivered: [],              // 已交付设备 id
      plan: [],                   // 玩家分配的停靠顺序（楼层数组，如 [2,1,3]）
      hull: 100,                  // 结构完整度
      violations: 0,              // 提前开门次数
      impactCount: 0,
      events: [],                 // 声音/逻辑事件
      status: 'running',          // running | won | lost
      targetFloor: null,
      nearestFloorIndex: 0,
      log: [],
    };
  }

  function emit(game, type, payload = {}) {
    const event = Object.assign({ type, t: round3(game.time) }, payload);
    game.events.push(event);
    game.log.push(event);
    if (game.log.length > 80) game.log.shift();
  }

  function totalCargoWeight(game) {
    return game.cargo.reduce((sum, id) => sum + EQUIPMENT[id].weight, 0);
  }

  function effectiveMass(game) {
    return CAR_MASS + totalCargoWeight(game);
  }

  function setBuffer(game, bufferId) {
    if (!BUFFERS[bufferId]) return { ok: false, reason: 'unknown-buffer' };
    if (game.car.status !== 'idle' || game.car.y !== 0) {
      return { ok: false, reason: 'buffer-only-on-ground' };
    }
    game.car.buffer = bufferId;
    emit(game, 'buffer-set', { buffer: bufferId });
    return { ok: true };
  }

  // 分配停靠顺序：必须包含 1..3 层且不重复
  function setDockingPlan(game, floors) {
    if (!Array.isArray(floors) || floors.length !== 3) {
      return { ok: false, reason: 'plan-must-have-three-floors' };
    }
    const sorted = floors.slice().sort((a, b) => a - b);
    if (sorted.join(',') !== '1,2,3') {
      return { ok: false, reason: 'plan-must-cover-floors-1-2-3' };
    }
    game.plan = floors.slice();
    emit(game, 'plan-set', { plan: game.plan.slice() });
    return { ok: true };
  }

  function toggleLoad(game, equipId) {
    if (!EQUIPMENT[equipId]) return { ok: false, reason: 'unknown-equipment' };
    if (game.car.y !== 0 || game.car.status !== 'idle') {
      return { ok: false, reason: 'loading-only-on-ground' };
    }
    const idx = game.cargo.indexOf(equipId);
    if (idx >= 0) {
      game.cargo.splice(idx, 1);
      emit(game, 'unload-ground', { equipment: equipId });
      return { ok: true };
    }
    if (game.delivered.includes(equipId)) {
      return { ok: false, reason: 'already-delivered' };
    }
    game.cargo.push(equipId);
    emit(game, 'load', {
      equipment: equipId,
      totalWeight: totalCargoWeight(game),
      brakeDistance: brakingDistance(game),
    });
    return { ok: true };
  }

  // 依据当前载重与缓冲器计算“重载下降”的制动距离（m）
  function brakingDistance(game) {
    const mass = effectiveMass(game);
    const decel = G + BUFFERS[game.car.buffer].brakeForce / mass;
    return round3((CRUISE_SPEED * CRUISE_SPEED) / (2 * decel));
  }

  function nearestFloorIndex(game) {
    let best = 0;
    let bestDist = Infinity;
    FLOORS.forEach((fy, i) => {
      const d = Math.abs(fy - game.car.y);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    game.nearestFloorIndex = best;
    return best;
  }

  function isAtFloor(game) {
    const i = nearestFloorIndex(game);
    return Math.abs(FLOORS[i] - game.car.y) <= DOCK_TOLERANCE ? i : -1;
  }

  // 启动：direction 为 +1（上升）或 -1（下降）。上升必须遵循停靠计划的下一停靠层。
  function startMove(game, direction) {
    if (game.status !== 'running') return { ok: false, reason: 'game-over' };
    if (game.car.status !== 'idle') return { ok: false, reason: 'car-busy' };
    if (game.doors.open) return { ok: false, reason: 'doors-open' };
    if (direction !== 1 && direction !== -1) return { ok: false, reason: 'bad-direction' };
    if (direction === -1 && game.car.y <= 0) return { ok: false, reason: 'already-at-bottom' };

    if (direction === 1) {
      const next = nextPlannedFloor(game);
      if (next === null) return { ok: false, reason: 'plan-complete' };
      game.targetFloor = next;
    } else {
      game.targetFloor = 0;
    }
    game.car.direction = direction;
    game.car.status = 'accelerating';
    emit(game, 'motor-start', { direction, targetFloor: game.targetFloor });
    return { ok: true };
  }

  function nextPlannedFloor(game) {
    for (const floor of game.plan) {
      const stillPending = game.cargo.some((id) => EQUIPMENT[id].toFloor === floor)
        || EQUIP_IDS.some((id) => !game.delivered.includes(id)
          && !game.cargo.includes(id) && EQUIPMENT[id].toFloor === floor);
      if (stillPending) return floor;
    }
    return null;
  }

  // 玩家在接近目标层时手动制动；制动过晚会越过平台触发缓冲碰撞。
  function applyBrake(game) {
    if (game.status !== 'running') return { ok: false, reason: 'game-over' };
    if (!['accelerating', 'cruising'].includes(game.car.status)) {
      return { ok: false, reason: 'cannot-brake' };
    }
    game.car.status = 'braking';
    emit(game, 'brake-on', {
      y: round3(game.car.y),
      velocity: round3(game.car.velocity),
      brakeDistance: brakingDistance(game),
    });
    return { ok: true };
  }

  function deceleration(game) {
    const mass = effectiveMass(game);
    return G + BUFFERS[game.car.buffer].brakeForce / mass;
  }

  function resolveImpact(game, floorIndex) {
    const mass = effectiveMass(game);
    const speed = Math.max(Math.abs(game.car.velocity), CREEP_SPEED);
    const energy = 0.5 * mass * speed * speed;
    const absorbed = BUFFERS[game.car.buffer].absorb;
    const damage = Math.max(1, Math.round((energy / 1000) * (1 - absorbed)));
    game.hull = clamp(game.hull - damage, 0, 100);
    game.impactCount += 1;
    game.car.status = 'impact';
    game.car.velocity = -Math.sign(game.car.direction || 1) * CREEP_SPEED * 0.5;
    emit(game, 'impact', {
      floor: floorIndex, speed: round3(speed), damage,
      hull: game.hull, buffer: game.car.buffer,
    });
    if (game.hull <= 0) {
      game.status = 'lost';
      emit(game, 'hull-destroyed', {});
    }
  }

  // 固定步长推进（dt 秒）。下降时重力辅助加速，重载制动距离由 brakingDistance 体现。
  function step(game, dt) {
    if (game.status !== 'running') return game;
    dt = Math.min(dt, 0.05);
    game.time = round3(game.time + dt);
    stepPressure(game, dt);

    const car = game.car;
    if (car.status === 'idle' || car.status === 'undershoot') {
      return game;
    }
    if (car.status === 'impact') {
      settleCar(game);
      return game;
    }

    const dir = car.direction;
    if (car.status === 'accelerating') {
      const motor = dir === 1 ? ACCEL : ACCEL * 1.15; // 下降有重力助力
      car.velocity += dir * (motor + (dir === -1 ? G * 0.4 : 0)) * dt;
      if (Math.abs(car.velocity) >= CRUISE_SPEED) {
        car.velocity = dir * CRUISE_SPEED;
        car.status = 'cruising';
        emit(game, 'cruise', { velocity: round3(car.velocity) });
      }
    } else if (car.status === 'cruising') {
      // 巡航匀速（电机抵消持续重力）
      car.velocity = dir * CRUISE_SPEED;
    } else if (car.status === 'braking') {
      const a = deceleration(game);
      car.velocity -= dir * a * dt;
      if (dir * car.velocity <= 0) {
        car.velocity = 0;
        settleCar(game);
        return game;
      }
    }

    car.y = clamp(car.y + car.velocity * dt, 0, FLOORS[3] + FLOOR_HEIGHT);

    // 井道两端硬限位
    if (car.y === 0 && car.velocity < 0) {
      car.velocity = 0;
      resolveImpact(game, 0);
      settleCar(game);
    } else if (car.status === 'braking' && game.targetFloor !== null) {
      const targetY = FLOORS[game.targetFloor];
      const crossedUp = car.direction === 1 && car.y > targetY;
      const crossedDown = car.direction === -1 && car.y < targetY;
      if (crossedUp || crossedDown) {
        car.y = targetY + car.direction * 0.4;
        resolveImpact(game, game.targetFloor);
        if (game.status === 'running') {
          car.status = 'impact';
          car.velocity = 0;
          car.direction = 0;
        }
      }
    }
    nearestFloorIndex(game);
    return game;
  }

  function settleCar(game) {
    const car = game.car;
    car.velocity = 0;
    const idx = isAtFloor(game);
    if (idx >= 0) {
      car.y = FLOORS[idx];
      car.status = 'idle';
      car.direction = 0;
      game.targetFloor = null;
      emit(game, 'docked', { floor: idx });
      checkWin(game);
    } else if (car.status !== 'impact') {
      // 制动后停在两层之间（欠停），不扣结构，等待玩家低速回调
      car.status = 'undershoot';
      car.velocity = 0;
      emit(game, 'undershoot', { y: round3(car.y) });
    }
  }

  // 越过平台后的回调：向最近楼层低速移动并精确停靠
  function creepToFloor(game, direction) {
    if (!['undershoot', 'impact'].includes(game.car.status)) {
      return { ok: false, reason: 'cannot-creep' };
    }
    const idx = nearestFloorIndex(game);
    const target = FLOORS[idx];
    if ((direction === 1 && target <= game.car.y) ||
        (direction === -1 && target >= game.car.y)) {
      return { ok: false, reason: 'wrong-creep-direction' };
    }
    game.car.direction = direction;
    game.car.status = 'braking';
    game.car.velocity = direction * CREEP_SPEED;
    emit(game, 'creep', { direction, floor: idx });
    return { ok: true };
  }

  function stepPressure(game, dt) {
    for (let i = 0; i < FLOORS.length; i += 1) {
      if (!game.doors.equalizing[i]) continue;
      game.doors.pressure[i] = clamp(
        game.doors.pressure[i] + dt, 0, PRESSURE_TIME);
      if (game.doors.pressure[i] >= PRESSURE_TIME) {
        game.doors.equalizing[i] = false;
        emit(game, 'pressure-ready', { floor: i });
      }
    }
  }

  function currentFloorIndex(game) {
    return isAtFloor(game);
  }

  // 请求压力平衡：停靠后气闸开始抽/充气，PRESSURE_TIME 秒后才能开门
  function startPressure(game) {
    const idx = currentFloorIndex(game);
    if (idx < 0) return { ok: false, reason: 'not-docked' };
    if (game.doors.pressure[idx] >= PRESSURE_TIME) {
      return { ok: false, reason: 'already-balanced' };
    }
    game.doors.equalizing[idx] = true;
    emit(game, 'pressure-start', {
      floor: idx, duration: PRESSURE_TIME,
    });
    return { ok: true };
  }

  function pressureProgress(game, floorIndex) {
    return clamp(game.doors.pressure[floorIndex] / PRESSURE_TIME, 0, 1);
  }

  // 开门：压力未平衡则失败（记录违规、报警，门保持关闭）
  function openDoor(game) {
    if (game.status !== 'running') return { ok: false, reason: 'game-over' };
    const idx = currentFloorIndex(game);
    if (idx < 0) return { ok: false, reason: 'not-docked' };
    if (game.doors.open) return { ok: false, reason: 'already-open' };
    if (game.doors.pressure[idx] < PRESSURE_TIME) {
      game.violations += 1;
      emit(game, 'early-open-blocked', {
        floor: idx,
        progress: round3(pressureProgress(game, idx)),
        violations: game.violations,
      });
      return {
        ok: false, reason: 'pressure-imbalance',
        violations: game.violations,
        progress: pressureProgress(game, idx),
      };
    }
    game.doors.open = true;
    emit(game, 'door-open', { floor: idx });
    autoDeliver(game, idx);
    return { ok: true, floor: idx };
  }

  function closeDoor(game) {
    if (!game.doors.open) return { ok: false, reason: 'door-closed' };
    const idx = currentFloorIndex(game);
    game.doors.open = false;
    emit(game, 'door-close', { floor: idx });
    return { ok: true };
  }

  // 开门瞬间自动卸载目的层匹配的设备
  function autoDeliver(game, floorIndex) {
    const remaining = [];
    for (const id of game.cargo) {
      if (EQUIPMENT[id].toFloor === floorIndex) {
        if (!game.delivered.includes(id)) game.delivered.push(id);
        emit(game, 'delivered', { equipment: id, floor: floorIndex });
      } else {
        remaining.push(id);
      }
    }
    game.cargo = remaining;
  }

  function checkWin(game) {
    if (game.status !== 'running') return;
    const allDelivered = EQUIP_IDS.every((id) => game.delivered.includes(id));
    if (allDelivered && game.car.y === 0 && game.car.status === 'idle') {
      game.status = 'won';
      emit(game, 'win', {
        time: game.time, violations: game.violations,
        impacts: game.impactCount, hull: game.hull,
      });
    }
  }

  function drainEvents(game) {
    const out = game.events.splice(0, game.events.length);
    return out;
  }

  // 连续推进直到状态为 idle / impact / 结束，或到达 maxSeconds
  function advanceUntilIdle(game, maxSeconds = 120, onStep) {
    const dt = 0.02;
    let elapsed = 0;
    while (game.status === 'running'
      && !['idle', 'impact', 'undershoot'].includes(game.car.status)
      && elapsed < maxSeconds) {
      step(game, dt);
      if (onStep) onStep(game);
      elapsed += dt;
    }
    return game;
  }

  return {
    G, FLOOR_HEIGHT, FLOORS, CRUISE_SPEED, CREEP_SPEED, ACCEL,
    PRESSURE_TIME, DOCK_TOLERANCE,
    EQUIPMENT, EQUIP_IDS, BUFFERS, BUFFER_IDS, CAR_MASS,
    createGame, emit, totalCargoWeight, effectiveMass,
    setBuffer, setDockingPlan, toggleLoad, brakingDistance,
    nearestFloorIndex, isAtFloor, currentFloorIndex,
    startMove, applyBrake, deceleration, resolveImpact, step,
    settleCar, creepToFloor, startPressure, pressureProgress,
    openDoor, closeDoor, autoDeliver, checkWin, drainEvents,
    advanceUntilIdle, nextPlannedFloor,
    clamp, round3,
  };
});
