export const NODES = [
  { id: "f1", code: "F-01", name: "朝阳智造", type: "factory", production: 120, stock: 42, x: 118, y: 280, sub: "核心生产基地" },
  { id: "f2", code: "F-02", name: "江城智造", type: "factory", production: 90, stock: 28, x: 118, y: 462, sub: "柔性补充基地" },
  { id: "w1", code: "W-01", name: "北岭仓", type: "warehouse", stock: 18, x: 500, y: 126, sub: "区域仓库 · 北区" },
  { id: "w2", code: "W-02", name: "中轴仓", type: "warehouse", stock: 12, x: 500, y: 320, sub: "区域仓库 · 中轴枢纽" },
  { id: "w3", code: "W-03", name: "南湾仓", type: "warehouse", stock: 9, x: 500, y: 514, sub: "区域仓库 · 南区" },
  { id: "s1", code: "S-01", name: "东城店", type: "store", demand: 60, stock: 14, x: 876, y: 88, sub: "零售终端 · 东区" },
  { id: "s2", code: "S-02", name: "西城店", type: "store", demand: 55, stock: 11, x: 876, y: 226, sub: "零售终端 · 西区" },
  { id: "s3", code: "S-03", name: "滨江店", type: "store", demand: 50, stock: 9, x: 876, y: 376, sub: "零售终端 · 滨江" },
  { id: "s4", code: "S-04", name: "高新店", type: "store", demand: 45, stock: 7, x: 876, y: 526, sub: "零售终端 · 高新区" },
];

export const EDGES = [
  { id: "f1w1", from: "f1", to: "w1", capacity: 80 },
  { id: "f1w2", from: "f1", to: "w2", capacity: 55 },
  { id: "f1w3", from: "f1", to: "w3", capacity: 40 },
  { id: "f2w1", from: "f2", to: "w1", capacity: 45 },
  { id: "f2w2", from: "f2", to: "w2", capacity: 65 },
  { id: "f2w3", from: "f2", to: "w3", capacity: 45 },
  { id: "w1s1", from: "w1", to: "s1", capacity: 45 },
  { id: "w1s2", from: "w1", to: "s2", capacity: 40 },
  { id: "w1s3", from: "w1", to: "s3", capacity: 35 },
  { id: "w1s4", from: "w1", to: "s4", capacity: 30 },
  { id: "w2s1", from: "w2", to: "s1", capacity: 30 },
  { id: "w2s2", from: "w2", to: "s2", capacity: 35 },
  { id: "w2s3", from: "w2", to: "s3", capacity: 30 },
  { id: "w2s4", from: "w2", to: "s4", capacity: 30 },
  { id: "w3s1", from: "w3", to: "s1", capacity: 25 },
  { id: "w3s2", from: "w3", to: "s2", capacity: 25 },
  { id: "w3s3", from: "w3", to: "s3", capacity: 35 },
  { id: "w3s4", from: "w3", to: "s4", capacity: 30 },
];

export const BALANCED_FLOWS = {
  f1w1: 70, f1w2: 35, f1w3: 15,
  f2w1: 20, f2w2: 50, f2w3: 20,
  w1s1: 35, w1s2: 25, w1s3: 20, w1s4: 10,
  w2s1: 15, w2s2: 20, w2s3: 25, w2s4: 25,
  w3s1: 10, w3s2: 10, w3s3: 5, w3s4: 10,
};

export const OVERLOAD_FLOWS = {
  ...BALANCED_FLOWS,
  w2s1: 36,
  w2s2: 10,
  w2s3: 20,
  w2s4: 19,
};

export const SCENARIOS = {
  balanced: { flows: BALANCED_FLOWS, label: "平衡方案" },
  overload: { flows: OVERLOAD_FLOWS, label: "超载测试" },
};

export const nodeById = Object.fromEntries(NODES.map((node) => [node.id, node]));
export const edgeById = Object.fromEntries(EDGES.map((edge) => [edge.id, edge]));

