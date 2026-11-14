import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8403";
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE + "/index.html");
await page.waitForTimeout(300);

// 1. 页面加载无报错，五个关键点就绪
const kfs0 = await page.evaluate(() => state.keyframes.map((k) => ({ ...k })));
check("页面加载且无 JS 错误", errors.length === 0, errors.join("; "));
check("初始包含 5 个关键点", kfs0.length === 5);
check("初始无遮挡警告", await page.locator("#warning").isHidden());

// 工具：把世界坐标转换为页面客户端坐标
const worldToClient = (wx, wy) =>
  page.evaluate(
    ([wx, wy]) => {
      const rect = document.getElementById("stage").getBoundingClientRect();
      const p = toScreen({ x: wx, y: wy });
      return {
        x: rect.left + (p.x / 1280) * rect.width,
        y: rect.top + (p.y / 720) * rect.height,
      };
    },
    [wx, wy]
  );

// 2. 拖动关键点 3 到障碍区域附近，改变曲线形状
const kf3 = kfs0[2];
const from = await worldToClient(kf3.x, kf3.y);
const target = { x: 620, y: 330 }; // 障碍 (620,300,r110) 边缘
const to = await worldToClient(target.x, target.y);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(200);

const kfs1 = await page.evaluate(() => state.keyframes.map((k) => ({ ...k })));
const moved = Math.hypot(kfs1[2].x - kf3.x, kfs1[2].y - kf3.y);
check("拖动后关键点 3 位置已改变", moved > 50, `位移 ${moved.toFixed(0)}`);
check("拖动后显示障碍警告", await page.locator("#warning").isVisible());

// 3. 取景框不越出舞台：把关键点 1 往舞台外拖
const kf1pos = await worldToClient(kfs1[0].x, kfs1[0].y);
const outside = await worldToClient(-500, -500);
await page.mouse.move(kf1pos.x, kf1pos.y);
await page.mouse.down();
await page.mouse.move(outside.x, outside.y, { steps: 8 });
await page.mouse.up();
const inside = await page.evaluate(() =>
  state.keyframes.every((kf) =>
    frustumCorners(kf).every(
      (c) => c.x >= -0.01 && c.x <= 1600.01 && c.y >= -0.01 && c.y <= 900.01
    )
  )
);
check("向舞台外拖动后取景框仍在舞台内", inside);

// 4. 用滑杆调整焦距与旋转
await page.evaluate(() => { state.selected = 2; syncPanel(); });
await page.locator("#focal").fill("90");
await page.locator("#angle").fill("45");
await page.waitForTimeout(100);
const kfs2 = await page.evaluate(() => state.keyframes.map((k) => ({ ...k })));
check("焦距滑杆生效", Math.abs(kfs2[2].focal - 90) < 1.5, `focal=${kfs2[2].focal}`);
check("旋转滑杆生效", Math.abs(kfs2[2].angle - 45) < 1.5, `angle=${kfs2[2].angle}`);

// 5. 保存 → 重载 → 关键点不变
const savedJson = await page.evaluate(() => localStorage.getItem("camera-path-project"));
check("工程已写入 localStorage", !!savedJson && JSON.parse(savedJson).keyframes.length === 5);
await page.reload();
await page.waitForTimeout(300);
const kfs3 = await page.evaluate(() => state.keyframes.map((k) => ({ ...k })));
const same = kfs2.every(
  (k, i) =>
    Math.abs(k.x - kfs3[i].x) < 0.01 &&
    Math.abs(k.y - kfs3[i].y) < 0.01 &&
    Math.abs(k.angle - kfs3[i].angle) < 0.01 &&
    Math.abs(k.focal - kfs3[i].focal) < 0.01
);
check("重载后 5 个关键点与调整前完全一致", same);
check("重载后警告状态保持", await page.locator("#warning").isVisible());

// 6. 导出 JSON 内容合法
const exported = JSON.parse(savedJson);
check(
  "导出 JSON 结构合法",
  exported.version === 1 && exported.duration === 8 && exported.keyframes.length === 5
);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length ? 1 : 0);
