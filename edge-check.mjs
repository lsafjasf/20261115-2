import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(root, "index.html")).href);
await page.waitForFunction(() => window.__subtitle);

const edge = await page.evaluate(() => {
  const sub = window.__subtitle;
  const ctx = document.getElementById("stage").getContext("2d");
  const out = [];
  const cases = [
    { text: "", kw: "" },
    { text: "短", kw: "短" },
    { text: "啊".repeat(300), kw: "啊啊" },
    { text: "hello world, this is a very long english sentence without much punctuation ".repeat(4), kw: "hello" }
  ];
  for (const c of cases) {
    sub.state.text = c.text;
    sub.state.keywords = c.kw;
    for (const amp of [0, 2]) {
      sub.state.amplitude = amp;
      for (const anim of ["rise", "pop", "slide", "blur"]) {
        sub.state.anim = anim;
        const layout = sub.computeLayout(ctx);
        let allIn = true;
        for (let t = 0; t <= sub.DURATION; t += 500) {
          const b = sub.textBounds(ctx, t);
          if (b.minX !== Infinity && !b.insideSafe) allIn = false;
        }
        out.push({ len: c.text.length, amp, anim, lines: layout.lines.length, font: layout.fontSize, allIn });
      }
    }
  }
  return out;
});

const bad = edge.filter(e => !e.allIn);
console.log("cases:", edge.length, "failures:", bad.length);
console.log(edge.filter((_, i) => i % 4 === 0)
  .map(e => `len=${e.len} lines=${e.lines} font=${e.font}`).join("\n"));
await browser.close();
process.exit(bad.length ? 1 : 0);
