import test from "node:test";
import assert from "node:assert/strict";
import {
  createColdChainGame,
  LIMIT_TEMP,
} from "../src/sim.js";

function run(game, seconds = 90) {
  game.start();
  game.advance(seconds);
  return game.getSnapshot();
}

test("固定默认方案完成一局：三车安全且至少两车准点", () => {
  const snapshot = run(createColdChainGame());
  const result = snapshot.result;

  assert.equal(result.success, true);
  assert.equal(result.outcome, "success");
  assert.equal(result.arrived, 3);
  assert.ok(result.onTime >= 2);
  assert.equal(result.unsafe.length, 0);
  assert.ok(snapshot.ambient > 30, "外部温度应随任务时钟升高");
  assert.ok(
    snapshot.trucks.every((truck) => truck.finalTemp < LIMIT_TEMP),
    "所有到场药品必须低于上限",
  );
});

test("低电量车辆改走中线并开 MAX，电力不足导致货温超限", () => {
  const game = createColdChainGame();
  assert.equal(game.setRoute("T-01", "direct"), true);
  assert.equal(game.setCooling("T-01", "max"), true);
  const snapshot = run(game);
  const result = snapshot.result;
  const truck = snapshot.trucks.find((item) => item.id === "T-01");

  assert.equal(result.success, false);
  assert.equal(result.outcome, "cold-chain-breach");
  assert.equal(result.powerRelatedBreach, true);
  assert.deepEqual(result.powerFailure, ["T-01"]);
  assert.deepEqual(result.unsafe, ["T-01"]);
  assert.equal(truck.powerLost, true);
  assert.equal(truck.battery, 0);
  assert.ok(truck.finalTemp > LIMIT_TEMP);
  assert.ok(
    snapshot.events.some(
      (event) =>
        event.type === "danger" &&
        event.truckId === "T-01" &&
        event.message.includes("电量耗尽"),
    ),
  );
});

test("换电顺序会改变共享工位的服务先后", () => {
  const game = createColdChainGame();
  game.setRoute("T-02", "north");
  game.setPriority("north", "T-02", -1);
  game.start();
  game.advance(27.2);
  const snapshot = game.getSnapshot();

  assert.equal(snapshot.stations.north.active, "T-02");
  assert.ok(snapshot.stations.north.queue.includes("T-01"));
});

test("开箱作业会额外抬升货温", () => {
  const baseline = createColdChainGame();
  baseline.start();
  baseline.advance(8);
  const baselineTemp = baseline
    .getSnapshot()
    .trucks.find((truck) => truck.id === "T-01").temperature;

  const opened = createColdChainGame();
  opened.start();
  opened.advance(4);
  opened.openDoor("T-01");
  opened.advance(4);
  const openedTruck = opened
    .getSnapshot()
    .trucks.find((truck) => truck.id === "T-01");

  assert.ok(openedTruck.doorOpenCount === 1);
  assert.ok(
    openedTruck.temperature > baselineTemp + 0.5,
    "开箱后的货温应明显高于基线",
  );
});
