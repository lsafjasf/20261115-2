import { chromium } from "playwright";

const browser = await chromium.launch({
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(process.env.GAME_URL || "http://127.0.0.1:9321/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: "artifacts/start.png" });

await page.evaluate(() => window.__balloonGame.startDemo());
await page.evaluate(() => window.__balloonGame.advance(19));
await page.waitForTimeout(400);
await page.screenshot({ path: "artifacts/flight.png" });

const result = await page.evaluate(() => window.__balloonGame.advance(40));
await page.waitForTimeout(500);
await page.screenshot({ path: "artifacts/escape.png" });

const ui = await page.evaluate(() => ({
  mode: window.__balloonGame.getMode(),
  resultVisible: document.querySelector("#resultOverlay").classList.contains("is-visible"),
  title: document.querySelector("#resultTitle").textContent.trim(),
  time: document.querySelector("#resultTime").textContent,
  ballast: document.querySelector("#resultBallast").textContent,
  speed: document.querySelector("#resultSpeed").textContent,
}));

console.log(JSON.stringify({ result, ui, errors }, null, 2));
await browser.close();
