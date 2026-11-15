import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const base = "file://" + path.join(dir, "index.html");

async function getState(page) {
  return page.evaluate(() => {
    const { state, CFG } = window.__game;
    return {
      phase: state.phase,
      failReason: state.failReason,
      timeLeft: state.timeLeft,
      x: state.car.x,
      v: state.car.v,
      cps: state.cps.map(c => ({ id: c.id, x: c.x, status: c.status, hasFault: c.hasFault })),
      exitX: CFG.exitX,
      zoneHalf: CFG.zoneHalf,
    };
  });
}

// ===== 场景一：完整玩一局并成功退出 =====
async function testSuccess() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  page.on("pageerror", e => { throw new Error("页面异常: " + e.message); });
  await page.goto(base + "?faults=0,2"); // 固定故障点：1号、3号需要工具

  await page.keyboard.press("ArrowRight"); // 任意键开始
  let driving = false;
  const t0 = Date.now();

  while (Date.now() - t0 < 90000) {
    const s = await getState(page);
    if (s.phase === "success" || s.phase === "fail") {
      await page.screenshot({ path: path.join(dir, "artifacts", "success.png") });
      await browser.close();
      if (s.phase !== "success") throw new Error("意外失败: " + s.failReason);
      console.log("✅ 场景一通过：三处合格并按时退出，phase = success");
      return;
    }

    const cp = s.cps.find(c => c.status !== "done");
    if (!cp) {
      // 全部合格，驶向出口
      if (!driving) { await page.keyboard.down("ArrowRight"); driving = true; }
    } else {
      const dist = cp.x - s.x;
      const inZone = Math.abs(dist) <= s.zoneHalf;
      if (cp.status === "inspecting") {
        if (driving) { await page.keyboard.up("ArrowRight"); driving = false; }
      } else if (cp.status === "tooling") {
        await page.keyboard.down("KeyT");
      } else if (cp.status === "pending") {
        await page.keyboard.up("KeyT");
        if (inZone && Math.abs(s.v) < 2) {
          if (driving) { await page.keyboard.up("ArrowRight"); driving = false; }
          await page.keyboard.up("Space");
          await page.keyboard.down("KeyE");
          await page.waitForTimeout(120);
          await page.keyboard.up("KeyE");
        } else {
          // 预判制动距离，精准停进检测区
          const brakeDist = (s.v * s.v) / (2 * 140);
          if (dist - brakeDist > 8) {
            if (!driving) { await page.keyboard.down("ArrowRight"); driving = true; }
            await page.keyboard.up("Space");
          } else {
            if (driving) { await page.keyboard.up("ArrowRight"); driving = false; }
            await page.keyboard.down("Space");
          }
        }
      }
    }
    await page.waitForTimeout(50);
  }
  await browser.close();
  throw new Error("场景一超时未完成");
}

// ===== 场景二：超时失败 =====
async function testTimeout() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  page.on("pageerror", e => { throw new Error("页面异常: " + e.message); });
  await page.goto(base + "?scale=200"); // 10 分钟窗口压缩到 3 秒真实时间

  await page.keyboard.press("ArrowRight"); // 开始但随后不动车
  await page.keyboard.up("ArrowRight");

  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const s = await getState(page);
    if (s.phase === "fail") {
      await page.screenshot({ path: path.join(dir, "artifacts", "timeout.png") });
      await browser.close();
      if (s.timeLeft > 0.01) throw new Error("失败时倒计时未归零: " + s.timeLeft);
      console.log("✅ 场景二通过：倒计时归零，phase = fail，原因 = " + s.failReason);
      return;
    }
    await page.waitForTimeout(100);
  }
  await browser.close();
  throw new Error("场景二未触发超时失败");
}

await testSuccess();
await testTimeout();
console.log("全部测试通过 🎉");
