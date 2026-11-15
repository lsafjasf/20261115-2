'use strict';

const BANDS = [
  {
    id: 'A',
    meters: '49 m',
    lo: 5900,
    hi: 6300,
    center: 6100,
    filterLabel: 'BAND A / 49 m',
    audioCenter: 560
  },
  {
    id: 'B',
    meters: '41 m',
    lo: 7000,
    hi: 7400,
    center: 7200,
    filterLabel: 'BAND B / 41 m',
    audioCenter: 710
  },
  {
    id: 'C',
    meters: '31 m',
    lo: 9400,
    hi: 9900,
    center: 9650,
    filterLabel: 'BAND C / 31 m',
    audioCenter: 880
  }
];

const TARGET_WINDOW_MS = 9000;
const LOCK_TOLERANCE_KHZ = 8;
const BEARING_TOLERANCE_DEG = 12;
const MIN_GAIN = 28;
const MAX_GAIN = 74;
const MIN_SNR = 7;
const TARGET_SAMPLE_COUNT = 3;
const TRACE_BINS = 144;
const HISTORY_MS = 30000;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const dom = {
  startScreen: $('#startScreen'),
  startBtn: $('#startBtn'),
  resultScreen: $('#resultScreen'),
  resultCard: $('.result-card'),
  resultEyebrow: $('#resultEyebrow'),
  resultTitle: $('#resultTitle'),
  resultCopy: $('#resultCopy'),
  resultRecords: $('#resultRecords'),
  resultLocks: $('#resultLocks'),
  resultTime: $('#resultTime'),
  resultErrors: $('#resultErrors'),
  restartBtn: $('#restartBtn'),
  audioState: $('#audioState'),
  audioLabel: $('#audioLabel'),
  muteBtn: $('#muteBtn'),
  sessionClock: $('#sessionClock'),
  bandButtons: $$('.band-button'),
  filterLamp: $('#filterLamp'),
  filterText: $('#filterText'),
  freqValue: $('#freqValue'),
  tuneRange: $('#tuneRange'),
  bandLow: $('#bandLow'),
  bandHigh: $('#bandHigh'),
  fineUp: $('#fineUp'),
  fineDown: $('#fineDown'),
  bearingRange: $('#bearingRange'),
  bearingValue: $('#bearingValue'),
  bearingHint: $('#bearingHint'),
  gainRange: $('#gainRange'),
  gainValue: $('#gainValue'),
  gainState: $('#gainState'),
  spectrumCanvas: $('#spectrumCanvas'),
  spectrumAxis: $('#spectrumAxis'),
  peakFreq: $('#peakFreq'),
  directionCanvas: $('#directionCanvas'),
  radarMode: $('#radarMode'),
  radarBearing: $('#radarBearing'),
  radarCardinal: $('#radarCardinal'),
  polarFill: $('#polarFill'),
  polarValue: $('#polarValue'),
  historyCanvas: $('#historyCanvas'),
  historyCount: $('#historyCount'),
  windowTime: $('#windowTime'),
  windowFill: $('#windowFill'),
  targetState: $('#targetState'),
  hopCount: $('#hopCount'),
  progressPips: $$('#progressPips > div'),
  signalBars: $$('#signalBars i'),
  qualityLabel: $('#qualityLabel'),
  snrValue: $('#snrValue'),
  levelValue: $('#levelValue'),
  lockBtn: $('#lockBtn'),
  lockHint: $('#lockHint'),
  logList: $('#logList'),
  logEmpty: $('#logEmpty'),
  clearLog: $('#clearLog'),
  footerState: $('#footerState'),
  footerDetail: $('#footerDetail'),
  toast: $('#toast'),
  srStatus: $('#srStatus')
};

