import assert from "node:assert/strict";
import test from "node:test";
import {
  BALANCED_FLOWS,
  EDGES,
  NODES,
  OVERLOAD_FLOWS,
  analyzeNetwork,
  clampFlow,
  cloneFlows,
  simulateNetwork,
  solveBalancedFlows,
} from "../src/network.js";

test("network has the required 2 factories, 3 warehouses and 4 stores", () => {
  assert.equal(NODES.filter((node) => node.type === "factory").length, 2);
  assert.equal(NODES.filter((node) => node.type === "warehouse").length, 3);
  assert.equal(NODES.filter((node) => node.type === "store").length, 4);
  assert.equal(EDGES.length, 18);
});

test("balanced scenario completes supply and demand without violations", () => {
  const result = analyzeNetwork(BALANCED_FLOWS);
  assert.equal(result.totals.supplyPlan, 210);
  assert.equal(result.totals.demandPlan, 210);
  assert.equal(result.totals.actualSupply, 210);
  assert.equal(result.totals.actualDemand, 210);
  assert.equal(result.capacityValid, true);
  assert.equal(result.conservationValid, true);
  assert.equal(result.demandValid, true);
  assert.equal(result.balanced, true);

  result.edges.forEach((edge) => {
    assert.ok(edge.flow <= edge.capacity, `${edge.id} exceeds its capacity`);
  });
  result.nodes.forEach((node) => {
    assert.equal(node.balance, 0, `${node.id} is not conserved`);
  });
});

test("overload scenario highlights W-02 to S-01 and reports the shortage", () => {
  const result = analyzeNetwork(OVERLOAD_FLOWS);
  assert.deepEqual(result.overloadedEdges.map((edge) => edge.id), ["w2s1"]);
  assert.equal(result.overloadedEdges[0].flow, 36);
  assert.equal(result.overloadedEdges[0].capacity, 30);
  assert.equal(result.capacityValid, false);

  const westStore = result.nodes.find((node) => node.id === "s2");
  assert.equal(westStore.gap, 10);
  assert.equal(result.demandValid, false);
});

test("auto balancing finds a feasible 210-unit plan under route capacities", () => {
  const solution = solveBalancedFlows();
  const result = analyzeNetwork(solution.flows);
  assert.equal(solution.maxFlow, 210);
  assert.equal(result.balanced, true);
  assert.equal(result.conservationValid, true);
  assert.equal(result.demandValid, true);
  assert.equal(result.overloadedEdges.length, 0);
});

test("ten-step simulation returns ten snapshots and final inventories", () => {
  const simulation = simulateNetwork(OVERLOAD_FLOWS, 10);
  assert.equal(simulation.steps.length, 10);
  assert.equal(simulation.steps.at(-1).step, 10);
  assert.equal(Object.keys(simulation.finalStocks).length, 9);
  assert.equal(simulation.overloadCount, 1);
  assert.equal(simulation.conserved, false);
});

test("flow values are clamped to a safe editable range", () => {
  assert.equal(clampFlow("w2s1", -12), 0);
  assert.equal(clampFlow("w2s1", 200), 45);
  assert.equal(clampFlow("w2s1", 31.6), 32);
  assert.deepEqual(cloneFlows(BALANCED_FLOWS), BALANCED_FLOWS);
});
