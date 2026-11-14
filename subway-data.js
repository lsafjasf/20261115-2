/* 抽象地铁网络固定样例 + 寻路算法（UMD：浏览器与 Node 共用） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Subway = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TRANSFER_PENALTY = 1; // 换乘一次的步行/等待耗时（分钟）

  var lines = [
    {
      id: 'L1', name: '1号线', color: '#d8423f',
      stations: ['A0', 'A1', 'A2', 'A3', 'A4'],
      minutes: 2
    },
    {
      id: 'L2', name: '2号线', color: '#2f6fd0',
      stations: ['B0', 'B1', 'B2', 'B3', 'A2'],
      minutes: 2
    },
    {
      id: 'L3', name: '3号线', color: '#35a25b',
      // L 型慢线：机场沿横线经南湖站到东门站，再北上北苑，终点东站
      stations: ['C0', 'C1', 'B2', 'C2', 'A3', 'A4'],
      minutes: 6
    }
  ];

  // 站点坐标即固定样例的画布坐标（逻辑像素）
  var stations = {
    A0: { name: '西站', x: 120, y: 100 },
    A1: { name: '北岭', x: 300, y: 100 },
    A2: { name: '中心站', x: 480, y: 100 },
    A3: { name: '北苑', x: 660, y: 100 },
    A4: { name: '东站', x: 840, y: 100 },
    B0: { name: '南站', x: 480, y: 560 },
    B1: { name: '南海', x: 480, y: 420 },
    B2: { name: '南湖站', x: 480, y: 300 },
    B3: { name: '西城', x: 480, y: 200 },
    C0: { name: '机场', x: 120, y: 300 },
    C1: { name: '西园', x: 300, y: 300 },
    C2: { name: '东门站', x: 660, y: 300 }
  };

  // 每个站点停靠的线路
  var stationLines = {};
  lines.forEach(function (line) {
    line.stations.forEach(function (sid) {
      (stationLines[sid] = stationLines[sid] || []).push(line.id);
    });
  });

  function lineById(id) {
    return lines.find(function (l) { return l.id === id; });
  }

  /**
   * 构建图。closedLines 中的线路整体停运：
   * 只经过停运线路的边与状态全部移除，换乘站仍可由其他线路到达。
   * 节点状态 = 站点 + 所在线路（sid@lineId），同一站点跨线走换乘边。
   */
  function buildGraph(closedLines) {
    var closed = {};
    (closedLines || []).forEach(function (id) { closed[id] = true; });
    var adj = {};

    function addEdge(from, to, cost, kind) {
      (adj[from] = adj[from] || []).push({ to: to, cost: cost, kind: kind });
    }

    lines.forEach(function (line) {
      if (closed[line.id]) return;
      var seq = line.stations;
      for (var i = 0; i < seq.length - 1; i++) {
        var u = seq[i] + '@' + line.id;
        var v = seq[i + 1] + '@' + line.id;
        addEdge(u, v, line.minutes, 'ride');
        addEdge(v, u, line.minutes, 'ride');
      }
    });

    Object.keys(stationLines).forEach(function (sid) {
      var open = stationLines[sid].filter(function (id) { return !closed[id]; });
      open.forEach(function (id) {
        var state = sid + '@' + id;
        open.forEach(function (other) {
          if (other !== id) {
            addEdge(state, sid + '@' + other, TRANSFER_PENALTY, 'transfer');
          }
        });
      });
    });

    return { adj: adj, closed: closed };
  }

  // 简易二叉堆，代价由 comparator 决定（时间 Dijkstra / 换乘 Dijkstra 复用）
  function Heap(compare) {
    this.data = [];
    this.cmp = compare;
  }
  Heap.prototype.push = function (node) {
    var d = this.data, i = d.push(node) - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (this.cmp(d[i], d[p]) >= 0) break;
      var t = d[i]; d[i] = d[p]; d[p] = t;
      i = p;
    }
  };
  Heap.prototype.pop = function () {
    var d = this.data, top = d[0], last = d.pop();
    if (d.length) {
      d[0] = last;
      var i = 0;
      for (;;) {
        var l = i * 2 + 1, r = l + 1, s = i;
        if (l < d.length && this.cmp(d[l], d[s]) < 0) s = l;
        if (r < d.length && this.cmp(d[r], d[s]) < 0) s = r;
        if (s === i) break;
        var t = d[i]; d[i] = d[s]; d[s] = t;
        i = s;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.data.length; };

  // mode: 'time' 最短时间；'transfers' 最少换乘（换乘数优先，时间做平局判定）
  function dijkstra(graph, startStates, goalSid, mode) {
    var adj = graph.adj;
    var dist = {}, prev = {}, done = {};
    var heap = new Heap(mode === 'time'
      ? function (a, b) { return a.cost - b.cost; }
      : function (a, b) {
          return a.cost.m - b.cost.m || a.cost.t - b.cost.t;
        });

    startStates.forEach(function (s) {
      var zero = mode === 'time' ? 0 : { t: 0, m: 0 };
      dist[s] = zero;
      heap.push({ state: s, cost: zero });
    });

    while (heap.size()) {
      var cur = heap.pop();
      if (done[cur.state]) continue;
      done[cur.state] = true;
      var sid = cur.state.split('@')[0];
      // 同一站点在不同线路上是多个终点状态：终点也不提前终止，
      // 继续松弛其余状态，保证换乘优先模式能找到全局最优的终点状态。
      if (sid === goalSid && mode === 'time') {
        return reconstruct(prev, cur.state);
      }

      (adj[cur.state] || []).forEach(function (edge) {
        if (done[edge.to]) return;
        var next;
        if (mode === 'time') {
          next = cur.cost + edge.cost;
          if (dist[edge.to] === undefined || next < dist[edge.to]) {
            dist[edge.to] = next;
            prev[edge.to] = { from: cur.state, edge: edge };
            heap.push({ state: edge.to, cost: next });
          }
        } else {
          var addT = edge.cost;
          var addM = edge.kind === 'transfer' ? 1 : 0;
          next = { t: cur.cost.t + addT, m: cur.cost.m + addM };
          var old = dist[edge.to];
          if (!old || next.m < old.m || (next.m === old.m && next.t < old.t)) {
            dist[edge.to] = next;
            prev[edge.to] = { from: cur.state, edge: edge };
            heap.push({ state: edge.to, cost: next });
          }
        }
      });
    }
    var best = Object.keys(dist)
      .filter(function (state) { return state.split('@')[0] === goalSid; })
      .sort(mode === 'time'
        ? function (a, b) { return dist[a] - dist[b]; }
        : function (a, b) {
            return dist[a].m - dist[b].m || dist[a].t - dist[b].t;
          })[0];
    return best ? reconstruct(prev, best) : null;
  }

  function reconstruct(prev, goalState) {
    var states = [goalState], cur = goalState;
    while (prev[cur]) {
      cur = prev[cur].from;
      states.push(cur);
    }
    return states.reverse();
  }

  // 把状态序列整理成用户可读的路径：总时间、换乘次数、分段、经停站点
  function describe(states, graph) {
    if (!states || !states.length) return null;
    var segments = [], totalMinutes = 0, transfers = 0;
    var curLine = states[0].split('@')[1];
    var segStart = states[0].split('@')[0];
    var stopList = [segStart];

    for (var i = 1; i < states.length; i++) {
      var prevState = states[i - 1], state = states[i];
      var edge = (graph.adj[prevState] || []).find(function (e) {
        return e.to === state;
      });
      var sid = state.split('@')[0], line = state.split('@')[1];
      if (edge.kind === 'transfer') {
        segments.push({ line: curLine, from: segStart, to: stopList[stopList.length - 1] });
        transfers++;
        totalMinutes += edge.cost;
        curLine = line;
        segStart = sid;
      } else {
        totalMinutes += edge.cost;
        if (stopList.indexOf(sid) < 0) stopList.push(sid);
      }
    }
    segments.push({ line: curLine, from: segStart, to: stopList[stopList.length - 1] });
    return {
      states: states,
      stops: stopList,
      segments: segments,
      totalMinutes: totalMinutes,
      transfers: transfers
    };
  }

  function openStates(sid, graph) {
    return stationLines[sid]
      .filter(function (id) { return !graph.closed[id]; })
      .map(function (id) { return sid + '@' + id; });
  }

  /**
   * 主入口：返回两种方案与不可达信息。
   * closedLines: 停运线路 id 数组。
   */
  function findRoutes(startSid, endSid, closedLines) {
    var graph = buildGraph(closedLines);
    var startStates = openStates(startSid, graph);
    var result = {
      start: startSid, end: endSid,
      closedLines: closedLines || [],
      reachable: false,
      shortestTime: null,
      fewestTransfers: null,
      disconnectedStations: isolatedStations(graph)
    };
    if (!startStates.length || !openStates(endSid, graph).length) return result;

    var timeStates = dijkstra(graph, startStates, endSid, 'time');
    var transferStates = dijkstra(graph, startStates, endSid, 'transfers');
    if (!timeStates || !transferStates) return result;

    result.reachable = true;
    result.shortestTime = describe(timeStates, graph);
    result.fewestTransfers = describe(transferStates, graph);
    return result;
  }

  // 停运后没有任何开放线路经过的站点，即网络中被断开的节点
  function isolatedStations(graph) {
    return Object.keys(stations)
      .filter(function (sid) { return openStates(sid, graph).length === 0; })
      .sort();
  }

  return {
    TRANSFER_PENALTY: TRANSFER_PENALTY,
    lines: lines,
    stations: stations,
    stationLines: stationLines,
    lineById: lineById,
    buildGraph: buildGraph,
    findRoutes: findRoutes,
    isolatedStations: isolatedStations
  };
});
