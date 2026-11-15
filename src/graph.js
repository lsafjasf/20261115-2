export const WORLD = Object.freeze({ width: 1180, height: 720 });

export const NODES = Object.freeze([
  { id: "dawn", name: "晨星台", code: "A1", kind: "station", x: 126, y: 184 },
  { id: "deep", name: "深井站", code: "B2", kind: "station", x: 148, y: 506 },
  { id: "northwest", name: "北环岔", code: "J1", kind: "junction", x: 368, y: 346 },
  { id: "ridge", name: "月脊台", code: "C3", kind: "station", x: 628, y: 122 },
  { id: "northeast", name: "东环岔", code: "J2", kind: "junction", x: 866, y: 326 },
  { id: "dome", name: "穹顶站", code: "D4", kind: "station", x: 1094, y: 168 },
  { id: "south", name: "南汇岔", code: "J3", kind: "junction", x: 656, y: 626 },
  { id: "tide", name: "潮汐港", code: "E5", kind: "station", x: 352, y: 688 },
  { id: "ember", name: "余烬站", code: "F6", kind: "station", x: 992, y: 690 },
]);

const EDGE_DEFINITIONS = [
  ["dawn", "northwest", 2.8, 272, 238],
  ["deep", "northwest", 2.7, 206, 468],
  ["northwest", "northeast", 4.4, 616, 303],
  ["northeast", "ridge", 2.5, 713, 191],
  ["northeast", "dome", 2.8, 1013, 225],
  ["northeast", "south", 4.5, 807, 494],
  ["south", "tide", 2.7, 464, 688],
  ["south", "ember", 2.8, 862, 698],
  ["south", "northwest", 4.1, 435, 515],
];

export const EDGES = Object.freeze(
  EDGE_DEFINITIONS.map(([a, b, duration, cx, cy]) => {
    const [from, to] = [a, b].sort();
    return Object.freeze({
      id: `${from}--${to}`,
      a,
      b,
      duration,
      control: Object.freeze({ x: cx, y: cy }),
    });
  }),
);

export const NODE_BY_ID = Object.freeze(
  Object.fromEntries(NODES.map((node) => [node.id, node])),
);

export const EDGE_BY_ID = Object.freeze(
  Object.fromEntries(EDGES.map((edge) => [edge.id, edge])),
);

export const STATIONS = Object.freeze(NODES.filter((node) => node.kind === "station"));
export const JUNCTIONS = Object.freeze(NODES.filter((node) => node.kind === "junction"));

const adjacency = new Map(NODES.map((node) => [node.id, []]));

for (const edge of EDGES) {
  adjacency.get(edge.a).push({ edge, node: edge.b });
  adjacency.get(edge.b).push({ edge, node: edge.a });
}

export function edgeId(a, b) {
  return [a, b].sort().join("--");
}

export function getEdge(a, b) {
  return EDGE_BY_ID[edgeId(a, b)] ?? null;
}

export function otherEnd(edge, nodeId) {
  return edge.a === nodeId ? edge.b : edge.a;
}

export function getNode(nodeId) {
  return NODE_BY_ID[nodeId] ?? null;
}

export function findPath(start, goal, options = {}) {
  const blockedEdges = options.blockedEdges ?? new Set();
  const weights = options.weights ?? {};

  if (start === goal) {
    return { nodes: [start], edges: [], duration: 0 };
  }

  const distances = new Map(NODES.map((node) => [node.id, Infinity]));
  const previous = new Map();
  const unvisited = new Set(NODES.map((node) => node.id));
  distances.set(start, 0);

  while (unvisited.size > 0) {
    let current = null;
    let best = Infinity;
    for (const nodeId of unvisited) {
      if (distances.get(nodeId) < best) {
        best = distances.get(nodeId);
        current = nodeId;
      }
    }

    if (current === null || best === Infinity) break;
    if (current === goal) break;

    unvisited.delete(current);
    for (const link of adjacency.get(current) ?? []) {
      if (blockedEdges.has(link.edge.id) || !unvisited.has(link.node)) continue;
      const weight = weights[link.edge.id] ?? link.edge.duration;
      const candidate = best + weight;
      if (candidate < distances.get(link.node)) {
        distances.set(link.node, candidate);
        previous.set(link.node, { node: current, edge: link.edge });
      }
    }
  }

  if (!Number.isFinite(distances.get(goal))) return null;

  const nodes = [goal];
  const edges = [];
  let cursor = goal;
  while (cursor !== start) {
    const step = previous.get(cursor);
    if (!step) return null;
    edges.unshift(step.edge.id);
    nodes.unshift(step.node);
    cursor = step.node;
  }

  return {
    nodes,
    edges,
    duration: edges.reduce((sum, id) => sum + EDGE_BY_ID[id].duration, 0),
  };
}

export function stationOptions() {
  return STATIONS.map(({ id, name, code }) => ({ id, name, code }));
}

export function validateStops(origin, stops) {
  if (!NODE_BY_ID[origin]) return "起点不存在";
  if (!Array.isArray(stops) || stops.length === 0) return "至少需要一个目的地";
  if (stops.some((stop) => !NODE_BY_ID[stop])) return "包含无效站点";
  return null;
}

export function formatClock(seconds, includeTenths = true) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  if (!includeTenths) {
    return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`;
  }
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
}
