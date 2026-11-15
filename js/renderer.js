import { PANEL_COUNT, PANEL_HEIGHT, PANEL_WIDTH } from "./artwork.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

const PANEL_ANGLES = [-0.3, 0.27, -0.22, 0.31];
const PANEL_W = 2.4;
const PANEL_H = (PANEL_HEIGHT / PANEL_WIDTH) * PANEL_W;
const CAMERA_DISTANCE = 13.2;

const VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec2 aUv;
  attribute vec2 aPanelUv;
  uniform mat4 uMvp;
  varying vec2 vUv;
  varying vec2 vPanelUv;
  void main() {
    gl_Position = uMvp * vec4(aPosition, 1.0);
    vUv = aUv;
    vPanelUv = aPanelUv;
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uBrightness;
  uniform float uShadeLeft;
  uniform float uShadeRight;
  uniform float uCrease;
  varying vec2 vUv;
  varying vec2 vPanelUv;

  void main() {
    vec4 swatch = texture2D(uTexture, vUv);
    float leftEdge = 1.0 - smoothstep(0.0, 0.115, vPanelUv.x);
    float rightEdge = smoothstep(0.885, 1.0, vPanelUv.x);
    float leftFall = pow(leftEdge, 1.55);
    float rightFall = pow(rightEdge, 1.55);
    float shade = min(
      0.64,
      (uShadeLeft * leftFall + uShadeRight * rightFall) * 2.1
    );
    float seam = max(
      smoothstep(0.0055, 0.0, vPanelUv.x),
      smoothstep(0.9945, 1.0, vPanelUv.x)
    );

    vec3 color = swatch.rgb * uBrightness;
    color = mix(color, color * vec3(0.46, 0.44, 0.40), shade);
    color *= 1.0 - seam * uCrease;
    color += vec3(0.018, 0.012, 0.004) * max(uBrightness - 0.92, 0.0);
    gl_FragColor = vec4(color, swatch.a);
  }
`;

const SHADOW_VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec2 aUv;
  uniform mat4 uMvp;
  varying vec2 vUv;
  void main() {
    gl_Position = uMvp * vec4(aPosition, 1.0);
    vUv = aUv;
  }
`;

const SHADOW_FRAGMENT_SHADER = `
  precision mediump float;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float radius = length((vUv - vec2(0.5)) * vec2(1.35, 1.0));
    float shadow = 1.0 - smoothstep(0.08, 0.52, radius);
    gl_FragColor = vec4(0.105, 0.093, 0.072, shadow * uAlpha);
  }
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function compileProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

function createGeometry() {
  const starts = [];
  const corners = [];
  const normals = [];
  let cursor = [-2 * PANEL_W, 0, 0];

  for (let panel = 0; panel < PANEL_COUNT; panel += 1) {
    const angle = PANEL_ANGLES[panel];
    const direction = [Math.cos(angle), 0, Math.sin(angle)];
    starts.push(cursor);
    [
      [0, PANEL_H / 2],
      [0, -PANEL_H / 2],
      [PANEL_W, -PANEL_H / 2],
      [PANEL_W, PANEL_H / 2],
    ].forEach(([x, y]) => {
      corners.push([
        cursor[0] + direction[0] * x,
        y,
        cursor[2] + direction[2] * x,
      ]);
    });
    normals.push([-Math.sin(angle), 0, Math.cos(angle)]);
    cursor = [cursor[0] + direction[0] * PANEL_W, 0, cursor[2] + direction[2] * PANEL_W];
  }

  const minX = Math.min(...corners.map((point) => point[0]));
  const maxX = Math.max(...corners.map((point) => point[0]));
  const minZ = Math.min(...corners.map((point) => point[2]));
  const maxZ = Math.max(...corners.map((point) => point[2]));
  const center = [(minX + maxX) / 2, 0, (minZ + maxZ) / 2];

  const centered = corners.map((point) => [
    point[0] - center[0],
    point[1],
    point[2] - center[2],
  ]);
  const centeredStarts = starts.map((point) => [
    point[0] - center[0],
    0,
    point[2] - center[2],
  ]);

  const vertexData = [];
  const panelCenters = [];
  for (let panel = 0; panel < PANEL_COUNT; panel += 1) {
    const base = panel * 4;
    const panelCorners = centered.slice(base, base + 4);
    const centerPoint = panelCorners.reduce(
      (sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4, sum[2] + point[2] / 4],
      [0, 0, 0],
    );
    panelCenters.push(centerPoint);

    const uvs = [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    panelCorners.forEach((point, index) => {
      const local = uvs[index];
      vertexData.push(
        point[0],
        point[1],
        point[2],
        (panel + local[0]) / PANEL_COUNT,
        local[1],
        local[0],
        local[1],
      );
    });
  }

  return {
    vertexData,
    indices: new Uint16Array([
      0, 1, 2, 0, 2, 3,
      4, 5, 6, 4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
    ]),
    normals,
    panelCenters,
    centeredStarts,
    center,
  };
}

function createShadowGeometry(light) {
  const sx = -light[0] * 0.75;
  const sz = -light[2] * 0.75;
  const y = -PANEL_H / 2 - 0.18;
  const width = 7.8;
  const depth = 4.4;
  const corners = [
    [-width, y, -depth],
    [-width, y, depth],
    [width, y, depth],
    [width, y, -depth],
  ].map((point) => [point[0] + sx, point[1], point[2] + sz]);
  const vertices = [];
  const uvs = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ];
  corners.forEach((point, index) => {
    vertices.push(point[0], point[1], point[2], uvs[index][0], uvs[index][1]);
  });
  return {
    vertices,
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}

export class FoldRenderer {
  constructor(canvas, artwork) {
    this.canvas = canvas;
    this.artwork = artwork;
    this.gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!this.gl) throw new Error("当前浏览器不支持 WebGL Canvas。");

    this.program = compileProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.shadowProgram = compileProgram(
      this.gl,
      SHADOW_VERTEX_SHADER,
      SHADOW_FRAGMENT_SHADER,
    );
    this.locations = this.getLocations(this.program, true);
    this.shadowLocations = this.getLocations(this.shadowProgram, false);
    this.geometry = createGeometry();
    this.buffers = this.createPanelBuffers();
    this.texture = this.createTexture(artwork.canvas);
    this.width = 1;
    this.height = 1;
    this.lastInfo = null;
  }

  getLocations(program, textured) {
    const gl = this.gl;
    return {
      position: gl.getAttribLocation(program, "aPosition"),
      uv: gl.getAttribLocation(program, "aUv"),
      panelUv: textured ? gl.getAttribLocation(program, "aPanelUv") : -1,
      mvp: gl.getUniformLocation(program, "uMvp"),
      texture: textured ? gl.getUniformLocation(program, "uTexture") : null,
      brightness: textured ? gl.getUniformLocation(program, "uBrightness") : null,
      shadeLeft: textured ? gl.getUniformLocation(program, "uShadeLeft") : null,
      shadeRight: textured ? gl.getUniformLocation(program, "uShadeRight") : null,
      crease: textured ? gl.getUniformLocation(program, "uCrease") : null,
      shadowAlpha: textured ? null : gl.getUniformLocation(program, "uAlpha"),
    };
  }

  createPanelBuffers() {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(this.geometry.vertexData),
      gl.STATIC_DRAW,
    );
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.geometry.indices, gl.STATIC_DRAW);
    return { buffer, indexBuffer };
  }

  createTexture(source) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.gl.viewport(0, 0, width, height);
    return { width: this.width, height: this.height, dpr };
  }

  getCamera(state) {
    const { yaw, pitch } = state;
    const camera = [
      Math.sin(yaw) * Math.cos(pitch) * CAMERA_DISTANCE,
      Math.sin(pitch) * CAMERA_DISTANCE,
      Math.cos(yaw) * Math.cos(pitch) * CAMERA_DISTANCE,
    ];
    const target = [0, 0, 0];
    const forward = normalize(subtract(target, camera));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = normalize(cross(right, forward));
    return { camera, forward, right, up };
  }

  getFocal(state) {
    return Math.min(this.width * 1.35, this.height * 2.2) * (state.zoom || 1);
  }

  createMvp(camera, focal) {
    const scaleX = focal / (this.width / 2);
    const scaleY = focal / (this.height / 2);
    const { right, up, forward } = camera;
    const offsetX = -dot(camera.camera, right) * scaleX;
    const offsetY = -dot(camera.camera, up) * scaleY;
    const offsetW = -dot(camera.camera, forward);

    return new Float32Array([
      right[0] * scaleX,
      up[0] * scaleY,
      0,
      forward[0],
      right[1] * scaleX,
      up[1] * scaleY,
      0,
      forward[1],
      right[2] * scaleX,
      up[2] * scaleY,
      0,
      forward[2],
      offsetX,
      offsetY,
      0,
      offsetW,
    ]);
  }

  projectPoint(point, camera, focal) {
    const relative = subtract(point, camera.camera);
    const depth = dot(relative, camera.forward);
    return {
      x: this.width / 2 + (dot(relative, camera.right) * focal) / depth,
      y: this.height / 2 - (dot(relative, camera.up) * focal) / depth,
      depth,
    };
  }

  getLight(state) {
    const azimuth = (state.lightAz * Math.PI) / 180;
    const elevation = (state.lightEl * Math.PI) / 180;
    return normalize([
      Math.cos(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(azimuth) * Math.cos(elevation),
    ]);
  }

  getPanelLighting(light) {
    const luminance = this.geometry.normals.map((normal) =>
      clamp(dot(normal, light), 0, 1),
    );
    return this.geometry.normals.map((normal, panel) => {
      const previous = panel > 0 ? luminance[panel - 1] : luminance[panel];
      const next =
        panel < PANEL_COUNT - 1 ? luminance[panel + 1] : luminance[panel];
      const leftDifference = Math.max(0, previous - luminance[panel]);
      const rightDifference = Math.max(0, next - luminance[panel]);
      const facingAway = Math.max(0, -dot(normal, light));

      return {
        brightness: 0.845 + luminance[panel] * 0.225 + facingAway * 0.085,
        shadeLeft: clamp(0.035 + leftDifference * 0.72 + facingAway * 0.14, 0, 0.34),
        shadeRight: clamp(
          0.035 + rightDifference * 0.72 + facingAway * 0.14,
          0,
          0.34,
        ),
        crease: 0.2 + facingAway * 0.12,
      };
    });
  }

  bindPanelAttributes() {
    const gl = this.gl;
    const stride = 7 * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.buffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.locations.uv);
    gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(this.locations.panelUv);
    gl.vertexAttribPointer(this.locations.panelUv, 2, gl.FLOAT, false, stride, 20);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indexBuffer);
  }

  drawShadow(mvp, light) {
    const gl = this.gl;
    const geometry = createShadowGeometry(light);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.vertices), gl.DYNAMIC_DRAW);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);

    gl.useProgram(this.shadowProgram);
    gl.uniformMatrix4fv(this.shadowLocations.mvp, false, mvp);
    gl.uniform1f(this.shadowLocations.shadowAlpha, 0.16);
    gl.enableVertexAttribArray(this.shadowLocations.position);
    gl.vertexAttribPointer(this.shadowLocations.position, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(this.shadowLocations.uv);
    gl.vertexAttribPointer(this.shadowLocations.uv, 2, gl.FLOAT, false, 20, 12);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.BLEND);

    gl.deleteBuffer(buffer);
    gl.deleteBuffer(indexBuffer);
  }

  render(state) {
    const gl = this.gl;
    const { width, height } = this.resize();
    const camera = this.getCamera(state);
    const focal = this.getFocal(state);
    const mvp = this.createMvp(camera, focal);
    const light = this.getLight(state);
    const lighting = this.getPanelLighting(light);
    const drawOrder = this.geometry.panelCenters
      .map((center, panel) => ({
        panel,
        depth: dot(subtract(center, camera.camera), camera.forward),
      }))
      .sort((a, b) => b.depth - a.depth);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.drawShadow(mvp, light);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.mvp, false, mvp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.locations.texture, 0);
    this.bindPanelAttributes();

    drawOrder.forEach(({ panel }) => {
      const shade = lighting[panel];
      gl.uniform1f(this.locations.brightness, shade.brightness);
      gl.uniform1f(this.locations.shadeLeft, shade.shadeLeft);
      gl.uniform1f(this.locations.shadeRight, shade.shadeRight);
      gl.uniform1f(this.locations.crease, shade.crease);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, panel * 6 * 2);
    });

    this.lastInfo = {
      camera,
      focal,
      light,
      lighting,
      drawOrder: drawOrder.map((item) => item.panel),
      width,
      height,
    };
    return this.lastInfo;
  }

  getPanelScreens(state) {
    const camera = this.getCamera(state);
    const focal = this.getFocal(state);
    return Array.from({ length: PANEL_COUNT }, (_, panel) => {
      const base = panel * 4;
      return this.geometry.vertexData
        .slice(base * 7, (base + 4) * 7)
        .reduce((points, _value, index) => {
          if (index % 7 === 0) {
            const offset = base * 7 + index;
            points.push(
              this.projectPoint(
                [
                  this.geometry.vertexData[offset],
                  this.geometry.vertexData[offset + 1],
                  this.geometry.vertexData[offset + 2],
                ],
                camera,
                focal,
              ),
            );
          }
          return points;
        }, []);
    });
  }
}
