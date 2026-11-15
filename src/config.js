// 分切机仿真全局配置（尺寸单位：毫米 mm，长度单位：米 m）

export const MASTER_WIDTH = 2000; // 母卷幅宽

// 四种订单：宽度 + 需要的精确长度（收卷轴长度，单位 m）
export const ORDERS = [
  { id: 'A', width: 520, target: 600, color: '#4f8cff' },
  { id: 'B', width: 380, target: 450, color: '#34c98b' },
  { id: 'C', width: 460, target: 500, color: '#f0a832' },
  { id: 'D', width: 420, target: 400, color: '#e05a7a' },
];

export const NOMINAL_TRIM = 110; // 标准左右废边各 110mm，合计 220mm
export const WASTE_TARGET_PERCENT = 12; // 废边率目标（%）

// 物理参数
export const MAX_SPEED = 300; // 最大卷速 m/min
export const RATED_SPEED = 200; // 额定卷速
export const MAX_TENSION = 100; // 张力设定范围 0-100（相对单位）
export const TENSION_OK_MIN = 42;
export const TENSION_OK_MAX = 68;
export const TENSION_BREAK_MIN = 82; // 高于该值开始有断纸风险
export const WIDTH_TOLERANCE = 2; // 刀距公差 ±2mm

// 默认（错误的）刀位，玩家需要重新对刀；5 把刀，单位 mm
// 正确刀位应为：110, 630, 1010, 1470, 1890
export const DEFAULT_KNIVES = [130, 660, 1000, 1450, 1870];

// 仿真时间倍率（测试时可调大以加速）
export const DEFAULT_TIME_SCALE = 1;
