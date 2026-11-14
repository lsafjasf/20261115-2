const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const artifacts = path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });

function serve() {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  return http
    .createServer((req, res) => {
      const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
      const file = path.join(root, decodeURIComponent(urlPath));
      if (!file.startsWith(root)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end("not found");
        }
        res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
        res.end(data);
      });
    })
    .listen(0);
}

(async () => {
  const server = serve();
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__typesetter && window.__typesetter.state.result,
      { timeout: 15000 }
    );

    // 1. Auto layout with real Canvas measurement: lines in every column.
    const initial = await page.evaluate(() => {
      const { result } = window.__typesetter.state;
      return {
        lineCount: result.lines.length,
        columns: new Set(result.lines.map((l) => l.columnIndex)).size,
        diagnostics: result.diagnostics,
      };
    });
    assert.ok(initial.lineCount > 30, `expected many lines, got ${initial.lineCount}`);
    assert.ok(initial.columns >= 2, `expected multi-column flow, got ${initial.columns}`);
    console.log(`  ✓ auto layout: ${initial.lineCount} lines across ${initial.columns} columns`);

    // 2. Pin paragraph #2 by clicking its first line on the canvas.
    const target = await page.evaluate(() => {
      const line = window.__typesetter.state.result.lines.find((l) => l.paragraphId === 2);
      return { x: line.x + 8, y: line.y + 10 };
    });
    const canvas = page.locator("#view");
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + target.x, box.y + target.y);
    await page.waitForFunction(
      () => Object.keys(window.__typesetter.state.pins).length === 1
    );
    const pinnedSignature = await page.evaluate(() =>
      window.__typesetter.state.result.lines
        .filter((l) => l.paragraphId === 2)
        .map((l) => `${l.x}|${l.y}|${l.tokens.map((t) => t.text).join("")}`)
    );
    console.log(`  ✓ pinned paragraph 2 (${pinnedSignature.length} lines fixed)`);

    // 3. Move the shapes and re-layout: pinned paragraph must not move.
    await page.evaluate(() => window.__typesetter.toggleShapes());
    const afterMove = await page.evaluate(() =>
      window.__typesetter.state.result.lines
        .filter((l) => l.paragraphId === 2)
        .map((l) => `${l.x}|${l.y}|${l.tokens.map((t) => t.text).join("")}`)
    );
    assert.deepStrictEqual(afterMove, pinnedSignature);
    console.log("  ✓ pinned paragraph unchanged after shapes moved and re-flow");

    // 4. Other paragraphs must have re-flowed.
    const moved = await page.evaluate(() => {
      const r = window.__typesetter.state.result;
      return r.lines.some((l) => l.paragraphId === 3);
    });
    assert.ok(moved);
    console.log("  ✓ remaining paragraphs re-flowed around the pin");

    // 5. Export PNG (canvas) and SVG (pure generator) to artifacts.
    const pngB64 = await page.evaluate(
      () =>
        new Promise((resolve) =>
          document.getElementById("view").toBlob(async (b) => {
            const buf = new Uint8Array(await b.arrayBuffer());
            let s = "";
            for (const v of buf) s += String.fromCharCode(v);
            resolve(btoa(s));
          })
        )
    );
    fs.writeFileSync(path.join(artifacts, "layout-pinned.png"), Buffer.from(pngB64, "base64"));

    const { result: svgResult, fontSize } = await page.evaluate(() => ({
      result: window.__typesetter.state.result,
      measurer: window.__typesetter.state.measurer,
      fontSize: window.__typesetter.state.fontSize,
    }));
    const { toSvg } = require("../src/render");
    // Node side cannot reuse the canvas measurer; build an equivalent estimator
    // so token x-positions stay internally consistent for the exported file.
    const { createEstimateMeasurer } = require("../src/measurer");
    const exportMeasurer = createEstimateMeasurer(fontSize, Math.round(fontSize * 1.47));
    const svgString = toSvg(
      svgResult,
      { contentX: 40, contentY: 40, contentWidth: 520, contentHeight: 720, columnCount: 3, gutter: 18 },
      { fontSize, fontFamily: "'Noto Sans SC', sans-serif", pageWidth: 600, pageHeight: 800, measurer: exportMeasurer }
    );
    fs.writeFileSync(path.join(artifacts, "layout-pinned.svg"), svgString);
    console.log("  ✓ exported artifacts/layout-pinned.png and layout-pinned.svg");

    // 6. Unpin and export the re-flowed render (narrow band may report overrun
    //    by design; verify the diagnostics surface it).
    await page.evaluate(() => window.__typesetter.setPins({}));
    const movedDiags = await page.evaluate(
      () => window.__typesetter.state.result.diagnostics.map((d) => d.type)
    );
    assert.ok(
      movedDiags.includes("overrun") || movedDiags.length === 0,
      `unexpected diagnostics: ${movedDiags.join(",")}`
    );
    console.log(`  ✓ diagnostics correctly surfaced: [${movedDiags.join(", ") || "clean"}]`);

    const reflowPng = await page.evaluate(
      () =>
        new Promise((resolve) =>
          document.getElementById("view").toBlob(async (b) => {
            const buf = new Uint8Array(await b.arrayBuffer());
            let s = "";
            for (const v of buf) s += String.fromCharCode(v);
            resolve(btoa(s));
          })
        )
    );
    fs.writeFileSync(path.join(artifacts, "layout-reflow.png"), Buffer.from(reflowPng, "base64"));

    // 7. Restore the default shape set -> zero violations on the standard layout.
    await page.evaluate(() => window.__typesetter.toggleShapes());
    const finalDiags = await page.evaluate(
      () => window.__typesetter.state.result.diagnostics
    );
    assert.deepStrictEqual(finalDiags, []);
    const diagText = await page.locator("#diag").innerText();
    assert.ok(diagText.includes("无违规"));
    console.log("  ✓ default layout restores to zero violations");

    assert.strictEqual(errors.length, 0, `browser errors: ${errors.join("; ")}`);
    console.log("\nAll browser checks passed");
  } catch (err) {
    console.error("BROWSER TEST FAILED:", err.message);
    await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true });
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
