import assert from "node:assert/strict";
import test from "node:test";
import {
  JUNCTIONS,
  findPath,
  getEdge,
  validateStops,
} from "../src/graph.js";
import {
  FIXED_SCENARIO,
  TransitSimulation,
  WRONG_ROUTE_SCENARIO,
  runBlockingTest,
} from "../src/simulation.js";

function runScenario(scenario, { maxSeconds = 90, step = 0.05, autoRepair = true } = {}) {
  const simulation = new TransitSimulation({ scenario, autoRepair });
  simulation.start();
  let elapsed = 0;
  let maxPodsOnOneEdge = 0;

  while (elapsed < maxSeconds && simulation.status !== "success") {
    simulation.step(step);
    elapsed += step;
    const counts = new Map();
    for (const pod of simulation.pods) {
      if (!pod.currentEdge) continue;
      counts.set(pod.currentEdge, (counts.get(pod.currentEdge) ?? 0) + 1);
      maxPodsOnOneEdge = Math.max(maxPodsOnOneEdge, counts.get(pod.currentEdge));
    }
  }

  return { simulation, maxPodsOnOneEdge };
}

test("固定场景有三处分岔，并且存在可绕行的环线", () => {
  assert.equal(JUNCTIONS.length, 3);
  const alternatives = findPath("dawn", "ridge", {
    blockedEdges: new Set(["northeast--northwest"]),
  });
  assert.ok(alternatives);
  assert.ok(alternatives.edges.includes("northwest--south"));
  assert.ok(alternatives.edges.includes("northeast--south"));
});

test("固定场景中四辆舱完成各自任务，且区间从不被重复占用", () => {
  const { simulation, maxPodsOnOneEdge } = runScenario(FIXED_SCENARIO);
  assert.equal(simulation.status, "success");
  assert.equal(simulation.metrics.completed, 4);
  assert.equal(maxPodsOnOneEdge, 1);
  assert.ok(simulation.pods.every((pod) => pod.state === "complete"));
  assert.ok(simulation.elapsed < 60);
});

test("前车故障会闭锁区间并触发后车备用路径", () => {
  const { simulation } = runScenario(FIXED_SCENARIO);
  assert.ok(simulation.metrics.faults >= 1);
  assert.ok(simulation.metrics.reroutes >= 1);
  assert.ok(simulation.events.some((event) => event.message.includes("前车故障")));
  assert.ok(simulation.events.some((event) => event.message.includes("备用路径")));
  assert.equal(simulation.status, "success");
});

test("错误对向线路复现阻塞：低优先级等待后解除，未正面相遇", () => {
  const report = runBlockingTest();
  assert.equal(report.pass, true, JSON.stringify(report.assertions));
  assert.ok(report.headOnHolds >= 1);
  assert.equal(report.maxOccupancyPerEdge, 1);
  assert.equal(report.allCompleted, true);
  assert.ok(report.waitSeconds > 0);
});

test("错误线路场景的优先级关系保持可解释", () => {
  const priorityByPod = Object.fromEntries(
    WRONG_ROUTE_SCENARIO.pods.map((pod) => [pod.id, pod.priority]),
  );
  assert.ok(priorityByPod.gamma > priorityByPod.alpha);
  assert.equal(getEdge("dawn", "northwest").id, "dawn--northwest");
  assert.equal(getEdge("dawn", "ridge"), null);
  assert.equal(validateStops("dawn", ["ridge"]), null);
  assert.equal(validateStops("dawn", []), "至少需要一个目的地");
});
