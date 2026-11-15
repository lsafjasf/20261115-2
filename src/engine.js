// 潮汐铁路调度仿真引擎（纯逻辑，无 DOM 依赖，可在 Node 中直接测试）

export const SIM_DURATION = 1800; // 潮位窗口总时长（秒）
export const STEP = 0.5; // 仿真步长（秒）
export const TRAIN_COUNT = 3;
export const DEPART_INTERVAL = 80; // 三列车依次发车的间隔（秒）
export const MAX_DECEL = 1.2; // 最大常用制动减速度 m/s^2（惯性限制）
export const MAX_ACCEL = 0.7; // 启动加速度 m/s^2
export const FLOOD_HYSTERESIS = 0.18; // 封锁迟滞（米）：水位回落到高程以下 0.18m 才解封

// 轨道分段：kind 决定平面形状；elevation 为路基高程（米），低于潮位即被淹
// route: 'coastal' 沿海线（易淹） | 'bypass' 内陆绕行线（安全但更长）
// junction 段（道岔）两条路线共用
export const SEGMENTS = [
  { id: 's0', name: '车辆段', length: 160, elevation: 4.0, speed: 24, route: 'shared' },
  { id: 's1', name: '1号道岔', length: 120, elevation: 3.5, speed: 14, route: 'shared', junction: true },
  { id: 'c2', name: '海堤段A', length: 300, elevation: 2.3, speed: 28, route: 'coastal' },
  { id: 'c3', name: '临海站', length: 200, elevation: 2.0, speed: 18, route: 'coastal', station: 'linhai' },
  { id: 'c4', name: '海堤段B', length: 320, elevation: 1.7, speed: 28, route: 'coastal' },
  { id: 'c5', name: '礁石弯道', length: 240, elevation: 2.1, speed: 16, route: 'coastal' },
  { id: 'b2', name: '内陆联络线A', length: 300, elevation: 4.5, speed: 22, route: 'bypass' },
  { id: 'b3', name: '内陆站', length: 180, elevation: 4.2, speed: 18, route: 'bypass', station: 'neilu' },
  { id: 'b4', name: '内陆联络线B', length: 280, elevation: 4.8, speed: 22, route: 'bypass' },
  { id: 'b5', name: '丘陵弯道', length: 220, elevation: 5.0, speed: 16, route: 'bypass' },
  { id: 's6', name: '2号道岔', length: 120, elevation: 3.5, speed: 14, route: 'shared', junction: true },
  { id: 's7', name: '终点前直道', length: 260, elevation: 3.8, speed: 24, route: 'shared' },
  { id: 's8', name: '终点', length: 140, elevation: 4.0, speed: 18, route: 'shared', terminal: true },
];

export const SEGMENT_IDS = SEGMENTS.map((s) => s.id);
const SEG_BY_ID = new Map(SEGMENTS.map((s) => [s.id, s]));

// 两条可选路径（道岔 s1 分流、s6 合流）
export const ROUTES = {
  coastal: ['s0', 's1', 'c2', 'c3', 'c4', 'c5', 's6', 's7', 's8'],
  bypass: ['s0', 's1', 'b2', 'b3', 'b4', 'b5', 's6', 's7', 's8'],
};

// 每段的累计起点里程（按路线分别计算）
function buildPath(routeIds) {
  let acc = 0;
  return routeIds.map((id) => {
    const seg = SEG_BY_ID.get(id);
    const node = { id, start: acc, length: seg.length, end: acc + seg.length, seg };
    acc += seg.length;
    return node;
  });
}

export const PATH = {
  coastal: buildPath(ROUTES.coastal),
  bypass: buildPath(ROUTES.bypass),
};

export function pathLength(route) {
  const p = PATH[route];
  return p[p.length - 1].end;
}