const state = {
  running: false,
  ended: false,
  audioStarted: false,
  muted: false,
  band: 0,
  tuneKHz: 6100,
  bearing: 120,
  gain: 52,
  target: null,
  targetStartedAt: 0,
  targetEndsAt: 0,
  pendingTargetAt: 0,
  finishAt: 0,
  hop: 0,
  targetsSeen: 0,
  records: [],
  falseLocks: 0,
  startedAt: 0,
  endedAt: 0,
  failReason: '',
  lastBand: -1,
  metrics: {
    quality: 0,
    snrDb: 0,
    peakDbfs: -100,
    signal: 0,
    noise: 0,
    polar: 0,
    valid: false
  },
  history: [],
  events: [],
  trace: new Float32Array(TRACE_BINS),
  lastSampleAt: 0,
  lastTraceAt: 0,
  lastUiAt: 0,
  lastLockAt: 0,
  toastTimer: 0,
  runToken: 0
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function angleDistance(a, b) {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

function formatMHz(kHz) {
  return (kHz / 1000).toFixed(3);
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function cardinal(degrees) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round(degrees / 22.5) % 16];
}

function randomTarget() {
  const possibleBands = [0, 1, 2].filter((band) => band !== state.lastBand);
  const band = possibleBands[Math.floor(Math.random() * possibleBands.length)];
  const bandData = BANDS[band];
  const steps = Math.floor((bandData.hi - bandData.lo - 80) / 5);
  const frequency = bandData.lo + 40 + Math.floor(Math.random() * steps) * 5;
  const bearing = Math.floor(Math.random() * 72) * 5;
  state.lastBand = band;
  return {
    band,
    frequency,
    bearing,
    serial: state.targetsSeen + 1,
    pitch: bandData.audioCenter + Math.round((frequency - bandData.lo) / 12)
  };
}

function measureSignal(now = performance.now()) {
  const target = state.target;
  const bandMatch = Boolean(target) && target.band === state.band;
  const frequencyDelta = target ? Math.abs(state.tuneKHz - target.frequency) : 999;
  const bearingDelta = target ? angleDistance(state.bearing, target.bearing) : 180;
  const tuneFactor = clamp(1 - frequencyDelta / 24, 0, 1);
  const bearingFactor = Math.pow(
    Math.max(0, Math.cos(toRadians(Math.min(bearingDelta, 90)))),
    5
  );
  const gainLinear = clamp(state.gain / 40, 0, 1.15);
  const gainPenalty = state.gain > 76
    ? clamp(1 - (state.gain - 76) / 34, 0.18, 1)
    : 1;
  const noise = 0.06 + Math.pow(state.gain / 100, 1.8) * 0.92;
  const signal = bandMatch ? tuneFactor * bearingFactor * gainLinear * gainPenalty : 0;
  const snrDb = 10 * Math.log10((signal * 1.8 + 0.012) / (0.055 + noise * 0.32));
  const quality = bandMatch
    ? clamp(100 * (signal * 1.15 - noise * 0.14), 0, 100)
    : clamp(noise * 18, 0, 20);
  const valid = Boolean(target)
    && bandMatch
    && frequencyDelta <= LOCK_TOLERANCE_KHZ
    && bearingDelta <= BEARING_TOLERANCE_DEG
    && state.gain >= MIN_GAIN
    && state.gain <= MAX_GAIN
    && snrDb >= MIN_SNR;
  const peakDbfs = 20 * Math.log10(0.0025 + signal * 0.72 + noise * 0.12);

  return {
    bandMatch,
    frequencyDelta,
    bearingDelta,
    tuneFactor,
    bearingFactor,
    noise,
    signal,
    snrDb,
    quality,
    peakDbfs,
    polar: bandMatch ? bearingFactor * tuneFactor * clamp(state.gain / 42, 0, 1) * 100 : 0,
    valid,
    targetActive: Boolean(target) && now < state.targetEndsAt
  };
}

class ReceiverAudio {
  constructor() {
    this.context = null;
    this.analyser = null;
    this.frequencyData = null;
    this.master = null;
    this.signalGain = null;
    this.noiseGain = null;
    this.oscillator = null;
    this.oscillatorHarmonic = null;
    this.lfo = null;
    this.noiseFilter = null;
    this.ready = false;
    this.lastPeak = -100;
    this.lastAverage = 0;
  }

  async start() {
    if (this.ready) {
      await this.context.resume();
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('此浏览器不支持 Web Audio');
    }

    const context = new AudioContextClass();
    await context.resume();
    this.context = context;

    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.8);

    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -20;

    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 820;
    noiseFilter.Q.value = 0.38;

    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.14;

    const noise = context.createBufferSource();
    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) {
      noiseData[i] = Math.random() * 2 - 1;
    }
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const signalGain = context.createGain();
    signalGain.gain.value = 0.0001;

    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 610;

    const harmonic = context.createOscillator();
    harmonic.type = 'triangle';
    harmonic.frequency.value = 1216;
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = 0.14;

    const lfo = context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 2.1;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);
    lfoGain.connect(harmonic.frequency);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    oscillator.connect(signalGain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(signalGain);
    signalGain.connect(master);
    master.connect(analyser);
    analyser.connect(context.destination);

    noise.start();
    oscillator.start();
    harmonic.start();
    lfo.start();

    this.master = master;
    this.analyser = analyser;
    this.signalGain = signalGain;
    this.noiseGain = noiseGain;
    this.noiseFilter = noiseFilter;
    this.oscillator = oscillator;
    this.oscillatorHarmonic = harmonic;
    this.lfo = lfo;
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    this.ready = true;
  }

  update(metrics, bandIndex, target, running) {
    if (!this.ready) return;
    const now = this.context.currentTime;
    const signalLevel = running && target ? metrics.signal * 0.48 : 0.0001;
    const noiseLevel = running ? 0.018 + metrics.noise * 0.28 : 0.0001;
    this.signalGain.gain.setTargetAtTime(Math.max(0.0001, signalLevel), now, 0.045);
    this.noiseGain.gain.setTargetAtTime(Math.max(0.0001, noiseLevel), now, 0.08);
    this.noiseFilter.frequency.setTargetAtTime(
      BANDS[bandIndex].audioCenter * 1.25,
      now,
      0.12
    );

    if (target) {
      this.oscillator.frequency.setTargetAtTime(target.pitch, now, 0.1);
      this.oscillatorHarmonic.frequency.setTargetAtTime(target.pitch * 1.997, now, 0.1);
    }
  }

  sample() {
    if (!this.ready) return { peak: -100, average: 0 };
    this.analyser.getByteFrequencyData(this.frequencyData);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < this.frequencyData.length; i += 1) {
      peak = Math.max(peak, this.frequencyData[i]);
      sum += this.frequencyData[i];
    }
    this.lastPeak = peak === 0 ? -100 : -100 + (peak / 255) * 80;
    this.lastAverage = sum / this.frequencyData.length / 255;
    return { peak: this.lastPeak, average: this.lastAverage };
  }

  setMuted(muted) {
    if (!this.ready) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0.0001 : 0.12, now, 0.04);
  }

  chirp(success) {
    if (!this.ready || state.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(success ? 520 : 190, now);
    oscillator.frequency.exponentialRampToValueAtTime(success ? 1040 : 92, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(success ? 0.055 : 0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.38);
  }
}

const audio = new ReceiverAudio();

function updateSpectrumAxis() {
  const band = BANDS[state.band];
  const labels = [];
  for (let i = 0; i < 5; i += 1) {
    const frequency = band.lo + (band.hi - band.lo) * (i / 4);
    labels.push(`<span>${formatMHz(Math.round(frequency / 5) * 5)}</span>`);
  }
  dom.spectrumAxis.innerHTML = labels.join('');
}

function updateBandUI() {
  const band = BANDS[state.band];
  dom.bandButtons.forEach((button, index) => {
    const active = index === state.band;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  dom.filterText.textContent = `${band.filterLabel} / WIDE`;
  dom.tuneRange.min = String(band.lo);
  dom.tuneRange.max = String(band.hi);
  dom.bandLow.textContent = formatMHz(band.lo);
  dom.bandHigh.textContent = formatMHz(band.hi);
  updateSpectrumAxis();
}

function updateFrequencyUI() {
  dom.freqValue.textContent = formatMHz(state.tuneKHz);
  dom.tuneRange.value = String(state.tuneKHz);
  if (state.metrics.quality >= 28) {
    dom.peakFreq.textContent = formatMHz(state.tuneKHz);
  }
}

function updateBearingUI() {
  const value = Math.round(state.bearing);
  dom.bearingRange.value = String(value);
  dom.bearingValue.textContent = String(value);
  dom.bearingHint.textContent = cardinal(value);
  dom.radarBearing.textContent = `${value}°`;
  dom.radarCardinal.textContent = cardinal(value);
}

function updateGainUI() {
  dom.gainRange.value = String(state.gain);
  dom.gainValue.textContent = String(state.gain);
  dom.gainState.classList.remove('is-high', 'is-low');

  if (state.gain > MAX_GAIN) {
    dom.gainState.textContent = 'OVERLOAD';
    dom.gainState.classList.add('is-high');
  } else if (state.gain < MIN_GAIN) {
    dom.gainState.textContent = 'LOW';
    dom.gainState.classList.add('is-low');
  } else if (state.gain > 65) {
    dom.gainState.textContent = 'HOT';
    dom.gainState.classList.add('is-high');
  } else {
    dom.gainState.textContent = 'NOMINAL';
  }
}

function setBand(index, userAction = true) {
  if (index < 0 || index >= BANDS.length) return;
  const band = BANDS[index];
  const outsideBand = state.tuneKHz < band.lo || state.tuneKHz > band.hi;
  state.band = index;
  if (outsideBand && userAction) {
    state.tuneKHz = band.center;
  }
  state.tuneKHz = Math.round(clamp(state.tuneKHz, band.lo, band.hi) / 5) * 5;
  updateBandUI();
  updateFrequencyUI();
}

function setTune(frequencyKHz) {
  const band = BANDS[state.band];
  state.tuneKHz = Math.round(clamp(frequencyKHz, band.lo, band.hi) / 5) * 5;
  updateFrequencyUI();
}

function setBearing(degrees) {
  state.bearing = ((Math.round(degrees) % 360) + 360) % 360;
  updateBearingUI();
}

function setGain(percent) {
  state.gain = Math.round(clamp(percent, 0, 100));
  updateGainUI();
}

function showToast(message, tone = '') {
  window.clearTimeout(state.toastTimer);
  dom.toast.textContent = message;
  dom.toast.className = `toast is-visible ${tone}`.trim();
  state.toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove('is-visible');
  }, 2900);
}

function announce(message) {
  dom.srStatus.textContent = '';
  window.setTimeout(() => {
    dom.srStatus.textContent = message;
  }, 20);
}

function renderLog() {
  if (state.records.length === 0) {
    dom.logList.innerHTML = '<li class="log-empty" id="logEmpty">暂无验证记录<br><span>VERIFIED FREQUENCIES APPEAR HERE</span></li>';
    dom.logEmpty = $('#logEmpty');
    dom.historyCount.textContent = '0 / 3 RECORDS';
    return;
  }

  dom.logList.innerHTML = state.records.map((record, index) => `
    <li>
      <span class="log-index">0${index + 1}</span>
      <span class="log-freq">${formatMHz(record.frequency)} <small>MHz</small></span>
      <span class="log-meta"><b>VALID</b>${record.meterBand} · ${String(record.bearing).padStart(3, '0')}°</span>
    </li>
  `).join('');
  dom.historyCount.textContent = `${state.records.length} / 3 RECORDS`;
}

function updateProgress() {
  dom.progressPips.forEach((pip, index) => {
    pip.classList.toggle('is-complete', index < state.records.length);
    pip.classList.toggle(
      'is-current',
      state.running && index === state.records.length && !state.target
    );
  });
}

function spawnTarget(now = performance.now(), initial = false) {
  if (!state.running) return;
  state.target = randomTarget();
  state.targetsSeen += 1;
  state.targetStartedAt = now;
  state.targetEndsAt = now + TARGET_WINDOW_MS;
  state.pendingTargetAt = 0;
  state.finishAt = 0;

  for (let i = 0; i < state.trace.length; i += 1) {
    state.trace[i] *= initial ? 0.08 : 0.28;
  }

  state.statusMessage = initial ? '接收链路开启 · 搜索目标峰值' : '新跳频窗口 · 重新捕获';
  dom.targetState.textContent = state.statusMessage;
  dom.hopCount.textContent = `HOP ${String(state.targetsSeen).padStart(3, '0')}`;
  dom.radarMode.textContent = 'SCANNING';
  announce(`收到新的短波信号窗口，第 ${state.targetsSeen} 跳。`);
}

function tickGame(now) {
  if (!state.running) return;

  if (state.finishAt && now >= state.finishAt) {
    finishGame(true, '', now);
    return;
  }

  if (state.pendingTargetAt && now >= state.pendingTargetAt) {
    spawnTarget(now);
    return;
  }

  if (state.target && now >= state.targetEndsAt) {
    state.statusMessage = '目标已转移 · 新窗口搜索中';
    dom.targetState.textContent = state.statusMessage;
    showToast('目标已跳频。窗口重置，继续扫描。');
    spawnTarget(now);
    state.hop += 1;
  }
}

function failureReason(metrics) {
  if (!state.target) return '当前没有可验证的信号窗口。';
  if (!metrics.bandMatch) return '带通频段错误：当前频段只有底噪。';
  if (metrics.frequencyDelta > LOCK_TOLERANCE_KHZ) return '接收频率偏离目标超过 8 kHz 容差。';
  if (metrics.bearingDelta > BEARING_TOLERANCE_DEG) return '天线方位未对准信号源。';
  if (state.gain < MIN_GAIN) return '前置增益过低，有效信号未被识别。';
  if (state.gain > MAX_GAIN) return '前置增益过高，噪声淹没了载波峰值。';
  if (metrics.snrDb < MIN_SNR) return '信噪比不足，峰值仍不稳定。';
  return '信号特征未通过验证。';
}

function attemptLock() {
  if (!state.running || state.ended || state.finishAt) return;
  const now = performance.now();
  if (now - state.lastLockAt < 240) return;
  if (!state.target && state.pendingTargetAt) return;
  state.lastLockAt = now;

  if (!state.target || now >= state.targetEndsAt) {
    state.falseLocks += 1;
    audio.chirp(false);
    finishGame(false, '信号窗口已经关闭，记录操作未能验证。', now);
    return;
  }

  const metrics = measureSignal(now);
  if (!metrics.valid) {
    state.falseLocks += 1;
    audio.chirp(false);
    finishGame(false, failureReason(metrics), now);
    return;
  }

  const snapshot = {
    serial: state.targetsSeen,
    band: state.target.band,
    frequency: state.target.frequency,
    tunedFrequency: state.tuneKHz,
    bearing: state.bearing,
    gain: state.gain,
    snrDb: metrics.snrDb,
    quality: metrics.quality,
    meterBand: BANDS[state.target.band].meters,
    elapsedMs: now - state.startedAt,
    capturedAt: new Date().toISOString()
  };

  state.records.push(snapshot);
  state.events.push({
    at: now,
    frequency: snapshot.frequency,
    bearing: snapshot.bearing,
    band: snapshot.band
  });
  state.target = null;
  audio.chirp(true);
  renderLog();
  updateProgress();
  dom.radarMode.textContent = 'LOCKED';

  if (state.records.length >= TARGET_SAMPLE_COUNT) {
    state.statusMessage = '三个频点验证完毕';
    dom.targetState.textContent = state.statusMessage;
    state.finishAt = now + 1150;
    showToast(`频点 ${formatMHz(snapshot.frequency)} MHz 验证通过。追踪完成。`, 'is-success');
    announce('第三次锁定成功，追踪任务完成。');
  } else {
    state.statusMessage = '频点已记录 · 等待目标转移';
    dom.targetState.textContent = state.statusMessage;
    state.pendingTargetAt = now + 1450;
    showToast(`频点 ${formatMHz(snapshot.frequency)} MHz 验证通过。`);
    announce(`第 ${state.records.length} 次锁定成功。`);
  }
}

function finishGame(success, reason, now = performance.now()) {
  if (state.ended) return;
  state.running = false;
  state.ended = true;
  state.endedAt = now;
  state.target = null;
  state.finishAt = 0;
  state.pendingTargetAt = 0;
  dom.lockBtn.disabled = true;
  dom.targetState.textContent = success ? '任务完成' : '行动终止';
  dom.windowTime.textContent = '--.-';
  dom.windowTime.classList.remove('is-low');
  dom.windowFill.style.width = '0%';
  dom.radarMode.textContent = success ? 'COMPLETE' : 'LOST';
  updateProgress();

  const elapsed = state.endedAt - state.startedAt;
  dom.resultCard.classList.toggle('failed', !success);
  dom.resultEyebrow.textContent = success ? 'TRACK COMPLETE / 03 OF 03' : 'TRACK TERMINATED';
  dom.resultTitle.innerHTML = success ? '三频点<br>全部锁定' : '信号链<br>验证失败';
  dom.resultCopy.textContent = success
    ? '接收链路稳定，三个跳频频点已写入行动记录。'
    : reason;
  dom.resultLocks.textContent = String(state.records.length);
  dom.resultTime.textContent = formatClock(elapsed);
  dom.resultErrors.textContent = String(state.falseLocks);

  if (state.records.length) {
    dom.resultRecords.innerHTML = state.records.map((record) => `
      <div class="result-record">
        <span>${record.meterBand} / ${record.bearing}°</span>
        <b>${formatMHz(record.frequency)}</b>
        <span>${record.snrDb.toFixed(1)} dB SNR</span>
      </div>
    `).join('');
  } else {
    dom.resultRecords.innerHTML = `
      <div class="result-record">
        <span>NO RECORD</span>
        <b>—</b>
        <span>接收链未确认</span>
      </div>
    `;
  }

  dom.footerState.textContent = success ? 'COMPLETE' : 'FAILED';
  dom.footerDetail.textContent = success ? '三次频点已验证' : '误锁导致行动终止';
  state.failReason = reason;
  window.setTimeout(() => {
    dom.resultScreen.hidden = false;
  }, success ? 480 : 360);

  announce(success ? '任务完成，三次频点全部正确。' : `任务失败。${reason}`);
}

function resetRun() {
  state.running = true;
  state.ended = false;
  state.target = null;
  state.band = 0;
  state.tuneKHz = 6100;
  state.bearing = 120;
  state.gain = 52;
  state.hop = 0;
  state.targetsSeen = 0;
  state.records = [];
  state.falseLocks = 0;
  state.failReason = '';
  state.lastBand = -1;
  state.startedAt = performance.now();
  state.endedAt = 0;
  state.pendingTargetAt = 0;
  state.finishAt = 0;
  state.lastLockAt = 0;
  state.history = [];
  state.events = [];
  state.trace.fill(0);
  state.metrics = {
    quality: 0,
    snrDb: 0,
    peakDbfs: -100,
    signal: 0,
    noise: 0.1,
    polar: 0,
    valid: false
  };
  dom.resultScreen.hidden = true;
  dom.footerState.textContent = 'LISTENING';
  dom.footerDetail.textContent = '追踪中';
  dom.qualityLabel.textContent = 'NO SIGNAL';
  dom.peakFreq.textContent = '—.———';
  dom.logList.innerHTML = '<li class="log-empty" id="logEmpty">暂无验证记录<br><span>VERIFIED FREQUENCIES APPEAR HERE</span></li>';
  dom.logEmpty = $('#logEmpty');
  dom.historyCount.textContent = '0 / 3 RECORDS';
  setBand(0, false);
  setTune(6100);
  setBearing(120);
  setGain(52);
  updateProgress();
  renderLog();
  spawnTarget(performance.now(), true);
}

async function startGame() {
  if (state.running) return;
  dom.startBtn.disabled = true;

  try {
    await audio.start();
    state.audioStarted = true;
    dom.audioState.classList.add('is-live');
    dom.audioLabel.textContent = 'AUDIO LIVE';
  } catch (error) {
    dom.audioState.classList.remove('is-live');
    dom.audioLabel.textContent = 'AUDIO ERROR';
    showToast(`音频启动失败：${error.message}`, 'is-error');
  }

  dom.startBtn.disabled = false;
  dom.startScreen.hidden = true;
  resetRun();
  showToast('接收机已启动。选择频段，扫描方位与频率。');
}

function restartGame() {
  if (audio.ready) {
    audio.context.resume();
  }
  dom.resultScreen.hidden = true;
  resetRun();
  showToast('新的追踪轮次已开始。');
}

dom.bandButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setBand(Number(button.dataset.band));
  });
});

