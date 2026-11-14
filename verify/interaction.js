const puppeteer = require('puppeteer');
const assert = require('assert');
const EXE = process.env.HOME + '/.cache/puppeteer/chrome/157.0.8103.50/chrome-linux64/chrome';
(async () => {
  const browser = await puppeteer.launch({
    headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on('pageerror', e => logs.push(e.message));
  await page.goto('file:///home/hj/userfeedback/uid419/index.html');
  await new Promise(r => setTimeout(r, 500));

  // 找到水平切面一个单元的屏幕坐标
  const target = await page.evaluate(() => {
    const c = document.getElementById('scene');
    const r = c.getBoundingClientRect();
    const pm = window.__PM;
    // 用内部投影：通过 mousedown 命中测试间接验证，这里返回画布中心区域
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  });

  // 模拟在场景中央按住并垂直拖动 -> 改变水平切片高度
  const cx = target.left + target.w * 0.45;
  const cy = target.top + target.h * 0.62;
  await page.mouse.move(cx, cy);
  const before = await page.evaluate(() => window.__PM.state.zIndex);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 120, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.__PM.state.zIndex);
  console.log('水平拖拽 zIndex:', before, '->', after);

  // 自检面板 DOM
  const panel = await page.evaluate(() => {
    const el = document.getElementById('selfTest');
    return {
      text: el.innerText.split('\n').slice(0, 4).join(' | '),
      summary: el.querySelector('.summary').innerText,
      passCount: el.querySelectorAll('.pass').length,
      failCount: el.querySelectorAll('.fail').length
    };
  });
  console.log('自检面板:', JSON.stringify(panel, null, 1));

  // 热点列表与统计同步：先回到 25m 记录，再切到 200m 比较高度标签
  await page.evaluate(() => {
    const h = document.getElementById('hSlider'); h.value = 1;
    h.dispatchEvent(new Event('input'));
  });
  const hs1 = await page.evaluate(() => document.getElementById('hotspots').innerText.split('\n')[0]);
  await page.evaluate(() => {
    const h = document.getElementById('hSlider'); h.value = 6;
    h.dispatchEvent(new Event('input'));
  });
  const hs2 = await page.evaluate(() => document.getElementById('hotspots').innerText.split('\n')[0]);
  const statsH = await page.evaluate(() =>
    document.getElementById('stats').innerText.split('\n')[0]);
  console.log('热点(25m):', hs1);
  console.log('热点(200m):', hs2);
  console.log('统计头:', statsH);

  // 时间切换后图例域文本变化
  const legend1 = await page.evaluate(() => document.getElementById('legendDomain').innerText);
  await page.evaluate(() => {
    const t = document.getElementById('timeSlider'); t.value = 20;
    t.dispatchEvent(new Event('input'));
  });
  const legend2 = await page.evaluate(() => document.getElementById('legendDomain').innerText);
  console.log('图例域 08时:', legend1);
  console.log('图例域 20时:', legend2);

  assert.ok(logs.length === 0, logs.join('|'));
  assert.ok(panel.failCount === 0 && panel.summary.includes('20/20'));
  assert.notStrictEqual(hs1, hs2);
  assert.ok(hs1.includes('25m') && hs2.includes('200m'));
  assert.ok(statsH.includes('200m'));
  assert.notStrictEqual(legend1, legend2);
  console.log('\nINTERACTION TEST PASSED');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
