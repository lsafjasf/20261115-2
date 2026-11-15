import { expect, test } from "@playwright/test";

async function openGame(page) {
  await page.goto("/");
  await expect(page.locator("#game")).toBeVisible();
  await page.click("#start-button");
  await page.evaluate(() => window.__rainRider.setTestMode(true));
}

test("积水急刹会产生可测量的侧滑", async ({ page }, testInfo) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const game = window.__rainRider;
    game.teleport(704, 966, 0, 170);
    let maxSlip = 0;
    let maxLateral = 0;
    let skidTicks = 0;
    for (let index = 0; index < 48; index += 1) {
      game.setControls({ throttle: false, brake: true, steer: 0.62 });
      const state = game.step(1 / 120, 1);
      maxSlip = Math.max(maxSlip, state.bike.slipAngle);
      maxLateral = Math.max(
        maxLateral,
        state.bike.speed * Math.sin(state.bike.slipAngle),
      );
      if (state.bike.skidding) skidTicks += 1;
    }
    return {
      state: game.getState(),
      maxSlip,
      maxLateral,
      skidTicks,
      skidMarks: game.getState().bike.skidding,
    };
  });

  expect(result.state.bike.inPuddle).toBe(true);
  expect(result.skidTicks).toBeGreaterThan(20);
  expect(result.maxSlip).toBeGreaterThan(0.08);
  expect(result.maxLateral).toBeGreaterThan(5);
  expect(result.skidMarks).toBe(true);
  await page.waitForTimeout(50);
  await page.screenshot({
    path: testInfo.outputPath("wet-skid.png"),
    fullPage: true,
  });
});

test("同一套物理与窗口逻辑可以完成四单并成功结算", async ({ page }, testInfo) => {
  await openGame(page);
  const report = await page.evaluate(() => {
    const game = window.__rainRider;
    const normalize = (angle) => {
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;
      return angle;
    };
    const clamp = (value, min, max) =>
      Math.max(min, Math.min(max, value));

    let totalSteps = 0;
    const checkpoints = [];
    const windowsSeen = [];

    function driveTo(targetX, targetY, kind, targetIndex) {
      let state = game.getState();
      let sawWindow = false;
      for (let step = 0; step < 8000; step += 1) {
        state = game.getState();
        if (state.phase !== "playing") return state;
        if (kind === "destination" && state.destinationIndex > targetIndex) {
          return { ...state, sawWindow };
        }
        if (state.delivery.windowOpen) sawWindow = true;

        const dx = targetX - state.bike.x;
        const dy = targetY - state.bike.y;
        const distance = Math.hypot(dx, dy);
        if (kind === "waypoint" && distance < 17 && state.bike.speed < 20) {
          return state;
        }

        const angleDifference = normalize(
          Math.atan2(dy, dx) - state.bike.angle,
        );
        let targetSpeed =
          kind === "destination"
            ? clamp((distance - 12) * 0.9, 0, 52)
            : distance < 75
              ? 26
              : 92;
        if (Math.abs(angleDifference) > 0.65) {
          targetSpeed = Math.min(targetSpeed, 30);
        }
        if (Math.abs(angleDifference) > 1.15) {
          targetSpeed = Math.min(targetSpeed, 12);
        }

        game.setControls({
          throttle: state.bike.speed < targetSpeed - 5,
          brake: state.bike.speed > targetSpeed + 4,
          steer: clamp(angleDifference * 2.2, -1, 1),
        });
        state = game.step(1 / 120, 1);
        totalSteps += 1;
      }
      throw new Error(`Route segment timed out at ${targetX},${targetY}`);
    }

    const route = [
      [480, 934, "destination"],
      [220, 934, "waypoint"],
      [220, 300, "waypoint"],
      [480, 300, "destination"],
      [760, 300, "waypoint"],
      [760, 610, "waypoint"],
      [1040, 610, "destination"],
      [1280, 610, "waypoint"],
      [1280, 820, "waypoint"],
      [1242, 820, "destination"],
    ];

    let destinationIndex = 0;
    for (const [x, y, kind] of route) {
      const state = driveTo(x, y, kind, destinationIndex);
      if (kind === "destination") {
        destinationIndex += 1;
        windowsSeen.push(Boolean(state.sawWindow));
        checkpoints.push({
          destination: destinationIndex,
          elapsed: Number(state.elapsed.toFixed(2)),
          damage: Number(state.damage.toFixed(2)),
        });
      }
      if (state.phase !== "playing") break;
    }

    game.setControls({ throttle: false, brake: false, steer: 0 });
    game.step(1 / 120, 180);
    return {
      state: game.getState(),
      checkpoints,
      windowsSeen,
      totalSteps,
      resultVisible: !document
        .querySelector("#result-screen")
        .classList.contains("hidden"),
    };
  });

  expect(report.windowsSeen).toEqual([true, true, true, true]);
  expect(report.state.delivered).toEqual([
    "flower",
    "paper",
    "moon",
    "clock",
  ]);
  expect(report.state.damage).toBeLessThan(report.state.damageLimit);
  expect(report.state.phase).toBe("success");
  expect(report.resultVisible).toBe(true);
  await expect(page.locator("#result-title")).toHaveText("四单送达");
  await page.waitForTimeout(80);
  await page.screenshot({
    path: testInfo.outputPath("success-run.png"),
    fullPage: true,
  });
});