// ---- 固定 seed 的伪随机数（mulberry32）----
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 固定 seed 生成潮汐曲线：多个正弦周期叠加 + 平滑随机涌浪
export function makeTideCurve(seed = 20261115) {
  const rnd = mulberry32(seed);
  // 单峰主潮：峰值时刻与宽度由固定 seed 决定，窗口内保证只涨落一次
  const peakTime = 520 + rnd() * 120;
  const peakWidth = 300 + rnd() * 80;
  const peakAmp = 2.35 + rnd() * 0.25;
  const baseLevel = 0.05 + rnd() * 0.1;
  // 两次较小的次级周期（振幅、周期由 seed 决定，相位固定以保证开局低潮）
  const waves = [
    { amp: 0.18 + rnd() * 0.1, period: 500 + rnd() * 160, phase: rnd() * Math.PI },
    { amp: 0.1 + rnd() * 0.08, period: 260 + rnd() * 120, phase: rnd() * Math.PI },
  ];
  const swell = [];
  let smooth = 0;
  for (let t = 0; t <= SIM_DURATION; t += STEP) {
    smooth = smooth * 0.94 + (rnd() - 0.5) * 0.18;
    swell.push(smooth);
  }
  return function tideAt(t) {
    // 高斯单峰主潮 + 低基线
    let h = baseLevel + peakAmp * Math.exp(-(((t - peakTime) / peakWidth) ** 2));
    for (const w of waves) {
      h += w.amp * Math.sin(((2 * Math.PI) / w.period) * t + w.phase);
    }
    const idx = Math.min(swell.length - 1, Math.max(0, Math.round(t / STEP)));
    return h + swell[idx];
  };
}

// 某段在给定潮位下是否被淹
export function isFlooded(seg, waterLevel) {
  return waterLevel >= seg.elevation;
}

// ---- 列车与对局 ----
export const TRAIN_DEFAULTS = {
  names: ['东风01', '东风02', '东风03'],
  colors: ['#e5484d', '#3e63dd', '#2a9d8f'],
  dwellChoices: [20, 40, 60, 90], // 可选停站时长（秒）
  speedChoices: [10, 14, 18, 22, 26], // 可选限速（m/s）
};

export function createTrain(index, route, speedLimit, dwell) {
  return {
    id: index,
    name: TRAIN_DEFAULTS.names[index],
    color: TRAIN_DEFAULTS.colors[index],
    route,
    path: PATH[route],
    position: 0,
    speed: 0,
    status: 'holding', // holding | running | dwell | blocked | finished | crashed
    departAt: index * DEPART_INTERVAL,
    delay: 0, // 玩家设定的额外发车等待（秒）
    dwell,
    dwellRemaining: 0,
    speedLimit,
    segmentId: pathSegmentAt(PATH[route], 0).id,
    visitedStations: new Set(),
    finishedAt: null,
    crashReason: null,
    lastAspect: 'green',
  };
}

export function createGame(options = {}) {
  const seed = options.seed ?? 20261115;
  const tideAt = makeTideCurve(seed);
  const trains = [];
  const presets = options.trains || [
    { route: 'coastal', speedLimit: 18, dwell: 40 },
    { route: 'coastal', speedLimit: 18, dwell: 40 },
    { route: 'coastal', speedLimit: 18, dwell: 40 },
  ];
  presets.slice(0, TRAIN_COUNT).forEach((p, i) => {
    trains.push(createTrain(i, p.route, p.speedLimit, p.dwell));
  });
  return {
    t: 0,
    seed,
    tideAt,
    waterLevel: tideAt(0),
    flooded: new Set(),
    trains,
    status: 'running', // running | success | failed
    failReason: null,
    log: [],
    events: [], // 结构化事件，供测试断言
  };
}

export function pathSegmentAt(path, position) {
  for (const node of path) {
    if (position < node.end || node === path[path.length - 1]) return node;
  }
  return path[path.length - 1];
}

function pushEvent(game, type, detail) {
  const ev = { t: game.t, type, ...detail };
  game.events.push(ev);
  game.log.push(ev);
  if (game.log.length > 200) game.log.shift();
}

// 玩家调整：道岔（路线）、限速、停站时长；列车进入 s1 后锁定路线
export function setRoute(game, trainId, route) {
  const train = game.trains[trainId];
  const s1 = train.path.find((n) => n.id === 's1');
  if (train.status === 'finished' || train.status === 'crashed') return false;
  if (train.position >= s1.end) return false; // 已过分流道岔，路线锁定
  train.route = route;
  train.path = PATH[route];
  return true;
}

export function setSpeedLimit(game, trainId, speedLimit) {
  const train = game.trains[trainId];
  if (train.status === 'finished' || train.status === 'crashed') return false;
  train.speedLimit = speedLimit;
  return true;
}

export function setDwell(game, trainId, dwell) {
  const train = game.trains[trainId];
  if (train.status === 'finished' || train.status === 'crashed') return false;
  train.dwell = dwell;
  return true;
}

// 发车延迟（在车辆段等待潮位回落），仅待发状态可调整
export function setDelay(game, trainId, delay) {
  const train = game.trains[trainId];
  if (train.status !== 'holding') return false;
  train.delay = Math.max(0, delay);
  return true;
}

