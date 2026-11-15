export const WORLD = {
  width: 1600,
  height: 1120,
  damageLimit: 70,
};

export const START = {
  x: 760,
  y: 956,
  angle: -Math.PI / 2,
};

const top = 0;
const upper = 355;
const middle = 755;
const lower = 1035;
const left = 0;
const west = 295;
const center = 855;
const east = 1365;
const right = 1600;
const firstEnd = 205;
const secondEnd = 565;
const thirdEnd = 885;

export const BUILDINGS = [
  { id: "nw", x: left, y: top, w: 145, h: firstEnd, hue: 188, roof: "water" },
  { id: "n2", x: west, y: top, w: 370, h: firstEnd, hue: 173, roof: "vents" },
  { id: "n3", x: center, y: top, w: 340, h: firstEnd, hue: 198, roof: "tiles" },
  { id: "ne", x: east, y: top, w: 235, h: firstEnd, hue: 181, roof: "water" },
  { id: "w1", x: left, y: upper, w: 145, h: 210, hue: 194, roof: "tiles" },
  { id: "paper", x: west, y: upper, w: 370, h: 210, hue: 176, roof: "vents" },
  { id: "moon", x: center, y: upper, w: 340, h: 210, hue: 201, roof: "water" },
  { id: "e1", x: east, y: upper, w: 235, h: 210, hue: 184, roof: "tiles" },
  { id: "w2", x: left, y: middle, w: 145, h: 130, hue: 191, roof: "water" },
  { id: "flower", x: west, y: middle, w: 370, h: 130, hue: 168, roof: "tiles" },
  { id: "clock", x: center, y: middle, w: 340, h: 130, hue: 197, roof: "vents" },
  { id: "e2", x: east, y: middle, w: 235, h: 130, hue: 185, roof: "water" },
  { id: "sw", x: left, y: lower, w: 145, h: 85, hue: 183, roof: "vents" },
  { id: "s2", x: west, y: lower, w: 370, h: 85, hue: 195, roof: "tiles" },
  { id: "s3", x: center, y: lower, w: 340, h: 85, hue: 178, roof: "water" },
  { id: "se", x: east, y: lower, w: 235, h: 85, hue: 190, roof: "vents" },
];

export const PUDDLES = [
  { id: "start-water", x: 704, y: 966, rx: 92, ry: 39, rotation: -0.1 },
  { id: "west-cross", x: 218, y: 620, rx: 34, ry: 112, rotation: 0.08 },
  { id: "flower-road", x: 506, y: 972, rx: 105, ry: 34, rotation: 0.06 },
  { id: "north-alley", x: 535, y: 282, rx: 116, ry: 35, rotation: -0.04 },
  { id: "central-cross", x: 782, y: 438, rx: 39, ry: 102, rotation: 0.12 },
  { id: "moon-road", x: 993, y: 667, rx: 103, ry: 38, rotation: -0.1 },
  { id: "east-alley", x: 1282, y: 710, rx: 38, ry: 123, rotation: 0.03 },
  { id: "clock-road", x: 1102, y: 826, rx: 76, ry: 28, rotation: 0.25 },
];

export const DESTINATIONS = [
  {
    id: "flower",
    name: "槐花里 12",
    customer: "林阿姨",
    marker: { x: 480, y: 934 },
    door: { x: 480, y: 885, side: "south" },
    accent: "#ffc15c",
  },
  {
    id: "paper",
    name: "纸灯巷 14",
    customer: "陈师傅",
    marker: { x: 480, y: 300 },
    door: { x: 480, y: 355, side: "north" },
    accent: "#8ed8c6",
  },
  {
    id: "moon",
    name: "月井里 8",
    customer: "小周",
    marker: { x: 1040, y: 610 },
    door: { x: 1040, y: 565, side: "south" },
    accent: "#88c8ff",
  },
  {
    id: "clock",
    name: "旧钟巷 2",
    customer: "守夜人",
    marker: { x: 1242, y: 820 },
    door: { x: 1195, y: 820, side: "east" },
    accent: "#ff986d",
  },
];

export const LAMPS = [
  { x: 190, y: 250, lit: true },
  { x: 895, y: 250, lit: false },
  { x: 1258, y: 470, lit: true },
  { x: 350, y: 680, lit: false },
  { x: 920, y: 825, lit: true },
  { x: 1510, y: 685, lit: true },
];

export const TREES = [
  { x: 132, y: 300, r: 24 },
  { x: 315, y: 615, r: 30 },
  { x: 625, y: 585, r: 26 },
  { x: 880, y: 340, r: 25 },
  { x: 1165, y: 610, r: 29 },
  { x: 1398, y: 935, r: 24 },
  { x: 690, y: 1002, r: 28 },
  { x: 1110, y: 1008, r: 23 },
];

export const ROUTE_HINTS = [
  { x: 480, y: 934 },
  { x: 480, y: 300 },
  { x: 1040, y: 610 },
  { x: 1242, y: 820 },
];

