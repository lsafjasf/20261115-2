export const CYCLE_SECONDS = 96;
export const STEP_SECONDS = 0.25;
export const COLONY_START = 56;
export const COLONY_MIN = 40;
export const START_HOUR = 6;

export const RELEASE_ZONES = {
  west: {
    name: '西侧',
    detail: '靠近番茄区',
    factors: { tomato: 1.1, strawberry: 1, blueberry: 0.9 },
  },
  center: {
    name: '中央',
    detail: '均衡覆盖',
    factors: { tomato: 1, strawberry: 1, blueberry: 1 },
  },
  east: {
    name: '东侧',
    detail: '靠近蓝莓区',
    factors: { tomato: 0.9, strawberry: 1, blueberry: 1.1 },
  },
};

export const CROP_DEFS = [
  {
    id: 'tomato',
    name: '樱桃番茄',
    variety: '粉贝贝',
    icon: '●',
    accent: '#d46643',
    leaf: '#55754b',
    initialResidue: 0.03,
  },
  {
    id: 'strawberry',
    name: '四季草莓',
    variety: '红颜',
    icon: '♥',
    accent: '#c84d57',
    leaf: '#6c8752',
    initialResidue: 0.28,
  },
  {
    id: 'blueberry',
    name: '高丛蓝莓',
    variety: '蓝丰',
    icon: '✦',
    accent: '#607d9d',
    leaf: '#4d6d55',
    initialResidue: 0.05,
  },
];

