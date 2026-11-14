import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEMPLATES,
  applyTemplate,
  createCue,
  createInitialState,
  entranceState,
  entranceTransform,
  getActiveCue,
  parseProject,
  serializeProject,
  Clock,
} from '../js/core.js';

test('初始工程包含三条不同模板的字幕', () => {
  const state = createInitialState();
  assert.equal(state.cues.length, 3);
  assert.deepEqual(
    state.cues.map((cue) => cue.templateId),
    ['news', 'drama', 'card'],
  );
  assert.ok(state.cues.every((cue) => cue.text.length > 0));
});

test('模板切换保留文本与时间区间，只替换外观字段', () => {
  const state = createInitialState();
  for (const cue of state.cues) {
    const original = { text: cue.text, start: cue.start, end: cue.end, id: cue.id };
    for (const templateId of Object.keys(TEMPLATES)) {
      const switched = applyTemplate(cue, templateId);
      assert.equal(switched.text, original.text);
      assert.equal(switched.start, original.start);
      assert.equal(switched.end, original.end);
      assert.equal(switched.id, original.id);
      assert.equal(switched.templateId, templateId);
      assert.equal(switched.fontSize, TEMPLATES[templateId].fontSize);
      assert.deepEqual(switched.box, TEMPLATES[templateId].box);
      assert.deepEqual(switched.stroke, TEMPLATES[templateId].stroke);
      assert.equal(switched.entrance, TEMPLATES[templateId].entrance);
    }
  }
});

test('连续在三个模板间来回切换，文本始终不丢失', () => {
  let cue = createCue({ text: '关键台词不能丢', start: 2, end: 6 });
  const order = ['card', 'drama', 'news', 'card', 'drama'];
  for (const templateId of order) {
    cue = applyTemplate(cue, templateId);
    assert.equal(cue.text, '关键台词不能丢');
  }
  assert.equal(cue.templateId, 'drama');
  assert.equal(cue.entrance, TEMPLATES.drama.entrance);
});

test('时钟：播放按墙钟增量推进，暂停即冻结，seek 可跳转', () => {
  const clock = new Clock(15);
  assert.equal(clock.playing, false);

  clock.play(1000);
  assert.equal(clock.playing, true);
  clock.tick(2000); // +1s
  clock.tick(3500); // +1.5s
  assert.ok(Math.abs(clock.time - 2.5) < 1e-9);

  clock.pause();
  const frozen = clock.time;
  clock.tick(9000);
  assert.equal(clock.time, frozen);

  clock.seek(7.25);
  assert.equal(clock.time, 7.25);
  clock.seek(999);
  assert.equal(clock.time, 15);
  clock.seek(-5);
  assert.equal(clock.time, 0);
});

test('时钟播到节目结尾自动停止，重新播放从头开始', () => {
  const clock = new Clock(10);
  clock.play(0);
  clock.tick(15000);
  assert.equal(clock.time, 10);
  assert.equal(clock.playing, false);
  clock.play(20000);
  assert.equal(clock.time, 0);
  assert.equal(clock.playing, true);
});

test('入场状态由时间轴推导：区间外不可见，区间内进度单调递增', () => {
  const cue = createCue({ start: 2, end: 6, entrance: 'fadeIn', text: '测试字幕' });
  assert.equal(entranceState(cue, 1.9).visible, false);
  assert.equal(entranceState(cue, 6.1).visible, false);

  const s1 = entranceState(cue, 2.1);
  const s2 = entranceState(cue, 2.4);
  assert.equal(s1.visible, true);
  assert.ok(s2.progress > s1.progress);
  assert.equal(entranceState(cue, 4).progress, 1);

  const cut = createCue({ start: 0, end: 2, entrance: 'cut', text: '硬切' });
  assert.equal(entranceTransform(cut, entranceState(cut, 0.05)).opacity, 0);
  assert.equal(entranceTransform(cut, entranceState(cut, 1)).opacity, 1);
});

test('打字机入场的可见字符数随时间增长', () => {
  const cue = createCue({ start: 0, end: 3, entrance: 'typewriter', text: '一二三四五六' });
  const mid = entranceTransform(cue, entranceState(cue, 0.45));
  assert.ok(mid.chars > 0 && mid.chars < cue.text.length);
  const end = entranceTransform(cue, entranceState(cue, 2));
  assert.equal(end.chars, cue.text.length);
});

test('getActiveCue 按时间轴返回当前字幕', () => {
  const { cues } = createInitialState();
  assert.equal(getActiveCue(cues, 1).id, 'cue-1');
  assert.equal(getActiveCue(cues, 7).id, 'cue-2');
  assert.equal(getActiveCue(cues, 12).id, 'cue-3');
  assert.equal(getActiveCue(cues, 4.8), null);
});

test('工程 JSON 序列化与反序列化无损往返', () => {
  const state = createInitialState();
  const json = serializeProject(state);
  const parsed = parseProject(json);
  assert.equal(parsed.duration, state.duration);
  assert.deepEqual(parsed.cues, state.cues);
  assert.match(json, /"kind": "subtitle-studio-project"/);
  assert.throws(() => parseProject('{"kind":"other"}'));
});
