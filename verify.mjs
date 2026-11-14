import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "artifacts");
mkdirSync(OUT, { recursive: true });
const FFMPEG = path.join(ROOT, "node_modules/ffmpeg-static/ffmpeg");

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("console", msg => {
  if (msg.type() === "error") console.log("  [console.error]", msg.text());
});
page.on("pageerror", err => console.log("  [pageerror]", err.message));

await page.goto(pathToFileURL(path.join(ROOT, "index.html")).href);
await page.waitForFunction(() => window.__subtitle !== undefined);

const api = await page.evaluate(() => window.__subtitle);
check("应用加载并暴露测试 API", !!api);

/* ---------- 1. 三种文案：自动分行与布局检查 ---------- */
const wrapReport = await page.evaluate(() => {
  const sub = window.__subtitle;
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  return sub.PRESETS.map((p, i) => {
    sub.state.text = p.text;
    sub.state.keywords = p.keywords;
    sub.state.amplitude = 1;
    const layout = sub.computeLayout(ctx);
    const maxLineWidth = Math.max(...layout.lines.map(l => {
      ctx.font = layout.font;
      return l.segments.reduce((sum, s) => sum + ctx.measureText(s.text).width, 0);
    }));
    return {
      i,
      name: p.name,
      chars: Array.from(p.text).length,
      lineCount: layout.lines.length,
      fontSize: layout.fontSize,
      maxLineWidth,
      safeWidth: sub.SAFE_W,
      lines: layout.lines.map(l => l.raw),
      keywordHits: layout.lines.flatMap(l => l.segments.filter(s => s.hit).map(s => s.text))
    };
  });
});

for (const r of wrapReport) {
  console.log(`\n[${r.name}] ${r.chars} 字 → ${r.lineCount} 行，字号 ${r.fontSize}px，最宽行 ${Math.round(r.maxLineWidth)}/${r.safeWidth}px`);
  r.lines.forEach((l, idx) => console.log(`  L${idx + 1} (${Array.from(l).length}字): ${l}`));
  check(`${r.name} 至少成功分行`, r.lineCount >= 1);
  check(`${r.name} 行宽不超过安全框`, r.maxLineWidth <= r.safeWidth,
    `${Math.round(r.maxLineWidth)} <= ${r.safeWidth}`);
  check(`${r.name} 关键词被识别着色`, r.keywordHits.length > 0,
    `命中: ${[...new Set(r.keywordHits)].join("/")}`);
}
check("三种文案行数不同（长度驱动换行）", new Set(wrapReport.map(r => r.lineCount)).size >= 2,
  wrapReport.map(r => `${r.name}:${r.lineCount}行`).join(" "));
check("长文案行数严格多于短文案", wrapReport[2].lineCount > wrapReport[0].lineCount,
  `${wrapReport[2].lineCount} > ${wrapReport[0].lineCount}`);

/* ---------- 2. 全程安全框检查（四种动画 × 多个时间点 × 最大幅度） ---------- */
const safeReport = await page.evaluate(() => {
  const sub = window.__subtitle;
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const anims = ["rise", "pop", "slide", "blur"];
  const fails = [];
  for (const p of sub.PRESETS) {
    sub.state.text = p.text;
    sub.state.keywords = p.keywords;
    sub.state.amplitude = 2; // 最大动画幅度
    for (const anim of anims) {
      sub.state.anim = anim;
      for (let t = 0; t <= sub.DURATION; t += 250) {
        const b = sub.textBounds(ctx, t);
        if (b.minX === Infinity) continue;
        if (!b.insideSafe) {
          fails.push(`${p.name}/${anim}@${t}ms x:[${Math.round(b.minX)},${Math.round(b.maxX)}] y:[${Math.round(b.minY)},${Math.round(b.maxY)}]`);
        }
      }
    }
  }
  return { fails, sample: sub.textBounds(ctx, 6000) };
});
check("所有文案/动画/幅度/时间点均在安全框内", safeReport.fails.length === 0,
  safeReport.fails.length ? safeReport.fails.slice(0, 3).join(" | ") : `样例边界 ${JSON.stringify({
    x: [Math.round(safeReport.sample.minX), Math.round(safeReport.sample.maxX)],
    y: [Math.round(safeReport.sample.minY), Math.round(safeReport.sample.maxY)]
  })}`);

