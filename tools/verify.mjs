import { chromium } from "playwright";
import { spawn } from "node:child_process";

const port = 4917;
const server = spawn(process.execPath, ["tools/serve.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
});
await new Promise((resolve) => setTimeout(resolve, 500));

const executablePath = process.env.CHROME_BIN;
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const initial = await page.evaluate(() => ({
  overlay: document.querySelector("#startOverlay").classList.contains("is-visible"),
  state: window.__balloonGame.getState(),
}));
if (!initial.overlay) throw new Error("Start overlay should be visible");
if (initial.state.passengers !== 3) throw new Error("Expected three passengers");

await page.click("#startButton");
await page.waitForTimeout(300);
const beforeBurn = await page.evaluate(() => window.__balloonGame.getState());
await page.keyboard.down("KeyW");
await page.waitForTimeout(700);
await page.keyboard.up("KeyW");
const afterBurn = await page.evaluate(() => window.__balloonGame.getState());
if (afterBurn.temp <= beforeBurn.temp + 0.01) throw new Error("Burner did not raise heat");
if (afterBurn.y > beforeBurn.y + 0.5) throw new Error("Burner did not create lift");

await page.keyboard.press("KeyB");
await page.waitForTimeout(150);
const afterBallast = await page.evaluate(() => window.__balloonGame.getState());
if (afterBallast.ballast !== 2) throw new Error("Ballast drop did not decrement inventory");

await page.click("#restartButton");
await page.waitForTimeout(250);
const failed = await page.evaluate(() => window.__balloonGame.advance(20));
await page.waitForTimeout(300);
const failureUi = await page.evaluate(() => ({
  modal: document.querySelector("#resultOverlay").classList.contains("is-visible"),
  title: document.querySelector("#resultTitle").textContent.trim(),
}));
if (!failureUi.modal || failed.outcome === "success") {
  throw new Error("No-input flight should end in a visible failure");
}

await page.click("#againButton");
await page.waitForTimeout(200);
const escaped = await page.evaluate(() => window.__balloonGame.runDemo());
await page.waitForTimeout(300);
const successUi = await page.evaluate(() => ({
  modal: document.querySelector("#resultOverlay").classList.contains("is-visible"),
  title: document.querySelector("#resultTitle").textContent.trim(),
  time: document.querySelector("#resultTime").textContent,
  ballast: document.querySelector("#resultBallast").textContent,
  speed: document.querySelector("#resultSpeed").textContent,
}));

if (escaped.outcome !== "success") throw new Error("Autopilot failed to escape");
if (!successUi.modal) throw new Error("Success overlay is not visible");
if (escaped.passengers !== 3 || !escaped.ridge1Passed || !escaped.ridge2Passed) {
  throw new Error("Not all passengers cleared both ridges");
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);

await page.screenshot({ path: "artifacts/escape.png" });
console.log(
  JSON.stringify(
    {
      manualBurn: {
        fromY: beforeBurn.y,
        toY: afterBurn.y,
        fromTemp: beforeBurn.temp,
        toTemp: afterBurn.temp,
      },
      failure: { outcome: failed.outcome, title: failureUi.title },
      escape: escaped,
      successUi,
      browserErrors: errors,
    },
    null,
    2,
  ),
);
await browser.close();
server.kill();
