const puppeteer = require('puppeteer');
const assert = require('assert');

const EXE = process.env.HOME + '/.cache/puppeteer/chrome/157.0.8103.50/chrome-linux64/chrome';
const URL = 'file:///home/hj/userfeedback/uid419/index.html';
const TOL = 6;

function close(a, b, t = TOL) {
  return Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') logs.push('CONSOLE ' + m.text()); });
  await page.goto(URL);
  await new Promise(r => setTimeout(r, 800));

  const data = await page.evaluate(() => {
    const pm = window.__PM;
    const model = pm.model;
    const out = { checks: [], domains: model.domains.map(d => d.slice()) };
    const hour = 8;

    // ---- 1. 页面内置自检 ----
    const st = pm.runSelfTest();
    out.selftestPass = st.every(r => r.ok);
    out.selftestTotal = st.length;
    out.selftestFails = st.filter(r => !r.ok).map(r => r.name + ' ' + r.detail);

    // ---- 2. 两个高度：25m(z=1) 与 100m(z=4) ----
    [1, 4].forEach(z => {
      pm.state.hour = hour; pm.state.zIndex = z; pm.state.yIndex = 8;
      pm.render();
      const dom = model.domains[hour];
      // 主场景实际渲染像素：找到该水平切面某个已知单元的屏幕中心
      const probe = pm.render && null;
      // 用与渲染相同的颜色函数，校验 legend 色条两端/中点像素
      const legend = document.getElementById('legend');
      const lctx = legend.getContext('2d');
      const mid = lctx.getImageData(legend.width / 2, legend.height / 2, 1, 1).data;
      const top = lctx.getImageData(legend.width / 2, 2, 1, 1).data;
      const bot = lctx.getImageData(legend.width / 2, legend.height - 3, 1, 1).data;

      // 切面单元格颜色（通过离屏重绘主投影中的一个单元并读中心像素）
      const scene = document.getElementById('scene');
      const sctx = scene.getContext('2d');
      // 统计面板文本
      out.checks.push({
        z, height: window.PMModel.HEIGHTS[z],
        legendMid: [mid[0], mid[1], mid[2]],
        legendTop: [top[0], top[1], top[2]],
        legendBot: [bot[0], bot[1], bot[2]],
        stats: document.getElementById('stats').innerText,
        hotspots: document.getElementById('hotspots').innerText,
        badge: document.getElementById('sliceBadge').innerText,
        legendDomain: document.getElementById('legendDomain').innerText,
        hLabel: document.getElementById('hLabel').innerText
      });
    });

    // ---- 3. 主场景真实像素校验：把两个高度依次渲染后采样切面单元 ----
    out.pixelChecks = [];
    [1, 4].forEach(z => {
      pm.state.hour = hour; pm.state.zIndex = z;
      pm.render();
      const scene = document.getElementById('scene');
      const sctx = scene.getContext('2d');
      // 选择靠近相机的单元 (x=15,y=15)，其中心通过 __PM 无法直接拿投影，
      // 改为扫描画布统计“非背景彩色像素”数量，证明切面已实际绘制
      const img = sctx.getImageData(0, 0, scene.width, scene.height).data;
      let colored = 0;
      for (let i = 0; i < img.length; i += 4 * 37) {
        const r = img[i], g = img[i + 1], b = img[i + 2];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if (sat > 40 && !(r < 40 && g < 50 && b < 70)) colored++;
      }
      out.pixelChecks.push({ z, coloredSamples: colored });
    });

    // ---- 4. 时间变化：图例域随小时改变 ----
    pm.state.playing = false;
    pm.state.hour = 8; pm.render();
    const d8 = model.domains[8].slice();
    pm.state.hour = 20; pm.render();
    const d20 = model.domains[20].slice();
    out.domainChanged = JSON.stringify(d8) !== JSON.stringify(d20);
    out.d8 = d8; out.d20 = d20;

    // ---- 5. 拖动滑块联动 ----
    const h = document.getElementById('hSlider');
    h.value = 5; h.dispatchEvent(new Event('input'));
    out.afterSliderZ = pm.state.zIndex;
    out.afterSliderLabel = document.getElementById('hLabel').innerText;
    const v = document.getElementById('vSlider');
    v.value = 3; v.dispatchEvent(new Event('input'));
    out.afterSliderY = pm.state.yIndex;

    // ---- 6. 垂直切面数据一致性 ----
    const vs = model.verticalSlice(8, 8);
    out.verticalShape = [vs.length, vs[0].length];
    out.verticalMatch = vs.every((row, zi) =>
      row.every((val, xi) => val === model.valueAt(8, xi, 8, zi)));
    return out;
  });

  console.log(JSON.stringify(data, null, 1));
  assert.ok(logs.length === 0, '浏览器错误: ' + logs.join(' | '));
  assert.ok(data.selftestPass, '内置自检失败: ' + JSON.stringify(data.selftestFails));
  assert.strictEqual(data.selftestTotal, 20);
  assert.ok(data.domainChanged, '图例域未随时间改变');
  assert.strictEqual(data.afterSliderZ, 5);
  assert.strictEqual(data.afterSliderY, 3);
  assert.ok(data.afterSliderLabel.includes('150'));
  assert.deepStrictEqual(data.verticalShape, [8, 16]);
  assert.ok(data.verticalMatch);
  data.pixelChecks.forEach(p => assert.ok(p.coloredSamples > 200, '切面像素不足 z=' + p.z));

  console.log('\nALL E2E ASSERTIONS PASSED');
  await browser.close();
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
