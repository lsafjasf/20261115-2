const WIND_KEYS = [
  [0, 6.8],
  [5, 7.2],
  [9, 7.8],
  [12, 9.2],
  [15, 12.4],
  [18, 17.4],
  [20, 23.2],
  [22, 19.8],
  [24, 14.2],
  [28, 9.8],
  [32, 7.6],
  [36, 6.9],
  [42, 6.8],
];

export const WIND_LOOP_SECONDS = 42;
export const STORM_THRESHOLD = 19;
export const STORM_GRACE_SECONDS = 1.4;

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

export function windAt(seconds) {
  const time = ((seconds % WIND_LOOP_SECONDS) + WIND_LOOP_SECONDS) % WIND_LOOP_SECONDS;
  let index = 0;

  while (index < WIND_KEYS.length - 2 && time > WIND_KEYS[index + 1][0]) {
    index += 1;
  }

  const [startTime, startWind] = WIND_KEYS[index];
  const [endTime, endWind] = WIND_KEYS[index + 1];
  const mix = smoothstep((time - startTime) / (endTime - startTime));
  return startWind + (endWind - startWind) * mix;
}

export function windSamples(seconds, length = 30, step = 0.25) {
  const samples = [];
  for (let offset = 0; offset <= length; offset += step) {
    samples.push({ offset, speed: windAt(seconds + offset) });
  }
  return samples;
}

export function windowInfo(seconds, limit) {
  const isOpen = windAt(seconds) <= limit;
  let transitionIn = 0;

  for (let offset = 0.1; offset <= WIND_LOOP_SECONDS; offset += 0.1) {
    if ((windAt(seconds + offset) <= limit) !== isOpen) {
      transitionIn = offset;
      break;
    }
  }

  let nextOpenIn = null;
  if (!isOpen) {
    for (let offset = 0.1; offset <= WIND_LOOP_SECONDS; offset += 0.1) {
      if (windAt(seconds + offset) <= limit) {
        nextOpenIn = offset;
        break;
      }
    }
  }

  return {
    open: isOpen,
    transitionIn,
    nextOpenIn,
    limit,
    speed: windAt(seconds),
  };
}

export function swayFor(wind, time, motorVelocity = 0) {
  const gust = Math.max(0, wind - 4);
  const primary = gust * 0.36 * Math.sin(time * 0.92 + 0.45);
  const secondary = gust * 0.11 * Math.sin(time * 2.15 + 1.7);
  const motorKick = motorVelocity * 0.55 * Math.sin(time * 6.4);
  return primary + secondary + motorKick;
}
