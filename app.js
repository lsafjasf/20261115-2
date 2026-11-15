"use strict";

(() => {
  const FAULT_TYPES = {
    continuous: {
      label: "连续音",
      descriptor: "稳态啸叫 / 气蚀",
      detail: "持续、窄带的稳态高频能量，随负载增强而抬起。",
      color: "#69e4bb",
    },
    impact: {
      label: "冲击音",
      descriptor: "周期敲击 / 间隙",
      detail: "短促冲击以稳定节拍重复，低频余振明显。",
      color: "#f4b45c",
    },
    friction: {
      label: "摩擦音",
      descriptor: "宽频沙沙 / 干摩擦",
      detail: "不规则宽频噪声，声能分布在较宽的中高频段。",
      color: "#e58e6f",
    },
  };

  const MACHINES = [
    {
      id: "pump",
      title: "离心泵 / CP-04",
      name: "单级端吸离心泵",
      model: "CP-04",
      serial: "SN 8841-CP",
      spec: "单级端吸泵 · 11 kW · 铸铁蜗壳",
      rpm: 2920,
      temp: 58,
      baseHz: 165,
      bgLevel: 0.18,
      fault: "continuous",
      faultName: "叶轮气蚀",
      faultNotes: "蜗壳内持续高频啸叫，入口压力不足时增强。",
      clue: "持续高频嘶鸣 / 随负载增强",
      correctPoint: "volute",
      hotSpots: [
        { id: "bearing", label: "电机轴承", x: 30.2, y: 47, side: "left" },
        { id: "volute", label: "泵壳 / 蜗壳", x: 56.8, y: 56, side: "right" },
        { id: "outlet", label: "出口法兰", x: 77.5, y: 30, side: "right" },
      ],
    },
    {
      id: "gearbox",
      title: "斜齿轮减速机 / RX-2",
      name: "两级斜齿轮减速机",
      model: "RX-2",
      serial: "SN 2207-RX",
      spec: "两级斜齿 · 22 kW · 速比 18.4",
      rpm: 1470,
      temp: 64,
      baseHz: 112,
      bgLevel: 0.24,
      fault: "impact",
      faultName: "齿面点蚀",
      faultNotes: "啮合区出现周期冲击，低速轴每转约两次敲击。",
      clue: "稳定节拍的低频敲击 / 短促余振",
      correctPoint: "mesh",
      hotSpots: [
        { id: "highBearing", label: "高速轴轴承", x: 30.4, y: 46, side: "left" },
        { id: "mesh", label: "齿轮啮合区", x: 54.6, y: 57, side: "right" },
        { id: "coupling", label: "输出联轴器", x: 76.5, y: 50, side: "right" },
      ],
    },
    {
      id: "compressor",
      title: "活塞空压机 / AC-7",
      name: "双缸往复式空压机",
      model: "AC-7",
      serial: "SN 7390-AC",
      spec: "双缸往复式 · 7.5 kW · 0.8 MPa",
      rpm: 980,
      temp: 76,
      baseHz: 96,
      bgLevel: 0.27,
      fault: "friction",
      faultName: "连杆轴承干摩擦",
      faultNotes: "曲轴箱发出不规则宽频摩擦声，润滑膜已局部失效。",
      clue: "不规则沙沙声 / 中高频宽频能量",
      correctPoint: "crankcase",
      hotSpots: [
        { id: "head", label: "气缸盖", x: 36, y: 27, side: "left" },
        { id: "crankcase", label: "曲轴箱", x: 66.2, y: 57, side: "right" },
        { id: "valve", label: "排气阀", x: 19, y: 31, side: "left" },
      ],
    },
  ];

  const MACHINE_ART = {
    pump: `
      <svg viewBox="0 0 760 370" role="img" aria-label="离心泵结构示意图">
        <defs>
          <linearGradient id="pumpMetal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3b4d42"/>
            <stop offset=".55" stop-color="#223129"/>
            <stop offset="1" stop-color="#121b16"/>
          </linearGradient>
          <linearGradient id="pumpPipe" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#5a7163"/>
            <stop offset=".5" stop-color="#293a31"/>
            <stop offset="1" stop-color="#16211b"/>
          </linearGradient>
          <pattern id="pumpHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#849a8c" stroke-opacity=".18" stroke-width="1"/>
          </pattern>
        </defs>
        <ellipse cx="380" cy="315" rx="292" ry="20" fill="#050906" opacity=".65"/>
        <rect x="105" y="293" width="561" height="20" rx="4" fill="#1b2720" stroke="#52665a"/>
        <rect x="132" y="285" width="70" height="13" rx="2" fill="#0e1511" stroke="#4f6257"/>
        <rect x="611" y="285" width="58" height="13" rx="2" fill="#0e1511" stroke="#4f6257"/>
        <path d="M166 250h265v42H166z" fill="url(#pumpMetal)" stroke="#5a7062" stroke-width="1.5"/>
        <path d="M176 229h30l9-9h52l9 9h46l8-9h44l8 9h32v22H176z" fill="url(#pumpMetal)" stroke="#617769"/>
        <path d="M204 228v-19m34 19v-19m102 19v-19m34 19v-19" stroke="#7b9183" stroke-width="2" opacity=".65"/>
        <rect x="177" y="241" width="239" height="6" fill="#101813" opacity=".7"/>
        <circle cx="289" cy="241" r="26" fill="#19261f" stroke="#789083" stroke-width="2"/>
        <circle cx="289" cy="241" r="17" fill="#0d1511" stroke="#455b4e"/>
        <path d="M254 170h45v46h-45z" fill="#293a31" stroke="#63796b"/>
        <circle cx="461" cy="236" r="76" fill="url(#pumpMetal)" stroke="#769083" stroke-width="2"/>
        <circle cx="461" cy="236" r="56" fill="#26372e" stroke="#51675b"/>
        <circle cx="461" cy="236" r="46" fill="#1a2921" stroke="#7a9284" stroke-width="1.5"/>
        <circle cx="461" cy="236" r="13" fill="#0c1310" stroke="#91a699"/>
        <path d="M382 226c55-45 127-4 105 47-6 14-20 31-40 37" fill="none" stroke="#91a99a" stroke-width="2.4" opacity=".55"/>
        <path d="M497 188c23-30 43-40 69-36l17 43c-26-2-49 8-67 19z" fill="url(#pumpPipe)" stroke="#778f80" stroke-width="1.5"/>
        <rect x="498" y="153" width="73" height="17" rx="3" fill="#26382e" stroke="#809889"/>
        <path d="M568 165h36v15h-36zM606 161h20v23h-20z" fill="#3a5042" stroke="#809889"/>
        <path d="M442 158v-33h61v33M452 125h41" fill="none" stroke="#7d9686" stroke-width="2"/>
        <rect x="441" y="120" width="63" height="12" rx="2" fill="#2b3d33" stroke="#849c8c"/>
        <rect x="589" y="260" width="43" height="40" rx="3" fill="#19261f" stroke="#60766a"/>
        <circle cx="610" cy="279" r="4" fill="#69e4bb"/>
        <path d="M436 301h44v10h-44z" fill="#27372e" stroke="#5f7668"/>
        <rect x="209" y="249" width="172" height="13" rx="2" fill="url(#pumpHatch)" stroke="#748b7d" stroke-width="1"/>
        <text x="605" y="279" fill="#93a99d" font-family="monospace" font-size="7">P-04</text>
        <path d="M173 250h104M398 230h63M584 279h60" stroke="#a3b8ab" stroke-width="1" opacity=".2"/>
        <g fill="none" stroke="#9eafa4" stroke-width=".7" opacity=".35">
          <path d="M125 89h66M125 96h42M637 92h75M637 99h39"/>
          <circle cx="108" cy="92" r="3"/><circle cx="718" cy="95" r="3"/>
        </g>
      </svg>`,
    gearbox: `
      <svg viewBox="0 0 760 370" role="img" aria-label="斜齿轮减速机结构示意图">
        <defs>
          <linearGradient id="gearMetal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#445849"/>
            <stop offset=".5" stop-color="#24352b"/>
            <stop offset="1" stop-color="#111a15"/>
          </linearGradient>
          <pattern id="gearHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#9bb0a1" stroke-opacity=".16"/>
          </pattern>
        </defs>
        <ellipse cx="383" cy="318" rx="300" ry="21" fill="#050906" opacity=".7"/>
        <rect x="92" y="296" width="570" height="20" rx="4" fill="#1a271f" stroke="#53675b"/>
        <path d="M129 246h239v50H129z" fill="url(#gearMetal)" stroke="#647a6c" stroke-width="1.5"/>
        <path d="M143 227h202l15 19H129z" fill="#31443a" stroke="#71887a"/>
        <path d="M160 227v-18m32 18v-18m70 18v-18m32 18v-18" stroke="#829889" stroke-width="2" opacity=".55"/>
        <circle cx="244" cy="194" r="25" fill="#1a2821" stroke="#718779" stroke-width="2"/>
        <circle cx="244" cy="194" r="14" fill="#0d1511" stroke="#485f51"/>
        <path d="M342 170h249l48 126H301z" fill="url(#gearMetal)" stroke="#748b7c" stroke-width="2"/>
        <path d="M350 183h225l28 91H328z" fill="url(#gearHatch)" opacity=".9" stroke="#617769"/>
        <path d="M360 170h105v-18h92v18h38" fill="#3b5143" stroke="#819787"/>
        <rect x="395" y="125" width="121" height="28" rx="5" fill="#26382e" stroke="#7a9182"/>
        <path d="M412 125v-12m88 12v-12" stroke="#8ea494" stroke-width="2"/>
        <rect x="401" y="113" width="25" height="14" rx="2" fill="#17241d" stroke="#657d6e"/>
        <rect x="489" y="113" width="25" height="14" rx="2" fill="#17241d" stroke="#657d6e"/>
        <circle cx="414" cy="139" r="5" fill="#0c1511" stroke="#7f9687"/>
        <circle cx="506" cy="139" r="5" fill="#0c1511" stroke="#7f9687"/>
        <rect x="589" y="237" width="59" height="59" fill="#293c31" stroke="#7b9283"/>
        <circle cx="618" cy="267" r="23" fill="#18261f" stroke="#7f9688" stroke-width="2"/>
        <circle cx="618" cy="267" r="8" fill="#0c1410" stroke="#a0b4a7"/>
        <rect x="648" y="239" width="28" height="55" rx="3" fill="#1a281f" stroke="#566d5e"/>
        <path d="M302 231h42M292 240h43M284 249h43M277 258h44M494 260h81" stroke="#a0b6a8" stroke-width="1.2" opacity=".32"/>
        <rect x="605" y="278" width="40" height="30" rx="3" fill="#18251e" stroke="#647a6b"/>
        <circle cx="625" cy="291" r="4" fill="#69e4bb"/>
        <text x="614" y="304" fill="#94aa9d" font-family="monospace" font-size="7">R-02</text>
        <g fill="none" stroke="#9eb0a5" stroke-width=".7" opacity=".35">
          <path d="M114 85h71M114 92h35M642 83h63M642 90h44"/>
          <circle cx="96" cy="88" r="3"/><circle cx="721" cy="86" r="3"/>
        </g>
      </svg>`,
    compressor: `
      <svg viewBox="0 0 760 370" role="img" aria-label="活塞空压机结构示意图">
        <defs>
          <linearGradient id="compMetal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#4c5545"/>
            <stop offset=".55" stop-color="#2a3328"/>
            <stop offset="1" stop-color="#151b14"/>
          </linearGradient>
          <linearGradient id="tankMetal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#506253"/>
            <stop offset=".45" stop-color="#26362c"/>
            <stop offset="1" stop-color="#111913"/>
          </linearGradient>
          <pattern id="compHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#adbaa9" stroke-opacity=".14"/>
          </pattern>
        </defs>
        <ellipse cx="385" cy="320" rx="302" ry="20" fill="#050906" opacity=".7"/>
        <rect x="98" y="299" width="573" height="19" rx="4" fill="#1b261f" stroke="#52655a"/>
        <path d="M166 251h282v48H166z" fill="url(#compMetal)" stroke="#687d6e" stroke-width="1.5"/>
        <path d="M181 233h44l12-13h50l12 13h84l13-13h46l11 13h26v20H181z" fill="#364438" stroke="#788d7c"/>
        <path d="M238 219v-49h92v51M257 219v-31h53v31" fill="#243026" stroke="#798d7d" stroke-width="1.7"/>
        <rect x="225" y="161" width="112" height="19" rx="3" fill="#3c4b3e" stroke="#8b9b8a"/>
        <path d="M245 161v-15m54 15v-15" stroke="#8a9e8d" stroke-width="2"/>
        <rect x="231" y="137" width="107" height="10" rx="2" fill="#1c281f" stroke="#627567"/>
        <path d="M316 246h64v53h-64z" fill="#28372c" stroke="#6e8273"/>
        <rect x="330" y="257" width="40" height="28" rx="2" fill="url(#compHatch)" stroke="#738879"/>
        <rect x="448" y="237" width="58" height="61" fill="#25342a" stroke="#7d9081"/>
        <circle cx="477" cy="268" r="22" fill="#16231b" stroke="#839888" stroke-width="2"/>
        <circle cx="477" cy="268" r="9" fill="#0b130e" stroke="#a4b5a7"/>
        <path d="M506 251h25v47h-25z" fill="#1a281e" stroke="#607466"/>
        <circle cx="525" cy="350" r="24" fill="#101914" stroke="#596d5f"/>
        <path d="M525 326v48m-24-24h48" stroke="#758a7a" stroke-width="1.3"/>
        <rect x="550" y="247" width="121" height="49" rx="5" fill="url(#tankMetal)" stroke="#7a8f7f" stroke-width="1.5"/>
        <rect x="561" y="254" width="99" height="30" rx="3" fill="url(#compHatch)" stroke="#687d6e"/>
        <path d="M297 146h59c18 0 28 11 29 30v36h-62" fill="none" stroke="#7e9282" stroke-width="2"/>
        <rect x="359" y="174" width="20" height="39" rx="2" fill="#35473a" stroke="#7f9383"/>
        <circle cx="369" cy="226" r="6" fill="#101914" stroke="#7f9383"/>
        <path d="M621 265h26v29h-26zM647 273h17v14h-17z" fill="#344539" stroke="#788d7c"/>
        <circle cx="648" cy="271" r="3" fill="#69e4bb"/>
        <path d="M662 280h36v5h-36zM669 283v12" stroke="#7c9181" stroke-width="2"/>
        <rect x="676" y="244" width="58" height="40" rx="3" fill="#18251d" stroke="#627768"/>
        <text x="687" y="268" fill="#9aada0" font-family="monospace" font-size="7">A-07</text>
        <path d="M684 279h43" stroke="#879b8b" stroke-width="1" opacity=".4"/>
        <g fill="none" stroke="#9eb0a4" stroke-width=".7" opacity=".35">
          <path d="M107 82h74M107 89h40M638 79h69M638 86h31"/>
          <circle cx="92" cy="85" r="3"/><circle cx="720" cy="82" r="3"/>
        </g>
      </svg>`,
  };

  const state = {
    started: false,
    machineIndex: 0,
    selectedPoint: null,
    placement: "none",
    clarity: 0,
    gain: 34,
    load: 64,
    mute: false,
    solved: 0,
    verdicts: [],
    gainAlerts: 0,
    gainOver: false,
    peakGain: 34,
    peakSafeGain: 34,
    analysisMode: "ready",
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;

  function createNoiseBuffer(ctx, seconds = 4) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.018 * white) / 1.018;
      data[i] = clamp(brown * 3.8 + white * 0.16, -1, 1);
    }
    return buffer;
  }

  class StethoscopeEngine {
    constructor() {
      this.ctx = null;
      this.analyser = null;
      this.running = false;
      this.machine = null;
      this.placement = "none";
      this.load = 0.64;
      this.gainValue = 34;
      this.muted = false;
      this.sourceNodes = [];
      this.knockTimer = null;
      this.timeBuffer = null;
    }

    async start(machine) {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error("当前浏览器不支持 Web Audio");
        }
        this.ctx = new AudioContextClass();
        this.buildGraph();
      }
      await this.ctx.resume();
      this.running = true;
      this.setMachine(machine);
      this.setLoad(this.load);
      this.setGain(this.gainValue);
    }

    buildGraph() {
      const ctx = this.ctx;
      this.mix = ctx.createGain();
      this.mix.gain.value = 0.82;

      this.master = ctx.createGain();
      this.master.gain.value = 0.43;

      this.shaper = ctx.createWaveShaper();
      this.shaper.curve = this.createSoftClipCurve(2.6);
      this.shaper.oversample = "2x";

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.62;
      this.timeBuffer = new Float32Array(this.analyser.fftSize);

      this.muteGain = ctx.createGain();
      this.muteGain.gain.value = this.muted ? 0 : 1;

      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.knee.value = 8;
      this.limiter.ratio.value = 14;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.16;

      this.mix.connect(this.master);
      this.master.connect(this.shaper);
      this.shaper.connect(this.muteGain);
      this.muteGain.connect(this.analyser);
      this.analyser.connect(this.limiter);
      this.limiter.connect(ctx.destination);

      this.noiseBuffer = createNoiseBuffer(ctx);

      this.bgFilter = ctx.createBiquadFilter();
      this.bgFilter.type = "lowpass";
      this.bgFilter.frequency.value = 5200;
      this.bgFilter.Q.value = 0.45;

      this.loadNoiseGain = ctx.createGain();
      this.loadNoiseGain.gain.value = 0.11;

      this.bgNoise = ctx.createBufferSource();
      this.bgNoise.buffer = this.noiseBuffer;
      this.bgNoise.loop = true;
      this.bgNoise.connect(this.loadNoiseGain);
      this.loadNoiseGain.connect(this.bgFilter);
      this.bgFilter.connect(this.mix);
      this.bgNoise.start();

      this.faultBus = ctx.createGain();
      this.faultBus.gain.value = 0;
      this.faultFilter = ctx.createBiquadFilter();
      this.faultFilter.type = "lowpass";
      this.faultFilter.frequency.value = 16000;
      this.faultFilter.Q.value = 0.6;
      this.faultBus.connect(this.faultFilter);
      this.faultFilter.connect(this.mix);

      this.contactNoise = ctx.createBufferSource();
      this.contactNoise.buffer = this.noiseBuffer;
      this.contactNoise.loop = true;
      this.contactNoise.playbackRate.value = 1.7;
      this.contactFilter = ctx.createBiquadFilter();
      this.contactFilter.type = "bandpass";
      this.contactFilter.frequency.value = 2800;
      this.contactFilter.Q.value = 0.55;
      this.contactGain = ctx.createGain();
      this.contactGain.gain.value = 0;
      this.contactNoise.connect(this.contactFilter);
      this.contactFilter.connect(this.contactGain);
      this.contactGain.connect(this.mix);
      this.contactNoise.start();
    }

    createSoftClipCurve(amount) {
      const samples = 2048;
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; i += 1) {
        const x = (i * 2) / (samples - 1) - 1;
        curve[i] = Math.tanh(x * amount);
      }
      return curve;
    }

    cleanupMachine() {
      if (this.knockTimer) {
        window.clearInterval(this.knockTimer);
        this.knockTimer = null;
      }
      this.sourceNodes.forEach((node) => {
        try {
          node.stop();
        } catch {
          // A source may already have stopped after a machine change.
        }
        try {
          node.disconnect();
        } catch {
          // Disconnected nodes are harmless.
        }
      });
      this.sourceNodes = [];
    }

    track(node) {
      this.sourceNodes.push(node);
      return node;
    }

    setMachine(machine) {
      if (!this.ctx || this.machine?.id === machine.id) return;
      this.cleanupMachine();
      this.machine = machine;

      const now = this.ctx.currentTime;
      const baseGain = this.ctx.createGain();
      baseGain.gain.value = 0.018;
      baseGain.connect(this.bgFilter);
      this.machineToneGain = baseGain;

      const fundamental = this.track(this.ctx.createOscillator());
      fundamental.type = "sine";
      fundamental.frequency.value = machine.baseHz;
      fundamental.connect(baseGain);
      fundamental.start();

      const harmonicGain = this.ctx.createGain();
      harmonicGain.gain.value = 0.33;
      harmonicGain.connect(baseGain);
      this.machineHarmonicGain = harmonicGain;

      const harmonic = this.track(this.ctx.createOscillator());
      harmonic.type = "triangle";
      harmonic.frequency.value = machine.baseHz * 2.02;
      harmonic.connect(harmonicGain);
      harmonic.start();

      const motorLfo = this.track(this.ctx.createOscillator());
      const motorLfoDepth = this.ctx.createGain();
      motorLfo.frequency.value = 1.7;
      motorLfoDepth.gain.value = 0.0035;
      motorLfo.connect(motorLfoDepth);
      motorLfoDepth.connect(baseGain.gain);
      motorLfo.start();

      if (machine.fault === "continuous") {
        this.buildContinuousFault();
      } else if (machine.fault === "impact") {
        this.buildImpactFault();
      } else {
        this.buildFrictionFault();
      }

      this.applyPlacement(this.placement, true);
      this.setLoad(this.load);
    }

    buildContinuousFault() {
      const ctx = this.ctx;
      const toneGain = ctx.createGain();
      toneGain.gain.value = 0.065;
      toneGain.connect(this.faultBus);

      const tone = this.track(ctx.createOscillator());
      tone.type = "sine";
      tone.frequency.value = 712;
      tone.connect(toneGain);
      tone.start();

      const overtoneGain = ctx.createGain();
      overtoneGain.gain.value = 0.024;
      overtoneGain.connect(this.faultBus);
      const overtone = this.track(ctx.createOscillator());
      overtone.type = "triangle";
      overtone.frequency.value = 1424;
      overtone.connect(overtoneGain);
      overtone.start();

      const am = this.track(ctx.createOscillator());
      const amDepth = ctx.createGain();
      am.frequency.value = 4.2;
      amDepth.gain.value = 0.014;
      am.connect(amDepth);
      amDepth.connect(toneGain.gain);
      am.start();

      const hiss = this.track(ctx.createBufferSource());
      hiss.buffer = this.noiseBuffer;
      hiss.loop = true;
      const hissFilter = ctx.createBiquadFilter();
      hissFilter.type = "bandpass";
      hissFilter.frequency.value = 2100;
      hissFilter.Q.value = 1.4;
      const hissGain = ctx.createGain();
      hissGain.gain.value = 0.1;
      hiss.connect(hissFilter);
      hissFilter.connect(hissGain);
      hissGain.connect(this.faultBus);
      hiss.start();
    }

    buildImpactFault() {
      const strike = () => {
        if (!this.ctx || !this.running) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const bodyGain = ctx.createGain();
        bodyGain.gain.setValueAtTime(0.0001, now);
        bodyGain.gain.exponentialRampToValueAtTime(0.26, now + 0.008);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);
        bodyGain.connect(this.faultBus);

        const body = ctx.createOscillator();
        body.type = "sine";
        body.frequency.setValueAtTime(112, now);
        body.frequency.exponentialRampToValueAtTime(58, now + 0.18);
        body.connect(bodyGain);
        body.start(now);
        body.stop(now + 0.26);

        const click = ctx.createBufferSource();
        click.buffer = this.noiseBuffer;
        const clickFilter = ctx.createBiquadFilter();
        clickFilter.type = "bandpass";
        clickFilter.frequency.value = 740;
        clickFilter.Q.value = 1.1;
        const clickGain = ctx.createGain();
        clickGain.gain.setValueAtTime(0.16, now);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
        click.connect(clickFilter);
        clickFilter.connect(clickGain);
        clickGain.connect(this.faultBus);
        click.start(now);
        click.stop(now + 0.09);

        const ring = ctx.createOscillator();
        ring.type = "triangle";
        ring.frequency.value = 384;
        const ringGain = ctx.createGain();
        ringGain.gain.setValueAtTime(0.035, now);
        ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.31);
        ring.connect(ringGain);
        ringGain.connect(this.faultBus);
        ring.start(now);
        ring.stop(now + 0.33);
      };
      strike();
      this.knockTimer = window.setInterval(strike, 690);
    }

    buildFrictionFault() {
      const ctx = this.ctx;
      const friction = this.track(ctx.createBufferSource());
      friction.buffer = this.noiseBuffer;
      friction.loop = true;
      friction.playbackRate.value = 1.35;

      const frictionFilter = ctx.createBiquadFilter();
      frictionFilter.type = "bandpass";
      frictionFilter.frequency.value = 1180;
      frictionFilter.Q.value = 0.48;
      const frictionGain = ctx.createGain();
      frictionGain.gain.value = 0.095;
      friction.connect(frictionFilter);
      frictionFilter.connect(frictionGain);
      frictionGain.connect(this.faultBus);
      friction.start();

      const rasp = this.track(ctx.createBufferSource());
      rasp.buffer = this.noiseBuffer;
      rasp.loop = true;
      rasp.playbackRate.value = 2.2;
      const raspFilter = ctx.createBiquadFilter();
      raspFilter.type = "highpass";
      raspFilter.frequency.value = 2600;
      const raspGain = ctx.createGain();
      raspGain.gain.value = 0.032;
      rasp.connect(raspFilter);
      raspFilter.connect(raspGain);
      raspGain.connect(this.faultBus);
      rasp.start();

      const dragLfo = this.track(ctx.createOscillator());
      const dragDepth = ctx.createGain();
      dragLfo.frequency.value = 0.74;
      dragDepth.gain.value = 0.026;
      dragLfo.connect(dragDepth);
      dragDepth.connect(frictionGain.gain);
      dragLfo.start();
    }

    setLoad(value) {
      this.load = value / 100;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const noiseGain = 0.065 + this.load * 0.16;
      this.loadNoiseGain.gain.setTargetAtTime(noiseGain, now, 0.08);
      if (this.machineToneGain) {
        this.machineToneGain.gain.setTargetAtTime(0.008 + this.load * 0.019, now, 0.08);
      }
      const brightness = 900 + this.load * 4600;
      if (this.placement !== "wrong") {
        this.bgFilter.frequency.setTargetAtTime(brightness, now, 0.08);
      }
    }

    setGain(value) {
      this.gainValue = value;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const mapped = 0.055 + Math.pow(value / 100, 1.45) * 1.48;
      this.master.gain.setTargetAtTime(mapped, now, 0.035);
    }

    setMuted(muted) {
      this.muted = muted;
      if (!this.ctx) return;
      this.muteGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.025);
    }

    applyPlacement(placement, immediate = false) {
      this.placement = placement;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const ramp = immediate ? 0.001 : 0.045;
      const isCorrect = placement === "correct";
      const isWrong = placement === "wrong";
      const faultLevel = isCorrect ? 1 : isWrong ? 0.15 : 0;
      const contactLevel = isWrong ? 0.04 : 0;
      this.faultBus.gain.setTargetAtTime(faultLevel, now, ramp);
      this.contactGain.gain.setTargetAtTime(contactLevel, now, ramp);
      this.faultFilter.frequency.setTargetAtTime(isWrong ? 720 : 16000, now, ramp);
      this.bgFilter.frequency.setTargetAtTime(
        isWrong ? 860 : 900 + this.load * 4600,
        now,
        ramp,
      );
    }

    getFrame() {
      if (!this.analyser || !this.running) {
        return { data: null, rms: 0, peak: 0, spl: 0 };
      }
      this.analyser.getFloatTimeDomainData(this.timeBuffer);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < this.timeBuffer.length; i += 1) {
        const sample = this.timeBuffer[i];
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const rms = Math.sqrt(sum / this.timeBuffer.length);
      const spl = clamp(64 + 20 * Math.log10(Math.max(rms, 0.0001) / 0.018), 38, 119);
      return { data: this.timeBuffer, rms, peak, spl };
    }

    suspend() {
      if (this.ctx?.state === "running") {
        this.ctx.suspend();
      }
    }
  }

  const engine = new StethoscopeEngine();
  let machine = MACHINES[0];
  let verdictAction = "close";
  let toastTimer = null;
  const splHistory = Array.from({ length: 96 }, () => 0);

  const dom = {
    machineTitle: $("#machineTitle"),
    machineSerial: $("#machineSerial"),
    machineVisual: $("#machineVisual"),
    hotspotLayer: $("#hotspotLayer"),
    frameReadout: $("#frameReadout"),
    loadReadout: $("#loadReadout"),
    rpmValue: $("#rpmValue"),
    tempValue: $("#tempValue"),
    loadState: $("#loadState"),
    machineSpec: $("#machineSpec"),
    loadSlider: $("#loadSlider"),
    loadLabel: $("#loadLabel"),
    placementState: $("#placementState"),
    sensorFuzz: $("#sensorFuzz"),
    captureBadge: $("#captureBadge"),
    scopePoint: $("#scopePoint"),
    filterReadout: $("#filterReadout"),
    splValue: $("#splValue"),
    clarityValue: $("#clarityValue"),
    clarityMeter: $("#clarityMeter"),
    couplingValue: $("#couplingValue"),
    couplingMeter: $("#couplingMeter"),
    gainSlider: $("#gainSlider"),
    gainReadout: $("#gainReadout"),
    gainState: $("#gainState"),
    clipLed: $("#clipLed"),
    noiseLevel: $("#noiseLevel"),
    diagnosisIndex: $("#diagnosisIndex"),
    promptCode: $("#promptCode"),
    diagnosisPrompt: $("#diagnosisPrompt"),
    diagnoseButton: $("#diagnoseButton"),
    statusMessage: $("#statusMessage"),
    sessionScore: $("#sessionScore"),
    scopeCanvas: $("#scopeCanvas"),
    pressureCanvas: $("#pressureCanvas"),
    verdictCanvas: $("#verdictCanvas"),
    verdictOverlay: $("#verdictOverlay"),
    verdictSecondary: $("#verdictSecondary"),
    verdictPrimary: $("#verdictPrimary"),
    completionOverlay: $("#completionOverlay"),
    finalGain: $("#finalGain"),
    toast: $("#toast"),
    toastText: $("#toastText"),
  };

  function showToast(message, duration = 3600) {
    window.clearTimeout(toastTimer);
    dom.toastText.textContent = message;
    dom.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove("is-visible");
    }, duration);
  }

  function setStatus(message) {
    dom.statusMessage.textContent = message;
  }

  function updateSessionScore() {
    dom.sessionScore.textContent = `正确 ${state.solved} / 3`;
  }

  function updateLoadLabels() {
    dom.loadLabel.textContent = `${state.load}% 工况`;
    dom.loadReadout.textContent = `${state.load}%`;
    dom.loadState.textContent = state.load;
    dom.noiseLevel.textContent = `${Math.round(-25 + state.load * 0.19)} dB`;
    dom.loadSlider.value = state.load;
  }

  function updatePlacementUI() {
    const isCorrect = state.placement === "correct";
    const isWrong = state.placement === "wrong";
    const hasPoint = isCorrect || isWrong;

    dom.sensorFuzz.classList.toggle("is-visible", isWrong);
    dom.placementState.classList.toggle("is-solid", isCorrect);
    dom.placementState.classList.toggle("is-fuzzy", isWrong);
    dom.placementState.textContent = isCorrect
      ? "耦合良好"
      : isWrong
        ? "模糊信号 · 偏移"
        : "未贴附";

    dom.captureBadge.classList.toggle("is-live", isCorrect);
    dom.captureBadge.classList.toggle("is-fuzzy", isWrong);
    dom.captureBadge.querySelector("b").textContent = isCorrect
      ? "CAPTURING"
      : isWrong
        ? "FUZZY SIGNAL"
        : state.started
          ? "READY"
          : "STANDBY";

    dom.clarityValue.textContent = hasPoint ? `${state.clarity}%` : "—";
    dom.couplingValue.textContent = hasPoint
      ? `${isCorrect ? 94 : 48}%`
      : "—";
    dom.clarityMeter.style.width = hasPoint ? `${state.clarity}%` : "0%";
    dom.clarityMeter.style.background = isWrong ? "var(--amber)" : "var(--teal)";
    dom.couplingMeter.style.width = hasPoint ? `${isCorrect ? 94 : 48}%` : "0%";
    dom.filterReadout.textContent = isWrong ? "LPF / 720 Hz" : "WIDE / 20 kHz";

    dom.diagnoseButton.disabled = !hasPoint;
  }

  function updateGainUI() {
    const over = state.gain > 72;
    dom.gainSlider.value = state.gain;
    dom.gainReadout.innerHTML = `${state.gain}<small>%</small>`;
    dom.gainState.classList.toggle("is-over", over);
    dom.gainState.innerHTML = over
      ? "<i></i> OVER GAIN"
      : "<i></i> SAFE RANGE";
    dom.clipLed.classList.toggle("is-active", over);
    dom.gainSlider.setAttribute("aria-valuetext", `${state.gain}%，${over ? "增益超限" : "安全范围"}`);
  }

  function renderMachine(index) {
    state.machineIndex = index;
    machine = MACHINES[index];
    state.selectedPoint = null;
    state.placement = "none";
    state.clarity = 0;

    dom.machineTitle.textContent = machine.title;
    dom.machineSerial.textContent = machine.serial;
    dom.frameReadout.textContent = machine.model;
    dom.rpmValue.textContent = machine.rpm.toLocaleString("en-US");
    dom.tempValue.textContent = machine.temp;
    dom.machineSpec.textContent = machine.spec;
    dom.diagnosisIndex.textContent = String(index + 1).padStart(2, "0");
    dom.promptCode.textContent = `${machine.model} · 待采信`;
    dom.diagnosisPrompt.textContent = "贴紧测点并试听，选择最符合的异常声纹。";
    $$('input[name="faultType"]').forEach((input) => {
      input.checked = false;
    });
    dom.machineVisual.innerHTML = MACHINE_ART[machine.id];
    dom.hotspotLayer.innerHTML = machine.hotSpots
      .map(
        (point) => `
          <button
            class="hotspot"
            type="button"
            data-point="${point.id}"
            data-label-side="${point.side}"
            aria-label="将听诊器贴附至${point.label}"
            aria-pressed="false"
            style="left:${point.x}%;top:${point.y}%"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="5"></circle>
              <path d="m15 15 5 5M11 7v8M7 11h8"></path>
            </svg>
            <span class="hotspot-label">${point.label}</span>
          </button>`,
      )
      .join("");

    dom.hotspotLayer.querySelectorAll(".hotspot").forEach((button) => {
      button.addEventListener("click", () => selectPoint(button.dataset.point));
    });

    updateLoadLabels();
    updatePlacementUI();
    updateSessionScore();
    if (state.started) engine.setMachine(machine);
  }

  function selectPoint(pointId) {
    if (!state.started || state.solved >= 3) return;
    const point = machine.hotSpots.find((entry) => entry.id === pointId);
    if (!point) return;

    state.selectedPoint = pointId;
    const correct = pointId === machine.correctPoint;
    state.placement = correct ? "correct" : "wrong";
    state.clarity = correct
      ? Math.round(89 + state.load * 0.065)
      : Math.round(29 + state.load * 0.075);

    dom.hotspotLayer.querySelectorAll(".hotspot").forEach((button) => {
      const selected = button.dataset.point === pointId;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-correct", selected && correct);
      button.classList.toggle("is-wrong", selected && !correct);
    });

    dom.scopePoint.textContent = `${machine.model} / ${point.label}`;
    dom.promptCode.textContent = `${machine.model} · ${correct ? "信号清晰" : "信号模糊"}`;
    dom.diagnosisPrompt.textContent = correct
      ? "耦合稳定，背景声已降低。请比对连续、冲击与摩擦特征。"
      : "测点偏离主振源，低频背景与接触噪声混入，声纹可信度降低。";

    engine.applyPlacement(state.placement);
    updatePlacementUI();

    if (correct) {
      setStatus(`${point.label}：传感器耦合良好，声纹清晰`);
    } else {
      setStatus(`${point.label}：测点偏离，检测到背景掩蔽`);
      showToast("信号模糊：该测点未贴合主振源。可尝试移动测点，避免用模糊声纹下结论。");
      const button = dom.hotspotLayer.querySelector(`[data-point="${pointId}"]`);
      window.setTimeout(() => button?.classList.remove("is-wrong"), 420);
    }
  }

  function handleGainInput() {
    state.gain = Number(dom.gainSlider.value);
    state.peakGain = Math.max(state.peakGain, state.gain);
    const nowOver = state.gain > 72;
    if (nowOver && !state.gainOver) {
      state.gainAlerts += 1;
      showToast("前置增益超过 72%：声纹进入削波区。本次巡检需重新开始后才能结算。", 5200);
      setStatus("警告：前置增益超过安全上限");
    }
    state.gainOver = nowOver;
    engine.setGain(state.gain);
    updateGainUI();
  }

  function handleLoadInput() {
    state.load = Number(dom.loadSlider.value);
    engine.setLoad(state.load);
    updateLoadLabels();
    if (state.placement === "correct") {
      state.clarity = Math.round(89 + state.load * 0.065);
      updatePlacementUI();
    }
  }

  function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: rect.width, height: rect.height };
  }

  function drawScope(frame) {
    const { ctx, width, height } = prepareCanvas(dom.scopeCanvas);
    ctx.clearRect(0, 0, width, height);
    const mid = height * 0.53;

    ctx.save();
    ctx.strokeStyle = "rgba(105, 228, 187, 0.055)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    const wrong = state.placement === "wrong";
    const active = frame.data && state.placement !== "none";
    const color = wrong ? "#f4b45c" : "#69e4bb";

    if (active) {
      const data = frame.data;
      let start = 0;
      for (let i = 2; i < data.length / 2; i += 1) {
        if (data[i - 1] <= 0 && data[i] > 0) {
          start = i;
          break;
        }
      }
      const samples = data.length - start;
      const points = Math.min(940, Math.floor(width * 1.35));
      ctx.beginPath();
      for (let i = 0; i < points; i += 1) {
        const index = start + Math.floor((i / points) * samples);
        const x = (i / (points - 1)) * width;
        const signal = Math.tanh(data[index] * (wrong ? 2.4 : 3.2));
        const y = mid - signal * height * 0.42;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = wrong ? 1 : 1.35;
      ctx.shadowColor = color;
      ctx.shadowBlur = wrong ? 3 : 9;
      ctx.globalAlpha = wrong ? 0.7 : 0.95;
      ctx.stroke();

      if (wrong) {
        ctx.globalAlpha = 0.2;
        ctx.translate(7, 0);
        ctx.stroke();
      }
    } else {
      ctx.setLineDash([2, 7]);
      ctx.strokeStyle = "rgba(126, 157, 140, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const y = mid + Math.sin(x * 0.026 + performance.now() * 0.0012) * 3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPressure(frame) {
    const { ctx, width, height } = prepareCanvas(dom.pressureCanvas);
    ctx.clearRect(0, 0, width, height);

    const hasSignal = state.placement !== "none" && state.started;
    const spl = hasSignal ? frame.spl : 42;
    splHistory.push(spl);
    splHistory.shift();

    const top = 5;
    const bottom = height - 6;
    const span = 116 - 36;
    const yFor = (value) => bottom - ((value - 36) / span) * (bottom - top);

    ctx.strokeStyle = "rgba(189, 214, 198, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yFor(96));
    ctx.lineTo(width, yFor(96));
    ctx.stroke();

    ctx.beginPath();
    splHistory.forEach((value, index) => {
      const x = (index / (splHistory.length - 1)) * width;
      const y = yFor(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(width, bottom);
    ctx.lineTo(0, bottom);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, "rgba(105, 228, 187, 0.24)");
    gradient.addColorStop(1, "rgba(105, 228, 187, 0)");
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    splHistory.forEach((value, index) => {
      const x = (index / (splHistory.length - 1)) * width;
      const y = yFor(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = state.placement === "wrong" ? "#f4b45c" : "#69e4bb";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function animationLoop(timestamp) {
    const frame = engine.getFrame();
    drawScope(frame);
    drawPressure(frame);

    if (timestamp - lastReadoutUpdate > 100) {
      if (state.started && state.placement !== "none") {
        dom.splValue.textContent = frame.spl.toFixed(1);
      } else {
        dom.splValue.textContent = "--";
      }
      lastReadoutUpdate = timestamp;
    }
    window.requestAnimationFrame(animationLoop);
  }

  let lastReadoutUpdate = 0;

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function verdictStyle(kind) {
    if (kind === "correct") {
      return { color: "#69e4bb", soft: "rgba(105,228,187,0.1)", code: "PASS / 03" };
    }
    if (kind === "placement") {
      return { color: "#f4b45c", soft: "rgba(244,180,92,0.1)", code: "HOLD / F01" };
    }
    return { color: "#ff7466", soft: "rgba(255,116,102,0.1)", code: "FAIL / R02" };
  }

  function drawSignature(ctx, x, y, width, height, type, mode) {
    const mid = y + height * 0.53;
    const samples = Math.floor(width);
    const points = [];
    let seed = 19.37;

    for (let i = 0; i < samples; i += 1) {
      const t = i / samples;
      let signal = 0;
      if (mode === "fuzzy") {
        seed = (seed * 16807) % 2147483647;
        const noise = (seed / 2147483647) * 2 - 1;
        signal =
          Math.sin(t * Math.PI * 9) * 0.07 +
          Math.sin(t * Math.PI * 27) * 0.035 +
          noise * 0.2;
      } else if (type === "continuous") {
        const envelope = 0.8 + Math.sin(t * Math.PI * 8) * 0.08;
        signal =
          (Math.sin(t * Math.PI * 72) * 0.49 +
            Math.sin(t * Math.PI * 146) * 0.2 +
            Math.sin(t * Math.PI * 220) * 0.07) *
          envelope;
      } else if (type === "impact") {
        const beat = (t * 4.3) % 1;
        const strike = beat < 0.18 ? Math.exp(-beat * 21) : 0;
        signal =
          Math.sin(t * Math.PI * 39) * 0.1 +
          strike * (Math.sin(t * Math.PI * 420) * 0.66 + 0.28);
      } else {
        seed = (seed * 48271) % 2147483647;
        const noise = (seed / 2147483647) * 2 - 1;
        const drag = 0.077 + Math.sin(t * Math.PI * 6.1) * 0.025;
        signal =
          noise * drag + Math.sin(t * Math.PI * 116) * 0.06 +
          Math.sin(t * Math.PI * 287) * 0.025;
      }
      if (mode === "overgain") {
        signal = Math.tanh(signal * 5.4) * 0.88;
      }
      points.push(clamp(signal, -1, 1));
    }

    ctx.save();
    ctx.strokeStyle = "rgba(188, 211, 198, 0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, mid);
    ctx.lineTo(x + width, mid);
    ctx.stroke();

    ctx.beginPath();
    points.forEach((signal, index) => {
      const px = x + index;
      const py = mid - signal * height * 0.38;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = mode === "fuzzy" ? "#f4b45c" : "#9debc9";
    ctx.lineWidth = mode === "fuzzy" ? 0.85 : 1;
    ctx.globalAlpha = mode === "fuzzy" ? 0.72 : 0.9;
    ctx.stroke();
    ctx.restore();
  }

  function drawVerdictCard(result) {
    const canvas = dom.verdictCanvas;
    canvas.width = 1040;
    canvas.height = 700;
    const ctx = canvas.getContext("2d");
    const style = verdictStyle(result.kind);
    const selected = FAULT_TYPES[result.selectedType] || FAULT_TYPES[result.actualType];
    const actual = FAULT_TYPES[result.actualType];
    const point = machine.hotSpots.find((entry) => entry.id === result.point);
    const cardNumber = `DX-${machine.model.replace("-", "")}-${String(Date.now()).slice(-5)}`;

    ctx.fillStyle = "#101712";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const wash = ctx.createRadialGradient(820, 60, 10, 820, 60, 520);
    wash.addColorStop(0, style.soft);
    wash.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(190, 216, 201, 0.13)";
    ctx.lineWidth = 1;
    ctx.strokeRect(22.5, 22.5, 995, 655);
    ctx.strokeStyle = style.color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(22, 22);
    ctx.lineTo(196, 22);
    ctx.moveTo(844, 677);
    ctx.lineTo(1017, 677);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = style.color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(58, 54);
    ctx.lineTo(68, 54);
    ctx.lineTo(73, 41);
    ctx.lineTo(81, 65);
    ctx.lineTo(89, 48);
    ctx.lineTo(94, 57);
    ctx.lineTo(106, 57);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#dbe8df";
    ctx.font = "600 17px 'Courier New', monospace";
    ctx.letterSpacing = "2px";
    ctx.fillText("SONICDX / DIAGNOSTIC RECORD", 120, 60);
    ctx.fillStyle = "rgba(147, 170, 158, 0.7)";
    ctx.font = "11px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(cardNumber, 974, 49);
    ctx.fillText(`M-04 / ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`, 974, 66);
    ctx.textAlign = "left";

    ctx.strokeStyle = "rgba(190, 216, 201, 0.12)";
    ctx.beginPath();
    ctx.moveTo(58, 88);
    ctx.lineTo(974, 88);
    ctx.stroke();

    ctx.fillStyle = style.color;
    ctx.font = "10px 'Courier New', monospace";
    ctx.fillText(style.code, 58, 128);
    ctx.fillStyle = "#e5efe8";
    ctx.font = "600 42px 'SonicSC', 'Microsoft YaHei', 'PingFang SC', sans-serif";
    const headline =
      result.kind === "correct"
        ? "故障确认"
        : result.kind === "wrong"
          ? "声纹不匹配"
          : result.kind === "placement"
            ? "测点无效"
            : "增益超限";
    ctx.fillText(headline, 58, 174);

    let description = "";
    if (result.kind === "correct") {
      description = `${actual.label}特征吻合 · ${machine.faultName}`;
    } else if (result.kind === "wrong") {
      description = `实测特征更接近「${actual.label}」，而非「${selected.label}」。`;
    } else if (result.kind === "placement") {
      description = `「${point?.label || "当前测点"}」偏离主振源，声纹已被背景噪声掩蔽。`;
    } else {
      description = `前置增益 ${result.gain}%，越过 72% 安全线，削波产生了虚假谐波。`;
    }
    ctx.fillStyle = "rgba(190, 210, 199, 0.72)";
    ctx.font = "14px 'SonicSC', 'Microsoft YaHei', 'PingFang SC', sans-serif";
    ctx.fillText(description, 58, 203);

    ctx.fillStyle = "rgba(147, 170, 158, 0.62)";
    ctx.font = "9px 'Courier New', monospace";
    ctx.fillText("CAPTURED SIGNATURE / 4.2 SEC", 58, 239);
    ctx.textAlign = "right";
    ctx.fillText(
      result.kind === "placement" ? "LOW COHERENCE" : "NORMALIZED / DC REMOVED",
      974,
      239,
    );
    ctx.textAlign = "left";
    roundedRect(ctx, 57, 250, 917, 126, 2);
    ctx.fillStyle = "rgba(5, 10, 7, 0.38)";
    ctx.fill();
    ctx.strokeStyle = "rgba(190, 216, 201, 0.08)";
    ctx.stroke();
    roundedRect(ctx, 57, 250, 917, 126, 2);
    ctx.strokeStyle = style.color;
    ctx.globalAlpha = 0.19;
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawSignature(
      ctx,
      77,
      260,
      877,
      104,
      result.actualType,
      result.kind === "placement" ? "fuzzy" : result.kind === "overgain" ? "overgain" : "clean",
    );

    const featureRows =
      result.kind === "placement"
        ? [["稳态连续能量", 29], ["周期冲击指数", 24], ["宽频摩擦指数", 31]]
        : [
            ["稳态连续能量", result.actualType === "continuous" ? 92 : 17],
            ["周期冲击指数", result.actualType === "impact" ? 94 : 15],
            ["宽频摩擦指数", result.actualType === "friction" ? 90 : 19],
          ];

    featureRows.forEach(([label, score], index) => {
      const y = 418 + index * 38;
      ctx.fillStyle = "rgba(196, 216, 204, 0.58)";
      ctx.font = "11px 'SonicSC', 'Microsoft YaHei', 'PingFang SC', sans-serif";
      ctx.fillText(label, 58, y);
      roundedRect(ctx, 202, y - 9, 354, 5, 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
      ctx.fill();
      roundedRect(ctx, 202, y - 9, 354 * (score / 100), 5, 2);
      ctx.fillStyle = style.color;
      ctx.globalAlpha = result.kind === "placement" ? 0.4 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(222, 237, 227, 0.76)";
      ctx.font = "9px 'Courier New', monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${score}%`, 593, y);
    });
    ctx.textAlign = "left";

    const meta = [
      ["EQUIPMENT", machine.name],
      ["MODEL / SN", `${machine.model} / ${machine.serial}`],
      ["SENSOR POINT", point?.label || "未贴附"],
      ["LOAD / GAIN", `${result.load}% / ${result.gain}%`],
    ];
    ctx.strokeStyle = "rgba(190, 216, 201, 0.09)";
    ctx.beginPath();
    ctx.moveTo(624, 399);
    ctx.lineTo(624, 507);
    ctx.stroke();
    meta.forEach(([label, value], index) => {
      const y = 418 + index * 30;
      ctx.fillStyle = "rgba(140, 163, 151, 0.62)";
      ctx.font = "8px 'Courier New', monospace";
      ctx.fillText(label, 653, y);
      ctx.fillStyle = "rgba(220, 235, 225, 0.78)";
      ctx.font = "11px 'SonicSC', 'Microsoft YaHei', 'PingFang SC', sans-serif";
      ctx.fillText(value, 764, y);
    });

    roundedRect(ctx, 58, 566, 916, 55, 2);
    ctx.fillStyle = style.soft;
    ctx.fill();
    ctx.strokeStyle = style.color;
    ctx.globalAlpha = 0.25;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = style.color;
    ctx.font = "600 9px 'Courier New', monospace";
    ctx.fillText(result.kind === "correct" ? "VERDICT / ACCEPTED" : "VERDICT / RECAPTURE REQUIRED", 78, 598);
    ctx.fillStyle = "rgba(207, 225, 214, 0.7)";
    ctx.font = "11px 'SonicSC', 'Microsoft YaHei', 'PingFang SC', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      result.kind === "correct" ? "判断已锁定 · 未过度增益" : "返回检测舱重新耦合后再判定",
      954,
      598,
    );
    ctx.textAlign = "left";

    ctx.fillStyle = "rgba(135, 158, 145, 0.5)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText("ALL SIGNALS SYNTHESIZED IN WEB AUDIO", 58, 654);
    ctx.textAlign = "right";
    ctx.fillText("SONICDX FIELD UNIT · CONFIDENTIAL", 974, 654);
    ctx.textAlign = "left";
  }

  function showVerdict(result) {
    const selected = FAULT_TYPES[result.selectedType];
    drawVerdictCard(result);
    dom.verdictOverlay.classList.remove("is-hidden");
    dom.verdictOverlay.setAttribute("aria-hidden", "false");
    dom.verdictSecondary.hidden = true;
    dom.verdictSecondary.style.display = "none";

    if (result.kind === "correct") {
      const last = state.machineIndex === MACHINES.length - 1;
      verdictAction = last ? "complete" : "next";
      dom.verdictPrimary.textContent = last ? "完成巡检" : "下一台设备";
    } else {
      verdictAction = "retry";
      dom.verdictPrimary.textContent = "返回重新采信";
    }

    if (result.kind !== "correct" && selected) {
      setStatus(`判定未采信：${selected.label}证据不足`);
    }
  }

  function hideVerdict() {
    dom.verdictOverlay.classList.add("is-hidden");
    dom.verdictOverlay.setAttribute("aria-hidden", "true");
  }

  function submitDiagnosis() {
    if (!state.started) {
      showToast("请先启动声学引擎，再提交诊断。");
      return;
    }
    if (!state.selectedPoint) {
      showToast("听诊器尚未贴附。请先在设备上选择一个测点。");
      return;
    }
    const selectedInput = document.querySelector('input[name="faultType"]:checked');
    if (!selectedInput) {
      showToast("请先选择一种声纹类别：连续音、冲击音或摩擦音。");
      return;
    }

    const selectedType = selectedInput.value;
    const result = {
      kind: "correct",
      selectedType,
      actualType: machine.fault,
      point: state.selectedPoint,
      gain: state.gain,
      load: state.load,
    };

    if (state.gainOver || state.gainAlerts > 0) {
      result.kind = "overgain";
      showVerdict(result);
      return;
    }
    if (state.placement === "wrong") {
      result.kind = "placement";
      showVerdict(result);
      return;
    }
    if (selectedType !== machine.fault) {
      result.kind = "wrong";
      showVerdict(result);
      return;
    }

    state.solved += 1;
    state.verdicts.push({
      machine: machine.id,
      fault: selectedType,
      point: state.selectedPoint,
      gain: state.gain,
    });
    updateSessionScore();
    setStatus(`${machine.model} 判定正确：${FAULT_TYPES[selectedType].label} / ${machine.faultName}`);
    showVerdict(result);
  }

  function showCompletion() {
    if (state.solved !== 3 || state.gainAlerts > 0) return;
    dom.completionOverlay.classList.remove("is-hidden");
    dom.completionOverlay.setAttribute("aria-hidden", "false");
    dom.finalGain.textContent = `${state.peakGain}%`;
    setStatus("巡检闭环：3/3 判断正确，增益未超限");
  }

  function resetSession() {
    state.machineIndex = 0;
    state.selectedPoint = null;
    state.placement = "none";
    state.clarity = 0;
    state.gain = 34;
    state.load = 64;
    state.mute = false;
    state.solved = 0;
    state.verdicts = [];
    state.gainAlerts = 0;
    state.gainOver = false;
    state.peakGain = 34;
    state.analysisMode = "ready";

    dom.completionOverlay.classList.add("is-hidden");
    dom.completionOverlay.setAttribute("aria-hidden", "true");
    hideVerdict();
    dom.toast.classList.remove("is-visible");
    dom.muteButton?.setAttribute("aria-pressed", "false");

    engine.setMuted(false);
    engine.setGain(state.gain);
    engine.setLoad(state.load);
    engine.applyPlacement("none");
    renderMachine(0);
    engine.setMachine(MACHINES[0]);
    updateGainUI();
    updateSessionScore();
    setStatus("巡检已重置，听诊器待贴附");
  }

  function updateClock() {
    $("#clock").textContent = new Date().toLocaleTimeString("zh-CN", {
      hour12: false,
    });
  }

  async function startSession() {
    const button = $("#startButton");
    button.disabled = true;
    $("#startButtonLabel").textContent = "正在启动声学引擎";
    try {
      await engine.start(machine);
      state.started = true;
      $("#startOverlay").classList.add("is-hidden");
      updatePlacementUI();
      setStatus("声学引擎在线，等待贴附传感器");
      showToast("声学引擎已启动。点击设备测点开始采集。", 3000);
    } catch (error) {
      button.disabled = false;
      $("#startButtonLabel").textContent = "开始声纹采集";
      showToast(error.message || "音频启动失败，请检查浏览器权限。", 5000);
    }
  }

  function initialize() {
    renderMachine(0);
    updateGainUI();
    updateLoadLabels();
    updateSessionScore();
    updateClock();
    window.setInterval(updateClock, 1000);
    window.requestAnimationFrame(animationLoop);

    $("#startButton").addEventListener("click", startSession);
    $("#restartButton").addEventListener("click", () => {
      resetSession();
      showToast("已重置为第一台设备。");
    });
    $("#replayButton").addEventListener("click", () => {
      resetSession();
      showToast("新一轮巡检已开始。", 2400);
    });
    $("#muteButton").addEventListener("click", () => {
      state.mute = !state.mute;
      engine.setMuted(state.mute);
      $("#muteButton").setAttribute("aria-pressed", String(state.mute));
      $("#muteButton").setAttribute("aria-label", state.mute ? "取消静音" : "静音");
      setStatus(state.mute ? "监听已静音" : "监听已恢复");
    });
    dom.gainSlider.addEventListener("input", handleGainInput);
    dom.loadSlider.addEventListener("input", handleLoadInput);
    dom.diagnoseButton.addEventListener("click", submitDiagnosis);
    dom.verdictPrimary.addEventListener("click", () => {
      hideVerdict();
      if (verdictAction === "next") {
        renderMachine(state.machineIndex + 1);
        engine.applyPlacement("none");
        setStatus(`已切换至 ${machine.title}，等待贴附传感器`);
      } else if (verdictAction === "complete") {
        showCompletion();
      }
    });
    dom.verdictSecondary.addEventListener("click", hideVerdict);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dom.verdictOverlay.classList.contains("is-hidden")) {
        hideVerdict();
      }
    });

    window.__sonicDx = {
      getState() {
        return {
          started: state.started,
          machineId: machine.id,
          fault: machine.fault,
          correctPoint: machine.correctPoint,
          selectedPoint: state.selectedPoint,
          placement: state.placement,
          clarity: state.clarity,
          solved: state.solved,
          gain: state.gain,
          load: state.load,
          gainAlerts: state.gainAlerts,
          peakGain: state.peakGain,
          audioState: engine.ctx?.state || "closed",
          analyserRms: engine.getFrame().rms,
        };
      },
      canvases() {
        return [dom.scopeCanvas, dom.pressureCanvas, dom.verdictCanvas].map((canvas) => ({
          id: canvas.id,
          width: canvas.width,
          height: canvas.height,
        }));
      },
    };
  }

  initialize();
})();
