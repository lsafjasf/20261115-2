// 姿态数据与挥手动画生成（浏览器与 Node 共用的纯数据模块，无 DOM 依赖）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pose = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEG = Math.PI / 180;

  // 可拖拽关节点
  const JOINTS = [
    'hip', 'chest', 'head',
    'elbowL', 'handL', 'elbowR', 'handR',
    'kneeL', 'footL', 'kneeR', 'footR',
  ];

  // 平移时带动全身的关节（躯干根节点）
  const ROOT_JOINTS = ['hip', 'chest'];

  const HEAD_RADIUS = 24;

  function basePose() {
    return {
      hip:    { x: 240, y: 300 },
      chest:  { x: 240, y: 218 },
      head:   { x: 240, y: 176 },
      elbowL: { x: 206, y: 258 },
      handL:  { x: 196, y: 298 },
      elbowR: { x: 268, y: 192 },
      handR:  { x: 292, y: 158 },
      kneeL:  { x: 226, y: 350 },
      footL:  { x: 216, y: 396 },
      kneeR:  { x: 254, y: 350 },
      footR:  { x: 264, y: 396 },
    };
  }

  function polar(origin, angleDeg, len) {
    return {
      x: origin.x + Math.cos(angleDeg * DEG) * len,
      y: origin.y + Math.sin(angleDeg * DEG) * len,
    };
  }

  function clonePose(pose) {
    const copy = {};
    for (const j of JOINTS) copy[j] = { x: pose[j].x, y: pose[j].y };
    return copy;
  }

  // 12 帧挥手动画：右臂举起，前臂左右摆动两个周期，身体轻微摇摆起伏
  function makeWaveFrames(count) {
    count = count || 12;
    const frames = [];
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2 * 2; // 两个挥手周期
      const pose = basePose();
      const sway = Math.sin(t);
      const bob = Math.sin(t * 2);

      // 身体整体摇摆；脚钉在地面上，膝盖以上起伏
      const dx = 4 * sway;
      const dy = 2.5 * bob;
      for (const j of JOINTS) {
        pose[j].x += dx;
        if (j !== 'footL' && j !== 'footR') pose[j].y += dy;
      }

      // 右臂：肘部固定在举起位置附近，前臂大幅左右挥动
      const elbow = polar(pose.chest, -38 + 3 * sway, 40);
      const hand = polar(elbow, -95 + 28 * sway, 38);
      pose.elbowR = elbow;
      pose.handR = hand;

      // 左臂自然轻摆，头部跟随
      pose.handL.x += 3 * sway;
      pose.head.x += 2.5 * sway;

      frames.push(pose);
    }
    return frames;
  }

  // 骨架笔画列表：折线数组 + 头部圆，浏览器 Canvas 与 Node 预览渲染共用同一几何
  function strokes(pose) {
    return {
      lines: [
        [pose.hip, pose.chest],                                  // 脊柱
        [pose.chest, pose.elbowL, pose.handL],                   // 左臂
        [pose.chest, pose.elbowR, pose.handR],                   // 右臂
        [pose.hip, pose.kneeL, pose.footL],                      // 左腿
        [pose.hip, pose.kneeR, pose.footR],                      // 右腿
      ],
      head: { center: pose.head, radius: HEAD_RADIUS },
    };
  }

  return { JOINTS, ROOT_JOINTS, HEAD_RADIUS, basePose, clonePose, makeWaveFrames, polar, strokes };
});