export function cloneFlows(flows = BALANCED_FLOWS) {
  return Object.fromEntries(EDGES.map((edge) => [edge.id, Number(flows[edge.id] ?? 0)]));
}

export function clampFlow(edgeId, value) {
  const edge = edgeById[edgeId];
  if (!edge) return 0;
  return Math.max(0, Math.min(edge.capacity * 1.5, Math.round(Number(value) || 0)));
}

function totalsForNode(node, flows) {
  const incoming = EDGES
    .filter((edge) => edge.to === node.id)
    .reduce((sum, edge) => sum + (flows[edge.id] || 0), 0);
  const outgoing = EDGES
    .filter((edge) => edge.from === node.id)
    .reduce((sum, edge) => sum + (flows[edge.id] || 0), 0);
  return { incoming, outgoing };
}

export function evaluateNode(node, flows) {
  const { incoming, outgoing } = totalsForNode(node, flows);
  let expected = outgoing;
  let gap = 0;
  let surplus = 0;

  if (node.type === "factory") {
    expected = node.production;
    gap = Math.max(0, node.production - outgoing);
    surplus = Math.max(0, outgoing - node.production);
  } else if (node.type === "warehouse") {
    expected = incoming;
    gap = Math.max(0, outgoing - incoming);
    surplus = Math.max(0, incoming - outgoing);
  } else {
    expected = node.demand;
    gap = Math.max(0, node.demand - incoming);
    surplus = Math.max(0, incoming - node.demand);
  }

  const balance = node.type === "factory"
    ? outgoing - node.production
    : node.type === "warehouse"
      ? incoming - outgoing
      : incoming - node.demand;

  return {
    ...node,
    incoming,
    outgoing,
    expected,
    gap,
    surplus,
    balance,
    balanced: Math.abs(balance) < 0.001,
  };
}

export function analyzeNetwork(flows) {
  const edgeStates = EDGES.map((edge) => {
    const flow = Number(flows[edge.id] || 0);
    const ratio = flow / edge.capacity;
    return {
      ...edge,
      flow,
      ratio,
      full: flow >= edge.capacity - 0.001,
      overload: flow > edge.capacity + 0.001,
      nearCapacity: ratio >= 0.85 && flow <= edge.capacity + 0.001,
    };
  });
  const nodeStates = NODES.map((node) => evaluateNode(node, flows));
  const overloadedEdges = edgeStates.filter((edge) => edge.overload);
  const balancedNodes = nodeStates.filter((node) => node.balanced);
  const fulfilledStores = nodeStates.filter((node) => node.type === "store" && node.gap === 0);
  const factories = nodeStates.filter((node) => node.type === "factory");
  const stores = nodeStates.filter((node) => node.type === "store");
  const supplyPlan = factories.reduce((sum, node) => sum + node.production, 0);
  const demandPlan = stores.reduce((sum, node) => sum + node.demand, 0);
  const actualSupply = factories.reduce((sum, node) => sum + node.outgoing, 0);
  const actualDemand = stores.reduce((sum, node) => sum + node.incoming, 0);

  return {
    nodes: nodeStates,
    edges: edgeStates,
    overloadedEdges,
    balancedNodes,
    fulfilledStores,
    totals: { supplyPlan, demandPlan, actualSupply, actualDemand },
    capacityValid: overloadedEdges.length === 0,
    conservationValid: balancedNodes.length === NODES.length,
    demandValid: fulfilledStores.length === stores.length,
    balanced: overloadedEdges.length === 0 && balancedNodes.length === NODES.length,
  };
}

export function findEdgeState(analysis, edgeId) {
  return analysis.edges.find((edge) => edge.id === edgeId);
}

export function findNodeState(analysis, nodeId) {
  return analysis.nodes.find((node) => node.id === nodeId);
}

