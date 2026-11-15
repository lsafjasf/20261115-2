// 物理模型：8 个玻璃杯的水位、温度、共振频率、振动与裂纹状态。

export const GLASS_COUNT = 8;

// C 大调音阶 C4..C5，基准频率（Hz）
const NOTE_NAMES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const BASE_FREQS = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];

// 水温系数：水量越多，玻璃振动受阻尼越大，音高越低（0.5%~6% 下移）
const WATER_LEVELS = [0.82, 0.7, 0.6, 0.5, 0.4, 0.31, 0.22, 0.13];

// 每升高 1°C 的相对频偏（热膨胀使弹性模量下降 -> 频率降低）
export const TEMP_COEFF = -0.0012;

// 敲击力度超过该阈值即裂杯
export const CRACK_FORCE = 1.0;

// 自然冷却速率（°C/秒）
const COOL_RATE = 1.6;
// 摩擦升温速率（°C/秒，满强度摩擦）
const RUB_HEAT_RATE = 9.0;
// 敲击振动衰减系数（指数衰减）
const VIBRATION_DECAY = 2.4;

export function createGlasses() {
  return BASE_FREQS.map((freq, i) => ({
    id: i,
    note: NOTE_NAMES[i],
    baseFreq: freq,
    water: WATER_LEVELS[i],
    temperature: 20,           // °C
    vibration: 0,              // 当前振动振幅 0..1
    rubEnergy: 0,              // 当前摩擦能量 0..1
    cracked: false,
  }));
}

// 水负载造成的静态频率下移
export function waterShift(glass) {
  return 1 - 0.075 * glass.water;
}

// 冷态（20°C）实际频率
export function coldFreq(glass) {
  return glass.baseFreq * waterShift(glass);
}

// 当前温度下的共振频率
export function resonantFreq(glass) {
  const dt = glass.temperature - 20;
  return coldFreq(glass) * (1 + TEMP_COEFF * dt);
}

// 当前音高相对冷态的偏移（cent，100 cent = 一个半音）
export function detuneCents(glass) {
  return 1200 * Math.log2(resonantFreq(glass) / coldFreq(glass));
}

// 敲击：force 0..1.2，过强裂杯；返回事件描述
export function strike(glass, force) {
  if (glass.cracked) return { type: 'dead' };
  if (force >= CRACK_FORCE) {
    glass.cracked = true;
    glass.vibration = 0.9;
    return { type: 'crack', force };
  }
  glass.vibration = Math.max(glass.vibration, Math.min(1, force));
  // 敲击附带少量摩擦热
  glass.temperature += 0.25 * force;
  return { type: 'ring', force };
}

// 摩擦：intensity 0..1，持续施加
export function rub(glass, intensity, dt) {
  if (glass.cracked) return;
  const heat = RUB_HEAT_RATE * Math.max(0, Math.min(1, intensity)) * dt;
  glass.temperature += heat;
  glass.rubEnergy = Math.max(glass.rubEnergy, Math.min(1, intensity));
  glass.vibration = Math.max(glass.vibration, 0.25 * intensity);
}

// 每帧推进物理状态
export function step(glasses, dt) {
  for (const g of glasses) {
    g.temperature = Math.max(20, g.temperature - COOL_RATE * dt);
    g.vibration *= Math.exp(-VIBRATION_DECAY * dt);
    if (g.vibration < 0.001) g.vibration = 0;
    g.rubEnergy *= Math.exp(-6 * dt);
  }
}

// 目标旋律（欢乐颂前 12 音），元素为玻璃杯 id
export const MELODY = [2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2];

// 判断一次发声是否命中下一个目标音（容差 80 cent）
export function matchNote(glass, targetId) {
  if (glass.id !== targetId || glass.cracked) return false;
  return Math.abs(detuneCents(glass)) < 80;
}
