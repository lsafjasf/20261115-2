import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { snapshot } from "../app/js/engine.js";
import { runRecovery, runWrongAnchor } from "./drivers.js";

mkdirSync("artifacts", { recursive: true });

const successRun = runRecovery();
const wrongRun = runWrongAnchor();
const success = snapshot(successRun.engine);
const wrong = snapshot(wrongRun.engine);

const result = {
  generatedAt: new Date().toISOString(),
  successfulRecovery: {
    status: success.status,
    reason: success.finishReason,
    timeSeconds: Number(success.time.toFixed(2)),
    frontSafe: success.front.safe,
    rearSafe: success.rear.safe,
    rescueSlip: Number(success.rescue.slip.toFixed(1)),
    peakTension: Number(successRun.engine.maxTension.toFixed(1)),
    phaseTimeline: successRun.log,
  },
  wrongAnchor: {
    angle: wrong.anchor.angle,
    quality: Number(wrong.anchor.quality.toFixed(3)),
    band: wrong.anchor.band,
    timeSeconds: Number(wrong.time.toFixed(2)),
    tension: Number(wrong.tension.toFixed(1)),
    rescueSlip: Number(wrongRun.engine.maxSlip.toFixed(1)),
    rescueOffsetX: Number((wrong.rescue.x - 878).toFixed(1)),
    rescueTilt: Number(wrong.rescue.tilt.toFixed(1)),
  },
};

writeFileSync(resolve("artifacts/rescue-run.json"), JSON.stringify(result, null, 2));

console.log(
  `双车救援：${success.status === "won" ? "成功" : "失败"}，` +
    `用时 ${result.successfulRecovery.timeSeconds}s，` +
    `前车=${success.front.safe}，后车=${success.rear.safe}，` +
    `救援车滑移=${result.successfulRecovery.rescueSlip}%`,
);
console.log(
  `错误锚点 ${wrong.anchor.angle}°：救援车滑移 ${result.wrongAnchor.rescueSlip}% ` +
    `(x 偏移 ${result.wrongAnchor.rescueOffsetX}px，倾角 ${result.wrongAnchor.rescueTilt}°)，` +
    `锚点评级 ${wrong.anchor.band}`,
);
console.log("验证数据已写入 artifacts/rescue-run.json");
