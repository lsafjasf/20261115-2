const TAU = Math.PI * 2;
const LAMP_COLORS = ["#51e9ff", "#d8ff4f", "#ff4f93"];
const MONO = '"Cascadia Mono", "Roboto Mono", Consolas, "Noto Sans SC Variable", monospace';

export class StageRenderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
  }

  render(state, now) {
    if (!this.width || !this.height) this.resize();
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawBackdrop(ctx, width, height, now);
    this.drawGantry(ctx, width, height, state, now);
    this.drawLamps(ctx, width, height, state, now);
    this.drawWaveform(ctx, width, height, state, now);
    this.drawBeatGrid(ctx, width, height, state, now);
    this.drawFrameText(ctx, width, height, state, now);
    this.drawCountIn(ctx, width, height, state, now);
    this.drawAlarm(ctx, width, height, state, now);
  }

  drawBackdrop(ctx, width, height, now) {
    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, "#071013");
    background.addColorStop(0.56, "#050a0c");
    background.addColorStop(1, "#030607");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const bloom = ctx.createRadialGradient(
      width * 0.5,
      height * 0.31,
      0,
      width * 0.5,
      height * 0.31,
      width * 0.52,
    );
    bloom.addColorStop(0, "rgba(75, 123, 126, 0.12)");
    bloom.addColorStop(0.48, "rgba(33, 70, 74, 0.045)");
    bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 1;
    const spacing = Math.max(30, width / 28);
    ctx.strokeStyle = "rgba(164, 202, 198, 0.035)";
    ctx.beginPath();
    for (let x = spacing; x < width; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = spacing; y < height; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    const horizon = height * 0.665;
    ctx.strokeStyle = "rgba(216, 255, 79, 0.11)";
    ctx.beginPath();
    ctx.moveTo(18, horizon);
    ctx.lineTo(width - 18, horizon);
    ctx.stroke();

    for (let index = 0; index < 7; index += 1) {
      const span = 1 - index * 0.12;
      const y = horizon + (height - horizon) * (index / 8) ** 1.6;
      ctx.strokeStyle = `rgba(116, 153, 155, ${0.035 - index * 0.003})`;
      ctx.beginPath();
      ctx.moveTo(width * (0.5 - span * 0.5), y);
      ctx.lineTo(width * (0.5 + span * 0.5), y);
      ctx.stroke();
    }

    const floor = ctx.createLinearGradient(0, horizon, 0, height);
    floor.addColorStop(0, "rgba(8, 19, 20, 0)");
    floor.addColorStop(1, "rgba(2, 6, 7, 0.9)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizon, width, height - horizon);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#728887";
    for (let column = -8; column <= 8; column += 1) {
      ctx.beginPath();
      ctx.moveTo(width * 0.5 + column * 9, height * 0.59);
      ctx.lineTo(width * 0.5 + column * width * 0.09, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGantry(ctx, width, height, state, now) {
    const center = width * 0.5;
    const gantryY = height * 0.175;
    const gantryWidth = width * 0.56;
    const left = center - gantryWidth * 0.5;
    const right = center + gantryWidth * 0.5;

    ctx.strokeStyle = "rgba(172, 200, 197, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, gantryY);
    ctx.lineTo(center - 18, gantryY);
    ctx.moveTo(center + 18, gantryY);
    ctx.lineTo(right, gantryY);
    ctx.moveTo(left, gantryY);
    ctx.lineTo(left + 9, gantryY + 26);
    ctx.moveTo(right, gantryY);
    ctx.lineTo(right - 9, gantryY + 26);
    ctx.stroke();

    ctx.fillStyle = "rgba(4, 8, 9, 0.96)";
    ctx.fillRect(center - 29, gantryY - 14, 58, 28);
    ctx.strokeStyle = "rgba(216, 255, 79, 0.34)";
    ctx.strokeRect(center - 29.5, gantryY - 14.5, 59, 29);
    ctx.fillStyle = "#d8ff4f";
    ctx.font = `600 ${Math.max(7, width * 0.006)}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SYNC BUS", center, gantryY);

    const target = state.nextTarget;
    if (target) {
      const distance = Math.max(0, target.time - now);
      const near = distance < 1.4;
      ctx.fillStyle = near ? "#e8ffb5" : "rgba(168, 195, 190, 0.72)";
      ctx.font = `500 ${Math.max(7, width * 0.0062)}px ${MONO}`;
      ctx.textAlign = "left";
      ctx.fillText(`NEXT LIGHT / 0${target.lamp + 1}`, width * 0.068, gantryY - 17);
      ctx.fillStyle = LAMP_COLORS[target.lamp];
      ctx.fillRect(width * 0.068, gantryY - 8, clamp(82 * (1 - distance / 2.2), 4, 82), 2);
    }
  }

  drawLamps(ctx, width, height, state, now) {
    const lampY = height * 0.335;
    const positions = [0.315, 0.5, 0.685].map((ratio) => width * ratio);
    const floorY = height * 0.64;
    const hitAge = state.lastLock ? Math.max(0, now - state.lastLock.at) : 99;
    const hitLamp = state.lastLock?.lamp ?? -1;
    const nextDistance = state.nextTarget ? state.nextTarget.time - now : 99;

    positions.forEach((x, index) => {
      const color = LAMP_COLORS[index];
      const isHit = hitLamp === index;
      const beatFlash = isHit ? Math.exp(-hitAge * 4.2) : 0;
      const cue =
        state.nextTarget?.lamp === index
          ? clamp(1 - Math.abs(nextDistance) / 1.1, 0, 1) * 0.18
          : 0;
      const intensity = clamp(beatFlash + cue, 0, 1);
      const locked = state.targets.some((target) => target.lamp === index && target.status === "hit");

      ctx.save();
      ctx.strokeStyle = "rgba(174, 200, 198, 0.21)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 16, height * 0.19);
      ctx.lineTo(x - 16, lampY - 19);
      ctx.moveTo(x + 16, height * 0.19);
      ctx.lineTo(x + 16, lampY - 19);
      ctx.stroke();

      ctx.fillStyle = "rgba(9, 15, 17, 0.95)";
      ctx.strokeStyle = "rgba(180, 207, 202, 0.3)";
      ctx.beginPath();
      ctx.roundRect(x - 28, lampY - 17, 56, 34, 7);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(4, 8, 9, 0.9)";
      ctx.beginPath();
      ctx.roundRect(x - 22, lampY - 13, 44, 26, 10);
      ctx.fill();

      const lens = ctx.createRadialGradient(x, lampY, 1, x, lampY, 12 + intensity * 28);
      lens.addColorStop(0, color);
      lens.addColorStop(0.22, `${color}dd`);
      lens.addColorStop(0.58, `${color}44`);
      lens.addColorStop(1, `${color}00`);
      ctx.fillStyle = lens;
      ctx.globalAlpha = 0.34 + intensity * 0.66;
      ctx.beginPath();
      ctx.arc(x, lampY, 12 + intensity * 28, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      const beamLength = floorY - lampY + 44;
      const beamWidth = 35 + intensity * 48;
      const beam = ctx.createLinearGradient(0, lampY, 0, floorY);
      beam.addColorStop(0, `${color}${intensity > 0.1 ? "66" : "14"}`);
      beam.addColorStop(0.72, `${color}${intensity > 0.1 ? "20" : "06"}`);
      beam.addColorStop(1, `${color}00`);
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 13, lampY + 10);
      ctx.lineTo(x + 13, lampY + 10);
      ctx.lineTo(x + beamWidth, lampY + beamLength);
      ctx.lineTo(x - beamWidth, lampY + beamLength);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, lampY, 4.2 + intensity * 2, 0, TAU);
      ctx.fill();

      ctx.font = `500 ${Math.max(7, width * 0.006)}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillStyle = locked ? color : "rgba(155, 177, 175, 0.58)";
      ctx.fillText(`L0${index + 1}`, x, lampY + 39);
      ctx.fillStyle = "rgba(155, 177, 175, 0.44)";
      ctx.fillText(locked ? "LOCKED" : "ARMED", x, lampY + 52);
      ctx.restore();
    });
  }

  drawWaveform(ctx, width, height, state, now) {
    const startX = width * 0.25;
    const endX = width * 0.75;
    const centerY = height * 0.555;
    const amplitude = (5 + state.volume * 0.075) * (state.tuningValid ? 1 : 0.72);
    const pulseAge = state.lastLock ? now - state.lastLock.at : 99;
    const pulse = Math.exp(-Math.max(0, pulseAge) * 5);
    const phase = now * Math.PI * 2 * 2.1;
    const points = 90;

    ctx.save();
    ctx.strokeStyle = "rgba(81, 233, 255, 0.19)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, centerY);
    ctx.lineTo(endX, centerY);
    ctx.stroke();

    ctx.strokeStyle = "#51e9ff";
    ctx.lineWidth = 1.1;
    ctx.shadowColor = "rgba(81, 233, 255, 0.7)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let point = 0; point <= points; point += 1) {
      const ratio = point / points;
      const x = startX + (endX - startX) * ratio;
      const envelope = Math.sin(ratio * Math.PI) ** 1.7 * (0.55 + pulse * 0.65);
      const y =
        centerY +
        Math.sin(ratio * 19 + phase) * amplitude * envelope +
        Math.sin(ratio * 41 - phase * 0.6) * amplitude * 0.16 * envelope;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    if (pulse > 0.015) {
      for (let ring = 0; ring < 3; ring += 1) {
        const age = Math.max(0, now - (state.lastLock?.at ?? 0)) - ring * 0.075;
        if (age < 0) continue;
        const radius = 8 + age * (70 + ring * 23);
        ctx.strokeStyle = `rgba(216, 255, 79, ${Math.max(0, 0.35 - age * 0.5)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(width * 0.5, centerY, radius * 1.8, radius * 0.35, 0, 0, TAU);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgba(155, 177, 175, 0.43)";
    ctx.font = `500 ${Math.max(6.5, width * 0.0055)}px ${MONO}`;
    ctx.textAlign = "left";
    ctx.fillText("SUB / OSC", startX, centerY - 17);
    ctx.textAlign = "right";
    ctx.fillText(`${state.frequency.toFixed(1)} HZ  /  ${Math.round(state.volume)}%`, endX, centerY - 17);
  }

  drawBeatGrid(ctx, width, height, state, now) {
    const panel = {
      x: width * 0.062,
      y: height * 0.69,
      w: width * 0.876,
      h: height * 0.225,
    };
    const labelWidth = Math.max(44, width * 0.055);
    const rowHeight = panel.h / 3;
    const count = Math.max(1, state.targets.length);
    const cellWidth = (panel.w - labelWidth) / count;
    const spb = 60 / state.bpm;

    ctx.save();
    ctx.fillStyle = "rgba(3, 8, 10, 0.82)";
    ctx.strokeStyle = "rgba(173, 204, 199, 0.16)";
    ctx.lineWidth = 1;
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1);

    for (let row = 0; row < 3; row += 1) {
      const rowY = panel.y + row * rowHeight;
      if (row % 2 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.014)";
        ctx.fillRect(panel.x + 1, rowY + 1, panel.w - 2, rowHeight - 1);
      }
      ctx.strokeStyle = "rgba(173, 204, 199, 0.1)";
      ctx.beginPath();
      ctx.moveTo(panel.x + 1, rowY + rowHeight);
      ctx.lineTo(panel.x + panel.w - 1, rowY + rowHeight);
      ctx.stroke();

      ctx.fillStyle = "rgba(129, 151, 151, 0.5)";
      ctx.font = `500 ${Math.max(6, width * 0.0052)}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(`L${row + 1}`, panel.x + labelWidth * 0.48, rowY + rowHeight * 0.55);
      ctx.fillStyle = `${LAMP_COLORS[row]}88`;
      ctx.fillRect(panel.x + 8, rowY + rowHeight * 0.73, 4, 4);
    }

    for (let targetIndex = 0; targetIndex < state.targets.length; targetIndex += 1) {
      const target = state.targets[targetIndex];
      const columnX = panel.x + labelWidth + targetIndex * cellWidth;
      ctx.strokeStyle = "rgba(173, 204, 199, 0.07)";
      ctx.beginPath();
      ctx.moveTo(columnX, panel.y + 1);
      ctx.lineTo(columnX, panel.y + panel.h - 1);
      ctx.stroke();

      const centerX = columnX + cellWidth * 0.5;
      const centerY = panel.y + target.lamp * rowHeight + rowHeight * 0.5;
      const color = LAMP_COLORS[target.lamp];
      const near = Math.max(0, 1 - Math.abs(target.time - now) / 0.75);
      const pulse = target.status === "pending" ? 1 + near * 1.5 : 1;
      const size = Math.max(4.5, Math.min(8, cellWidth * 0.09)) * pulse;

      if (target.status === "hit") {
        ctx.fillStyle = `${color}22`;
        ctx.fillRect(columnX + 1, panel.y + target.lamp * rowHeight + 1, cellWidth - 2, rowHeight - 2);
        ctx.strokeStyle = `${color}b0`;
        ctx.strokeRect(columnX + 1.5, panel.y + target.lamp * rowHeight + 1.5, cellWidth - 3, rowHeight - 3);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        drawDiamond(ctx, centerX, centerY, size);
        ctx.shadowBlur = 0;
        ctx.fillStyle = `${color}cc`;
        ctx.font = `600 ${Math.max(5.5, width * 0.0048)}px ${MONO}`;
        ctx.textAlign = "center";
        ctx.fillText("LOCK", centerX, centerY + rowHeight * 0.33);
      } else if (target.status === "fail") {
        ctx.strokeStyle = "rgba(255, 90, 70, 0.72)";
        ctx.strokeRect(columnX + 1.5, panel.y + target.lamp * rowHeight + 1.5, cellWidth - 3, rowHeight - 3);
        ctx.beginPath();
        ctx.moveTo(centerX - size, centerY - size);
        ctx.lineTo(centerX + size, centerY + size);
        ctx.moveTo(centerX + size, centerY - size);
        ctx.lineTo(centerX - size, centerY + size);
        ctx.stroke();
      } else {
        ctx.strokeStyle = `${color}${near > 0.3 ? "a0" : "55"}`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, size + 2, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = `${color}${near > 0.3 ? "55" : "18"}`;
        drawDiamond(ctx, centerX, centerY, Math.max(2.5, size * 0.46));
        if (near > 0.04) {
          ctx.strokeStyle = `${color}${Math.floor(30 + near * 90)
            .toString(16)
            .padStart(2, "0")}`;
          ctx.beginPath();
          ctx.arc(centerX, centerY, size + 5 + near * 9, 0, TAU);
          ctx.stroke();
        }
      }

      ctx.fillStyle =
        target.status === "hit"
          ? color
          : target.status === "fail"
            ? "#ff5a46"
            : "rgba(175, 195, 193, 0.55)";
      ctx.font = `500 ${Math.max(6, width * 0.0052)}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(String(targetIndex + 1).padStart(2, "0"), centerX, panel.y + panel.h - 4);
    }

    const firstTime = state.targets[0]?.time ?? now;
    const lastTime = state.targets[state.targets.length - 1]?.time ?? now;
    const timelineStart = firstTime - spb * 0.55;
    const timelineEnd = lastTime + 0.28;
    const timelineRatio = clamp((now - timelineStart) / Math.max(0.1, timelineEnd - timelineStart), 0, 1);
    const playheadX =
      panel.x + labelWidth + (panel.w - labelWidth) * timelineRatio;

    const beam = ctx.createLinearGradient(playheadX - 18, 0, playheadX + 4, 0);
    beam.addColorStop(0, "rgba(216, 255, 79, 0)");
    beam.addColorStop(1, "rgba(216, 255, 79, 0.1)");
    ctx.fillStyle = beam;
    ctx.fillRect(playheadX - 18, panel.y + 1, 22, panel.h - 2);
    ctx.strokeStyle = "rgba(216, 255, 79, 0.88)";
    ctx.beginPath();
    ctx.moveTo(playheadX, panel.y - 5);
    ctx.lineTo(playheadX, panel.y + panel.h - 1);
    ctx.stroke();
    ctx.fillStyle = "#d8ff4f";
    ctx.beginPath();
    ctx.moveTo(playheadX - 4, panel.y - 7);
    ctx.lineTo(playheadX + 4, panel.y - 7);
    ctx.lineTo(playheadX, panel.y - 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(158, 180, 178, 0.46)";
    ctx.font = `500 ${Math.max(6, width * 0.005)}px ${MONO}`;
    ctx.textAlign = "left";
    ctx.fillText("BEAT MATRIX / TARGET POSITION", panel.x, panel.y - 12);
    ctx.textAlign = "right";
    ctx.fillText("A + B  →  LOCK", panel.x + panel.w, panel.y - 12);
    ctx.restore();
  }

  drawFrameText(ctx, width, height, state, now) {
    ctx.save();
    ctx.font = `500 ${Math.max(6.5, width * 0.0055)}px ${MONO}`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(155, 178, 175, 0.57)";
    ctx.textAlign = "left";
    ctx.fillText("INSTALLATION FEED / CAM 01", width * 0.03, height * 0.045);
    ctx.textAlign = "right";
    const audioState = state.audio.state === "running" ? "AUDIO LIVE" : `AUDIO ${state.audio.state.toUpperCase()}`;
    ctx.fillStyle = state.audio.state === "running" ? "#d8ff4f" : "rgba(255, 90, 70, 0.8)";
    ctx.fillText(audioState, width * 0.97, height * 0.045);

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(155, 178, 175, 0.47)";
    ctx.fillText(`${state.stageId}  /  ${state.bpm} BPM`, width * 0.03, height * 0.947);
    ctx.textAlign = "right";
    ctx.fillText(
      `${String(Math.floor(now / 60)).padStart(2, "0")}:${(now % 60).toFixed(2).padStart(5, "0")}`,
      width * 0.97,
      height * 0.947,
    );

    for (let dot = 0; dot < 3; dot += 1) {
      ctx.fillStyle = dot <= state.stageIndex ? "#d8ff4f" : "rgba(255, 255, 255, 0.14)";
      ctx.fillRect(width * 0.5 - 16 + dot * 13, height * 0.04, 8, 2);
    }

    if (state.phase === "stageClear") {
      ctx.fillStyle = "rgba(3, 7, 8, 0.52)";
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = "center";
      ctx.fillStyle = "#d8ff4f";
      ctx.font = `700 ${Math.max(18, width * 0.03)}px ${MONO}`;
      ctx.fillText("SECTION LOCKED", width * 0.5, height * 0.43);
      ctx.fillStyle = "rgba(220, 234, 229, 0.7)";
      ctx.font = `500 ${Math.max(7, width * 0.0062)}px ${MONO}`;
      ctx.fillText(`${state.stageHits} / ${state.requiredHits} BEATS  ·  NEXT MOVEMENT IN ...`, width * 0.5, height * 0.48);
    }

    if (state.phase === "failure") {
      ctx.fillStyle = "rgba(39, 5, 3, 0.34)";
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff7867";
      ctx.font = `700 ${Math.max(16, width * 0.026)}px ${MONO}`;
      ctx.fillText("PHASE FAULT", width * 0.5, height * 0.42);
      ctx.fillStyle = "rgba(255, 210, 203, 0.72)";
      ctx.font = `500 ${Math.max(7, width * 0.0062)}px ${MONO}`;
      ctx.fillText("冷却中 · 即将重新接入本段", width * 0.5, height * 0.465);
    }
    ctx.restore();
  }

  drawCountIn(ctx, width, height, state, now) {
    if (state.phase !== "countin" || !state.countIn) return;
    const elapsed = now - (state.targets[0]?.time - (4.55 * 60) / state.bpm);
    const beatProgress = ((elapsed / (60 / state.bpm)) % 1 + 1) % 1;
    const scale = 1 + (1 - beatProgress) * 0.08;
    const centerY = height * 0.475;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(216, 255, 79, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(width * 0.5, centerY, 34 * scale, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "#d8ff4f";
    ctx.font = `600 ${Math.max(22, width * 0.036)}px ${MONO}`;
    ctx.fillText(String(state.countIn.beat), width * 0.5, centerY + 1);
    ctx.fillStyle = "rgba(220, 235, 229, 0.76)";
    ctx.font = `600 ${Math.max(7, width * 0.006)}px ${MONO}`;
    ctx.fillText("COUNT IN / 校准下一灯位", width * 0.5, centerY + 54);
    ctx.restore();
  }

  drawAlarm(ctx, width, height, state, now) {
    const alarmAge = state.lastAlarm ? now - state.lastAlarm.at : 99;
    if (alarmAge < 0 || alarmAge > 0.9) return;
    const flicker = 0.08 + (Math.sin(alarmAge * 48) * 0.5 + 0.5) * 0.16;
    ctx.save();
    ctx.fillStyle = `rgba(255, 48, 24, ${flicker})`;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = `rgba(255, 90, 70, ${0.45 + flicker})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, width - 4, height - 4);
    ctx.fillStyle = "rgba(255, 231, 226, 0.9)";
    ctx.font = `600 ${Math.max(7, width * 0.006)}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText("SYNC ALARM / 节拍与灯光未锁", width * 0.5, height * 0.155);
    ctx.restore();
  }
}

function drawDiamond(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.fill();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
