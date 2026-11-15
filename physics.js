(function attachTrainPhysics(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TrainPhysics = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createTrainPhysics() {
  "use strict";

  const SPEED_OF_SOUND = 343;
  const SOURCE_FREQUENCY = 392;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function centsBetween(frequency, reference = SOURCE_FREQUENCY) {
    return 1200 * Math.log2(frequency / reference);
  }

  function getPassGeometry(params) {
    const speed = Number(params.speed);
    const duration = Number(params.duration);
    const listenerX = Number(params.listenerX);
    const listenerOffset = Number(params.listenerOffset);
    const pathLength = speed * duration;
    const startX = -pathLength / 2;
    const endX = pathLength / 2;
    const passProgress = clamp((listenerX - startX) / pathLength, 0, 1);

    return {
      speed,
      duration,
      listenerX,
      listenerOffset,
      startX,
      endX,
      pathLength,
      passProgress,
    };
  }

  function getAcousticState(sourceX, params) {
    const listenerX = Number(params.listenerX);
    const listenerOffset = Number(params.listenerOffset);
    const speed = Number(params.speed);
    const deltaX = sourceX - listenerX;
    const distance = Math.hypot(deltaX, listenerOffset);
    const unitX = deltaX / distance;

    // Positive radial velocity means the source is getting closer to the listener.
    const radialVelocity = -speed * unitX;
    const safeRadialVelocity = clamp(radialVelocity, -SPEED_OF_SOUND * 0.94, SPEED_OF_SOUND * 0.94);
    const dopplerFactor = SPEED_OF_SOUND / (SPEED_OF_SOUND - safeRadialVelocity);
    const observedFrequency = SOURCE_FREQUENCY * dopplerFactor;

    const gain = clamp(
      0.035 + 0.66 * Math.pow(8 / (distance + 8), 0.72),
      0.025,
      0.7,
    );
    const filterCutoff = clamp(
      700 + 5000 * Math.pow(18 / (distance + 18), 1.35),
      700,
      5700,
    );
    const pan = clamp(
      (deltaX / Math.hypot(deltaX, listenerOffset * 1.3 + 1.5)) * 0.92,
      -1,
      1,
    );

    return {
      sourceX,
      deltaX,
      distance,
      radialVelocity,
      dopplerFactor,
      observedFrequency,
      cents: centsBetween(observedFrequency),
      gain,
      gainDb: 20 * Math.log10(gain),
      filterCutoff,
      pan,
    };
  }

  function getStateAtProgress(progress, params) {
    const geometry = getPassGeometry(params);
    const safeProgress = clamp(Number(progress), 0, 1);
    const sourceX = lerp(geometry.startX, geometry.endX, safeProgress);
    return {
      ...geometry,
      progress: safeProgress,
      elapsed: safeProgress * geometry.duration,
      ...getAcousticState(sourceX, params),
    };
  }

  function getStateAtTime(elapsed, params) {
    const duration = Number(params.duration);
    return getStateAtProgress(duration > 0 ? elapsed / duration : 0, params);
  }

  function samplePass(params, count = 241) {
    const total = Math.max(2, Math.floor(count));
    const samples = [];
    for (let index = 0; index < total; index += 1) {
      const progress = index / (total - 1);
      samples.push(getStateAtProgress(progress, params));
    }
    return samples;
  }

  function analyzePass(params, count = 361) {
    const samples = samplePass(params, count);
    let maxFrequency = -Infinity;
    let minFrequency = Infinity;
    let closestDistance = Infinity;
    let maxGain = -Infinity;

    for (const sample of samples) {
      maxFrequency = Math.max(maxFrequency, sample.observedFrequency);
      minFrequency = Math.min(minFrequency, sample.observedFrequency);
      closestDistance = Math.min(closestDistance, sample.distance);
      maxGain = Math.max(maxGain, sample.gain);
    }

    return {
      maxFrequency,
      minFrequency,
      maxCents: centsBetween(maxFrequency),
      minCents: centsBetween(minFrequency),
      closestDistance,
      maxGain,
      samples,
    };
  }

  return {
    SPEED_OF_SOUND,
    SOURCE_FREQUENCY,
    clamp,
    lerp,
    centsBetween,
    getPassGeometry,
    getAcousticState,
    getStateAtProgress,
    getStateAtTime,
    samplePass,
    analyzePass,
  };
});