/* ---------- 3. 用户编辑：自定义句子、主题色、幅度 ---------- */
const editReport = await page.evaluate(() => {
  const sub = window.__subtitle;
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  sub.state.text = "这是一句自定义测试文案，用来验证实时编辑与重新分行能力。";
  sub.state.keywords = "自定义,验证";
  sub.state.primary = "#ff5c8a";
  sub.state.amplitude = 1.5;
  sub.state.anim = "pop";
  const layout = sub.computeLayout(ctx);
  sub.renderFrameTo(5000);
  return { lineCount: layout.lines.length, hits: layout.lines.flatMap(l => l.segments.filter(s => s.hit).map(s => s.text)) };
});
check("用户改句子后重新分行", editReport.lineCount >= 1, `${editReport.lineCount} 行`);
check("用户改关键词后命中", editReport.hits.includes("自定义") && editReport.hits.includes("验证"));

/* ---------- 4. PNG 当前帧导出（三种文案各一张） ---------- */
for (const r of wrapReport) {
  await page.evaluate(idx => {
    const p = window.__subtitle.PRESETS[idx];
    window.__subtitle.state.text = p.text;
    window.__subtitle.state.keywords = p.keywords;
    window.__subtitle.state.anim = "rise";
    window.__subtitle.state.amplitude = 1;
    window.__subtitle.state.primary = "#6ea8fe";
    window.__subtitle.state.bg = "#0b1020";
  }, r.i);
  const dataUrl = await page.evaluate(t => window.__subtitle.downloadPNG(t, `frame-${t}.png`), 6000);
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  const file = path.join(OUT, `frame-${r.name}.png`);
  writeFile(file, buf);
  check(`${r.name} PNG 导出`, existsSync(file) && statSync(file).size > 10_000,
    `${(statSync(file).size / 1024).toFixed(1)} KB`);
}

/* ---------- 5. WebM 12 秒导出（含节拍音轨） ---------- */
const webmPath = path.join(OUT, "subtitle-card-12s.webm");
const blobInfo = await page.evaluate(async () => {
  const sub = window.__subtitle;
  sub.state.text = sub.PRESETS[1].text;
  sub.state.keywords = sub.PRESETS[1].keywords;
  sub.state.beat = true;
  const blob = await sub.exportWebM({ fps: 30, audio: true, auto: true });
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { size: buf.byteLength, type: blob.type, b64: btoa(binary) };
});
writeFile(webmPath, Buffer.from(blobInfo.b64, "base64"));
check("WebM Blob 生成且类型正确", blobInfo.type === "video/webm" && blobInfo.size > 50_000,
  `${(blobInfo.size / 1024).toFixed(1)} KB`);

let probe = "";
try {
  probe = execFileSync(FFMPEG, ["-hide_banner", "-i", webmPath], { encoding: "utf8", stdio: "pipe" });
} catch (e) { probe = e.stderr || e.stdout || ""; }
const hasVideo = /Video:.*(vp8|vp9)/.test(probe);
const hasAudio = /Audio:.*opus/.test(probe);
check("WebM 含 VP8/VP9 视频流", hasVideo, probe.match(/Video:[^\n]*/)?.[0]?.trim() || "未找到视频流");
check("WebM 含 Opus 节拍音轨", hasAudio, probe.match(/Audio:[^\n]*/)?.[0]?.trim() || "未找到音频流");

// Chrome 的 WebM 不写 Duration 头，用全解码日志里的最后 time= 作为实际时长
let decodeLog = "";
const dec = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", webmPath, "-f", "null", "-"], { encoding: "utf8" });
decodeLog = `${dec.stderr || ""}\n${dec.stdout || ""}`;
const normalized = decodeLog.replace(/\r/g, "\n");
const timeMatches = [...normalized.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)];
const last = timeMatches[timeMatches.length - 1];
const durationSec = last
  ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : 0;
check("WebM 实际解码时长约 12 秒", durationSec >= 10 && durationSec <= 14, `${durationSec.toFixed(2)}s`);

/* ---------- 6. 收尾截图 ---------- */
await page.evaluate(() => {
  const sub = window.__subtitle;
  const p = sub.PRESETS[2];
  sub.state.text = p.text;
  sub.state.keywords = p.keywords;
  sub.state.beat = false;
  sub.state.amplitude = 1;
  sub.state.anim = "rise";
  sub.renderFrameTo(6000);
});
await page.screenshot({ path: path.join(OUT, "ui-long-text.png") });

await browser.close();

const failed = results.filter(r => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} 项检查通过 ====`);
if (failed.length) process.exit(1);

function writeFile(file, buf) { writeFileSync(file, buf); }
