const puppeteer = require('puppeteer');
const EXE = process.env.HOME + '/.cache/puppeteer/chrome/157.0.8103.50/chrome-linux64/chrome';
(async () => {
  const browser = await puppeteer.launch({
    headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('file:///home/hj/userfeedback/uid419/index.html');
  const report = await page.evaluate(() => {
    const pm = window.__PM;
    const out = [];
    [1, 4].forEach(z => {
      pm.state.hour = 8; pm.state.zIndex = z; pm.render();
      out.push({
        height: window.PMModel.HEIGHTS[z] + 'm',
        stats: document.getElementById('stats').innerText,
        hotspots: document.getElementById('hotspots').innerText.split('\n'),
        legend: document.getElementById('legendDomain').innerText
      });
    });
    // 独立从原始数据复算，验证面板数字
    const model = pm.model;
    function recompute(z) {
      const cells = [];
      for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++)
        cells.push({ x, y, v: model.valueAt(8, x, y, z) });
      const avg = a => a.reduce((s, c) => s + c.v, 0) / a.length;
      const urban = cells.filter(c => window.PMModel.isUrban(c.x, c.y));
      const rural = cells.filter(c => !window.PMModel.isUrban(c.x, c.y));
      const max = Math.max(...cells.map(c => c.v));
      const min = Math.min(...cells.map(c => c.v));
      return {
        avg: avg(cells).toFixed(1), min: min.toFixed(1), max: max.toFixed(1),
        urban: avg(urban).toFixed(1), rural: avg(rural).toFixed(1),
        diff: (avg(urban) - avg(rural)).toFixed(1)
      };
    }
    out[0].recompute = recompute(1);
    out[1].recompute = recompute(4);
    return out;
  });
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
