export const ANOMALY_THRESHOLD = 2.7;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const WEEK_HOURS = 7 * 24;
export const RANGE_MIN_HOURS = 12;

const UTC8_OFFSET = 8 * HOUR;
const START_UTC = Date.UTC(2026, 10, 7, 16, 0, 0);

export const stations = [
  { code: "QHD", name: "青岛", latitude: "36.06°N", phase: 0.18, mean: 1.42, amp: 0.91, surge: 0.18 },
  { code: "WSG", name: "上海吴淞", latitude: "31.39°N", phase: 0.74, mean: 1.48, amp: 0.94, surge: 0.34 },
  { code: "ZOS", name: "舟山", latitude: "29.98°N", phase: 1.06, mean: 1.36, amp: 1.02, surge: 0.43 },
  { code: "XMN", name: "厦门", latitude: "24.48°N", phase: 1.54, mean: 1.39, amp: 1.03, surge: 0.86 },
  { code: "SHK", name: "深圳蛇口", latitude: "22.48°N", phase: 1.81, mean: 1.33, amp: 0.96, surge: 0.72 },
  { code: "BHY", name: "北海", latitude: "21.48°N", phase: 2.12, mean: 1.27, amp: 0.88, surge: 0.29 },
  { code: "DLN", name: "大连", latitude: "38.92°N", phase: 2.48, mean: 1.45, amp: 0.84, surge: 0.12 },
];

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const clock = (hour, period) => Math.sin((2 * Math.PI * hour) / period);

function tidalHeight(hour, station) {
  const phase = station.phase * 12.42;
  const main = station.amp * clock(hour + phase, 12.42);
  const solar = 0.15 * clock(hour + station.phase * 3, 24);
  const shallow = 0.045 * clock(hour + station.phase * 2, 6.21);
  const localNoise = 0.025 * Math.sin(hour * 1.73 + station.phase * 5.1);
  const surge = station.surge * Math.exp(-((hour - 88) ** 2) / (2 * 10 ** 2));
  return Math.max(0.3, round(station.mean + main + solar + shallow + localNoise + surge));
}

export const timestamps = Array.from({ length: WEEK_HOURS }, (_, index) => START_UTC + index * HOUR);

export const tideData = timestamps.map((_, hour) =>
  stations.map((station) => tidalHeight(hour, station)),
);

export const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const fullFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(index, withYear = false) {
  const date = new Date(timestamps[index]);
  return withYear
    ? `${fullFormatter.format(date).replaceAll("/", "-")} UTC+8`
    : timeFormatter.format(date).replaceAll("/", "/");
}

export function formatDay(index) {
  return dayFormatter.format(new Date(timestamps[index])).replaceAll("/", "/");
}

export function formatHour(value) {
  return `${value.toFixed(2)} m`;
}

export function durationLabel(startIndex, endIndex) {
  const hours = endIndex - startIndex + 1;
  return hours >= 168 ? "168 H" : `${hours} H`;
}

export function isAnomaly(height) {
  return height >= ANOMALY_THRESHOLD;
}

export function anomalyCount(startIndex, endIndex) {
  let count = 0;
  for (let hour = startIndex; hour <= endIndex; hour += 1) {
    for (const height of tideData[hour]) {
      if (isAnomaly(height)) count += 1;
    }
  }
  return count;
}

export function getRangeStats(startIndex, endIndex) {
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  let samples = 0;
  let anomalies = 0;
  let peakStation = 0;
  let peakHour = startIndex;

  for (let hour = startIndex; hour <= endIndex; hour += 1) {
    tideData[hour].forEach((height, stationIndex) => {
      max = Math.max(max, height);
      min = Math.min(min, height);
      sum += height;
      samples += 1;
      if (height >= ANOMALY_THRESHOLD) anomalies += 1;
      if (height === max) {
        peakStation = stationIndex;
        peakHour = hour;
      }
    });
  }

  return { max, min, average: sum / samples, anomalies, peakStation, peakHour };
}

export function nearestStationIndex(clientX, plotLeft, plotWidth) {
  const clamped = Math.min(plotWidth - 0.001, Math.max(0, clientX - plotLeft));
  return Math.floor((clamped / plotWidth) * stations.length);
}

export function timeTickIndexes(startIndex, endIndex) {
  const ticks = [startIndex];
  const firstMidnight = Math.ceil(startIndex / 24) * 24;
  for (let index = firstMidnight; index <= endIndex; index += 24) {
    if (index !== startIndex) ticks.push(index);
  }
  if (
    ticks[ticks.length - 1] !== endIndex &&
    Math.floor(ticks[ticks.length - 1] / 24) !== Math.floor(endIndex / 24)
  ) {
    ticks.push(endIndex);
  }
  return ticks;
}
