export const TOLERANCE_MM = 0.35;
export const SAFE_PRESSURE = { min: 2.05, max: 2.85 };
export const CHIP_PRESSURE = 2.95;
export const SPEED_LIMIT = 320;
export const BASE_STRESS = 62;
export const SHEET_MM = { width: 620, height: 410 };

export const CURVES = {
  A: {
    id: "A",
    label: "A 线",
    control: [
      [0.345, 0.015],
      [0.18, 0.28],
      [0.44, 0.69],
      [0.305, 0.985],
    ],
  },
  B: {
    id: "B",
    label: "B 线",
    control: [
      [0.665, 0.015],
      [0.82, 0.3],
      [0.55, 0.69],
      [0.705, 0.985],
    ],
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function cubicPoint(control, t) {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  return [
    u2 * u * control[0][0] +
      3 * u2 * t * control[1][0] +
      3 * u * t2 * control[2][0] +
      t2 * t * control[3][0],
    u2 * u * control[0][1] +
      3 * u2 * t * control[1][1] +
      3 * u * t2 * control[2][1] +
      t2 * t * control[3][1],
  ];
}

export function sampleCurve(curve, steps = 160) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return { t, xy: cubicPoint(curve.control, t) };
  });
}

export function curveLengthMm(curve, steps = 240) {
  let length = 0;
  let previous = cubicPoint(curve.control, 0);
  for (let index = 1; index <= steps; index += 1) {
    const point = cubicPoint(curve.control, index / steps);
    const dx = (point[0] - previous[0]) * SHEET_MM.width;
    const dy = (point[1] - previous[1]) * SHEET_MM.height;
    length += Math.hypot(dx, dy);
    previous = point;
  }
  return length;
}

export function createCut(curveId) {
  return {
    id: curveId,
    label: `${curveId} 线`,
    lengthMm: curveLengthMm(CURVES[curveId]),
    progress: 0,
    done: false,
    elapsed: 0,
    quality: {
      deviation: 0,
      maxDeviation: 0,
      chipDamage: 0,
      peakSpeed: 0,
      stress: BASE_STRESS,
      samples: 0,
    },
  };
}

export function recordCutSample(cut, sample) {
  const dt = clamp(Number(sample.dt) || 0, 0.006, 0.08);
  const speed = clamp(Number(sample.speed) || 0, 0, 2400);
  const pressure = clamp(Number(sample.pressure) || 0, 0, 6);
  const trackError = clamp(Number(sample.trackError) || 0, 0, 40);
  const overSpeed = Math.max(0, speed - SPEED_LIMIT);
  const overPressure = Math.max(0, pressure - SAFE_PRESSURE.max);
  const trackingDamage = Math.max(0, trackError - 7) * 0.0015;

  const toolWander = 0.06;
  const deviationRate =
    toolWander + overSpeed * 0.00215 + overPressure * 0.28 + trackingDamage;
  const chipRate = overPressure * 0.5 + overSpeed * 0.0007;
  const deviationGain = deviationRate * dt;
  const chipGain = chipRate * dt;

  cut.quality.deviation += deviationGain;
  cut.quality.maxDeviation = Math.max(cut.quality.maxDeviation, cut.quality.deviation);
  cut.quality.chipDamage = clamp(cut.quality.chipDamage + chipGain, 0, 4);
  cut.quality.peakSpeed = Math.max(cut.quality.peakSpeed, speed);
  cut.quality.samples += 1;
  cut.quality.stress = clamp(
    BASE_STRESS + cut.quality.deviation * 18 + cut.quality.chipDamage * 20,
    BASE_STRESS,
    99,
  );
  cut.elapsed += dt;

  return {
    speed,
    pressure,
    overSpeed,
    overPressure,
    deviationGain,
    chipGain,
    isCritical: overSpeed > 85 || pressure >= CHIP_PRESSURE,
  };
}

