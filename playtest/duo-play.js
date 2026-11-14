/* 双人实测脚本：两名"玩家"通过键盘各自操控，完成三个浮标的航线。
 * 玩家一（舵手）：盯罗盘，按 左/右 把航向对准金色目标方位点。
 * 玩家二（桨帆手）：按 W/S 保持安全航速，按 A/D 把帆角调到风舷角一半附近。
 */
const { chromium } = require("playwright");
const path = require("path");

const ARTIFACTS = path.join(__dirname, "..", "artifacts");

function wrapDeg(d) {
  d = d % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

async function setKeys(page, held, want) {
  for (const key of Object.keys(want)) {
    if (want[key] && !held[key]) { await page.keyboard.down(key); held[key] = true; }
    if (!want[key] && held[key]) { await page.keyboard.up(key); held[key] = false; }
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 820 } });
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
  await page.goto("file://" + path.join(__dirname, "..", "index.html"));
  await page.waitForTimeout(400);

  await page.keyboard.press("w");
  await page.waitForTimeout(200);

  const held = {};
  const shots = { 1: false, 2: false };
  const t0 = Date.now();
  let result = "timeout";

  while (Date.now() - t0 < 140000) {
    const s = await page.evaluate(() => window.__game.snapshot());
    if (s.status === "won" || s.status === "lost") { result = s.status; break; }

    const want = { ArrowLeft: false, ArrowRight: false, w: false, s: false, a: false, d: false };
    if (s.target) {
      const err = wrapDeg(s.target.bearing - s.shownHeading);
      if (err > 4) want.ArrowRight = true;
      else if (err < -4) want.ArrowLeft = true;
    }

    if (s.speed < 45) want.w = true;
    else if (s.speed > 58) want.s = true;
    const optimalSail = Math.max(-60, Math.min(60, s.windRel / 2));
    if (s.sailAngle < optimalSail - 4) want.d = true;
    else if (s.sailAngle > optimalSail + 4) want.a = true;

    await setKeys(page, held, want);

    if (s.gatesPassed >= 1 && !shots[1]) {
      shots[1] = true;
      await page.screenshot({ path: path.join(ARTIFACTS, "playthrough-buoy1.png") });
    }
    if (s.gatesPassed >= 2 && !shots[2]) {
      shots[2] = true;
      await page.screenshot({ path: path.join(ARTIFACTS, "playthrough-buoy2.png") });
    }
    await page.waitForTimeout(66);
  }

  await setKeys(page, held, {});
  const final = await page.evaluate(() => window.__game.snapshot());
  await page.screenshot({ path: path.join(ARTIFACTS, "playthrough-final.png") });
  await browser.close();

  console.log(JSON.stringify({
    result,
    gatesPassed: final.gatesPassed,
    hull: final.hull,
    timeLeft: Math.round(final.timeLeft),
  }));
  process.exit(result === "won" ? 0 : 1);
})();
