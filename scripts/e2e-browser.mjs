import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8321;
const server = spawn('node', ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } });
await new Promise((resolve) => setTimeout(resolve, 800));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

const downloads = [];
page.on('download', async (d) => {
  const path = `${ROOT}/artifacts/${d.suggestedFilename()}`;
  await d.saveAs(path);
  downloads.push(path);
});

const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); console.log('PASS', msg); };

await page.goto(`http://localhost:${PORT}/`);
await page.waitForSelector('#cue-list li');

// 1. 三条字幕
const cueCount = await page.locator('#cue-list li').count();
assert(cueCount === 3, `页面初始渲染 3 条字幕（实际 ${cueCount}）`);
const templates = await page.locator('#template-switch button').allTextContents();
assert(JSON.stringify(templates) === JSON.stringify(['新闻', '剧情', '提示卡']), '三个模板按钮：新闻/剧情/提示卡');

// 2. 每条字幕都做 模板 -> 其他两个 -> 切回，验证文本不丢
const texts = await page.locator('#cue-list li div:first-child').allTextContents();
const originalTemplate = ['新闻', '剧情', '提示卡'];
for (let i = 0; i < 3; i += 1) {
  await page.locator('#cue-list li').nth(i).click();
  const original = texts[i];
  for (const name of ['提示卡', '剧情', '新闻', originalTemplate[i]]) {
    await page.locator('#cue-list li').nth(i).click();
    await page.locator('#template-switch button', { hasText: name }).click();
  }
  const after = await page.inputValue('#text-input');
  assert(after === original, `字幕${i +1} 多轮模板切换后文本保留：「${after}」`);
}

// 3. 样式调整
await page.locator('#cue-list li').first().click();
await page.locator('#font-size').fill('64');
await page.check('#box-enabled');
await page.locator('#box-radius').fill('20');
await page.check('#stroke-enabled');
await page.locator('#stroke-width').fill('6');
await page.selectOption('#entrance-select', 'slideUp');
assert((await page.inputValue('#font-size')) === '64', '字号调整为 64');
assert((await page.inputValue('#entrance-select')) === 'slideUp', '入场改为上滑');

// 4. 播放/暂停与时间轴同步
const readTc = () => page.locator('#timecode').textContent();
await page.click('#play-pause');
await page.waitForTimeout(1200);
const tcPlaying = await readTc();
await page.waitForTimeout(600);
const tcPlaying2 = await readTc();
assert(tcPlaying2 !== tcPlaying, `播放中时间码推进：${tcPlaying} -> ${tcPlaying2}`);
await page.click('#play-pause');
const tcPaused = await readTc();
await page.waitForTimeout(700);
assert((await readTc()) === tcPaused, `暂停后时间码冻结：${tcPaused}`);

// 5. seek 与各时间点截图
const sampleStyle = async (t) => {
  await page.fill('#scrubber', String(t));
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const c = document.getElementById('stage');
    const g = c.getContext('2d');
    const data = g.getImageData(0, 0, c.width, c.height).data;
    const count = (r, g2, b) => {
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - r) < 24 && Math.abs(data[i + 1] - g2) < 24 && Math.abs(data[i + 2] - b) < 24) n += 1;
      }
      return n;
    };
    return { red: count(198, 40, 40), blue: count(21, 101, 192) };
  });
};
const style1 = await sampleStyle(1);
const style7 = await sampleStyle(7);
const style12 = await sampleStyle(12);
assert(style1.red > 4000, `1s 新闻条红色像素充足（${style1.red}）`);
assert(style7.red < 1000 && style7.blue < 1000, `7s 剧情字幕无背景框（红 ${style7.red} / 蓝 ${style7.blue}）`);
assert(style12.blue > 4000, `12s 提示卡蓝色像素充足（${style12.blue}）`);

for (const t of [1, 7, 12]) {
  await page.fill('#scrubber', String(t));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${ROOT}/artifacts/screen-at-${t}s.png` });
}
const tc12 = await readTc();
assert(tc12.startsWith('00:12.'), `seek 到 12s 后时间码为 ${tc12}`);

// 6. 导出当前帧 PNG
await Promise.all([
  page.waitForEvent('download'),
  page.click('#export-frame'),
]);
// 7. 导出模板 JSON
await Promise.all([
  page.waitForEvent('download'),
  page.click('#export-json'),
]);
await page.waitForTimeout(500);
assert(downloads.some((p) => p.endsWith('.png')), '当前帧 PNG 已导出到 artifacts/');
const jsonPath = downloads.find((p) => p.endsWith('.json'));
assert(Boolean(jsonPath), '模板 JSON 已导出到 artifacts/');
const project = JSON.parse(readFileSync(jsonPath, 'utf8'));
assert(project.kind === 'subtitle-studio-project' && project.cues.length === 3, 'JSON 含 3 条字幕工程数据');
assert(project.cues[0].fontSize === 64 && project.cues[0].entrance === 'slideUp', 'JSON 反映样式调整结果');

assert(errors.length === 0, `浏览器控制台无报错（${errors.length} 条）`);
console.log('\n浏览器 E2E 全部通过，截图与导出物：');
downloads.forEach((p) => console.log(' -', p));

await browser.close();
server.kill();
process.exit(0);
