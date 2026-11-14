import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChamberSim } from '../src/engine.js';
import { ChamberRenderer } from '../src/render.js';
import { FlowAudio } from '../src/audio.js';

// 最小 Canvas 2D 打桩，覆盖渲染器实际调用的方法
function makeCtxStub() {
  const noop = () => {};
  return new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient')
          return () => ({ addColorStop: noop });
        return typeof prop === 'string' ? noop : undefined;
      },
      set() {
        return true;
      },
    },
  );
}

test('渲染器在完整生命周期内不抛错（含封闭与稳定状态）', () => {
  const canvas = { width: 960, height: 440, getContext: () => makeCtxStub() };
  globalThis.performance = { now: () => 0 };
  const renderer = new ChamberRenderer(canvas);
  const sim = new ChamberSim();
  assert.doesNotThrow(() => renderer.render(sim.snapshot()));
  sim.setSupplyTarget(1);
  while (!sim.sealed) sim.step();
  assert.doesNotThrow(() => renderer.render(sim.snapshot()));
  while (sim.sealed) sim.step();
  for (let i = 0; i < 400; i += 1) {
    sim.setSupplyTarget(0.15);
    sim.step();
  }
  assert.doesNotThrow(() => renderer.render(sim.snapshot()));
});

test('FlowAudio 在无 AudioContext 环境安全降级，打桩后可更新流量与静音', () => {
  const audio = new FlowAudio();
  const sim = new ChamberSim();
  assert.doesNotThrow(() => audio.update(5, 2, false));

  const gainNodes = [];
  const oscNodes = [];
  class FakeGain {
    constructor() {
      this.gain = { value: 1, setTargetAtTime() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
      gainNodes.push(this);
    }
    connect() {
      return this;
    }
  }
  class FakeOsc {
    constructor() {
      this.frequency = { value: 0, setTargetAtTime() {} };
      this.type = '';
      oscNodes.push(this);
    }
    connect() {
      return this;
    }
    start() {}
    stop() {}
  }
  class FakeFilter {
    constructor() {
      this.frequency = { value: 0, setTargetAtTime() {} };
      this.Q = { value: 0 };
      this.type = '';
    }
    connect() {
      return this;
    }
  }
  class FakeBufferSource {
    constructor() {
      this.buffer = null;
      this.loop = false;
    }
    connect() {
      return this;
    }
    start() {}
  }
  globalThis.window = {
    AudioContext: class {
      constructor() {
        this.sampleRate = 8000;
        this.currentTime = 0;
        this.state = 'running';
        this.destination = {};
      }
      createGain() {
        return new FakeGain();
      }
      createOscillator() {
        return new FakeOsc();
      }
      createBiquadFilter() {
        return new FakeFilter();
      }
      createBufferSource() {
        return new FakeBufferSource();
      }
      createBuffer(channels, len) {
        return { getChannelData: () => new Float32Array(len) };
      }
      resume() {}
    },
  };
  audio.ensure();
  assert.ok(audio.ctx);
  assert.doesNotThrow(() => {
    audio.update(10, 0, false);
    audio.update(0, 8, true);
    audio.click();
    audio.setMuted(true);
    audio.setMuted(false);
  });
  assert.equal(audio.muted, false);
});