export function finishCut(cut) {
  cut.progress = 1;
  cut.done = true;
  return cut;
}

export function classifyPressure(pressure) {
  if (pressure < SAFE_PRESSURE.min - 0.2) return "light";
  if (pressure > CHIP_PRESSURE) return "danger";
  if (pressure > SAFE_PRESSURE.max) return "warning";
  return "safe";
}

export function classifySpeed(speed) {
  if (speed > SPEED_LIMIT * 1.35) return "danger";
  if (speed > SPEED_LIMIT) return "warning";
  return "safe";
}

const roundMetric = (value) => Math.round(value * 100) / 100;

export function assessParts(cuts, stress = BASE_STRESS) {
  const qualityA = cuts.A.quality;
  const qualityB = cuts.B.quality;
  const stressPenalty = Math.max(0, stress - 68) * 0.004;

  const partOne = qualityA.deviation + qualityA.chipDamage * 1.55 + stressPenalty;
  const partTwo =
    Math.max(qualityA.deviation, qualityB.deviation) * 0.92 +
    ((qualityA.chipDamage + qualityB.chipDamage) / 2) * 1.8 +
    stressPenalty;
  const partThree = qualityB.deviation + qualityB.chipDamage * 1.55 + stressPenalty;

  return [partOne, partTwo, partThree].map((deviation, index) => ({
    id: index + 1,
    deviation: roundMetric(deviation),
    passed: deviation <= TOLERANCE_MM,
    edgeGrade:
      deviation <= 0.18 ? "A" : deviation <= TOLERANCE_MM ? "B" : deviation <= 0.8 ? "C" : "D",
  }));
}

export function evaluateAssembly(parts, cuts, stress = BASE_STRESS) {
  const maxDeviation = Math.max(...parts.map((part) => part.deviation));
  const passedCount = parts.filter((part) => part.passed).length;
  const chips =
    (cuts.A?.quality.chipDamage || 0) + (cuts.B?.quality.chipDamage || 0);
  const peakSpeed = Math.max(
    cuts.A?.quality.peakSpeed || 0,
    cuts.B?.quality.peakSpeed || 0,
  );

  return {
    success: passedCount === 3,
    passedCount,
    maxDeviation: roundMetric(maxDeviation),
    stress: roundMetric(stress),
    edgeGrade: chips > 0.45 ? "C" : chips > 0.12 ? "B" : "A",
    peakSpeed: Math.round(peakSpeed),
    reason:
      peakSpeed > SPEED_LIMIT
        ? "走刀速度超过 320 mm/s，断裂线发生偏移"
        : chips > 0.12
          ? "刀压过高，切口边缘出现崩边"
          : passedCount < 3
            ? "裂片轮廓超出 ±0.35 mm 公差带"
            : "三片均落入公差带",
  };
}

export function simulateDeterministicSample(mode) {
  const cuts = { A: createCut("A"), B: createCut("B") };
  const lengths = { A: cuts.A.lengthMm, B: cuts.B.lengthMm };
  const durations =
    mode === "overspeed"
      ? { A: lengths.A / 215, B: 0.66 }
      : { A: lengths.A / 205, B: lengths.B / 205 };
  const step = 0.04;

  for (const id of ["A", "B"]) {
    const duration = durations[id];
    const speed = lengths[id] / duration;
    for (let time = 0; time < duration; time += step) {
      const dt = Math.min(step, duration - time);
      recordCutSample(cuts[id], {
        speed,
        pressure: 2.52,
        dt,
        trackError: mode === "overspeed" && id === "B" ? 4.2 : 1.2,
      });
    }
    finishCut(cuts[id]);
  }

  const parts = assessParts(cuts, BASE_STRESS);
  return {
    cuts,
    parts,
    result: evaluateAssembly(parts, cuts, BASE_STRESS),
    durations,
    speeds: {
      A: Math.round(lengths.A / durations.A),
      B: Math.round(lengths.B / durations.B),
    },
  };
}