dom.tuneRange.addEventListener('input', () => setTune(Number(dom.tuneRange.value)));
dom.fineUp.addEventListener('click', () => setTune(state.tuneKHz + 5));
dom.fineDown.addEventListener('click', () => setTune(state.tuneKHz - 5));
dom.bearingRange.addEventListener('input', () => setBearing(Number(dom.bearingRange.value)));
dom.gainRange.addEventListener('input', () => setGain(Number(dom.gainRange.value)));
dom.lockBtn.addEventListener('click', attemptLock);
dom.startBtn.addEventListener('click', startGame);
dom.restartBtn.addEventListener('click', restartGame);

dom.muteBtn.addEventListener('click', () => {
  state.muted = !state.muted;
  audio.setMuted(state.muted);
  dom.muteBtn.classList.toggle('is-muted', state.muted);
  dom.muteBtn.setAttribute('aria-label', state.muted ? '取消静音' : '静音');
  showToast(state.muted ? '音频已静音。' : '音频已恢复。');
});

dom.clearLog.addEventListener('click', () => {
  if (state.running) {
    showToast('行动进行中，验证记录不可清除。');
  } else if (!state.ended) {
    showToast('尚无验证记录。');
  }
});

window.addEventListener('keydown', (event) => {
  if (!state.running) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !state.ended) {
      event.preventDefault();
      startGame();
    }
    return;
  }

  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' && event.key !== ' ') return;

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    setBearing(state.bearing - (event.shiftKey ? 10 : 1));
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    setBearing(state.bearing + (event.shiftKey ? 10 : 1));
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    setTune(state.tuneKHz + (event.shiftKey ? 25 : 5));
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    setTune(state.tuneKHz - (event.shiftKey ? 25 : 5));
  } else if (event.code === 'Space') {
    event.preventDefault();
    attemptLock();
  }
});