export const SCENARIOS = {
  balanced: { ventilation: 82, shade: 72, releaseZone: 'center' },
  weakVentilation: { ventilation: 5, shade: 14, releaseZone: 'west' },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function makeCrops() {
  return CROP_DEFS.map((def) => ({
    ...def,
    pollination: 0,
    growth: 0,
    visits: 0,
    residue: def.initialResidue,
    ripe: false,
    stage: '等待授粉',
  }));
}

function createEvent(game, type, text) {
  const event = { t: game.t, type, text, clock: gameClock(game.t) };
  game.events.push(event);
  game.log.push(event);
  if (game.log.length > 80) game.log.shift();
  return event;
}

export function gameClock(t, duration = CYCLE_SECONDS) {
  const minutes = START_HOUR * 60 + (clamp(t / duration, 0, 1) * 12 * 60);
  const hour = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function createGame(options = {}) {
  const settings = {
    ventilation: 30,
    shade: 35,
    releaseZone: 'center',
    ...(options.settings || {}),
  };
  const game = {
    t: 0,
    duration: CYCLE_SECONDS,
    status: 'ready',
    settings,
    crops: makeCrops(),
    colony: COLONY_START,
    colonyMinSeen: COLONY_START,
    temp: 22,
    humidity: 64,
    solar: 0,
    activity: 0.82,
    heatStress: 0,
    residueLoad: 0.12,
    fruitCount: 0,
    events: [],
    log: [],
    flags: {},
    result: null,
  };
  updateEnvironment(game);
  createEvent(game, 'info', '蜂箱已就位，三块花田等待授粉。');
  createEvent(game, 'warn', '草莓区检出农残 0.28 mg/kg，通风可加速降解。');
  return game;
}

export function resetGame(game, options = {}) {
  return createGame({ settings: options.settings || game.settings });
}

export function updateEnvironment(game) {
  const progress = clamp(game.t / game.duration, 0, 1);
  const { ventilation, shade } = game.settings;
  const solar = Math.pow(Math.sin(progress * Math.PI), 0.9);
  const noonPulse = progress > 0.38 && progress < 0.64
    ? Math.sin(((progress - 0.38) / 0.26) * Math.PI) * 0.7
    : 0;

  game.progress = progress;
  game.solar = solar;
  game.temp = 19.5 + solar * 4.2 + (1 - ventilation / 100) * 4.8
    + (1 - shade / 100) * 3.2 + noonPulse;
  game.humidity = clamp(66 + shade * 0.11 - ventilation * 0.06 - solar * 5, 38, 88);
  game.residueLoad = game.crops.reduce((sum, crop) => sum + crop.residue, 0)
    / game.crops.length;

  const heatPenalty = clamp((game.temp - 27.4) / 5.8, 0, 1) * 0.58;
  const residuePenalty = clamp((game.residueLoad - 0.035) / 0.27, 0, 1) * 0.3;
  const colonyPenalty = clamp((COLONY_START - game.colony) / 32, 0, 1) * 0.22;
  game.activity = clamp(1 - heatPenalty - residuePenalty - colonyPenalty, 0.08, 1);
  game.heatStress = clamp((game.temp - 28.2) / 5, 0, 1);
}

export function forecastNoonTemperature(settings) {
  return 19.5 + 4.2 + (1 - settings.ventilation / 100) * 4.8
    + (1 - settings.shade / 100) * 3.2 + 0.7;
}

function localResidueFactor(crop) {
  return 1 - clamp((crop.residue - 0.035) * 1.85, 0, 0.46);
}

function stageFor(crop) {
  if (crop.ripe) return '果实成熟';
  if (crop.pollination >= 80) return '充分授粉';
  if (crop.pollination >= 58) return '授粉中';
  if (crop.pollination > 8) return '访花开始';
  return '等待授粉';
}

function updateCrops(game, dt) {
  const zone = RELEASE_ZONES[game.settings.releaseZone] || RELEASE_ZONES.center;
  const colonyFactor = clamp(0.48 + game.colony / 56 * 0.52, 0.48, 1);

  for (const crop of game.crops) {
    const releaseFactor = zone.factors[crop.id];
    const visitRate = 2.02
      * Math.pow(game.activity, 1.2)
      * colonyFactor
      * releaseFactor
      * localResidueFactor(crop);
    crop.visits += visitRate * dt;
    crop.pollination = clamp(crop.pollination + visitRate * dt, 0, 100);

    if (crop.pollination >= 58) {
      const strength = clamp((crop.pollination - 55) / 45, 0, 1);
      crop.growth = clamp(
        crop.growth + dt * 3.25 * strength * (0.72 + game.activity * 0.28),
        0,
        100,
      );
    }
    if (!crop.ripe && crop.pollination >= 80 && crop.growth >= 82) {
      crop.ripe = true;
      createEvent(game, 'good', `${crop.name}完成授粉，果实开始膨大。`);
    }
    crop.stage = stageFor(crop);
  }
  game.fruitCount = game.crops.filter((crop) => crop.ripe).length;
}

function updateResidue(game, dt) {
  const degradation = 0.0009 + game.settings.ventilation * 0.000025;
  for (const crop of game.crops) {
    crop.residue = Math.max(0.012, crop.residue - degradation * dt);
  }
  const strawberry = game.crops.find((crop) => crop.id === 'strawberry');
  if (strawberry && !game.flags.residueClear && strawberry.residue < 0.09) {
    game.flags.residueClear = true;
    createEvent(game, 'good', '草莓区农残已降至安全阈值以下。');
  }
}

function updateColony(game, dt) {
  const excessHeat = Math.max(0, game.temp - 28.2);
  const excessResidue = Math.max(0, game.residueLoad - 0.1);
  const decline = excessHeat * 0.17 + excessResidue * 3.4;

  if (decline > 0.002) {
    game.colony = Math.max(0, game.colony - decline * dt);
  } else if (game.activity > 0.64) {
    game.colony = Math.min(58, game.colony + 0.026 * dt);
  }
  game.colonyMinSeen = Math.min(game.colonyMinSeen, game.colony);

  if (!game.flags.heatWarning && game.temp > 29.1) {
    game.flags.heatWarning = true;
    createEvent(game, 'warn', '热应激出现：工蜂离巢减少，蜂群开始衰弱。');
  }
  if (!game.flags.colonyWarning && game.colony < 47) {
    game.flags.colonyWarning = true;
    createEvent(game, 'warn', '蜂群数量接近下限，请立即加强通风或遮阳。');
  }
  if (!game.flags.noonNotice && game.progress > 0.42) {
    game.flags.noonNotice = true;
    createEvent(game, 'info', '正午日照增强，温室热负荷进入峰值。');
  }
}

export function startGame(game) {
  if (game.status === 'ready') {
    game.status = 'running';
    createEvent(game, 'info', '授粉周期开始，蜂群出巢。');
  } else if (game.status === 'paused') {
    game.status = 'running';
  }
  return game.status;
}

export function pauseGame(game) {
  if (game.status === 'running') game.status = 'paused';
  return game.status;
}

export function setSettings(game, patch) {
  if (game.status === 'success' || game.status === 'failed') return false;
  if (patch.ventilation !== undefined) {
    game.settings.ventilation = clamp(Number(patch.ventilation), 0, 100);
  }
  if (patch.shade !== undefined) {
    game.settings.shade = clamp(Number(patch.shade), 0, 100);
  }
  if (patch.releaseZone && RELEASE_ZONES[patch.releaseZone]) {
    game.settings.releaseZone = patch.releaseZone;
  }
  updateEnvironment(game);
  return true;
}

export function finishGame(game) {
  if (game.status === 'success' || game.status === 'failed') return game.result;
  game.t = game.duration;
  updateEnvironment(game);
  game.colonyMinSeen = Math.min(game.colonyMinSeen, game.colony);
  const cropsRipe = game.crops.every((crop) => crop.ripe);
  const colonySafe = game.colonyMinSeen >= COLONY_MIN - 1e-6;
  const success = cropsRipe && colonySafe;
  const reasons = [];
  if (!cropsRipe) {
    const failedCrops = game.crops.filter((crop) => !crop.ripe).map((crop) => crop.name);
    reasons.push(`${failedCrops.join('、')}授粉不足`);
  }
  if (!colonySafe) {
    reasons.push(`蜂群最低降至 ${Math.floor(game.colonyMinSeen)} 只，跌破下限`);
  }
  game.status = success ? 'success' : 'failed';
  game.result = {
    success,
    title: success ? '三块花田全部坐果' : '本周期未达标',
    summary: success
      ? '蜂群数量保持在安全线以上，温室完成了一次完整授粉周期。'
      : `${reasons.join('；')}。调整通风、遮阳或放蜂区后再试一次。`,
    fruitCount: game.fruitCount,
    colony: game.colony,
    colonyMin: game.colonyMinSeen,
    cropsRipe,
    colonySafe,
  };
  createEvent(
    game,
    success ? 'good' : 'warn',
    success ? '周期结束：三块作物全部坐果。' : `周期结束：${reasons.join('；')}。`,
  );
  return game.result;
}

export function tick(game, dt = STEP_SECONDS) {
  if (game.status !== 'running') return game;
  const step = clamp(dt, 0, 0.5);
  game.t = Math.min(game.duration, game.t + step);
  updateEnvironment(game);
  updateResidue(game, step);
  updateEnvironment(game);
  updateCrops(game, step);
  updateColony(game, step);
  updateEnvironment(game);
  if (game.t >= game.duration) finishGame(game);
  return game;
}

export function advance(game, seconds, dt = STEP_SECONDS) {
  if (game.status === 'ready' || game.status === 'paused') startGame(game);
  let remaining = Math.max(0, seconds);
  while (remaining > 0 && game.status === 'running') {
    const step = Math.min(dt, remaining);
    tick(game, step);
    remaining -= step;
  }
  return game;
}

export function runFullCycle(options = {}) {
  const game = createGame({ settings: options.settings || {} });
  startGame(game);
  advance(game, CYCLE_SECONDS, options.step || STEP_SECONDS);
  return game;
}
