const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8"
};

function angleDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
      const target = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" });
      fs.createReadStream(target).pipe(response);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const seed = process.env.PASSAGE_SEED || "NIGHT-407";
  const server = await serve();
  const address = server.address();
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(`http://127.0.0.1:${address.port}/?seed=${encodeURIComponent(seed)}`, { waitUntil: "networkidle" });
    await page.fill("#seedInput", seed);
    await page.click("#startButton");
    await page.waitForTimeout(500);

    const pressed = { a: false, d: false, w: false, s: false };
    const setKey = async (key, on) => {
      if (pressed[key] === on) return;
      pressed[key] = on;
      if (on) await page.keyboard.down(key);
      else await page.keyboard.up(key);
    };

    let lastPing = 0;
    let snapshot = null;
    const started = Date.now();
    for (let tick = 0; tick < 1200; tick += 1) {
      snapshot = await page.evaluate(() => {
        const game = BP.app.game;
        const boat = game.boat;
        return {
          mode: game.mode,
          x: boat.x,
          y: boat.y,
          heading: boat.heading,
          throttle: boat.throttle,
          temp: boat.temp,
          depth: boat.depth,
          lighthouse: game.field.lighthouse,
          gates: game.field.gates.map((gate) => ({
            x: gate.x,
            y: gate.y,
            passed: gate.passed,
            touched: gate.touched
          }))
        };
      });
      if (snapshot.mode !== "running") break;

      const gate = snapshot.gates.find((item) => !item.passed);
      const index = gate ? snapshot.gates.indexOf(gate) : -1;
      let target = gate ? { x: gate.x + 90, y: gate.y } : snapshot.lighthouse;
      if (gate && snapshot.x > gate.x + 68) {
        const next = snapshot.gates[index + 1];
        target = next ? { x: next.x + 90, y: next.y } : snapshot.lighthouse;
      }

      const bearing = (Math.atan2(target.x - snapshot.x, snapshot.y - target.y) * 180 / Math.PI + 360) % 360;
      const headingError = angleDiff(bearing, snapshot.heading);
      await setKey("d", headingError > 4);
      await setKey("a", headingError < -4);

      let targetThrottle = snapshot.temp > 100 ? 0.15 : snapshot.temp > 92 ? 0.44 : snapshot.depth < 5 ? 0.48 : 0.62;
      if (snapshot.throttle < targetThrottle - 0.015) {
        await setKey("w", true);
        await setKey("s", false);
      } else if (snapshot.throttle > targetThrottle + 0.015) {
        await setKey("s", true);
        await setKey("w", false);
      } else {
        await setKey("w", false);
        await setKey("s", false);
      }

      if (Date.now() - lastPing > 1150) {
        lastPing = Date.now();
        await page.keyboard.press("Space");
      }
      await page.waitForTimeout(42);
    }

    for (const key of Object.keys(pressed)) await setKey(key, false);
    await page.waitForTimeout(650);
    const finalState = await page.evaluate(() => ({
      mode: BP.app.game.mode,
      elapsed: BP.app.game.elapsed,
      hits: BP.app.game.hits,
      pings: BP.app.game.pingCount,
      gates: BP.app.game.field.gates.map((gate) => ({ passed: gate.passed, touched: gate.touched })),
      validation: BP.app.game.field.validation
    }));
    const result = await page.evaluate(() => ({
      title: document.querySelector("#resultTitle").textContent,
      copy: document.querySelector("#resultText").textContent,
      time: document.querySelector("#resultTime").textContent
    }));

    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    await page.screenshot({ path: path.join(root, "artifacts", "passage-complete.png"), fullPage: true });
    const record = {
      seed: finalState.mode === "won" ? seed : null,
      mode: finalState.mode,
      elapsed: Number(finalState.elapsed.toFixed(2)),
      displayTime: result.time,
      collisions: finalState.hits,
      pings: finalState.pings,
      gates: finalState.gates,
      validation: finalState.validation,
      result,
      errors
    };
    fs.writeFileSync(path.join(root, "artifacts", "passage-record.json"), `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify(record, null, 2));

    const passed = finalState.mode === "won" && finalState.hits === 0 && finalState.gates.every((gate) => gate.passed);
    if (!passed || errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
