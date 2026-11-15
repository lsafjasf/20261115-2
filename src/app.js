/* 主控：绑定 UI、驱动固定步长物理循环、转发声音事件、Canvas 渲染。 */
(function () {
  'use strict';
  const engine = window.MoonLift;
  const renderer = window.MoonLiftRenderer.createRenderer(
    document.getElementById('scene'), engine);
  const audio = window.MoonLiftAudio.createAudio();

  const game = engine.createGame();
  const STEP = 1 / 60;
  let accumulator = 0;
  let lastTime = performance.now();

  const $ = (id) => document.getElementById(id);

  function feedback(result, successText) {
    const box = $('feedback');
    if (result.ok) {
      box.textContent = successText || '操作成功';
      box.className = 'feedback ok';
    } else {
      box.textContent = `失败：${reasonText(result.reason)}`;
      box.className = 'feedback bad';
    }
  }

  function reasonText(reason) {
    const map = {
      'pressure-imbalance': '气闸压力未平衡，门已锁定',
      'plan-must-cover-floors-1-2-3': '停靠顺序必须恰好包含 F1、F2、F3',
      'plan-must-have-three-floors': '需要三个停靠层',
      'loading-only-on-ground': '只有停在底层才能装载',
      'buffer-only-on-ground': '缓冲器只能在底层更换',
      'doors-open': '请先关闭门',
      'car-busy': '电梯运行中',
      'not-docked': '电梯尚未精确停靠',
      'already-open': '门已经打开',
      'already-balanced': '气闸已平衡',
      'cannot-brake': '当前状态无法制动',
      'not-in-impact': '无需回调',
      'cannot-creep': '当前状态无法回调',
      'game-over': '本局已结束，请重置',
      'plan-complete': '停靠计划已全部完成',
    };
    return map[reason] || reason;
  }

  function bindControls() {
    $('start-audio').addEventListener('click', () => audio.resume());

    engine.BUFFER_IDS.forEach((id) => {
      $(`buffer-${id}`).addEventListener('click', () => {
        audio.resume();
        feedback(engine.setBuffer(game, id),
          `已安装${engine.BUFFERS[id].name}`);
      });
    });

    engine.EQUIP_IDS.forEach((id) => {
      $(`load-${id}`).addEventListener('click', () => {
        audio.resume();
        const result = engine.toggleLoad(game, id);
        if (result.ok) {
          const eq = engine.EQUIPMENT[id];
          const on = game.cargo.includes(id);
          feedback(result, on
            ? `已装载${eq.name}（${eq.weight}kg），制动距离 ${result.brakeDistance}m`
            : `已卸下${eq.name}`);
        } else feedback(result);
      });
    });

    $('apply-plan').addEventListener('click', () => {
      const floors = ['plan-1', 'plan-2', 'plan-3']
        .map((id) => Number($(id).value));
      feedback(engine.setDockingPlan(game, floors), '停靠顺序已分配');
    });

    $('go-up').addEventListener('click', () => {
      audio.resume();
      feedback(engine.startMove(game, 1), '电机启动，上升');
    });
    $('go-down').addEventListener('click', () => {
      audio.resume();
      feedback(engine.startMove(game, -1), '电机启动，下降');
    });
    $('brake').addEventListener('click', () => {
      const result = engine.applyBrake(game);
      feedback(result, '制动器启动');
    });
    $('creep-up').addEventListener('click', () =>
      feedback(engine.creepToFloor(game, 1), '低速向上回调'));
    $('creep-down').addEventListener('click', () =>
      feedback(engine.creepToFloor(game, -1), '低速向下回调'));
    $('pressure').addEventListener('click', () =>
      feedback(engine.startPressure(game), '气闸开始压力平衡（4 秒）'));
    $('open-door').addEventListener('click', () => {
      const result = engine.openDoor(game);
      feedback(result, '门已开启，自动卸载匹配设备');
    });
    $('close-door').addEventListener('click', () =>
      feedback(engine.closeDoor(game), '门已关闭'));
    $('reset').addEventListener('click', () => location.reload());
  }

  function pumpEvents() {
    const events = engine.drainEvents(game);
    events.forEach((event) => audio.handleEvent(event));
  }

  function refreshControls() {
    const onGround = game.car.y === 0 && game.car.status === 'idle';
    const docked = engine.currentFloorIndex(game) >= 0 && game.car.status === 'idle';
    const moving = ['accelerating', 'cruising'].includes(game.car.status);
    $('go-up').disabled = !onGround || game.doors.open;
    $('go-down').disabled = !docked || onGround || game.doors.open;
    $('brake').disabled = !moving;
    $('creep-up').disabled = game.car.status !== 'undershoot'
      && game.car.status !== 'impact';
    $('creep-down').disabled = $('creep-up').disabled;
    $('pressure').disabled = !docked || game.doors.open
      || game.doors.pressure[engine.currentFloorIndex(game)] >= engine.PRESSURE_TIME;
    // 开门按钮保持可点：未平衡时由引擎拒绝并提示，便于复现“提前开门失败”
    $('open-door').disabled = game.doors.open;
    $('close-door').disabled = !game.doors.open;

    const floorIdx = engine.nearestFloorIndex(game);
    const pressureRatio = engine.pressureProgress(game, floorIdx);
    $('pressure-bar').style.width = `${pressureRatio * 100}%`;
    $('pressure-label').textContent =
      `${floorIdx === 0 ? 'B1' : `F${floorIdx}`} 气压 ${(pressureRatio * 100).toFixed(0)}%`;
  }

  function frame(now) {
    const frameSeconds = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += frameSeconds;
    while (accumulator >= STEP) {
      engine.step(game, STEP);
      accumulator -= STEP;
    }
    pumpEvents();
    audio.updateMotor(game);
    renderer.render(game);
    refreshControls();
    requestAnimationFrame(frame);
  }

  bindControls();
  engine.setDockingPlan(game, [1, 2, 3]);
  renderer.render(game);
  refreshControls();
  requestAnimationFrame(frame);
})();
