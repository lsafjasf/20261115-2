(function () {
  "use strict";

  const PANEL_W = 500;
  const PANEL_H = 640;
  const CAMERA_DISTANCE = 1500;
  const DEG = Math.PI / 180;

  const COLORS = {
    paper: "#e7e0d1",
    paperLight: "#f3ede0",
    paperDeep: "#c9bfad",
    ink: "#25251f",
    rust: "#b94a33",
    rustDark: "#7b3021",
    forest: "#1e3932",
    forestLight: "#45635b",
    gold: "#d5a649",
    cream: "#f2ead7"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function easeInOutCubic(value) {
    const t = clamp(value, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function textSpaced(ctx, text, x, y, spacing) {
    let offset = 0;
    for (const char of text) {
      ctx.fillText(char, x + offset, y);
      offset += ctx.measureText(char).width + spacing;
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    const lines = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    lines.forEach((entry, index) => ctx.fillText(entry, x, y + index * lineHeight));
    return lines.length;
  }

  function paperGrain(ctx, width, height, seed, opacity) {
    const random = mulberry32(seed);
    ctx.save();
    ctx.fillStyle = "#211d16";
    for (let i = 0; i < width * height * 0.012; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const alpha = random() * opacity;
      ctx.globalAlpha = alpha;
      ctx.fillRect(x, y, 1 + random() * 1.2, 1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < width * height * 0.005; i += 1) {
      const x = random() * width;
      const y = random() * height;
      ctx.globalAlpha = random() * opacity * 0.8;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  function insetBorder(ctx, width, height, inset, color, lineWidth) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    ctx.restore();
  }

  function drawFoldMark(ctx, x, y, size, color, lineWidth) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(-size, -size);
    ctx.lineTo(0, -size * 0.42);
    ctx.lineTo(size, -size);
    ctx.moveTo(-size, 0);
    ctx.lineTo(0, size * 0.58);
    ctx.lineTo(size, 0);
    ctx.moveTo(-size, size);
    ctx.lineTo(0, size * 1.58);
    ctx.lineTo(size, size);
    ctx.stroke();
    ctx.restore();
  }

  function makeTexture(width, height, painter) {
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d");
    painter(ctx, width, height);
    return canvas;
  }

  function makeCoverTexture() {
    return makeTexture(750, 960, (ctx, width, height) => {
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#c25239");
      background.addColorStop(0.48, "#b8432c");
      background.addColorStop(1, "#913421");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(width * 0.18, height * 0.1, 0, width * 0.2, height * 0.1, width * 0.9);
      glow.addColorStop(0, "rgba(255, 220, 188, 0.22)");
      glow.addColorStop(0.55, "rgba(255, 180, 120, 0.03)");
      glow.addColorStop(1, "rgba(70, 18, 8, 0.18)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      paperGrain(ctx, width, height, 11, 0.12);

      insetBorder(ctx, width, height, 34, "rgba(247, 229, 197, 0.55)", 2);
      ctx.strokeStyle = "rgba(247, 229, 197, 0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(43, 43, width - 86, height - 86);

      ctx.fillStyle = COLORS.cream;
      ctx.font = "600 16px 'Ubuntu Sans', sans-serif";
      textSpaced(ctx, "KELLER & CO. / EDITION 07", 66, 96, 1.45);
      ctx.font = "italic 14px Georgia, serif";
      ctx.fillStyle = "rgba(247, 233, 211, 0.74)";
      ctx.fillText("Objects, landscapes & quiet forms", 66, 126);

      ctx.save();
      ctx.translate(48, 316);
      ctx.fillStyle = COLORS.cream;
      ctx.font = "400 154px Georgia, 'DejaVu Serif', serif";
      ctx.fillText("FIELD", 0, 0);
      ctx.font = "italic 400 132px Georgia, 'DejaVu Serif', serif";
      ctx.fillText("notes", 112, 126);
      ctx.restore();

      ctx.save();
      ctx.translate(width - 134, 345);
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.gold;
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.font = "700 13px 'Ubuntu Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("VOL.", 0, -7);
      ctx.font = "400 38px Georgia, serif";
      ctx.fillText("01", 0, 27);
      ctx.restore();

      ctx.strokeStyle = "rgba(247, 233, 211, 0.75)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(66, height - 198);
      ctx.lineTo(width - 66, height - 198);
      ctx.stroke();

      ctx.fillStyle = "rgba(247, 233, 211, 0.9)";
      ctx.font = "600 13px 'Ubuntu Sans', sans-serif";
      textSpaced(ctx, "A STUDY IN LIGHT, FORM", 66, height - 152, 1.5);
      textSpaced(ctx, "AND THE SPACE BETWEEN", 66, height - 130, 1.5);
      ctx.font = "italic 16px Georgia, serif";
      ctx.fillStyle = "rgba(247, 233, 211, 0.65)";
      ctx.fillText("Autumn / MMXXVI", 66, height - 82);
      drawFoldMark(ctx, width - 94, height - 127, 18, "rgba(247, 233, 211, 0.58)", 1);
    });
  }

  function makeCoverBackTexture() {
    return makeTexture(750, 960, (ctx, width, height) => {
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(0, 0, width, height);
      paperGrain(ctx, width, height, 31, 0.13);
      insetBorder(ctx, width, height, 35, "rgba(65, 55, 42, 0.25)", 1);

      ctx.fillStyle = "rgba(43, 40, 33, 0.72)";
      drawFoldMark(ctx, width / 2, 132, 40, "rgba(43, 40, 33, 0.56)", 2);
      ctx.textAlign = "center";
      ctx.font = "italic 400 42px Georgia, serif";
      ctx.fillText("A quiet invitation", width / 2, 360);
      ctx.font = "600 12px 'Ubuntu Sans', sans-serif";
      textSpaced(ctx, "PAPERFOLD / FIELD NOTES", width / 2 - 108, 404, 1.3);

      ctx.strokeStyle = "rgba(43, 40, 33, 0.28)";
      ctx.beginPath();
      ctx.moveTo(width / 2 - 80, 443);
      ctx.lineTo(width / 2 + 80, 443);
      ctx.stroke();

      ctx.font = "400 17px Georgia, serif";
      ctx.fillStyle = "rgba(43, 40, 33, 0.56)";
      ctx.fillText("Fold gently. Begin anywhere.", width / 2, 485);
      ctx.textAlign = "left";
    });
  }

  function makePaperTexture(seed) {
    return makeTexture(750, 960, (ctx, width, height) => {
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#f4eee1");
      background.addColorStop(0.53, "#eadfcd");
      background.addColorStop(1, "#ded2be");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      const edge = ctx.createLinearGradient(0, 0, width, 0);
      edge.addColorStop(0, "rgba(101, 85, 59, 0.08)");
      edge.addColorStop(0.14, "rgba(255, 255, 255, 0.04)");
      edge.addColorStop(0.85, "rgba(255, 255, 255, 0.08)");
      edge.addColorStop(1, "rgba(101, 85, 59, 0.1)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, width, height);
      paperGrain(ctx, width, height, seed, 0.14);
      ctx.strokeStyle = "rgba(66, 53, 37, 0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(36, 36, width - 72, height - 72);
    });
  }

  function makeInnerTexture() {
    return makeTexture(1000, 1280, (ctx, width, height) => {
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#f5efe2");
      background.addColorStop(0.52, "#ebe1cf");
      background.addColorStop(1, "#ddd0ba");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      paperGrain(ctx, width, height, 59, 0.14);

      ctx.fillStyle = "rgba(33, 34, 29, 0.82)";
      ctx.font = "600 12px 'Ubuntu Sans', sans-serif";
      textSpaced(ctx, "FIELD NOTES / VOL. 01", 90, 106, 1.3);
      ctx.textAlign = "right";
      ctx.font = "italic 16px Georgia, serif";
      ctx.fillText("The inner field", width - 90, 108);
      ctx.textAlign = "left";

      ctx.strokeStyle = "rgba(33, 34, 29, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(90, 133);
      ctx.lineTo(width - 90, 133);
      ctx.stroke();

      ctx.fillStyle = COLORS.ink;
      ctx.font = "400 70px Georgia, 'DejaVu Serif', serif";
      ctx.fillText("A quiet", 90, 257);
      ctx.font = "italic 400 78px Georgia, 'DejaVu Serif', serif";
      ctx.fillStyle = COLORS.rustDark;
      ctx.fillText("architecture", 90, 344);

      ctx.font = "400 20px Georgia, serif";
      ctx.fillStyle = "rgba(33, 34, 29, 0.66)";
      wrapText(ctx, "Light rests on the crease before it rests on the page. We study the interval: a fold opening, a surface catching the afternoon, a shadow learning its edge.", 90, 400, 470, 29);

      ctx.save();
      ctx.translate(700, 450);
      ctx.strokeStyle = "rgba(33, 34, 29, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-118, 132);
      ctx.lineTo(-118, -40);
      ctx.arcTo(-118, -126, -32, -126, 86);
      ctx.arcTo(54, -126, 54, -40, 86);
      ctx.lineTo(54, 132);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -36, 73, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.gold;
      ctx.fill();
      ctx.strokeStyle = "rgba(33, 34, 29, 0.62)";
      ctx.beginPath();
      ctx.moveTo(-116, 132);
      ctx.lineTo(52, 132);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = "rgba(33, 34, 29, 0.24)";
      ctx.beginPath();
      ctx.moveTo(90, 700);
      ctx.lineTo(width - 90, 700);
      ctx.stroke();

      ctx.fillStyle = "rgba(33, 34, 29, 0.72)";
      ctx.font = "600 11px 'Ubuntu Sans', sans-serif";
      textSpaced(ctx, "01 / TIDELINE", 90, 733, 1.2);
      textSpaced(ctx, "02 / PRESSURE", 360, 733, 1.2);
      textSpaced(ctx, "03 / RELEASE", 648, 733, 1.2);

      ctx.save();
      ctx.fillStyle = "rgba(33, 34, 29, 0.9)";
      ctx.font = "400 18px Georgia, serif";
      wrapText(ctx, "The surface remembers every angle. A crease is not an interruption; it is a place for light to change direction.", 90, 800, 322, 27);
      wrapText(ctx, "We began with a sheet of paper and a duration. What remains is the small architecture of an opening.", 408, 800, 322, 27);
      ctx.restore();

      ctx.strokeStyle = "rgba(33, 34, 29, 0.18)";
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.moveTo(90 + i * 50, 930);
        ctx.lineTo(90 + i * 50, 950);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(33, 34, 29, 0.55)";
      ctx.font = "italic 20px Georgia, serif";
      ctx.fillText("A study in light and form", 90, 1047);
      ctx.font = "600 11px 'Ubuntu Sans', sans-serif";
      ctx.textAlign = "right";
      textSpaced(ctx, "PAPERFOLD / 01", width - 185, 1047, 1.2);
      ctx.textAlign = "left";

      const circle = ctx.createRadialGradient(width - 140, 1110, 0, width - 140, 1110, 150);
      circle.addColorStop(0, "rgba(213, 166, 73, 0.34)");
      circle.addColorStop(1, "rgba(213, 166, 73, 0)");
      ctx.fillStyle = circle;
      ctx.fillRect(width - 310, 950, 310, 310);
    });
  }

  function makeInnerBlankTexture() {
    return makeTexture(1000, 1280, (ctx, width, height) => {
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#f5efe2");
      background.addColorStop(0.52, "#ebe1cf");
      background.addColorStop(1, "#ddd0ba");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      paperGrain(ctx, width, height, 59, 0.14);
      ctx.strokeStyle = "rgba(33, 34, 29, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(90, 80, width - 180, height - 160);
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.strokeStyle = "rgba(33, 34, 29, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -37);
      ctx.lineTo(26, 0);
      ctx.lineTo(0, 37);
      ctx.lineTo(-26, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });
  }

  function makePlateTexture() {
    return makeTexture(750, 960, (ctx, width, height) => {
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#26453e");
      background.addColorStop(0.5, "#1d3932");
      background.addColorStop(1, "#132a26");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      paperGrain(ctx, width, height, 93, 0.1);

      const halo = ctx.createRadialGradient(490, 330, 0, 490, 330, 330);
      halo.addColorStop(0, "rgba(230, 183, 91, 0.2)");
      halo.addColorStop(0.6, "rgba(230, 183, 91, 0.03)");
      halo.addColorStop(1, "rgba(18, 43, 37, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = COLORS.gold;
      ctx.beginPath();
      ctx.arc(492, 309, 163, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1b3831";
      ctx.beginPath();
      ctx.moveTo(0, 620);
      ctx.bezierCurveTo(160, 530, 290, 690, 456, 592);
      ctx.bezierCurveTo(596, 512, 688, 634, 750, 574);
      ctx.lineTo(750, 960);
      ctx.lineTo(0, 960);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(240, 232, 211, 0.62)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 676);
      ctx.bezierCurveTo(170, 560, 320, 740, 480, 632);
      ctx.bezierCurveTo(590, 558, 690, 676, 750, 620);
      ctx.stroke();

      ctx.strokeStyle = "rgba(240, 232, 211, 0.22)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.ellipse(524, 730, 130 + i * 34, 19 + i * 13, -0.23, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = COLORS.cream;
      ctx.font = "600 12px 'Ubuntu Sans', sans-serif";
      textSpaced(ctx, "PLATE 03 / LATE AFTERNOON", 62, 82, 1.25);
      ctx.font = "italic 400 68px Georgia, 'DejaVu Serif', serif";
      ctx.fillText("Long", 58, 804);
      ctx.fillText("afternoon", 58, 872);

      ctx.save();
      ctx.translate(width - 66, 793);
      ctx.rotate(-Math.PI / 2);
      ctx.font = "600 11px 'Ubuntu Sans', sans-serif";
      textSpaced(ctx, "LIGHT / 35.22° N", 0, 0, 1.2);
      ctx.restore();

      ctx.strokeStyle = "rgba(240, 232, 211, 0.36)";
      ctx.strokeRect(38, 38, width - 76, height - 76);
      ctx.font = "600 10px 'Ubuntu Sans', sans-serif";
      ctx.fillStyle = "rgba(240, 232, 211, 0.55)";
      textSpaced(ctx, "THE SHAPE OF A DAY", 62, 920, 1.25);
    });
  }

  function makePlateBackTexture() {
    return makeTexture(750, 960, (ctx, width, height) => {
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(0, 0, width, height);
      paperGrain(ctx, width, height, 71, 0.14);
      ctx.strokeStyle = "rgba(44, 41, 34, 0.22)";
      ctx.strokeRect(36, 36, width - 72, height - 72);
      ctx.fillStyle = "rgba(44, 41, 34, 0.58)";
      ctx.font = "italic 42px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("The plate waits", width / 2, 440);
      ctx.font = "600 11px 'Ubuntu Sans', sans-serif";
      textSpaced(ctx, "TURN TO LET THE AFTERNOON IN", width / 2 - 118, 484, 1.15);
      ctx.fillStyle = COLORS.rustDark;
      ctx.beginPath();
      ctx.arc(width / 2, 628, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.cream;
      ctx.font = "400 20px Georgia, serif";
      ctx.fillText("03", width / 2, 636);
      ctx.textAlign = "left";
    });
  }

  class PanelWebGLRenderer {
    constructor() {
      this.canvas = makeCanvas(2, 2);
      this.gl = this.canvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
      });
      this.available = Boolean(this.gl);
      this.textures = new Map();
      this.width = 2;
      this.height = 2;
      if (this.available) {
        try {
          this.init();
        } catch (error) {
          console.warn("Perspective texture pass unavailable:", error);
          this.available = false;
        }
      }
    }

    init() {
      const gl = this.gl;
      const vertexSource = `
        attribute vec2 aScreen;
        attribute float aDepth;
        attribute vec2 aUV;
        uniform vec2 uResolution;
        varying vec2 vUv;
        void main() {
          float x = (aScreen.x / uResolution.x) * 2.0 - 1.0;
          float y = 1.0 - (aScreen.y / uResolution.y) * 2.0;
          gl_Position = vec4(x * aDepth, y * aDepth, 0.0, aDepth);
          vUv = aUV;
        }
      `;
      const fragmentSource = `
        precision mediump float;
        uniform sampler2D uTexture;
        uniform float uBrightness;
        uniform float uContrast;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(uTexture, vUv);
          float light = mix(0.94, 1.035, clamp(vUv.x, 0.0, 1.0));
          color.rgb *= uBrightness * light;
          color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
          gl_FragColor = vec4(color.rgb, 1.0);
        }
      `;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) || "Texture shader compile failed");
        }
        return shader;
      };

      this.program = gl.createProgram();
      gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(this.program) || "Texture shader link failed");
      }
      gl.useProgram(this.program);
      this.locations = {
        screen: gl.getAttribLocation(this.program, "aScreen"),
        depth: gl.getAttribLocation(this.program, "aDepth"),
        uv: gl.getAttribLocation(this.program, "aUV"),
        resolution: gl.getUniformLocation(this.program, "uResolution"),
        texture: gl.getUniformLocation(this.program, "uTexture"),
        brightness: gl.getUniformLocation(this.program, "uBrightness"),
        contrast: gl.getUniformLocation(this.program, "uContrast")
      };
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(this.locations.screen);
      gl.vertexAttribPointer(this.locations.screen, 2, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(this.locations.depth);
      gl.vertexAttribPointer(this.locations.depth, 1, gl.FLOAT, false, 20, 8);
      gl.enableVertexAttribArray(this.locations.uv);
      gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, 20, 12);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    resize(width, height) {
      if (!this.available) return;
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.width = width;
      this.height = height;
    }

    getTexture(image) {
      if (this.textures.has(image)) return this.textures.get(image);
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this.textures.set(image, texture);
      return texture;
    }

    vertexData(panel, image, u0, u1, v0, v1, project) {
      const sampleU = (u) => (panel.flipU ? 1 - u : u);
      const points = [
        { u: u0, v: v0 },
        { u: u1, v: v0 },
        { u: u1, v: v1 },
        { u: u0, v: v1 }
      ];
      return points.flatMap(({ u, v }) => {
        const projected = project(panel.pointAt(u, v));
        return [
          projected.x,
          projected.y,
          projected.depth,
          sampleU(u),
          1 - v
        ];
      });
    }

    drawQuad(panel, image, u0, u1, v0, v1, project, brightness) {
      const gl = this.gl;
      const texture = this.getTexture(image);
      const data = this.vertexData(panel, image, u0, u1, v0, v1, project);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
      gl.uniform1i(this.locations.texture, 0);
      gl.uniform1f(this.locations.brightness, brightness);
      gl.uniform1f(this.locations.contrast, 1.015);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    render(panels, project, textures) {
      if (!this.available) return false;
      const gl = this.gl;
      gl.viewport(0, 0, this.width, this.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniform2f(this.locations.resolution, this.width, this.height);

      for (const panel of panels) {
        const facing = Math.abs(panel.normal.z);
        const brightness = clamp(0.79 + facing * 0.2 + panel.normal.x * 0.015, 0.7, 1);
        if (panel.id === "inner") {
          this.drawQuad(panel, textures.innerBlank, 0, 1, 0, 1, project, brightness);
          const reveal = panel.state.reveal;
          if (reveal > 0.002) {
            const u0 = panel.state.direction === "rtl" ? 1 - reveal : 0;
            const u1 = panel.state.direction === "rtl" ? 1 : reveal;
            this.drawQuad(panel, textures.inner, u0, u1, 0, 1, project, brightness);
          }
        } else {
          const image = panel.frontFacing
            ? (panel.id === "cover" ? textures.cover : textures.plate)
            : (panel.id === "cover" ? textures.coverBack : textures.plateBack);
          this.drawQuad(panel, image, 0, 1, 0, 1, project, brightness);
        }
      }
      return true;
    }
  }

  class PaperFoldRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.textures = {
        cover: makeCoverTexture(),
        coverBack: makeCoverBackTexture(),
        inner: makeInnerTexture(),
        innerBlank: makeInnerBlankTexture(),
        plate: makePlateTexture(),
        plateBack: makePlateBackTexture()
      };
      const grain = makeCanvas(180, 180);
      const grainCtx = grain.getContext("2d");
      const random = mulberry32(417);
      for (let i = 0; i < 1800; i += 1) {
        const shade = 45 + Math.round(random() * 80);
        grainCtx.fillStyle = `rgba(${shade}, ${shade - 4}, ${shade - 10}, ${0.08 + random() * 0.2})`;
        grainCtx.fillRect(random() * 180, random() * 180, 1, 1);
      }
      this.noisePattern = this.ctx.createPattern(grain, "repeat");
      this.glRenderer = new PanelWebGLRenderer();
      this.width = 1;
      this.height = 1;
      this.camera = null;
      this.lastGeometry = null;
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
      this.width = width;
      this.height = height;
      this.glRenderer.resize(width, height);
      const focal = width * 0.83;
      this.camera = {
        focal,
        distance: CAMERA_DISTANCE,
        centerX: width * 0.5,
        centerY: height * 0.535,
        yaw: -5.5 * DEG,
        pitch: 3.2 * DEG,
        cosYaw: Math.cos(-5.5 * DEG),
        sinYaw: Math.sin(-5.5 * DEG),
        cosPitch: Math.cos(3.2 * DEG),
        sinPitch: Math.sin(3.2 * DEG)
      };
    }

    project(point) {
      const camera = this.camera;
      const x1 = point.x * camera.cosYaw + point.z * camera.sinYaw;
      const z1 = -point.x * camera.sinYaw + point.z * camera.cosYaw;
      const y2 = point.y * camera.cosPitch - z1 * camera.sinPitch;
      const z2 = point.y * camera.sinPitch + z1 * camera.cosPitch;
      const depth = z2 + camera.distance;
      const scale = camera.focal / Math.max(depth, 1);
      return {
        x: camera.centerX + x1 * scale,
        y: camera.centerY + y2 * scale,
        depth,
        scale
      };
    }

    projectNormal(normal) {
      const camera = this.camera;
      const x1 = normal.x * camera.cosYaw + normal.z * camera.sinYaw;
      const z1 = -normal.x * camera.sinYaw + normal.z * camera.cosYaw;
      const y2 = normal.y * camera.cosPitch - z1 * camera.sinPitch;
      const z2 = normal.y * camera.sinPitch + z1 * camera.cosPitch;
      return { x: x1, y: y2, z: z2 };
    }

    getFoldState(id, time, folds) {
      const fold = folds[id];
      const raw = clamp((time - fold.start) / Math.max(fold.duration, 0.01), 0, 1);
      const eased = easeInOutCubic(raw);
      if (id === "inner") {
        return {
          progress: raw,
          eased,
          angle: 0,
          reveal: eased,
          direction: fold.direction
        };
      }
      const towardViewer = fold.direction === "toward";
      let foldedAngle;
      if (id === "cover") {
        foldedAngle = towardViewer ? Math.PI : -Math.PI;
      } else {
        foldedAngle = towardViewer ? -Math.PI : Math.PI;
      }
      return {
        progress: raw,
        eased,
        angle: foldedAngle * (1 - eased),
        reveal: 1,
        direction: fold.direction
      };
    }

    buildPanels(time, folds) {
      const halfW = PANEL_W / 2;
      const halfH = PANEL_H / 2;

      const makePanel = (id, state) => {
        let pointAt;
        let normalAt;
        if (id === "inner") {
          pointAt = (u, v) => ({
            x: -halfW + u * PANEL_W,
            y: -halfH + v * PANEL_H,
            z: 0
          });
          normalAt = { x: 0, y: 0, z: 1 };
        } else if (id === "cover") {
          const angle = state.angle;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          pointAt = (u, v) => {
            const localX = -u * PANEL_W;
            return {
              x: -halfW + localX * cos,
              y: -halfH + v * PANEL_H,
              z: -localX * sin
            };
          };
          normalAt = { x: sin, y: 0, z: cos };
        } else {
          const angle = state.angle;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          pointAt = (u, v) => {
            const localX = u * PANEL_W;
            return {
              x: halfW + localX * cos,
              y: -halfH + v * PANEL_H,
              z: -localX * sin
            };
          };
          normalAt = { x: -sin, y: 0, z: cos };
        }

        const worldCenter = pointAt(0.5, 0.5);
        const center = this.project(worldCenter);
        const normal = this.projectNormal(normalAt);
        const uv = [
          pointAt(0, 0),
          pointAt(1, 0),
          pointAt(1, 1),
          pointAt(0, 1)
        ];
        const corners = uv.map((point) => this.project(point));
        const bias = id === "cover"
          ? (state.direction === "toward" ? 12 : -12)
          : id === "plate"
            ? (state.direction === "toward" ? 4 : -12)
            : 0;
        const flipU = this.project(pointAt(0, 0.5)).x > this.project(pointAt(1, 0.5)).x;
        return {
          id,
          state,
          pointAt,
          worldCenter,
          center,
          corners,
          normal,
          frontFacing: normal.z >= 0,
          flipU,
          sortDepth: center.depth + bias
        };
      };

      return [
        makePanel("cover", this.getFoldState("cover", time, folds)),
        makePanel("inner", this.getFoldState("inner", time, folds)),
        makePanel("plate", this.getFoldState("plate", time, folds))
      ];
    }

    drawBackground(time, panels) {
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#e8e2d5");
      background.addColorStop(0.48, "#ddd6c7");
      background.addColorStop(1, "#c9c0af");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(width * 0.52, height * 0.37, 0, width * 0.52, height * 0.37, width * 0.56);
      glow.addColorStop(0, "rgba(255, 252, 239, 0.72)");
      glow.addColorStop(0.55, "rgba(255, 248, 230, 0.16)");
      glow.addColorStop(1, "rgba(255, 245, 222, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      if (this.noisePattern) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = this.noisePattern;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = "rgba(56, 52, 42, 0.075)";
      ctx.lineWidth = 1;
      const grid = Math.max(34, Math.round(width / 29));
      for (let x = width * 0.055; x < width; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height * 0.13);
        ctx.stroke();
      }
      for (let y = height * 0.87; y < height; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.fillStyle = "rgba(122, 101, 64, 0.055)";
      ctx.beginPath();
      ctx.arc(width * 0.15, height * 0.83, width * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(56, 52, 42, 0.08)";
      ctx.beginPath();
      ctx.arc(width * 0.15, height * 0.83, width * 0.195, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const openAmount = (
        (1 - Math.abs(panels[0].state.angle) / Math.PI) +
        panels[1].state.reveal +
        (1 - Math.abs(panels[2].state.angle) / Math.PI)
      ) / 3;
      const shadowCenter = panels.reduce((acc, panel) => ({
        x: acc.x + panel.center.x / panels.length,
        y: acc.y + panel.center.y / panels.length
      }), { x: 0, y: 0 });
      const shadowWidth = width * (0.21 + openAmount * 0.34);
      const shadowHeight = height * 0.13;

      ctx.save();
      ctx.translate(shadowCenter.x, shadowCenter.y + height * 0.23);
      ctx.scale(shadowWidth / shadowHeight, 1);
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowHeight);
      shadow.addColorStop(0, "rgba(42, 33, 20, 0.28)");
      shadow.addColorStop(0.42, "rgba(42, 33, 20, 0.17)");
      shadow.addColorStop(1, "rgba(42, 33, 20, 0)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, shadowHeight, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = "rgba(34, 34, 28, 0.32)";
      ctx.font = "600 9px 'Ubuntu Sans', sans-serif";
      textSpaced(ctx, "AN INTERACTIVE PAPER STUDY", width * 0.046, height * 0.925, 1.1);
      ctx.textAlign = "right";
      textSpaced(ctx, `T+${time.toFixed(2)} / 10.00`, width * 0.954 - 55, height * 0.925, 1.1);
      ctx.textAlign = "left";
      ctx.restore();
    }

    drawTriangle(image, source0, source1, source2, dest0, dest1, dest2) {
      const ctx = this.ctx;
      const s1x = source1.x - source0.x;
      const s1y = source1.y - source0.y;
      const s2x = source2.x - source0.x;
      const s2y = source2.y - source0.y;
      const det = s1x * s2y - s2x * s1y;
      if (Math.abs(det) < 0.0001) return;

      const d1x = dest1.x - dest0.x;
      const d1y = dest1.y - dest0.y;
      const d2x = dest2.x - dest0.x;
      const d2y = dest2.y - dest0.y;
      const a = (d1x * s2y - d2x * s1y) / det;
      const c = (-d1x * s2x + d2x * s1x) / det;
      const b = (d1y * s2y - d2y * s1y) / det;
      const d = (-d1y * s2x + d2y * s1x) / det;
      const e = dest0.x - a * source0.x - c * source0.y;
      const f = dest0.y - b * source0.x - d * source0.y;
      const centerX = (source0.x + source1.x + source2.x) / 3;
      const centerY = (source0.y + source1.y + source2.y) / 3;
      const pad = 1.35;
      const expand = (point) => {
        const dx = point.x - centerX;
        const dy = point.y - centerY;
        const length = Math.hypot(dx, dy) || 1;
        return {
          x: point.x + (dx / length) * pad,
          y: point.y + (dy / length) * pad
        };
      };
      const clip0 = expand(source0);
      const clip1 = expand(source1);
      const clip2 = expand(source2);

      ctx.save();
      ctx.setTransform(a, b, c, d, e, f);
      ctx.beginPath();
      ctx.moveTo(clip0.x, clip0.y);
      ctx.lineTo(clip1.x, clip1.y);
      ctx.lineTo(clip2.x, clip2.y);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    }

    drawWarpedPanel(image, panel, u0, u1, options) {
      const settings = options || {};
      const cols = Math.max(3, Math.ceil(12 * (u1 - u0)));
      const rows = settings.rows || 8;
      const textureWidth = image.width;
      const textureHeight = image.height;
      const points = [];
      const sources = [];

      for (let row = 0; row <= rows; row += 1) {
        const v = row / rows;
        points[row] = [];
        sources[row] = [];
        for (let col = 0; col <= cols; col += 1) {
          const u = u0 + (u1 - u0) * (col / cols);
          const projected = this.project(panel.pointAt(u, v));
          points[row][col] = projected;
          const sourceU = panel.flipU ? 1 - u : u;
          sources[row][col] = {
            x: sourceU * textureWidth,
            y: v * textureHeight
          };
        }
      }

      const ctx = this.ctx;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const p00 = points[row][col];
          const p10 = points[row][col + 1];
          const p11 = points[row + 1][col + 1];
          const p01 = points[row + 1][col];
          const s00 = sources[row][col];
          const s10 = sources[row][col + 1];
          const s11 = sources[row + 1][col + 1];
          const s01 = sources[row + 1][col];
          this.drawTriangle(image, s00, s10, s11, p00, p10, p11);
          this.drawTriangle(image, s00, s11, s01, p00, p11, p01);
        }
      }
      ctx.restore();
    }

    shadePanel(panel) {
      const ctx = this.ctx;
      const corners = panel.corners;
      const facing = Math.abs(panel.normal.z);
      const sideLight = clamp(panel.normal.x * -0.7 + panel.normal.y * -0.28 + panel.normal.z * 0.7, -1, 1);
      const shade = clamp(0.055 + (1 - facing) * 0.17 + Math.max(0, -sideLight) * 0.12, 0, 0.31);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(corners[0].x, corners[0].y, corners[1].x, corners[1].y);
      gradient.addColorStop(0, `rgba(26, 22, 17, ${shade * 0.8})`);
      gradient.addColorStop(0.5, `rgba(255, 246, 226, ${facing * 0.035})`);
      gradient.addColorStop(1, `rgba(26, 22, 17, ${shade})`);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();

      const edgeGradient = ctx.createLinearGradient(corners[0].x, corners[0].y, corners[2].x, corners[2].y);
      edgeGradient.addColorStop(0, "rgba(255, 252, 240, 0.32)");
      edgeGradient.addColorStop(0.5, "rgba(255, 252, 240, 0.04)");
      edgeGradient.addColorStop(1, "rgba(42, 35, 24, 0.16)");
      ctx.save();
      ctx.strokeStyle = edgeGradient;
      ctx.lineWidth = Math.max(0.7, this.width / 1500);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    render(time, folds) {
      if (!this.camera) this.resize();
      if (this.width < 2 || this.height < 2) return null;
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      const panels = this.buildPanels(time, folds);
      this.drawBackground(time, panels);

      const ordered = panels.slice().sort((a, b) => a.sortDepth - b.sortDepth);
      const projectPoint = (point) => this.project(point);
      const glRendered = this.glRenderer.render(ordered, projectPoint, this.textures);
      if (glRendered) {
        ctx.drawImage(this.glRenderer.canvas, 0, 0);
      } else {
        for (const panel of ordered) {
          if (panel.id === "inner") {
            this.drawWarpedPanel(this.textures.innerBlank, panel, 0, 1, { rows: 10 });
            const reveal = panel.state.reveal;
            if (reveal > 0.001) {
              let u0 = 0;
              let u1 = reveal;
              if (panel.state.direction === "rtl") {
                u0 = 1 - reveal;
                u1 = 1;
              }
              this.drawWarpedPanel(this.textures.inner, panel, u0, u1, { rows: 10 });
            }
          } else {
            const texture = panel.frontFacing
              ? (panel.id === "cover" ? this.textures.cover : this.textures.plate)
              : (panel.id === "cover" ? this.textures.coverBack : this.textures.plateBack);
            this.drawWarpedPanel(texture, panel, 0, 1, { rows: 8 });
          }
          this.shadePanel(panel);
        }
      }

      const vignette = ctx.createRadialGradient(
        this.width * 0.5,
        this.height * 0.48,
        this.width * 0.24,
        this.width * 0.5,
        this.height * 0.48,
        this.width * 0.72
      );
      vignette.addColorStop(0, "rgba(31, 25, 16, 0)");
      vignette.addColorStop(1, "rgba(31, 25, 16, 0.16)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, this.width, this.height);

      this.lastGeometry = { panels, ordered: ordered.map((panel) => panel.id), time };
      return this.lastGeometry;
    }

    metrics(time, folds) {
      const panels = this.buildPanels(time, folds);
      const ordered = panels.slice().sort((a, b) => a.sortDepth - b.sortDepth);
      return {
        time,
        angle: {
          cover: Math.abs(panels[0].state.angle) / DEG,
          inner: panels[1].state.reveal * 100,
          plate: Math.abs(panels[2].state.angle) / DEG
        },
        progress: {
          cover: panels[0].state.progress,
          inner: panels[1].state.progress,
          plate: panels[2].state.progress
        },
        centers: {
          cover: { x: panels[0].center.x, y: panels[0].center.y },
          inner: { x: panels[1].center.x, y: panels[1].center.y },
          plate: { x: panels[2].center.x, y: panels[2].center.y }
        },
        depthOrder: ordered.map((panel) => panel.id),
        topSurface: ordered[ordered.length - 1].id
      };
    }
  }

  window.PaperFold = {
    PANEL_W,
    PANEL_H,
    COLORS,
    DEG,
    clamp,
    easeInOutCubic,
    PaperFoldRenderer
  };
})();
