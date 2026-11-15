(function attachTunnelData(root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = data;
  }
  if (root) {
    root.TUNNEL_DATA = data;
  }
})(typeof window !== "undefined" ? window : null, () => {
  const tunnel = {
    lengthMeters: 12,
    airTemp: -30,
    initialCoreTemp: 8,
    energyLimitKwh: 16.5,
    simulationRate: 45,
    blockageFlowFactor: 0.12,
    blockageRpmFactor: 0.16,
    driftFailPercent: 100
  };

  const profiles = [
    {
      id: "strawberry",
      index: "01",
      name: "轻质草莓",
      shortName: "草莓",
      visual: "strawberry",
      tagline: "高含水、低密度，最怕强风。",
      processTip: "风门先压低再进料。轻质果体超过安全风速会横向滑移。",
      targetTemp: -18,
      targetTime: 8,
      idealAir: 0.46,
      safeAir: 0.55,
      minAir: 0.34,
      idealGap: 30,
      gapSigma: 6.5,
      idealSpeed: 1.5,
      driftSensitivity: 2.4
    },
    {
      id: "dumpling",
      index: "02",
      name: "手工饺子",
      shortName: "饺子",
      visual: "dumpling",
      tagline: "中等密度，面皮需要均匀冷风。",
      processTip: "饺子堆叠会遮风，间距比首批更紧，风量需要中档。",
      targetTemp: -18,
      targetTime: 10,
      idealAir: 0.64,
      safeAir: 0.78,
      minAir: 0.48,
      idealGap: 22,
      gapSigma: 5.5,
      idealSpeed: 1.2,
      driftSensitivity: 1.8
    },
    {
      id: "beef",
      index: "03",
      name: "厚切牛肉",
      shortName: "牛肉",
      visual: "beef",
      tagline: "大块高密度，中心热阻最高。",
      processTip: "牛肉需要强风穿透，但最高风门也要守住剩余能耗。",
      targetTemp: -18,
      targetTime: 12,
      idealAir: 0.82,
      safeAir: 0.95,
      minAir: 0.68,
      idealGap: 15,
      gapSigma: 4.5,
      idealSpeed: 1.0,
      driftSensitivity: 1.25
    }
  ];

  return { tunnel, profiles };
});
