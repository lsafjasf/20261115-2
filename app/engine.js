(function attachEngine(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CryoEngine = api;
  }
})(typeof window !== "undefined" ? window : null, () => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round = (value, digits = 2) => Number(value.toFixed(digits));

  function createEngine(data) {
    const { tunnel, profiles } = data;
    const events = [];
    let eventSeq = 0;

    function emit(message, type = "info") {
      events.unshift({
        id: ++eventSeq,
        at: state ? state.totalRunSeconds : 0,
        message,
        type
      });
      events.length = Math.min(events.length, 24);
    }

    function currentProfile() {
      return profiles[state.batchIndex] || profiles[profiles.length - 1];
    }

    function initialBatch(profile) {
      return {
        temp: tunnel.initialCoreTemp,
        distance: 0,
        minutes: 0,
        drift: 0,
        energy: 0,
        peakAir: 0,
        warnedStrong: false,
        warnedWeak: false,
        warnedDrift: false,
        result: null
      };
    }

    const state = {
      batchIndex: 0,
      status: "idle",
      controls: { damper: 0.46, gap: 30, speed: 1.5 },
      batch: initialBatch(profiles[0]),
      totalRunSeconds: 0,
      energyTotal: 0,
      blockage: false,
      blockageCount: 0,
      campaignComplete: false,
      campaignSuccess: false,
      result: null
    };

    function baseCoolingConstant(profile) {
      const span = tunnel.initialCoreTemp - tunnel.airTemp;
      const remaining = profile.targetTemp - tunnel.airTemp;
      return -Math.log(remaining / span) / profile.targetTime;
    }

    function spacingFactor(profile) {
      const z = (state.controls.gap - profile.idealGap) / profile.gapSigma;
      return Math.exp(-0.5 * z * z);
    }

    function effectiveAir() {
      if (state.status !== "running") return 0;
      return state.controls.damper * (state.blockage ? tunnel.blockageFlowFactor : 1);
    }

    function fanRpm() {
      if (state.status !== "running") return 0;
      const normal = 420 + state.controls.damper * 2520;
      return Math.round(state.blockage ? normal * tunnel.blockageRpmFactor : normal);
    }

    function fanPowerKw() {
      const command = state.controls.damper;
      const motor = 4.5 + 31 * Math.pow(command, 1.85);
      const conveyor = 2.2 + state.controls.speed * 1.8;
      return (motor + conveyor) * (state.blockage ? 0.8 : 1);
    }

    function airVelocity() {
      return effectiveAir() * 5.5;
    }

    function pushWarning(key, message, type = "alert") {
      const batch = state.batch;
      if (batch[key]) return;
      batch[key] = true;
      emit(message, type);
    }

    function runWarnings(profile, air) {
      if (air > profile.safeAir) {
        pushWarning(
          "warnedStrong",
          `有效风量 ${(air * 100).toFixed(0)}% 超过安全线，飘移风险上升`
        );
      }
      if (air < profile.minAir) {
        pushWarning(
          "warnedWeak",
          `有效风量 ${(air * 100).toFixed(0)}% 偏弱，中心降温可能不足`
        );
      }
      if (state.batch.drift > 60) {
        pushWarning("warnedDrift", "食品横向位移接近托盘边缘", "alert");
      }
    }

    function finish(reason) {
      if (state.status !== "running") return;
      const profile = currentProfile();
      const batch = state.batch;
      const reasons = [];

      if (batch.temp > profile.targetTemp + 0.2) {
        reasons.push(`中心温度 ${round(batch.temp, 1)}°C，未达到 ${profile.targetTemp}°C`);
      }
      if (batch.minutes > profile.targetTime * 1.08) {
        reasons.push(`停留 ${formatMinutes(batch.minutes)}，超过规定窗口`);
      }
      if (batch.drift >= tunnel.driftFailPercent) {
        reasons.push("轻质食品横向飘移，超出托盘安全边界");
      }
      if (state.energyTotal > tunnel.energyLimitKwh) {
        reasons.push("累计能耗超过 16.5 kWh 红线");
      }

      const pass = reasons.length === 0;
      const isLast = state.batchIndex === profiles.length - 1;
      state.result = {
        pass,
        reason,
        profileId: profile.id,
        temp: round(batch.temp, 2),
        minutes: round(batch.minutes, 2),
        energy: round(batch.energy, 2),
        energyTotal: round(state.energyTotal, 2),
        drift: round(batch.drift, 1),
        reasons
      };
      state.status = "result";
      state.campaignComplete = isLast;
      state.campaignSuccess = isLast && pass;

      emit(
        pass
          ? `${profile.index} 批合格：${round(batch.temp, 1)}°C / ${formatMinutes(batch.minutes)}`
          : `${profile.index} 批不合格：${reasons[0]}`,
        pass ? "success" : "alert"
      );
    }

    function update(dtSeconds) {
      const dt = clamp(Number(dtSeconds) || 0, 0, 0.5);
      if (state.status !== "running" || dt === 0) return;

      const profile = currentProfile();
      const batch = state.batch;
      const dtMin = dt * tunnel.simulationRate / 60;
      const air = effectiveAir();
      const ratio = air / profile.idealAir;
      const airTransfer = clamp(0.13 + 0.87 * Math.pow(ratio, 0.9), 0.08, 1.55);
      const coolFactor = airTransfer * spacingFactor(profile);
      const coolingK = baseCoolingConstant(profile) * coolFactor;
      const power = fanPowerKw();

      batch.totalRunSeconds = (batch.totalRunSeconds || 0) + dt;
      state.totalRunSeconds += dt;
      batch.minutes += dtMin;
      batch.distance = Math.min(tunnel.lengthMeters, batch.distance + state.controls.speed * dtMin);
      batch.temp += (tunnel.airTemp - batch.temp) * coolingK * dtMin;
      batch.energy += power * dtMin / 60;
      state.energyTotal += power * dtMin / 60;
      batch.peakAir = Math.max(batch.peakAir, air);

      if (air > profile.safeAir) {
        const over = (air - profile.safeAir) / Math.max(0.01, 1 - profile.safeAir);
        batch.drift += over * profile.driftSensitivity * 100 * dtMin;
      }

      runWarnings(profile, air);

      if (batch.drift >= tunnel.driftFailPercent) {
        batch.drift = tunnel.driftFailPercent;
        finish("drift");
        return;
      }
      if (batch.distance >= tunnel.lengthMeters) {
        finish("exit");
        return;
      }
      if (batch.minutes >= profile.targetTime * 1.35) {
        finish("timeout");
      }
    }

    function formatMinutes(minutes) {
      const total = Math.max(0, Math.floor(minutes * 60 + 1e-7));
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    }

    function setControls(next) {
      if (!next) return;
      if (Number.isFinite(Number(next.damper))) {
        state.controls.damper = clamp(Number(next.damper), 0, 1);
      }
      if (Number.isFinite(Number(next.gap))) {
        state.controls.gap = clamp(Number(next.gap), 10, 40);
      }
      if (Number.isFinite(Number(next.speed))) {
        state.controls.speed = clamp(Number(next.speed), 0.6, 2.2);
      }
    }

    function start() {
      if (state.status !== "idle") return false;
      state.status = "running";
      state.blockage = false;
      emit(`启动 ${currentProfile().index} 批：风门 ${Math.round(state.controls.damper * 100)}%`);
      return true;
    }

    function advance() {
      if (!state.result || !state.result.pass || state.campaignComplete) return false;
      state.batchIndex += 1;
      state.batch = initialBatch(currentProfile());
      state.result = null;
      state.status = "idle";
      state.blockage = false;
      emit(`装载 ${currentProfile().index} 批：${currentProfile().name}`);
      return true;
    }

    function retry() {
      state.batch = initialBatch(currentProfile());
      state.result = null;
      state.status = "idle";
      state.blockage = false;
      emit(`重试 ${currentProfile().index} 批，已耗能保留`);
      return true;
    }

    function reset() {
      state.batchIndex = 0;
      state.batch = initialBatch(profiles[0]);
      state.status = "idle";
      state.blockage = false;
      state.blockageCount = 0;
      state.energyTotal = 0;
      state.totalRunSeconds = 0;
      state.result = null;
      state.campaignComplete = false;
      state.campaignSuccess = false;
      events.length = 0;
      emit("产线复位，等待首批入舱");
      return true;
    }

    function abort() {
      if (state.status !== "running") return false;
      state.status = "idle";
      state.blockage = false;
      state.batch = initialBatch(currentProfile());
      emit("操作员急停，本批物料已隔离", "alert");
      return true;
    }

    function simulateBlockage() {
      if (state.status !== "running" || state.blockage) return false;
      state.blockage = true;
      state.blockageCount += 1;
      emit("E-03 风机堵塞：冷气流量骤降", "alert");
      return true;
    }

    function clearBlockage() {
      if (!state.blockage) return false;
      state.blockage = false;
      emit("风机清理完成，风量恢复", "success");
      return true;
    }

    function snapshot() {
      const profile = currentProfile();
      const batch = state.batch;
      return {
        status: state.status,
        batchIndex: state.batchIndex,
        batchCount: profiles.length,
        profile,
        controls: { ...state.controls },
        temp: round(batch.temp, 2),
        distance: round(batch.distance, 3),
        progress: round(batch.distance / tunnel.lengthMeters, 4),
        minutes: round(batch.minutes, 3),
        minutesLabel: formatMinutes(batch.minutes),
        drift: round(batch.drift, 1),
        energy: round(batch.energy, 2),
        energyTotal: round(state.energyTotal, 2),
        energyLimit: tunnel.energyLimitKwh,
        blockage: state.blockage,
        blockageCount: state.blockageCount,
        effectiveAir: round(effectiveAir(), 4),
        airVelocity: round(airVelocity(), 2),
        rpm: fanRpm(),
        fanPower: round(fanPowerKw(), 2),
        result: state.result,
        campaignComplete: state.campaignComplete,
        campaignSuccess: state.campaignSuccess,
        events: events.slice()
      };
    }

    return {
      state,
      start,
      update,
      setControls,
      advance,
      retry,
      reset,
      abort,
      simulateBlockage,
      clearBlockage,
      snapshot,
      formatMinutes
    };
  }

  return { createEngine, clamp, round };
});