// 为了在剩余距离 d 内停下，当前允许的最大速度
function maxStopSpeed(d) {
  const effective = d - 4; // 预留一个步长的走行+计算余量，保证在封锁点外停稳
  if (effective <= 0) return 0;
  return Math.sqrt(Math.max(0, 2 * MAX_DECEL * effective));
}

// 扫描前方路径，返回当前允许的目标速度（考虑限速、封锁、停站、终点和前车）
function scanAhead(game, train, node) {
  let target = Math.min(train.speedLimit, node.seg.speed);
  let aspect = 'green';
  const pos = train.position;

  for (const n of train.path) {
    if (n.end <= pos) continue; // 已完全驶过
    const seg = n.seg;
    // 限速：进入该段前必须降到段内限速
    if (n.start > pos && seg.speed < target) {
      target = Math.min(target, Math.max(seg.speed, maxStopSpeed(n.start - pos)));
    }

    // 封锁点（水淹或前车占用）：需要在该段入口前停下
    if (game.flooded.has(n.id)) {
      aspect = 'red';
      const distToEntry = Math.max(0, n.start - pos);
      target = Math.min(target, maxStopSpeed(distToEntry));
      if (distToEntry <= 0.5 && train.speed <= 0.05) return { target: 0, aspect: 'red' };
    }

    // 车站：在站段中点停车（若尚未停靠过）
    if (seg.station && !train.visitedStations.has(seg.station)) {
      const stopAt = n.start + n.length / 2;
      const d = stopAt - pos;
      if (d > 0) {
        target = Math.min(target, maxStopSpeed(d));
        if (d < 260 && aspect === 'green') aspect = 'yellow';
      }
    }
  }

  // 前车防护：同一轨道上保持 120m 安全间隔
  const gaps = game.trains
    .filter(
      (other) =>
        other.id !== train.id &&
        other.route === train.route &&
        other.status !== 'crashed' &&
        other.status !== 'holding' && // 车辆段待发列车不构成障碍物
        other.status !== 'finished', // 已到达终点的列车退出闭塞
    )
    .map((other) => other.position - pos)
    .filter((d) => d > 0);
  const ahead = gaps.length ? Math.min(...gaps) : undefined;
  if (ahead !== undefined) {
    const gap = ahead - 120; // 必须在距前车 120m 处停下
    if (gap <= 320) {
      target = Math.min(target, maxStopSpeed(gap));
      aspect = 'red';
    } else if (gap < 500 && aspect === 'green') {
      aspect = 'yellow';
    }
  }
  return { target, aspect };
}

function failGame(game, reason) {
  game.status = 'failed';
  game.failReason = reason;
  pushEvent(game, 'game_failed', { reason });
}

export function stepGame(game) {
  if (game.status !== 'running') return game;
  game.t += STEP;
  if (game.t > SIM_DURATION) {
    failGame(game, '潮位窗口关闭，仍有列车未到达终点（超时）');
    return game;
  }

  // 潮位与自动封锁
  const level = game.tideAt(game.t);
  game.waterLevel = level;
  const prev = new Set(game.flooded);
  const next = new Set();
  for (const seg of SEGMENTS) {
    const wasFlooded = prev.has(seg.id);
    // 迟滞：淹没判定按高程；已淹没区段需水位回落到高程 - 迟滞量才解封
    const nowFlooded = wasFlooded
      ? level >= seg.elevation - FLOOD_HYSTERESIS
      : level >= seg.elevation;
    if (nowFlooded) {
      next.add(seg.id);
      if (!wasFlooded) {
        pushEvent(game, 'segment_flooded', { segmentId: seg.id, name: seg.name, level });
      }
    } else if (wasFlooded) {
      pushEvent(game, 'segment_reopened', { segmentId: seg.id, name: seg.name, level });
    }
  }
  game.flooded = next;

  for (const train of game.trains) {
    stepTrain(game, train);
    if (game.status !== 'running') break;
  }

  if (game.status === 'running' && game.trains.every((tr) => tr.status === 'finished')) {
    game.status = 'success';
    pushEvent(game, 'game_success', {});
  }
  return game;
}

function crash(game, train, reason) {
  train.status = 'crashed';
  train.crashReason = reason;
  pushEvent(game, 'train_crashed', { trainId: train.id, name: train.name, reason, segmentId: train.segmentId });
  failGame(game, reason);
}

