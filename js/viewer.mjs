import {
  DEFAULT_PARAMS,
  buildToolGeometry,
  lightDirection,
  hexToRgb,
  toOBJ,
} from './geometry.mjs';

const canvas = document.getElementById('view');
const gl = canvas.getContext('webgl', {
  antialias: true,
  preserveDrawingBuffer: true,
});

const VERT = [
  'attribute vec3 aPos;',
  'attribute vec3 aNor;',
  'uniform mat4 uProj;',
  'uniform mat4 uModel;',
  'uniform mat3 uNormalMat;',
  'varying vec3 vNor;',
  'void main() {',
  '  vNor = normalize(uNormalMat * aNor);',
  '  gl_Position = uProj * uModel * vec4(aPos, 1.0);',
  '}',
].join('\n');

const FRAG = [
  'precision mediump float;',
  'varying vec3 vNor;',
  'uniform vec3 uColor;',
  'uniform vec3 uLightDir;',
  'uniform float uAmbient;',
  'void main() {',
  '  vec3 n = normalize(vNor);',
  '  float diff = max(dot(n, uLightDir), 0.0);',
  '  vec3 h = normalize(uLightDir + vec3(0.0, 0.0, 1.0));',
  '  float spec = pow(max(dot(n, h), 0.0), 28.0) * 0.35;',
  '  vec3 col = uColor * (uAmbient + (1.0 - uAmbient) * diff) + vec3(spec);',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n');

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh));
  }
  return sh;
}

const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
gl.useProgram(prog);

const loc = {
  aPos: gl.getAttribLocation(prog, 'aPos'),
  aNor: gl.getAttribLocation(prog, 'aNor'),
  uProj: gl.getUniformLocation(prog, 'uProj'),
  uModel: gl.getUniformLocation(prog, 'uModel'),
  uNormalMat: gl.getUniformLocation(prog, 'uNormalMat'),
  uColor: gl.getUniformLocation(prog, 'uColor'),
  uLightDir: gl.getUniformLocation(prog, 'uLightDir'),
  uAmbient: gl.getUniformLocation(prog, 'uAmbient'),
};

const posBuf = gl.createBuffer();
const norBuf = gl.createBuffer();
gl.enableVertexAttribArray(loc.aPos);
gl.enableVertexAttribArray(loc.aNor);
gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);

const state = {
  ...DEFAULT_PARAMS,
  yaw: 0.6,
  pitch: -0.35,
  geo: null,
};

function rebuild() {
  state.geo = buildToolGeometry(state);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, state.geo.positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
  gl.bufferData(gl.ARRAY_BUFFER, state.geo.normals, gl.STATIC_DRAW);
}

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

// model = translate(0,0,-4.2) * rotX(pitch) * rotY(yaw)
function modelMatrix(yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return new Float32Array([
    cy, sp * sy, -cp * sy, 0,
    0, cp, sp, 0,
    sy, -sp * cy, cp * cy, 0,
    0, 0, -4.2, 1,
  ]);
}

function render() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr) || canvas.width;
  const h = Math.round(canvas.clientHeight * dpr) || canvas.height;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.086, 0.094, 0.114, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const model = modelMatrix(state.yaw, state.pitch);
  gl.uniformMatrix4fv(
    loc.uProj,
    false,
    perspective(0.7, canvas.width / canvas.height, 0.1, 20)
  );
  gl.uniformMatrix4fv(loc.uModel, false, model);
  gl.uniformMatrix3fv(
    loc.uNormalMat,
    false,
    new Float32Array([
      model[0], model[1], model[2],
      model[4], model[5], model[6],
      model[8], model[9], model[10],
    ])
  );
  gl.uniform3fv(loc.uColor, hexToRgb(state.color));
  gl.uniform3fv(
    loc.uLightDir,
    lightDirection(state.lightAzimuth, state.lightElevation)
  );
  gl.uniform1f(loc.uAmbient, 0.28);

  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
  gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, state.geo.positions.length / 3);
}

// Drag to rotate.
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  state.yaw += (e.clientX - lastX) * 0.01;
  state.pitch += (e.clientY - lastY) * 0.01;
  state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener('pointerup', () => {
  dragging = false;
});

// Controls.
function bind(id, key, fmt, onChange) {
  const input = document.getElementById(id);
  const label = document.getElementById(id + 'Val');
  input.value = state[key];
  const update = () => {
    state[key] = input.type === 'color' ? input.value : Number(input.value);
    if (label) label.textContent = fmt ? fmt(state[key]) : state[key];
    onChange();
  };
  input.addEventListener('input', update);
  update();
}

bind('depth', 'depth', (v) => v.toFixed(2), rebuild);
bind('bevel', 'bevel', (v) => v.toFixed(3), rebuild);
bind('color', 'color', null, () => {});
bind('azimuth', 'lightAzimuth', (v) => `${v}°`, () => {});
bind('elevation', 'lightElevation', (v) => `${v}°`, () => {});

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById('exportObj').addEventListener('click', () => {
  download(new Blob([toOBJ(state.geo)], { type: 'text/plain' }), 'tool-icon.obj');
});
document.getElementById('exportPng').addEventListener('click', () => {
  render();
  canvas.toBlob((blob) => download(blob, 'tool-icon.png'), 'image/png');
});

rebuild();
(function loop() {
  render();
  requestAnimationFrame(loop);
})();
