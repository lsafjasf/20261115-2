/* 无头浏览器验证：Canvas 点击选站、双路径高亮、停运绕行、断开节点 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1340, height: 720 } });
  page.on('pageerror', (e) => { throw new Error('页面 JS 错误: ' + e.message); });
  await page.goto('file://' + path.join(__dirname, 'index.html'));

  const canvas = page.locator('#map');
  const clickStation = async (sid) => {
    const box = await canvas.boundingBox();
    const p = await page.evaluate((id) => {
      const s = window.Subway.stations[id];
      return { x: s.x, y: s.y };
    }, sid);
    await page.mouse.click(box.x + p.x, box.y + p.y);
  };

  await clickStation('C0');
  await clickStation('A4');
  const normal = await page.locator('#result').innerText();
  if (!normal.includes('22') || !normal.includes('30')) {
    throw new Error('双方案分钟数不符合预期:\n' + normal);
  }
  if (!normal.includes('换乘 2') || !normal.includes('换乘 0')) {
    throw new Error('换乘次数不符合预期:\n' + normal);
  }
  await page.screenshot({ path: 'artshots/normal-c0-a4.png' });

  await page.getByText('1号线 停运').click();
  const reroute = await page.locator('#result').innerText();
  if (!reroute.includes('30') || reroute.includes('无法到达')) {
    throw new Error('停运后绕行结果异常:\n' + reroute);
  }
  if (!reroute.includes('相同路径')) {
    throw new Error('停运后两算法应收敛为同一绕行方案:\n' + reroute);
  }
  await page.screenshot({ path: 'artshots/closed-l1.png' });

  await clickStation('A1');
  await clickStation('A4');
  const unreachable = await page.locator('#result').innerText();
  if (!unreachable.includes('无法到达') || !unreachable.includes('北岭(A1)')) {
    throw new Error('不可达断开节点展示异常:\n' + unreachable);
  }
  await page.screenshot({ path: 'artshots/unreachable.png' });

  await browser.close();
  console.log('浏览器冒烟测试全部通过 ✔（截图见 artshots/）');
})();
