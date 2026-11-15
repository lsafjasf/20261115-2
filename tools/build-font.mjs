import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import subsetFont from "subset-font";

const root = resolve(import.meta.dirname, "..");
const inputs = [
  "app/index.html",
  "app/styles.css",
  "app/js/main.js",
  "app/js/renderer.js",
  "app/js/engine.js",
].map((file) => readFileSync(resolve(root, file), "utf8"));

const latin = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join("");
const characters = [...new Set((inputs.join("") + latin + "°−←→◖◗◆✓×↺❄").split(""))];
const text = characters.join("");

const variants = [
  [
    "/tmp/NotoSansCJKsc-Regular.otf",
    "app/assets/noto-sans-sc-400.woff2",
    "https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf",
  ],
  [
    "/tmp/NotoSansCJKsc-Bold.otf",
    "app/assets/noto-sans-sc-700.woff2",
    "https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf",
  ],
];

for (const [source, target, sourceUrl] of variants) {
  if (!existsSync(source)) {
    console.log(`downloading ${sourceUrl}`);
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`font download failed: ${response.status}`);
    writeFileSync(source, Buffer.from(await response.arrayBuffer()));
  }
  const result = await subsetFont(readFileSync(source), text, { targetFormat: "woff2" });
  writeFileSync(resolve(root, target), result);
  console.log(`${target}: ${characters.length} glyphs, ${result.length} bytes`);
}