function stepTrain(game, train) {
  if (train.status === 'finished' || train.status === 'crashed') return;

  // 车辆段待发
  if (train.status === 'holding') {
    if (game.t >= train.departAt + train.delay) {
      train.status = 'running';
      pushEvent(game, 'train_departed', { trainId: train.id, name: train.name });
    } else {
      return;
    }
  }

  // 停站倒计时
  if (train.status === 'dwell') {
    train.dwellRemaining -= STEP;
    if (train.dwellRemaining <= 0) {
      train.status = 'running';
      pushEvent(game, 'train_resumed', { trainId: train.id, name: train.name, station: train.segmentId });
    } else {
      return;
    }
  }

  const node = pathSegmentAt(train.path, train.position);
  train.segmentId = node.id;
  const { target, aspect } = scanAhead(game, train, node);
  train.lastAspect = aspect;

  // 惯性下的牵引/制动：不能瞬时减速
  if (train.speed < target - 1e-6) {
    train.speed = Math.min(target, train.speed + MAX_ACCEL * STEP);
  } else if (train.speed > target + 1e-6) {
    train.speed = Math.max(target, train.speed - MAX_DECEL * STEP);
  }

  const previousPosition = train.position;
  train.position += train.speed * STEP;

  // 涉水事故：本步移动后处于被淹区段
  const nowNode = pathSegmentAt(train.path, train.position);
  train.segmentId = nowNode.id;
  const enteredBlocked =
    game.flooded.has(nowNode.id) &&
    (nowNode.id !== node.id || previousPosition < nowNode.start);
  if (enteredBlocked) {
    crash(
      game,
      train,
      `${train.name} 涉水：${nowNode.seg.name}已被潮水淹没（${game.waterLevel.toFixed(2)}m ≥ 路基${nowNode.seg.elevation}m），制动距离不足冲入封锁区段`,
    );
    return;
  }

  // 追尾：撞上同路线前车
  const leadGaps = game.trains
    .filter(
      (other) =>
        other.id !== train.id &&
        other.route === train.route &&
        other.status !== 'crashed' &&
        other.status !== 'holding' &&
        other.status !== 'finished' &&
        other.position > train.position, // 车辆段待发列车在身后，不构成前车
    )
    .map((other) => ({ other, gap: other.position - previousPosition }))
    .filter((x) => x.gap <= 60) // 车头间距缩小到 60m 以内才算物理接触
    .sort((a, b) => a.gap - b.gap);
  const lead = leadGaps[0]?.other;
  if (lead) {
    crash(game, train, `${train.name} 与前车 ${lead.name} 追尾，安全间隔不足`);
    return;
  }

  // 车站停车：到达站段中点且尚未停靠
  if (nowNode.seg.station && !train.visitedStations.has(nowNode.seg.station)) {
    const stopAt = nowNode.start + nowNode.length / 2;
    const overshot = train.position >= stopAt;
    const nearlyStoppedAtPoint = stopAt - train.position <= 3 && train.speed <= 1.2;
    if (overshot || nearlyStoppedAtPoint) {
      if (train.speed > 2.5) {
        crash(game, train, `${train.name} 在${nowNode.seg.name}冒进停车点（速度 ${train.speed.toFixed(1)}m/s 未能刹停）`);
        return;
      }
      train.position = stopAt;
      train.speed = 0;
      train.visitedStations.add(nowNode.seg.station);
      train.status = 'dwell';
      train.dwellRemaining = train.dwell;
      pushEvent(game, 'train_stopped_station', {
        trainId: train.id,
        name: train.name,
        station: nowNode.seg.station,
        dwell: train.dwell,
      });
      return;
    }
  }

  // 到达终点
  if (nowNode.seg.terminal) {
    train.status = 'finished';
    train.speed = 0;
    train.finishedAt = game.t;
    pushEvent(game, 'train_arrived', { trainId: train.id, name: train.name, at: game.t });
    return;
  }

  // 封锁外等待状态（仅用于 UI 展示）
  if (train.speed <= 0.05 && aspect === 'red') train.status = 'blocked';
  else if (train.status === 'blocked') train.status = 'running';
}

// 便捷：一次性跑完整局，返回最终状态
export function runToEnd(game, maxSteps = Math.ceil(SIM_DURATION / STEP) + 10) {
  let steps = 0;
  while (game.status === 'running' && steps < maxSteps) {
    stepGame(game);
    steps += 1;
  }
  return game;
}
