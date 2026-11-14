// 核心逻辑：去重、筛选、间隔计算、统计。浏览器与 Node 共用。
(function (global) {
  "use strict";

  function timeToMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  function minutesToTime(min) {
    const h = String(Math.floor(min / 60)).padStart(2, "0");
    const m = String(min % 60).padStart(2, "0");
    return h + ":" + m;
  }

  function recordKey(r) {
    return [r.route, r.stop, r.time, r.vehicle].join("|");
  }

  // 去重：同一线路+站点+时间+车辆 视为重复记录，保留首条
  function dedupRecords(records) {
    const seen = new Set();
    const unique = [];
    const duplicates = [];
    for (const r of records) {
      const k = recordKey(r);
      if (seen.has(k)) {
        duplicates.push(r);
      } else {
        seen.add(k);
        unique.push(r);
      }
    }
    return { unique, duplicates };
  }

  // 筛选：按线路与时间窗口（分钟数，含端点）
  function filterRecords(records, route, winStart, winEnd) {
    return records.filter((r) => {
      if (route && r.route !== route) return false;
      const t = timeToMinutes(r.time);
      if (winStart != null && t < winStart) return false;
      if (winEnd != null && t > winEnd) return false;
      return true;
    });
  }

  // 计算每个站点相邻到站之间的等待间隔
  function buildIntervals(records) {
    const byStop = new Map();
    for (const r of records) {
      const key = r.stopIndex + "|" + r.stop;
      if (!byStop.has(key)) byStop.set(key, []);
      byStop.get(key).push(r);
    }
    const intervals = [];
    for (const [key, list] of byStop) {
      list.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      const [stopIndex, stop] = key.split("|");
      for (let i = 1; i < list.length; i++) {
        const start = timeToMinutes(list[i - 1].time);
        const end = timeToMinutes(list[i].time);
        intervals.push({
          stop,
          stopIndex: Number(stopIndex),
          startMin: start,
          endMin: end,
          wait: end - start,
          from: list[i - 1],
          to: list[i],
        });
      }
    }
    return intervals;
  }

  function computeStats(records, intervals, dupCount) {
    const waits = intervals.map((i) => i.wait);
    const sum = waits.reduce((a, b) => a + b, 0);
    return {
      recordCount: records.length,
      dupRemoved: dupCount,
      intervalCount: intervals.length,
      avgWait: waits.length ? sum / waits.length : 0,
      maxWait: waits.length ? Math.max(...waits) : 0,
      minWait: waits.length ? Math.min(...waits) : 0,
    };
  }

  const api = {
    timeToMinutes,
    minutesToTime,
    recordKey,
    dedupRecords,
    filterRecords,
    buildIntervals,
    computeStats,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.BusCore = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
