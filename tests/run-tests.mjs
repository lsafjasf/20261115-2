import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { startServer } from "./static-server.mjs";

const ARTIFACTS = new URL("../artifacts", import.meta.url).pathname;

function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    off += 2;
  }
  return Buffer.from(buffer);
}

function rms(samples) {
  let sum = 0;
  for (const v of samples) sum += v * v;
  return Math.sqrt(sum / samples.length);
}

function peak(samples) {
  let p = 0;
  for (const v of samples) p = Math.max(p, Math.abs(v));
  return p;
}

// 简单 FFT 能量：用 Goertzel 思路代价高，这里用自相关/频段积分近似
function bandEnergy(samples, sampleRate, low, high) {
  const n = samples.length;
  let sum = 0;
  let count = 0;
  // 使用 DFT 仅在目标频段少量频点采样
  const freqs = [];
  for (let f = low; f <= high; f += Math.max(20, Math.floor((high - low) / 12) || 20)) freqs.push(f);
  for (const f of freqs) {
    let re = 0, im = 0;
    const w = (2 * Math.PI * f) / sampleRate;
    for (let i = 0; i < n; i += 2) {
      re += samples[i] * Math.cos(w * i);
      im -= samples[i] * Math.sin(w * i);
    }
    sum += re * re + im * im;
    count++;
  }
  return sum / count;
}