export function solveBalancedFlows() {
  const source = 0;
  const sink = 10;
  const idMap = { f1: 1, f2: 2, w1: 3, w2: 4, w3: 5, s1: 6, s2: 7, s3: 8, s4: 9 };
  const graph = Array.from({ length: 11 }, () => []);
  const routeRefs = {};

  const addEdge = (from, to, capacity) => {
    const forward = { to, rev: graph[to].length, capacity };
    const backward = { to: from, rev: graph[from].length, capacity: 0 };
    graph[from].push(forward);
    graph[to].push(backward);
    return forward;
  };

  NODES.filter((node) => node.type === "factory")
    .forEach((node) => addEdge(source, idMap[node.id], node.production));

  EDGES.filter((edge) => edge.from.startsWith("f"))
    .forEach((edge) => {
      routeRefs[edge.id] = {
        capacity: edge.capacity,
        forward: addEdge(idMap[edge.from], idMap[edge.to], edge.capacity),
      };
    });

  EDGES.filter((edge) => edge.from.startsWith("w"))
    .forEach((edge) => {
      routeRefs[edge.id] = {
        capacity: edge.capacity,
        forward: addEdge(idMap[edge.from], idMap[edge.to], edge.capacity),
      };
    });

  NODES.filter((node) => node.type === "store")
    .forEach((node) => addEdge(idMap[node.id], sink, node.demand));

  const level = new Array(graph.length).fill(-1);
  const cursor = new Array(graph.length).fill(0);
  const bfs = () => {
    level.fill(-1);
    level[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      graph[current].forEach((edge) => {
        if (edge.capacity > 0 && level[edge.to] < 0) {
          level[edge.to] = level[current] + 1;
          queue.push(edge.to);
        }
      });
    }
    return level[sink] >= 0;
  };

  const send = (current, amount) => {
    if (current === sink) return amount;
    for (; cursor[current] < graph[current].length; cursor[current] += 1) {
      const edge = graph[current][cursor[current]];
      if (edge.capacity <= 0 || level[edge.to] !== level[current] + 1) continue;
      const pushed = send(edge.to, Math.min(amount, edge.capacity));
      if (pushed > 0) {
        edge.capacity -= pushed;
        graph[edge.to][edge.rev].capacity += pushed;
        return pushed;
      }
    }
    return 0;
  };

  let maxFlow = 0;
  while (bfs()) {
    cursor.fill(0);
    let pushed = send(source, Number.POSITIVE_INFINITY);
    while (pushed > 0) {
      maxFlow += pushed;
      pushed = send(source, Number.POSITIVE_INFINITY);
    }
  }

  const result = Object.fromEntries(EDGES.map((edge) => [edge.id, 0]));
  Object.entries(routeRefs).forEach(([id, ref]) => {
    result[id] = ref.capacity - ref.forward.capacity;
  });
  return { flows: result, maxFlow };
}

export function simulateNetwork(flows, steps = 10) {
  const analysis = analyzeNetwork(flows);
  const stocks = Object.fromEntries(NODES.map((node) => [node.id, node.stock]));
  const history = [];

  for (let step = 1; step <= steps; step += 1) {
    NODES.forEach((node) => {
      const state = findNodeState(analysis, node.id);
      if (node.type === "factory") {
        stocks[node.id] += (node.production - state.outgoing) / steps;
      } else if (node.type === "warehouse") {
        stocks[node.id] += (state.incoming - state.outgoing) / steps;
      } else {
        stocks[node.id] += (state.incoming - node.demand) / steps;
      }
    });
    history.push({
      step,
      stocks: Object.fromEntries(Object.entries(stocks).map(([id, value]) => [id, Number(value.toFixed(2))])),
      gaps: Object.fromEntries(analysis.nodes.map((node) => [node.id, node.gap])),
    });
  }

  const variance = Object.fromEntries(NODES.map((node) => {
    const finalStock = history.at(-1)?.stocks[node.id] ?? node.stock;
    return [node.id, Number((finalStock - node.stock).toFixed(2))];
  }));

  return {
    steps: history,
    finalStocks: history.at(-1)?.stocks ?? stocks,
    variance,
    analysis,
    overloadCount: analysis.overloadedEdges.length,
    conserved: analysis.conservationValid,
  };
}
