// 无头协作测试：模拟两名玩家完成三张不同距离的照片，并验证一次失焦。
const L = require("./logic.js");
const assert = require("assert");

// 确定性随机数，保证测试可复现
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 曝光手：根据当前光线反推最接近的 光圈/快门 组合
function meterFor(ev) {
  let best = null;
  for (const ap of L.APERTURES) {
    for (const sh of L.SHUTTERS) {
      const err = Math.abs(L.exposureError(ap, sh, ev));
      if (!best || err < best.err) best = { ap, sh, err };
    }
  }
  return best;
}

function waitForBird(game, zoneId) {
  for (let i = 0; i < 20000; i++) {
    L.tick(game, 0.1);
    if (game.bird && game.bird.zone === zoneId) return game.bird;
  }
  throw new Error("等不到分区 " + zoneId + " 的鸟");
}

const game = L.createGame(mulberry32(20261114));
const log = [];

function snap(label, focus, ap, sh) {
  const r = L.shoot(game, focus, ap, sh);
  log.push({
    label, focus: focus.toFixed(1), bird: r.bird && r.bird.toFixed(1),
    ap, sh, verdict: r.verdict, reason: r.reason,
  });
  return r;
}

// ---- 测试 1：故意失焦（曝光正确，焦点偏离）----
let bird = waitForBird(game, "near");
let m = meterFor(game.sceneEV);
const badFocus = bird.distance + L.focusTolerance(bird.distance, m.ap) * 3;
const r1 = snap("失焦测试", badFocus, m.ap, m.sh);
assert.strictEqual(r1.verdict, "misfocus", "偏离焦点应判失焦");
assert.strictEqual(game.keepers.length, 0, "失焦照片不计入成功");

// ---- 测试 2-4：三个不同距离分区各拍一张合格照片 ----
for (const zoneId of ["near", "mid", "far"]) {
  bird = waitForBird(game, zoneId);
  m = meterFor(game.sceneEV);
  const r = snap("收录 " + zoneId, bird.distance, m.ap, m.sh);
  assert.strictEqual(r.verdict, "keeper", zoneId + " 应成功");
  assert.strictEqual(r.zone, zoneId);
}

assert.strictEqual(game.keepers.length, 3, "应有 3 张成功照片");
assert.strictEqual(game.status, "won", "游戏应判定胜利");
assert.ok(game.film >= 0 && game.shots.length <= L.FILM_TOTAL, "胶片消耗合法");

// ---- 附加校验：纯函数行为 ----
assert.ok(L.focusError(8, 8, 8).ok, "焦点重合必合焦");
assert.ok(!L.focusError(2, 30, 8).ok, "焦点严重偏离必失焦");
assert.ok(L.exposureOk(8, 1 / 125, 13), "f/8 1/125 在 EV13 应曝光正常");
assert.ok(!L.exposureOk(4, 1, 13), "f/4 1s 在 EV13 应严重过曝");
assert.ok(!L.exposureOk(45, 1 / 500, 13), "f/45 1/500 在 EV13 应严重欠曝");

console.log("拍摄记录：");
for (const s of log) {
  const shLabel = s.sh >= 1 ? s.sh + "s" : "1/" + Math.round(1 / s.sh) + "s";
  console.log(
    "  [" + s.label + "] 对焦=" + s.focus + "m 鸟=" + s.bird + "m f/" + s.ap +
    " " + shLabel + " -> " + s.verdict + "（" + s.reason + "）"
  );
}
console.log("");
console.log("结果：" + game.status + " | 成功 " + game.keepers.length +
  "/3 张（" + game.keepers.join(", ") + "）| 剩余胶片 " + game.film);
console.log("全部断言通过 ✓");