let audioStats = { peak: -100, average: 0 };

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { ctx: context, width, height };
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}

function drawSpectrum(now) {
  const { ctx, width, height } = prepareCanvas(dom.spectrumCanvas);
  const metric = state.metrics;
  const band = BANDS[state.band];
  const pad = { left: 14, right: 14, top: 15, bottom: 25 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  const floorY = pad.top + graphHeight;

  ctx.save();
  ctx.strokeStyle = 'rgba(123, 142, 128, 0.13)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  for (let i = 0; i <= 5; i += 1) {
    const y = pad.top + graphHeight * (i / 5);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }
  for (let i = 0; i <= 10; i += 1) {
    const x = pad.left + graphWidth * (i / 10);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, floorY);
    ctx.stroke();
  }
  ctx.restore();

  const noiseFloorDb = -91 + metric.noise * 21 + audioStats.average * 13;
  const target = state.target;
  const targetVisible = target && target.band === state.band;
  const targetX = targetVisible
    ? pad.left + ((target.frequency - band.lo) / (band.hi - band.lo)) * graphWidth
    : -100;
  const tuneX = pad.left + ((state.tuneKHz - band.lo) / (band.hi - band.lo)) * graphWidth;
  const points = [];
  const step = 2;

  for (let x = 0; x <= graphWidth; x += step) {
    let db = noiseFloorDb
      + Math.sin(x * 0.075 + now * 0.0018) * 1.2
      + Math.sin(x * 0.019 - now * 0.0007) * 1.8
      + (Math.random() - 0.5) * (1.1 + metric.noise * 1.5);
    if (targetVisible) {
      const localKHz = band.lo + (x / graphWidth) * (band.hi - band.lo);
      const distance = localKHz - target.frequency;
      const sigma = 2.8 + (1 - metric.tuneFactor) * 1.6;
      const pulse = Math.exp(-(distance * distance) / (2 * sigma * sigma));
      const peakHeight = 9 + metric.signal * 52;
      db += peakHeight * pulse;
    }
    const normalized = clamp((db + 100) / 80, 0, 1);
    points.push({
      x: pad.left + x,
      y: floorY - normalized * graphHeight
    });
  }

  const fill = ctx.createLinearGradient(0, pad.top, 0, floorY);
  fill.addColorStop(0, 'rgba(120, 224, 176, 0.22)');
  fill.addColorStop(0.48, 'rgba(120, 224, 176, 0.08)');
  fill.addColorStop(1, 'rgba(120, 224, 176, 0.005)');
  ctx.beginPath();
  ctx.moveTo(points[0].x, floorY);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(points[points.length - 1].x, floorY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = '#78e0b0';
  ctx.lineWidth = 1.1;
  ctx.shadowColor = 'rgba(120, 224, 176, 0.55)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = 'rgba(255, 107, 50, 0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tuneX, pad.top);
  ctx.lineTo(tuneX, floorY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255, 107, 50, 0.92)';
  ctx.beginPath();
  ctx.moveTo(tuneX - 3, pad.top);
  ctx.lineTo(tuneX + 3, pad.top);
  ctx.lineTo(tuneX, pad.top + 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (targetVisible && metric.tuneFactor > 0.04) {
    const markerY = floorY - clamp((noiseFloorDb + 9 + metric.signal * 52 + 100) / 80, 0, 1) * graphHeight;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 155, 112, 0.95)';
    ctx.shadowColor = 'rgba(255, 107, 50, 0.8)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(targetX, markerY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const scanX = pad.left + ((now * 0.035) % graphWidth);
  const scanGradient = ctx.createLinearGradient(scanX - 22, 0, scanX, 0);
  scanGradient.addColorStop(0, 'rgba(120, 224, 176, 0)');
  scanGradient.addColorStop(1, 'rgba(120, 224, 176, 0.045)');
  ctx.fillStyle = scanGradient;
  ctx.fillRect(scanX - 22, pad.top, 22, graphHeight);

  ctx.font = '8px "SFMono-Regular", monospace';
  ctx.fillStyle = 'rgba(255, 155, 112, 0.65)';
  const tuneLabelX = clamp(tuneX + 5, pad.left + 2, width - pad.right - 36);
  ctx.fillText('TUNE', tuneLabelX, pad.top + 10);
}

function drawDirection(now) {
  const { ctx, width, height } = prepareCanvas(dom.directionCanvas);
  const size = Math.min(width, height) - 14;
  const radius = Math.max(28, size * 0.43);
  const cx = width / 2;
  const cy = height / 2;
  const metric = state.metrics;

  ctx.save();
  ctx.translate(cx, cy);

  const halo = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius * 1.1);
  halo.addColorStop(0, 'rgba(120, 224, 176, 0.035)');
  halo.addColorStop(1, 'rgba(120, 224, 176, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(109, 128, 113, 0.2)';
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * (ring / 4), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(-radius, 0);
  ctx.lineTo(radius, 0);
  ctx.moveTo(0, -radius);
  ctx.lineTo(0, radius);
  ctx.stroke();

  for (let angle = 0; angle < 360; angle += 15) {
    const angleRad = toRadians(angle - 90);
    const outer = radius;
    const inner = radius - (angle % 45 === 0 ? 7 : 3);
    ctx.strokeStyle = angle % 45 === 0 ? 'rgba(133, 149, 136, 0.44)' : 'rgba(109, 128, 113, 0.22)';
    ctx.beginPath();
    ctx.moveTo(Math.cos(angleRad) * inner, Math.sin(angleRad) * inner);
    ctx.lineTo(Math.cos(angleRad) * outer, Math.sin(angleRad) * outer);
    ctx.stroke();
  }

  ctx.font = '7px "SFMono-Regular", monospace';
  ctx.fillStyle = 'rgba(154, 166, 153, 0.68)';
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -radius - 5);
  ctx.fillText('S', 0, radius + 10);
  ctx.fillText('E', radius + 9, 2);
  ctx.fillText('W', -radius - 9, 2);

  const trace = state.trace;
  ctx.beginPath();
  for (let i = 0; i < TRACE_BINS; i += 1) {
    const angle = (i / TRACE_BINS) * Math.PI * 2 - Math.PI / 2;
    const inner = radius * 0.17;
    const strength = clamp(trace[i] / 100, 0, 1);
    const lobeRadius = inner + (radius - inner) * strength;
    const x = Math.cos(angle) * lobeRadius;
    const y = Math.sin(angle) * lobeRadius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(120, 224, 176, 0.075)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 224, 176, 0.42)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const bearingRad = toRadians(state.bearing - 90);
  const pointRadius = radius * 0.86;
  const pointX = Math.cos(bearingRad) * pointRadius;
  const pointY = Math.sin(bearingRad) * pointRadius;
  const bearingGradient = ctx.createLinearGradient(0, 0, pointX, pointY);
  bearingGradient.addColorStop(0, 'rgba(255, 107, 50, 0.25)');
  bearingGradient.addColorStop(1, 'rgba(255, 107, 50, 1)');
  ctx.strokeStyle = bearingGradient;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(Math.cos(bearingRad) * radius * 0.15, Math.sin(bearingRad) * radius * 0.15);
  ctx.lineTo(pointX, pointY);
  ctx.stroke();

  ctx.fillStyle = '#ff6b32';
  ctx.shadowColor = 'rgba(255, 107, 50, 0.9)';
  ctx.shadowBlur = metric.polar > 20 ? 13 : 7;
  ctx.beginPath();
  ctx.arc(pointX, pointY, metric.polar > 20 ? 2.6 : 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = '7px "SFMono-Regular", monospace';
  ctx.fillStyle = 'rgba(102, 116, 105, 0.75)';
  ctx.fillText('AZ / 360', 9, height - 7);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(metric.polar)}%`, width - 9, height - 7);
  ctx.restore();
}

function drawHistory(now) {
  const { ctx, width, height } = prepareCanvas(dom.historyCanvas);
  const pad = { left: 12, right: 12, top: 11, bottom: 17 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  const baseline = pad.top + graphHeight;

  ctx.strokeStyle = 'rgba(123, 142, 128, 0.13)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  for (let i = 0; i <= 3; i += 1) {
    const y = pad.top + graphHeight * (i / 3);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const start = state.running || state.ended ? state.startedAt : now - HISTORY_MS;
  const cutoff = now - HISTORY_MS;
  const samples = state.history.filter((sample) => sample.at >= cutoff && sample.at >= start);
  const xFor = (time) => pad.left + clamp((time - cutoff) / HISTORY_MS, 0, 1) * graphWidth;
  const yFor = (quality) => baseline - clamp(quality / 100, 0, 1) * graphHeight;

  if (samples.length > 1) {
    const fill = ctx.createLinearGradient(0, pad.top, 0, baseline);
    fill.addColorStop(0, 'rgba(120, 224, 176, 0.18)');
    fill.addColorStop(1, 'rgba(120, 224, 176, 0)');
    ctx.beginPath();
    ctx.moveTo(xFor(samples[0].at), baseline);
    samples.forEach((sample) => ctx.lineTo(xFor(sample.at), yFor(sample.quality)));
    ctx.lineTo(xFor(samples[samples.length - 1].at), baseline);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    samples.forEach((sample, index) => {
      const x = xFor(sample.at);
      const y = yFor(sample.quality);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#78e0b0';
    ctx.lineWidth = 1.1;
    ctx.shadowColor = 'rgba(120, 224, 176, 0.4)';
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  state.events.forEach((event, index) => {
    if (event.at < cutoff) return;
    const x = xFor(event.at);
    ctx.strokeStyle = 'rgba(255, 107, 50, 0.46)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, baseline);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff6b32';
    ctx.save();
    ctx.translate(x, pad.top + 7);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
    ctx.restore();
    ctx.font = '7px "SFMono-Regular", monospace';
    ctx.fillStyle = 'rgba(255, 155, 112, 0.9)';
    ctx.textAlign = x > width - 55 ? 'right' : 'left';
    ctx.fillText(formatMHz(event.frequency), x + (x > width - 55 ? -5 : 5), pad.top + 16);
    ctx.textAlign = 'left';
    void index;
  });

  ctx.font = '7px "SFMono-Regular", monospace';
  ctx.fillStyle = 'rgba(102, 116, 105, 0.72)';
  ctx.fillText('-30s', pad.left, height - 5);
  ctx.textAlign = 'center';
  ctx.fillText('-20s', pad.left + graphWidth / 3, height - 5);
  ctx.fillText('-10s', pad.left + graphWidth * 2 / 3, height - 5);
  ctx.textAlign = 'right';
  ctx.fillText('NOW', width - pad.right, height - 5);
  ctx.textAlign = 'left';

  if (!state.running && !state.ended) {
    ctx.fillStyle = 'rgba(110, 124, 113, 0.55)';
    ctx.font = '8px "SFMono-Regular", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AWAITING RECEIVER', width / 2, height / 2);
  }
}

function updateInterface(now) {
  const metric = state.metrics;
  const targetActive = Boolean(state.target) && now < state.targetEndsAt;

  updateFrequencyUI();
  updateBearingUI();
  updateGainUI();

  if (state.running || state.ended) {
    dom.sessionClock.textContent = formatClock((state.ended ? state.endedAt : now) - state.startedAt);
  }

  if (!state.running) {
    dom.lockBtn.disabled = true;
    dom.windowTime.textContent = state.ended ? '--.-' : '--.-';
    dom.windowFill.style.width = '0%';
  } else if (targetActive) {
    const remaining = Math.max(0, state.targetEndsAt - now);
    const ratio = remaining / TARGET_WINDOW_MS;
    dom.windowTime.textContent = (remaining / 1000).toFixed(1);
    dom.windowFill.style.width = `${ratio * 100}%`;
    dom.windowTime.classList.toggle('is-low', remaining < 3200);
    dom.lockBtn.disabled = false;
  } else {
    const wait = state.pendingTargetAt ? Math.max(0, state.pendingTargetAt - now) : 0;
    dom.windowTime.textContent = wait > 0 ? '...' : '--.-';
    dom.windowFill.style.width = '0%';
    dom.windowTime.classList.remove('is-low');
    dom.lockBtn.disabled = true;
  }

  const visualQuality = state.running
    ? clamp(metric.quality, 0, 100)
    : clamp(metric.noise * 10, 0, 9);
  dom.signalBars.forEach((bar, index) => {
    const threshold = ((index + 1) / dom.signalBars.length) * 100;
    const lit = visualQuality >= threshold - 4;
    bar.classList.toggle('is-on', lit);
    bar.classList.toggle('is-warn', lit && index > 8 && state.gain > 65);
    bar.style.setProperty('--h', String(6 + index * 2.45));
  });

  dom.snrValue.textContent = metric.snrDb.toFixed(1);
  const displayedPeak = audio.ready
    ? Math.max(audioStats.peak, metric.peakDbfs - 12)
    : metric.peakDbfs;
  dom.levelValue.textContent = displayedPeak <= -99 ? '−∞' : displayedPeak.toFixed(1);
  dom.polarFill.style.width = `${clamp(metric.polar, 0, 100)}%`;
  dom.polarValue.textContent = `${Math.round(metric.polar)}%`;

  if (state.ended) {
    dom.qualityLabel.textContent = state.records.length >= 3 ? 'COMPLETE' : 'TERMINATED';
  } else if (!state.running) {
    dom.qualityLabel.textContent = 'NO SIGNAL';
  } else if (!metric.bandMatch) {
    dom.qualityLabel.textContent = 'NO CARRIER';
  } else if (metric.valid) {
    dom.qualityLabel.textContent = 'LOCKABLE';
  } else if (metric.quality > 67) {
    dom.qualityLabel.textContent = 'STRONG';
  } else if (metric.quality > 27) {
    dom.qualityLabel.textContent = 'WEAK';
  } else {
    dom.qualityLabel.textContent = 'NOISE';
  }

  if (state.ended) {
    dom.lockHint.textContent = state.records.length >= 3
      ? '三个频点已全部写入行动记录。'
      : '本轮追踪已终止。重新开始可生成新的跳频轨迹。';
  } else if (!state.running) {
    dom.lockHint.textContent = '启动接收机后，寻找稳定峰值才能验证。';
  } else if (!targetActive) {
    dom.lockHint.textContent = '目标正在转移，等待新的信号窗口。';
  } else if (state.gain > MAX_GAIN) {
    dom.lockHint.textContent = '增益过载：底噪正在抬升，降低前置增益。';
  } else if (!metric.bandMatch) {
    dom.lockHint.textContent = '当前带通内没有目标载波。切换频段继续搜索。';
  } else if (metric.valid) {
    dom.lockHint.textContent = '信号峰值稳定，满足验证条件。';
  } else if (metric.quality > 52) {
    dom.lockHint.textContent = '已接近峰值。微调方位或频率后再记录。';
  } else {
    dom.lockHint.textContent = '扫描频率与天线方位，或调整增益以突出载波。';
  }

  dom.peakFreq.textContent = metric.bandMatch && metric.quality >= 24
    ? formatMHz(state.tuneKHz)
    : '—.———';
  updateProgress();
}

function updateTrace(now, metric) {
  if (now - state.lastTraceAt < 110) return;
  state.lastTraceAt = now;
  for (let i = 0; i < state.trace.length; i += 1) {
    state.trace[i] *= 0.986;
  }
  if (state.running && state.target && metric.polar > 0.5) {
    const index = Math.round((state.bearing / 360) * state.trace.length) % state.trace.length;
    state.trace[index] = Math.max(state.trace[index], metric.polar);
  }
}

function recordHistory(now, metric) {
  if (!state.running || now - state.lastSampleAt < 115) return;
  state.lastSampleAt = now;
  state.history.push({
    at: now,
    quality: metric.quality,
    snr: metric.snrDb,
    bandMatch: metric.bandMatch
  });
  const cutoff = now - HISTORY_MS - 1000;
  while (state.history.length && state.history[0].at < cutoff) {
    state.history.shift();
  }
}

function animationFrame(now) {
  tickGame(now);
  state.metrics = measureSignal(now);

  if (audio.ready && now - (animationFrame.lastAudioSample || 0) > 105) {
    animationFrame.lastAudioSample = now;
    audioStats = audio.sample();
  }
  audio.update(state.metrics, state.band, state.target, state.running);
  updateTrace(now, state.metrics);
  recordHistory(now, state.metrics);

  if (now - (animationFrame.lastUi || 0) > 65) {
    animationFrame.lastUi = now;
    updateInterface(now);
  }

  drawSpectrum(now);
  drawDirection(now);
  drawHistory(now);
  window.requestAnimationFrame(animationFrame);
}

window.__signalGame = {
  start: startGame,
  restart: restartGame,
  setBand,
  setTune,
  setBearing,
  setGain,
  lock: attemptLock,
  snapshot() {
    const metric = measureSignal();
    return {
      running: state.running,
      ended: state.ended,
      audioReady: audio.ready,
      band: state.band,
      tuneKHz: state.tuneKHz,
      bearing: state.bearing,
      gain: state.gain,
      target: state.target ? { ...state.target } : null,
      targetRemainingMs: state.target ? Math.max(0, state.targetEndsAt - performance.now()) : 0,
      records: state.records.map((record) => ({ ...record })),
      falseLocks: state.falseLocks,
      metrics: { ...metric }
    };
  }
};

updateBandUI();
updateFrequencyUI();
updateBearingUI();
updateGainUI();
renderLog();
window.requestAnimationFrame(animationFrame);
