import { chromium } from 'playwright';

const URL = 'file:///home/hj/userfeedback/uid414/index.html';
const held = new Set();

async function setKey(page, key, want){
  if (want && !held.has(key)){ await page.keyboard.down(key); held.add(key); }
  else if (!want && held.has(key)){ await page.keyboard.up(key); held.delete(key); }
}

function ik(s, tx, ty){
  const X = tx - s.base.x, Y = -(ty - s.base.y);
  const L1 = s.L1, L2 = s.L2;
  let r = Math.hypot(X, Y);
  r = Math.min(L1+L2-6, Math.max(Math.abs(L1-L2)+8, r));
  const phi = Math.atan2(Y, X);
  const c = Math.min(1, Math.max(-1, (r*r - L1*L1 - L2*L2) / (2*L1*L2)));
  const sols = [];
  for (const a2 of [Math.acos(c), -Math.acos(c)]){
    const a1 = phi - Math.atan2(L2*Math.sin(a2), L1 + L2*Math.cos(a2));
    if (a1 > -0.45 && a1 < 3.35 && a2 > -2.65 && a2 < 2.65) sols.push({a1, a2});
  }
  if (!sols.length) return null;
  sols.sort((p, q) => (Math.abs(p.a1-s.a1)+Math.abs(p.a2-s.a2)) - (Math.abs(q.a1-s.a1)+Math.abs(q.a2-s.a2)));
  return sols[0];
}

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 760 } });
  page.on('pageerror', e => { console.error('PAGE_ERROR:', e.message); });
  await page.goto(URL);
  await page.waitForTimeout(300);

  const t0 = Date.now();
  let result = null;
  while (Date.now() - t0 < 150000){
    const s = await page.evaluate(() => window.__state());
    if (s.status !== 'run'){ result = s; break; }

    let tx = 340, ty = 470, wantSpace = false;
    if (s.carried){
      tx = (s.slot.x0 + s.slot.x1) / 2; ty = s.slot.top - 70;
      wantSpace = true;
      const inSlot = s.tip.x > s.slot.x0 + 10 && s.tip.x < s.slot.x1 - 10 && s.tip.y < s.slot.top - 25;
      if (inSlot) wantSpace = false;
    } else if (s.wp && s.wp.state === 'belt'){
      const lead = 0.32;
      tx = Math.min(395, Math.max(262, s.wp.x + s.wp.vx * lead));
      ty = s.wp.y - 5;
      const dx = s.tip.x - s.wp.x, dy = s.tip.y - s.wp.y;
      wantSpace = Math.hypot(dx, dy) < 24;
    } else if (s.wp && s.wp.state === 'falling'){
      tx = 340; ty = 460;
    }

    const sol = ik(s, tx, ty);
    if (sol){
      await setKey(page, 'd', sol.a1 - s.a1 > 0.04);
      await setKey(page, 'a', s.a1 - sol.a1 > 0.04);
      await setKey(page, 's', sol.a2 - s.a2 > 0.04);
      await setKey(page, 'w', s.a2 - sol.a2 > 0.04);
    }
    await setKey(page, ' ', wantSpace);
    await page.waitForTimeout(40);
  }

  for (const k of [...held]){ await page.keyboard.up(k); }
  const fin = result || await page.evaluate(() => window.__state());
  console.log(JSON.stringify({ status: fin.status, placed: fin.placed, col: fin.col, miss: fin.miss,
    elapsedSec: ((Date.now()-t0)/1000).toFixed(1) }));
  await page.screenshot({ path: '/home/hj/userfeedback/uid414/artifacts/round.png' });
  await browser.close();
  if (fin.status !== 'win') process.exit(1);
};
run();
