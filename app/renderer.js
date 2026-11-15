(function attachRenderer(root, factory) {
  if (root) root.CryoRenderer = factory();
})(typeof window !== "undefined" ? window : null, () => {
  const W = 1180;
  const H = 620;
  const TAU = Math.PI * 2;
  const TUNNEL = { left: 56, right: 1124, top: 88, bottom: 526 };

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function tempColor(temp) {
    const t = clamp((temp + 18) / 26, 0, 1);
    if (t < 0.45) {
      const k = t / 0.45;
      return `rgb(${Math.round(lerp(255, 246, k))}, ${Math.round(lerp(104, 192, k))}, ${Math.round(lerp(88, 118, k))})`;
    }
    const k = (t - 0.45) / 0.55;
    return `rgb(${Math.round(lerp(246, 112, k))}, ${Math.round(lerp(192, 235, k))}, ${Math.round(lerp(118, 247, k))})`;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function createRenderer(canvas) {
    const ctx = canvas.getContext("2d");
    const particles = [];
    let elapsed = 0;
    let fanAngle = 0;
    let lastStatus = "idle";

    for (let i = 0; i < 96; i += 1) {
      particles.push({
        x: 260 + Math.random() * 800,
        y: 180 + Math.random() * 295,
        z: 0.35 + Math.random() * 0.65,
        phase: Math.random() * TAU,
        size: 0.6 + Math.random() * 2.2
      });
    }

    function drawBackground() {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#07151b");
      bg.addColorStop(0.52, "#08191f");
      bg.addColorStop(1, "#040d11");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const glow = ctx.createRadialGradient(520, 280, 10, 520, 280, 620);
      glow.addColorStop(0, "rgba(33, 139, 151, 0.1)");
      glow.addColorStop(1, "rgba(2, 8, 10, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(114, 191, 201, 0.035)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
        ctx.stroke();
      }
    }

    function drawTunnelShell() {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
      ctx.shadowBlur = 35;
      ctx.shadowOffsetY = 18;
      roundedRect(ctx, TUNNEL.left, TUNNEL.top, TUNNEL.right - TUNNEL.left, TUNNEL.bottom - TUNNEL.top, 26);
      ctx.fillStyle = "#0a1b22";
      ctx.fill();
      ctx.restore();

      const metal = ctx.createLinearGradient(0, TUNNEL.top, 0, TUNNEL.bottom);
      metal.addColorStop(0, "#18333c");
      metal.addColorStop(0.08, "#0e252d");
      metal.addColorStop(1, "#07161b");
      roundedRect(ctx, TUNNEL.left, TUNNEL.top, TUNNEL.right - TUNNEL.left, TUNNEL.bottom - TUNNEL.top, 26);
      ctx.fillStyle = metal;
      ctx.fill();
      ctx.strokeStyle = "rgba(123, 203, 213, 0.23)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      roundedRect(ctx, TUNNEL.left + 16, TUNNEL.top + 17, TUNNEL.right - TUNNEL.left - 32, TUNNEL.bottom - TUNNEL.top - 34, 18);
      ctx.fillStyle = "#061116";
      ctx.fill();
      ctx.strokeStyle = "rgba(115, 223, 233, 0.09)";
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, TUNNEL.left + 16, TUNNEL.top + 17, TUNNEL.right - TUNNEL.left - 32, TUNNEL.bottom - TUNNEL.top - 34, 18);
      ctx.clip();

      const chill = ctx.createLinearGradient(230, 0, 1080, 0);
      chill.addColorStop(0, "rgba(40, 159, 172, 0.11)");
      chill.addColorStop(0.5, "rgba(24, 103, 117, 0.055)");
      chill.addColorStop(1, "rgba(3, 20, 25, 0.02)");
      ctx.fillStyle = chill;
      ctx.fillRect(230, TUNNEL.top, 900, TUNNEL.bottom);

      ctx.strokeStyle = "rgba(104, 200, 209, 0.04)";
      for (let x = 260; x < 1100; x += 52) {
        ctx.beginPath();
        ctx.moveTo(x, 112);
        ctx.lineTo(x - 18, 500);
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = "rgba(110, 231, 239, 0.32)";
      ctx.font = "9px SFMono-Regular, Consolas, monospace";
      ctx.letterSpacing = "1px";
      ctx.fillText("AIRFLOW CHAMBER", 73, 63);
    }

    function drawFan(snapshot, dt) {
      const cx = 135;
      const cy = 307;
      const radius = 72;
      const live = snapshot.status === "running";
      const rpm = snapshot.rpm || 0;
      fanAngle += (live ? Math.max(0.12, rpm / 800) : 0.075) * dt;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.arc(0, 0, radius + 9, 0, TAU);
      ctx.fillStyle = "#07151a";
      ctx.fill();
      ctx.strokeStyle = snapshot.blockage ? "rgba(255, 111, 97, 0.62)" : "rgba(111, 220, 230, 0.3)";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fillStyle = "#0b2229";
      ctx.fill();
      ctx.strokeStyle = "rgba(122, 204, 213, 0.14)";
      ctx.stroke();

      ctx.save();
      ctx.rotate(fanAngle);
      for (let i = 0; i < 7; i += 1) {
        ctx.save();
        ctx.rotate((i / 7) * TAU);
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.bezierCurveTo(20, -22, 46, -17, 54, -2);
        ctx.bezierCurveTo(42, 12, 18, 9, 0, 2);
        ctx.closePath();
        const blade = ctx.createLinearGradient(0, -10, 56, 10);
        blade.addColorStop(0, "rgba(94, 204, 214, 0.46)");
        blade.addColorStop(1, "rgba(21, 62, 70, 0.74)");
        ctx.fillStyle = blade;
        ctx.fill();
        ctx.strokeStyle = "rgba(143, 222, 230, 0.12)";
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, TAU);
      const hub = ctx.createRadialGradient(-5, -5, 1, 0, 0, 20);
      hub.addColorStop(0, "#6ac4cd");
      hub.addColorStop(0.35, "#1d535c");
      hub.addColorStop(1, "#0b242b");
      ctx.fillStyle = hub;
      ctx.fill();
      ctx.strokeStyle = "rgba(153, 234, 240, 0.18)";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, TAU);
      ctx.fillStyle = live ? "#d8fdff" : "#50737a";
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(161, 217, 223, 0.44)";
      ctx.font = "8px SFMono-Regular, Consolas, monospace";
      ctx.fillText("FAN V-04", 101, 392);
      ctx.fillStyle = live ? "rgba(110, 231, 239, 0.7)" : "rgba(110, 231, 239, 0.28)";
      ctx.fillText(`${rpm} RPM`, 106, 406);

      if (snapshot.blockage) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = "rgba(255, 83, 72, 0.9)";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#ff5b50";
        ctx.shadowBlur = 17;
        ctx.beginPath();
        ctx.moveTo(-25, -25);
        ctx.lineTo(25, 25);
        ctx.moveTo(25, -25);
        ctx.lineTo(-25, 25);
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawDamper(snapshot) {
      const x = 236;
      const top = 166;
      const height = 282;
      const opening = snapshot.status === "running"
        ? snapshot.effectiveAir
        : snapshot.controls.damper;

      ctx.fillStyle = "rgba(10, 31, 37, 0.94)";
      roundedRect(ctx, x - 13, top - 10, 50, height + 20, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(116, 211, 220, 0.18)";
      ctx.stroke();

      for (let i = 0; i < 8; i += 1) {
        const y = top + 11 + i * ((height - 20) / 7);
        const slant = 9 + opening * 24;
        ctx.strokeStyle = snapshot.blockage
          ? "rgba(255, 121, 107, 0.35)"
          : `rgba(91, 193, 203, ${0.2 + opening * 0.5})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 28, y + slant * 0.35);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(161, 217, 223, 0.4)";
      ctx.font = "8px SFMono-Regular, Consolas, monospace";
      ctx.fillText("DAMPER", x - 3, top + height + 25);
      ctx.fillStyle = snapshot.blockage ? "#ff7b70" : "rgba(110, 231, 239, 0.68)";
      ctx.fillText(`${Math.round(opening * 100)}%`, x + 4, top + height + 39);
    }

    function drawAirflow(snapshot, dt) {
      const running = snapshot.status === "running";
      const air = running ? snapshot.airVelocity : 0;
      const blocked = snapshot.blockage;
      const speed = 22 + air * 39;

      for (const p of particles) {
        p.x += speed * dt * p.z;
        p.phase += dt * (1.1 + p.z * 1.7);
        p.y += Math.sin(p.phase) * (running ? air * 1.8 : 0.7) * dt * 5;
        if (p.x > 1068) {
          p.x = 264;
          p.y = 176 + Math.random() * 292;
        }
        if (p.y < 170 || p.y > 486) {
          p.y = 176 + Math.random() * 292;
        }
      }

      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, TUNNEL.left + 16, TUNNEL.top + 17, TUNNEL.right - TUNNEL.left - 32, TUNNEL.bottom - TUNNEL.top - 34, 18);
      ctx.clip();
      ctx.globalCompositeOperation = "lighter";

      const ribbonCount = 5;
      for (let i = 0; i < ribbonCount; i += 1) {
        const baseY = 208 + i * 58;
        const strength = running ? clamp(0.1 + snapshot.effectiveAir * 0.8, 0.1, 0.8) : 0.05;
        ctx.beginPath();
        for (let x = 266; x <= 1070; x += 14) {
          const wave = Math.sin((x + elapsed * (speed + 35)) * 0.018 + i * 1.3) * (8 + i * 1.4);
          const y = baseY + wave + Math.sin(elapsed * 1.4 + i) * 3;
          if (x === 266) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = blocked
          ? `rgba(255, 100, 82, ${strength * 0.32})`
          : `rgba(88, 220, 233, ${strength * 0.25})`;
        ctx.lineWidth = i % 2 === 0 ? 1.2 : 0.6;
        ctx.stroke();
      }

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const intensity = running
          ? clamp(snapshot.effectiveAir * 1.45 + 0.08, 0.08, 1)
          : 0.13;
        const alpha = intensity * (0.15 + p.z * 0.55);
        ctx.fillStyle = blocked
          ? `rgba(255, 107, 89, ${alpha * 0.72})`
          : `rgba(131, 237, 244, ${alpha})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * (1.8 + air * 0.08), p.size * 0.55, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawFoodPiece(type, x, y, temp, index) {
      const fill = tempColor(temp + index * 0.7);
      ctx.save();
      ctx.translate(x, y);

      if (type === "strawberry") {
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 11, -0.16, 0, TAU);
        const fruit = ctx.createRadialGradient(-3, -4, 1, 0, 0, 12);
        fruit.addColorStop(0, "rgba(255, 239, 227, 0.8)");
        fruit.addColorStop(0.24, fill);
        fruit.addColorStop(1, "rgba(110, 31, 35, 0.95)");
        ctx.fillStyle = fruit;
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 193, 179, 0.32)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.fillStyle = "rgba(104, 202, 165, 0.8)";
        ctx.beginPath();
        ctx.moveTo(-5, -9);
        ctx.lineTo(0, -14);
        ctx.lineTo(5, -9);
        ctx.lineTo(0, -11);
        ctx.closePath();
        ctx.fill();
      } else if (type === "dumpling") {
        ctx.beginPath();
        ctx.moveTo(-11, 2);
        ctx.quadraticCurveTo(-10, -9, 0, -10);
        ctx.quadraticCurveTo(10, -9, 11, 2);
        ctx.quadraticCurveTo(0, 8, -11, 2);
        ctx.closePath();
        const dough = ctx.createLinearGradient(-8, -9, 8, 8);
        dough.addColorStop(0, "rgba(255, 249, 220, 0.92)");
        dough.addColorStop(0.55, fill);
        dough.addColorStop(1, "rgba(141, 117, 72, 0.9)");
        ctx.fillStyle = dough;
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 241, 200, 0.36)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-6, -7);
        ctx.quadraticCurveTo(0, -5, 6, -7);
        ctx.strokeStyle = "rgba(139, 113, 66, 0.5)";
        ctx.stroke();
      } else {
        roundedRect(ctx, -11, -9, 22, 18, 4);
        const meat = ctx.createLinearGradient(-10, -8, 10, 8);
        meat.addColorStop(0, "rgba(206, 123, 104, 0.9)");
        meat.addColorStop(0.5, fill);
        meat.addColorStop(1, "rgba(71, 32, 29, 0.95)");
        ctx.fillStyle = meat;
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 185, 160, 0.2)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-6, -4);
        ctx.lineTo(3, 3);
        ctx.strokeStyle = "rgba(247, 197, 177, 0.28)";
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawCart(snapshot) {
      const profile = snapshot.profile;
      const progress = snapshot.status === "idle" && snapshot.distance === 0 ? 0 : snapshot.progress;
      const cartX = lerp(345, 1004, clamp(progress, 0, 1));
      const gapPx = snapshot.controls.gap * 1.18;
      const rows = [344 - gapPx, 344, 344 + gapPx];
      const drifting = profile.visual === "strawberry" && snapshot.drift > 0;
      const driftShift = drifting ? snapshot.drift / 100 * 34 : 0;
      const reached = snapshot.temp <= profile.targetTemp;

      ctx.save();
      if (snapshot.status !== "running") ctx.globalAlpha = 0.88;

      ctx.strokeStyle = "rgba(113, 200, 209, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cartX - 54, rows[0] - 17);
      ctx.lineTo(cartX - 54, rows[2] + 17);
      ctx.moveTo(cartX + 54, rows[0] - 17);
      ctx.lineTo(cartX + 54, rows[2] + 17);
      ctx.stroke();

      for (let row = 0; row < rows.length; row += 1) {
        const y = rows[row];
        const rowShift = drifting ? driftShift * (row % 2 === 0 ? 1 : 0.65) : 0;
        const trayGrad = ctx.createLinearGradient(cartX - 58, 0, cartX + 58, 0);
        trayGrad.addColorStop(0, "rgba(31, 74, 82, 0.85)");
        trayGrad.addColorStop(0.5, "rgba(86, 146, 154, 0.82)");
        trayGrad.addColorStop(1, "rgba(24, 61, 68, 0.85)");
        ctx.fillStyle = trayGrad;
        roundedRect(ctx, cartX - 56, y + 9, 112, 6, 2);
        ctx.fill();
        ctx.fillStyle = "rgba(163, 223, 229, 0.18)";
        ctx.fillRect(cartX - 52, y + 9, 104, 1);

        for (let item = 0; item < 3; item += 1) {
          const fx = cartX - 31 + item * 31 + rowShift;
          const fy = y + 1 + (item === 1 ? -2 : 0);
          drawFoodPiece(profile.visual, fx, fy, snapshot.temp, item + row * 0.8);
        }

        if (reached) {
          ctx.strokeStyle = "rgba(139, 244, 218, 0.35)";
          ctx.lineWidth = 0.7;
          for (let ci = 0; ci < 3; ci += 1) {
            const cx = cartX - 38 + ci * 38;
            const cy = y - 11 + (ci % 2) * 5;
            ctx.beginPath();
            ctx.moveTo(cx - 3, cy);
            ctx.lineTo(cx + 3, cy);
            ctx.moveTo(cx, cy - 3);
            ctx.lineTo(cx, cy + 3);
            ctx.stroke();
          }
        }
      }

      if (drifting) {
        ctx.strokeStyle = `rgba(255, 111, 97, ${0.2 + snapshot.drift / 160})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(cartX - 58, rows[1] + 4);
        ctx.lineTo(cartX - 58 + driftShift, rows[1] + 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255, 134, 120, 0.72)";
        ctx.font = "8px SFMono-Regular, Consolas, monospace";
        ctx.fillText("DRIFT", cartX + 45 + driftShift, rows[0] - 13);
      }

      ctx.fillStyle = "rgba(98, 191, 201, 0.2)";
      ctx.beginPath();
      ctx.moveTo(cartX - 51, rows[2] + 15);
      ctx.lineTo(cartX - 44, rows[2] + 30);
      ctx.lineTo(cartX - 59, rows[2] + 30);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cartX + 51, rows[2] + 15);
      ctx.lineTo(cartX + 59, rows[2] + 30);
      ctx.lineTo(cartX + 44, rows[2] + 30);
      ctx.closePath();
      ctx.fill();

      const badgeX = clamp(cartX + 64, 624, 987);
      const badgeY = rows[0] - 34;
      roundedRect(ctx, badgeX, badgeY, 76, 24, 6);
      ctx.fillStyle = "rgba(5, 18, 23, 0.9)";
      ctx.fill();
      ctx.strokeStyle = reached ? "rgba(88, 224, 166, 0.45)" : "rgba(255, 188, 100, 0.35)";
      ctx.stroke();
      ctx.fillStyle = reached ? "#78e0b6" : "#f0bb75";
      ctx.font = "600 11px SFMono-Regular, Consolas, monospace";
      ctx.fillText(`${snapshot.temp >= 0 ? "+" : ""}${snapshot.temp.toFixed(1)}°C`, badgeX + 10, badgeY + 16);

      ctx.strokeStyle = "rgba(131, 225, 233, 0.22)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(cartX, badgeY + 28);
      ctx.lineTo(cartX, rows[0] - 18);
      ctx.stroke();
      ctx.setLineDash([]);

      if (snapshot.controls.gap >= 10) {
        const bracketX = clamp(cartX - 74, 282, 930);
        ctx.strokeStyle = "rgba(120, 194, 202, 0.3)";
        ctx.beginPath();
        ctx.moveTo(bracketX, rows[0]);
        ctx.lineTo(bracketX, rows[1]);
        ctx.moveTo(bracketX - 3, rows[0]);
        ctx.lineTo(bracketX + 3, rows[0]);
        ctx.moveTo(bracketX - 3, rows[1]);
        ctx.lineTo(bracketX + 3, rows[1]);
        ctx.stroke();
        ctx.fillStyle = "rgba(143, 200, 207, 0.46)";
        ctx.font = "7px SFMono-Regular, Consolas, monospace";
        ctx.fillText(`${snapshot.controls.gap}cm`, bracketX - 10, (rows[0] + rows[1]) / 2 + 3);
      }
      ctx.restore();
    }

    let beltOffset = 0;

    function drawConveyor(snapshot, dt) {
      const x1 = 265;
      const x2 = 1080;
      const y = 489;
      const moving = snapshot.status === "running";
      const speed = moving ? snapshot.controls.speed : 0;
      beltOffset = (beltOffset + speed * 18 * dt) % 18;

      ctx.fillStyle = "rgba(4, 13, 17, 0.92)";
      roundedRect(ctx, x1, y, x2 - x1, 22, 4);
      ctx.fill();
      ctx.fillStyle = "#102c33";
      roundedRect(ctx, x1 + 5, y + 4, x2 - x1 - 10, 9, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(115, 209, 217, 0.19)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, x1 + 5, y + 4, x2 - x1 - 10, 9, 3);
      ctx.clip();
      ctx.strokeStyle = "rgba(108, 186, 195, 0.23)";
      for (let x = x1 - beltOffset; x < x2 + 20; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, y + 4);
        ctx.lineTo(x - 7, y + 13);
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = "rgba(111, 198, 207, 0.35)";
      ctx.font = "8px SFMono-Regular, Consolas, monospace";
      ctx.fillText(`BELT ${snapshot.controls.speed.toFixed(2)} m/min`, 932, 528);

      const pct = clamp(snapshot.progress, 0, 1);
      ctx.fillStyle = "rgba(110, 231, 239, 0.1)";
      ctx.fillRect(x1, y + 27, x2 - x1, 2);
      ctx.fillStyle = snapshot.blockage ? "#ff7162" : "#66e0e6";
      ctx.fillRect(x1, y + 27, (x2 - x1) * pct, 2);
      ctx.fillStyle = "rgba(140, 202, 208, 0.38)";
      ctx.font = "7px SFMono-Regular, Consolas, monospace";
      ctx.fillText("IN", x1, y + 42);
      ctx.fillText("OUT", x2 - 18, y + 42);

      ctx.strokeStyle = "rgba(114, 215, 223, 0.22)";
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(1080, 134);
      ctx.lineTo(1080, 476);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(110, 231, 239, 0.52)";
      ctx.font = "8px SFMono-Regular, Consolas, monospace";
      ctx.save();
      ctx.translate(1091, 320);
      ctx.rotate(Math.PI / 2);
      ctx.fillText("BATCH EXIT", 0, 0);
      ctx.restore();
    }

    function drawProbeGauge(snapshot) {
      const x = 1060;
      const y1 = 166;
      const y2 = 438;
      const pct = clamp((8 - snapshot.temp) / 38, 0, 1);
      const targetPct = clamp((8 - snapshot.profile.targetTemp) / 38, 0, 1);

      ctx.strokeStyle = "rgba(111, 215, 224, 0.11)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();

      const cold = ctx.createLinearGradient(0, y2, 0, y1);
      cold.addColorStop(0, "rgba(159, 245, 255, 0.9)");
      cold.addColorStop(1, "rgba(244, 180, 95, 0.75)");
      ctx.strokeStyle = cold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y2);
      ctx.lineTo(x, y2 - (y2 - y1) * pct);
      ctx.stroke();

      const targetY = y2 - (y2 - y1) * targetPct;
      ctx.strokeStyle = "rgba(88, 224, 166, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 7, targetY);
      ctx.lineTo(x + 7, targetY);
      ctx.stroke();
      ctx.fillStyle = "rgba(88, 224, 166, 0.7)";
      ctx.font = "7px SFMono-Regular, Consolas, monospace";
      ctx.fillText("CORE", x - 30, targetY + 3);
    }

    function drawAnnotations(snapshot) {
      const profile = snapshot.profile;
      const safe = profile.safeAir;
      const strong = snapshot.status === "running" && snapshot.effectiveAir > safe;
      const weak = snapshot.status === "running" && snapshot.effectiveAir < profile.minAir;

      roundedRect(ctx, 75, 107, 144, 25, 5);
      ctx.fillStyle = "rgba(8, 28, 34, 0.8)";
      ctx.fill();
      ctx.strokeStyle = "rgba(115, 211, 220, 0.12)";
      ctx.stroke();
      ctx.fillStyle = "rgba(131, 212, 219, 0.55)";
      ctx.font = "8px SFMono-Regular, Consolas, monospace";
      ctx.fillText(`CHAMBER -30.0°C`, 88, 123);

      const statusX = 916;
      roundedRect(ctx, statusX, 107, 154, 35, 6);
      ctx.fillStyle = "rgba(7, 24, 30, 0.82)";
      ctx.fill();
      ctx.strokeStyle = strong
        ? "rgba(255, 111, 97, 0.35)"
        : "rgba(110, 231, 239, 0.14)";
      ctx.stroke();
      ctx.fillStyle = "rgba(117, 186, 193, 0.5)";
      ctx.font = "7px SFMono-Regular, Consolas, monospace";
      ctx.fillText("CORE TARGET", statusX + 11, 120);
      ctx.fillStyle = snapshot.temp <= profile.targetTemp ? "#72dfb0" : "#f0bc76";
      ctx.font = "600 11px SFMono-Regular, Consolas, monospace";
      ctx.fillText(`≤ ${profile.targetTemp.toFixed(1)}°C`, statusX + 11, 134);
      ctx.fillStyle = "rgba(116, 177, 184, 0.44)";
      ctx.font = "7px SFMono-Regular, Consolas, monospace";
      ctx.fillText(`SAFE AIR ≤ ${(safe * 55).toFixed(2)} m/s`, statusX + 80, 126);

      if (strong || weak) {
        const label = strong ? "AIRFLOW OVER SAFE LIMIT" : "CORE COOLING TOO SLOW";
        const glow = strong ? "255, 111, 97" : "244, 180, 95";
        ctx.fillStyle = `rgba(${glow}, ${0.45 + Math.sin(elapsed * 4) * 0.16})`;
        ctx.font = "8px SFMono-Regular, Consolas, monospace";
        ctx.fillText(label, 772, 128);
      }
    }

    function drawAlarmFrame(snapshot) {
      if (!snapshot.blockage) return;
      const pulse = 0.22 + Math.sin(elapsed * 5) * 0.08;
      const frame = ctx.createLinearGradient(0, 0, W, 0);
      frame.addColorStop(0, `rgba(255, 71, 57, ${pulse})`);
      frame.addColorStop(0.5, "rgba(255, 71, 57, 0)");
      frame.addColorStop(1, `rgba(255, 71, 57, ${pulse})`);
      ctx.fillStyle = frame;
      ctx.fillRect(0, 0, W, 5);
      ctx.fillRect(0, H - 5, W, 5);

      ctx.fillStyle = `rgba(255, 91, 74, ${0.04 + pulse * 0.08})`;
      ctx.fillRect(0, 0, W, H);
    }

    function drawEdgeEffects() {
      const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.58);
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(1, 6, 8, 0.52)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "rgba(166, 231, 238, 0.025)";
      for (let y = 0; y < H; y += 4) {
        ctx.fillRect(0, y, W, 1);
      }
    }

    function render(snapshot, dt) {
      elapsed += Math.min(dt, 0.08);
      const safeDt = Math.min(dt, 0.08);
      drawBackground();
      drawTunnelShell();
      drawFan(snapshot, safeDt);
      drawDamper(snapshot);
      drawAirflow(snapshot, safeDt);
      drawConveyor(snapshot, safeDt);
      drawCart(snapshot);
      drawProbeGauge(snapshot);
      drawAnnotations(snapshot);
      drawAlarmFrame(snapshot);
      drawEdgeEffects();
      lastStatus = snapshot.status;
    }

    return {
      render,
      tempColor,
      getParticleCount: () => particles.length,
      getLastStatus: () => lastStatus
    };
  }

  return { createRenderer, tempColor };
});