function findOnsets(samples, sampleRate, threshold = 0.08) {
  const win = Math.floor(sampleRate * 0.01);
  const onsets = [];
  let last = -1;
  for (let i = win; i < samples.length - win; i += win) {
    const before = rms(samples.slice(i - win, i));
    const after = rms(samples.slice(i, i + win));
    if (after > threshold && after > before * 1.8 && i - last > sampleRate * 0.05) {
      onsets.push(i / sampleRate);
      last = i;
    }
  }
  return onsets;
}

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const { server, url } = await startServer(0);
const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--allow-file-access-from-files"],
});
const page = await browser.newPage({ acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await mkdir(ARTIFACTS, { recursive: true });

const drum = () => page.evaluate(() => window.__drum);
await page.evaluate(() => window.__drum.engine.init());

// 1. 引擎与默认图：四声源、两个效果、六条默认边，默认全部可达总线
const state = await page.evaluate(() => {
  const e = window.__drum.engine;
  return {
    voices: Object.keys(e.voices),
    edges: e.edges.map((x) => `${x.src}->${x.dst}`),
    swallowed: e.swallowed,
    pattern: Object.fromEntries(Object.entries(e.pattern).map(([k, v]) => [k, v.map(Boolean)])),
  };
});
check("四个声源节点均已创建", state.voices.length === 4, state.voices.join(","));
check("默认路由为 6 条连线且全部到达总线",
  state.edges.length === 6 && state.swallowed.length === 0, `边数=${state.edges.length}`);
const totalSteps = Object.values(state.pattern).reduce((n, arr) => n + arr.filter(Boolean).length, 0);
check("默认 16 步节奏包含触发", totalSteps >= 10, `共 ${totalSteps} 个触发`);

// 2. 实际播放一整个循环并录制（验证“成功播放循环”）
await page.evaluate(() => {
  const e = window.__drum.engine;
  e.stop();
  e.startRecording(6);
  e.play();
});
await page.waitForTimeout(2600);
const loop = await page.evaluate(() => {
  const e = window.__drum.engine;
  e.stop();
  const rec = e.stopRecording();
  return { sr: rec.sampleRate, samples: Array.from(rec.samples) };
});
const loopSamples = Float32Array.from(loop.samples);
check("播放循环有实际音频输出", rms(loopSamples) > 0.01, `RMS=${rms(loopSamples).toFixed(4)}`);
const onsets = findOnsets(loopSamples, loop.sr);
check("录制中检测到多个节拍触发点", onsets.length >= 4, `${onsets.length} 个 onset`);
// 步进间隔：112 BPM 十六分音符 = 60/112/4 ≈ 0.1339s；onset 间隔应集中在其倍数
const stepDur = 60 / 112 / 4;
const gaps = onsets.slice(1).map((t, i) => t - onsets[i]);
const nearGrid = gaps.filter((g) => {
  const units = g / stepDur;
  return Math.abs(units - Math.round(units)) < 0.25;
});
check("触发点落在十六分音符网格上", nearGrid.length / Math.max(1, gaps.length) > 0.75,
  `${nearGrid.length}/${gaps.length} 对齐`);
await writeFile(join(ARTIFACTS, "loop-normal.wav"), encodeWav(loopSamples, loop.sr));

// 录制固定短序列；voice 决定走哪条效果链（snare→滤波，hihat→延迟）
async function renderOnce(voice, bypassId) {
  return page.evaluate(async ({ voice, bid }) => {
    const e = window.__drum.engine;
    e.stop();
    e.resetMute();
    e.setBypass("filter", false);
    e.setBypass("delay", false);
    for (const id of ["kick", "snare", "hihat", "clap"]) {
      e.pattern[id].fill(false);
    }
    e.pattern[voice][0] = true;
    e.pattern[voice][4] = true;
    e.pattern[voice][8] = true;
    e.setBypass("filter", bid === "filter");
    e.setBypass("delay", bid === "delay");
    await e.play();
    e.startRecording();
    await new Promise((r) => setTimeout(r, 1800));
    e.stop();
    const rec = e.stopRecording();
    return { sr: rec.sampleRate, samples: Array.from(rec.samples) };
  }, { voice, bid: bypassId });
}

// 3. 滤波旁路 A/B：旁路后高频能量应显著高于低通启用时
const filterOn = Float32Array.from((await renderOnce("snare", null)).samples);
const filterOff = Float32Array.from((await renderOnce("snare", "filter")).samples);
const hiOn = bandEnergy(filterOn, loop.sr, 6000, 9000);
const hiOff = bandEnergy(filterOff, loop.sr, 6000, 9000);
check("滤波旁路：旁路后 6–9kHz 高频能量上升", hiOff > hiOn * 1.5,
  `启用=${hiOn.toExponential(2)} 旁路=${hiOff.toExponential(2)} 比值=${(hiOff / Math.max(hiOn, 1e-12)).toFixed(2)}`);
await writeFile(join(ARTIFACTS, "filter-on.wav"), encodeWav(filterOn, loop.sr));
await writeFile(join(ARTIFACTS, "filter-bypass.wav"), encodeWav(filterOff, loop.sr));

// 4. 延迟旁路 A/B：启用延迟时触发点后应出现回声能量，旁路后衰减更快
function echoTailEnergy(samples, sr) {
  const ons = findOnsets(samples, sr, 0.05);
  if (!ons.length) return 0;
  const t0 = ons[0];
  // 取首个 onset 之后 0.12–0.35s 的窗口（回声区），避开直达声
  const a = Math.floor((t0 + 0.12) * sr);
  const b = Math.floor((t0 + 0.4) * sr);
  return rms(samples.slice(a, Math.min(b, samples.length)));
}
const delayOnRec = await renderOnce("hihat", null);
const delayOffRec = await renderOnce("hihat", "delay");
const delayOn = Float32Array.from(delayOnRec.samples);
const delayOff = Float32Array.from(delayOffRec.samples);
const tailOn = echoTailEnergy(delayOn, delayOnRec.sr);
const tailOff = echoTailEnergy(delayOff, delayOffRec.sr);
check("延迟旁路：启用时回声尾能量高于旁路时", tailOn > tailOff * 1.3,
  `启用=${tailOn.toFixed(4)} 旁路=${tailOff.toFixed(4)}`);
check("旁路状态被引擎记录", await page.evaluate(() => {
  const e = window.__drum.engine;
  return e.isBypassed("delay") === true && e.isBypassed("filter") === false;
}));
await writeFile(join(ARTIFACTS, "delay-on.wav"), encodeWav(delayOn, delayOnRec.sr));
await writeFile(join(ARTIFACTS, "delay-bypass.wav"), encodeWav(delayOff, delayOffRec.sr));

// 5. 错误连接：无延迟反馈环必须被拒绝
const guard = await page.evaluate(() => {
  const e = window.__drum.engine;
  const self = e.canConnect("filter", "filter");
  const intoVoice = e.canConnect("delay", "kick");
  const fromBus = e.canConnect("bus", "filter");
  // filter → delay → filter 形成不含 delay 自环但含 delay 的环？
  // 真正禁止的是纯增益类环路：delay → filter 后再让 filter → delay 会经过 delay，允许；
  // 这里构造 filter 输出回自己的输入链：先测自环与非法端口
  const dup = (() => {
    const r = e.canConnect("kick", "filter");
    return r.ok === false; // 默认已存在
  })();
  return {
    self: self.ok,
    intoVoice: intoVoice.ok,
    fromBus: fromBus.ok,
    dup,
    selfReason: self.reason,
    intoVoiceReason: intoVoice.reason,
  };
});
check("拒绝自环连接", guard.self === false, guard.selfReason);
check("拒绝向声源输入", guard.intoVoice === false, guard.intoVoiceReason);
check("拒绝从总线输出", guard.fromBus === false);
check("拒绝重复连线", guard.dup === true);

// 含延迟节点的反馈环：补上 delay→filter 与 filter→delay 后环才闭合，应允许但带警告
const delayLoop = await page.evaluate(() => {
  const e = window.__drum.engine;
  const a = e.addEdge("delay", "filter");
  const b = e.addEdge("filter", "delay");
  const closed = a.ok && b.ok && !!b.warning;
  e.resetGraph();
  return { added: closed, warning: b.warning, reason: b.reason };
});
check("含延迟节点的反馈环允许但带警告", delayLoop.added === true,
  delayLoop.warning || delayLoop.reverseReason || "");

// 6. 吞节拍：删掉 hihat→delay 与 delay→bus 后，hihat 不可达总线
const swallow = await page.evaluate(() => {
  const e = window.__drum.engine;
  e.removeEdge("hihat", "delay");
  e.removeEdge("delay", "bus");
  e._refreshReachability();
  const result = [...e.swallowed];
  // 恢复
  e.addEdge("hihat", "delay");
  e.addEdge("delay", "bus");
  e._refreshReachability();
  return { swallowed: result, restored: [...e.swallowed] };
});
check("断链后检测到被吞掉的节拍声源", swallow.swallowed.includes("hihat"),
  swallow.swallowed.join(",") || "无");
check("恢复连线后吞节拍状态解除", swallow.restored.length === 0);

// 7. 峰值自动静音：拉高总线增益并同时触发四个声源，越过 0.98 应静音
const mute = await page.evaluate(async () => {
  const e = window.__drum.engine;
  e.resetMute();
  e.setParam("bus", "gain", 8);
  for (const id of ["kick", "snare", "hihat", "clap"]) {
    e.pattern[id].fill(false);
    e.pattern[id][0] = true;
  }
  e.setBypass("filter", false);
  e.setBypass("delay", false);
  await e.play();
  await new Promise((r) => setTimeout(r, 700));
  const tripped = e.muted;
  const peakVal = e.tripPeak || 0;
  e.stop();
  e.setParam("bus", "gain", 0.8);
  e.resetMute();
  await new Promise((r) => setTimeout(r, 250));
  return { tripped, peakVal, masterAfterReset: e.master.gain.value, stillMuted: e.muted };
});
check("峰值过线触发自动静音", mute.tripped === true, `峰值=${mute.peakVal.toFixed(3)}`);
check("静音后可手动恢复", !mute.stillMuted && mute.masterAfterReset > 0.5,
  `master=${mute.masterAfterReset.toFixed(2)}`);

// 8. 页面无 JS 错误
check("页面运行期间无未捕获错误", errors.length === 0, errors.join(" | "));

// 恢复默认节奏并再录一版完整循环作为最终交付音频
await page.evaluate(async () => {
  const e = window.__drum.engine;
  e.stop();
  e.resetMute();
  e.setParam("bus", "gain", 0.8);
  const d = window.__drum;
  // 用引擎默认 pattern 重建
  const fresh = {
    kick: new Array(16).fill(false), snare: new Array(16).fill(false),
    hihat: new Array(16).fill(false), clap: new Array(16).fill(false),
  };
  fresh.kick[0] = fresh.kick[4] = fresh.kick[8] = fresh.kick[12] = true;
  fresh.snare[4] = fresh.snare[12] = true;
  fresh.clap[12] = true;
  for (let i = 0; i < 16; i += 2) fresh.hihat[i] = true;
  Object.assign(e.pattern, fresh);
  e.setBypass("filter", false);
  e.setBypass("delay", false);
  e.startRecording();
  await e.play();
  await new Promise((r) => setTimeout(r, 2200));
  e.stop();
  window.__finalRec = e.stopRecording();
});
const final = await page.evaluate(() => ({
  sr: window.__finalRec.sampleRate,
  samples: Array.from(window.__finalRec.samples),
}));
const finalSamples = Float32Array.from(final.samples);
check("最终完整循环可成功播放并录制", rms(finalSamples) > 0.01 && peak(finalSamples) <= 1.0,
  `RMS=${rms(finalSamples).toFixed(4)} peak=${peak(finalSamples).toFixed(3)}`);
await writeFile(join(ARTIFACTS, "final-16step-loop.wav"), encodeWav(finalSamples, final.sr));

// 截图留存 Canvas 界面
await page.screenshot({ path: join(ARTIFACTS, "ui.png"), fullPage: true });

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
