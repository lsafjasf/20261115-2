import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, '..', 'artifacts');
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (err) => check('no page errors', false, err.message));
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForSelector('#stage');
await page.waitForTimeout(300);

// 1. Three panels auto-assigned.
const panelCount = await page.locator('.card').count();
check('three sections assigned to cover/inner/back', panelCount === 3, `cards=${panelCount}`);

// 2. Edit text with a very long string to force wrapping / shrink.
const longText = '超長測試文字'.repeat(40) + ' overflow word '.repeat(30);
await page.locator('.in-body').first().fill(longText);
await page.waitForTimeout(150);

const geometry = await page.evaluate(() => {
  const { VIEW, safeRect } = layout;
  const stage = document.getElementById('stage');
  const ctx = stage.getContext('2d');
  const composed = render.computeAll(ctx, window.__brochure.getDoc());
  const violations = [];
  composed.forEach(({ index, layout }) => {
    const safe = safeRect(index);
    layout.blocks.forEach((b) => {
      const r = b.rect;
      if (r.x < safe.x - 0.01 || r.y < safe.y - 0.01 ||
          r.x + r.w > safe.x + safe.w + 0.01 ||
          r.y + r.h > safe.y + safe.h + 0.01) {
        violations.push({ panel: index, type: b.type, r, safe });
      }
      if (b.fit) {
        b.fit.lines.forEach((line) => {
          if (line.width > VIEW.innerW + 0.5) violations.push({ panel: index, lineTooWide: line.width });
        });
      }
    });
  });
  return { violations, count: composed.reduce((n, c) => n + c.layout.blocks.length, 0) };
});
check('all blocks stay inside panel safe boxes', geometry.violations.length === 0, JSON.stringify(geometry.violations.slice(0, 2)));
check('no wrapped line exceeds inner width', !geometry.violations.some((v) => v.lineTooWide));
check('nine blocks laid out across three panels', geometry.count === 9, `blocks=${geometry.count}`);

// 3. Drag a block on canvas and verify it is clamped inside its safe box.
const dragInfo = await page.evaluate(() => {
  const stage = document.getElementById('stage');
  const rect = stage.getBoundingClientRect();
  const doc = window.__brochure.getDoc();
  const ctx = stage.getContext('2d');
  const composed = render.computeAll(ctx, doc);
  const block = composed[0].layout.blocks.find((b) => b.type === 'image');
  const scale = rect.width / layout.VIEW.width;
  return { id: block.id, startX: rect.left + (block.rect.x + 10) * scale, startY: rect.top + (block.rect.y + 10) * scale };
});
await page.mouse.move(dragInfo.startX, dragInfo.startY);
await page.mouse.down();
await page.mouse.move(dragInfo.startX + 400, dragInfo.startY + 500, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(150);

const clampInfo = await page.evaluate((id) => {
  const doc = window.__brochure.getDoc();
  const block = doc.panels.flatMap((p) => p.blocks).find((b) => b.id === id);
  const panelIndex = doc.panels.findIndex((p) => p.blocks.some((b) => b.id === id));
  const safe = layout.safeRect(panelIndex);
  const r = block.rect;
  return {
    pinned: Boolean(r),
    inside: r.x >= safe.x && r.y >= safe.y && r.x + r.w <= safe.x + safe.w && r.y + r.h <= safe.y + safe.h,
    r, safe,
  };
}, dragInfo.id);
check('dragged block stored with pinned rect', clampInfo.pinned);
check('dragged block clamped inside safe box', clampInfo.inside, JSON.stringify(clampInfo.r));

// 4. Reorder via buttons.
const firstRow = page.locator('.order-row').first();
const beforeId = await firstRow.getAttribute('data-id');
await firstRow.locator('[data-act=down]').click();
await page.waitForTimeout(100);
const afterId = await page.locator('.order-row').first().getAttribute('data-id');
check('block reorder changes sequence', beforeId !== afterId, `${beforeId} -> ${afterId}`);

// 5. Export SVG / PNG / JSON files.
const exported = await page.evaluate(() => {
  const stage = document.getElementById('stage');
  const doc = window.__brochure.getDoc();
  const ctx = stage.getContext('2d');
  return {
    svg: render.buildSvg(doc, ctx),
    pngDataUrlPrefix: stage.toDataURL('image/png').slice(0, 30),
    json: JSON.stringify(doc),
  };
});
check('SVG produced with three fold lines', (exported.svg.match(/stroke-dasharray="8 6"/g) || []).length === 2);
check('SVG contains three safe-box guides', (exported.svg.match(/stroke-dasharray="4 4"/g) || []).length === 3);
check('PNG data URL produced', exported.pngDataUrlPrefix.startsWith('data:image/png;base64,'));
check('JSON serialized with panels', exported.json.includes('"panels"'));
writeFileSync(path.join(outDir, 'brochure.svg'), exported.svg);
writeFileSync(path.join(outDir, 'brochure-layout.json'), exported.json);
const png = await page.locator('#stage').screenshot();
writeFileSync(path.join(outDir, 'brochure.png'), png);

// 6. Reload: text and pinned positions must match.
const clean = (doc) => JSON.parse(JSON.stringify(doc, (k, v) => (k === '_computed' ? undefined : v)));
const beforeReload = clean(await page.evaluate(() => window.__brochure.getDoc()));
await page.reload();
await page.waitForSelector('#stage');
await page.waitForTimeout(300);
const afterReload = clean(await page.evaluate(() => window.__brochure.getDoc()));
check('reloaded JSON equals pre-reload state', JSON.stringify(afterReload) === JSON.stringify(beforeReload));

const restoredRect = await page.evaluate((id) => {
  const doc = window.__brochure.getDoc();
  const b = doc.panels.flatMap((p) => p.blocks).find((x) => x.id === id);
  return b.rect;
}, dragInfo.id);
const origRect = beforeReload.panels.flatMap((p) => p.blocks).find((b) => b.id === dragInfo.id).rect;
check('pinned position identical after reload', JSON.stringify(restoredRect) === JSON.stringify(origRect), JSON.stringify(restoredRect));

const restoredText = await page.locator('.in-body').first().inputValue();
check('edited text identical after reload', restoredText === longText, `len=${restoredText.length}`);

// 7. Geometry determinism: recompute layout twice, compare.
const deterministic = await page.evaluate(() => {
  const stage = document.getElementById('stage');
  const ctx = stage.getContext('2d');
  const doc = window.__brochure.getDoc();
  const a = JSON.stringify(render.computeAll(ctx, doc));
  const b = JSON.stringify(render.computeAll(ctx, doc));
  return a === b;
});
check('layout is deterministic across recompute', deterministic);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
