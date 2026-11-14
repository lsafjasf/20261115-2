export const DESIGN_PRESETS = [
  {
    id: "tide",
    name: "潮汐档案",
    code: "FIELD NOTE 04",
    destination: "https://scanframe.studio/tide-archive",
    tagline: "暖纸、海盐与一枚不抢戏的码。",
    style: {
      foreground: "#123C33",
      background: "#F0E5CF",
      accent: "#D9573D",
      texture: "grain",
      textureStrength: 24,
      logo: "sun",
    },
    copy: {
      eyebrow: "SCANFRAME / FIELD NOTES",
      title: ["TIDE", "ARCHIVE"],
      subtitle: "SALT, LIGHT & THINGS THAT RETURN",
      body: [
        "A slow study of the coastline,",
        "collected between the last warm",
        "days and the first long shadows.",
      ],
      edition: "VOL. 04  ·  AUTUMN 2026",
      callout: "SCAN TO ENTER",
      caption: "原码保留完整静区，中心图形远离三枚定位块。",
    },
  },
  {
    id: "night",
    name: "夜航电台",
    code: "TRANSMISSION 88.4",
    destination: "https://scanframe.studio/night-shift",
    tagline: "黑白骨架配一束电光绿，清晰得毫不无聊。",
    style: {
      foreground: "#111814",
      background: "#E9E3D2",
      accent: "#C9F04A",
      texture: "grid",
      textureStrength: 13,
      logo: "orbit",
    },
    copy: {
      eyebrow: "NIGHT SHIFT / LIVE TRANSMISSION",
      title: ["NIGHT", "SHIFT"],
      subtitle: "A FREQUENCY FOR THE AFTER HOURS",
      body: [
        "Signals for the city after midnight,",
        "mixed from field recordings, radio",
        "hum and the occasional passing train.",
      ],
      edition: "FM 88.4  ·  23:00 — LATE",
      callout: "TUNE IN / SCAN",
      caption: "三枚定位块独立锁定，纹理与图形不得越界。",
    },
  },
];

export const LOGO_OPTIONS = [
  { id: "sun", label: "日轮", glyph: "SUN" },
  { id: "orbit", label: "轨道", glyph: "ORBIT" },
  { id: "leaf", label: "叶片", glyph: "LEAF" },
  { id: "disc", label: "唱片", glyph: "DISC" },
  { id: "none", label: "无图形", glyph: "CLEAN" },
];

export const TEXTURE_OPTIONS = [
  { id: "grain", label: "纸纹" },
  { id: "dots", label: "漏点" },
  { id: "grid", label: "网印" },
  { id: "waves", label: "波纹" },
  { id: "none", label: "纯色" },
];

export function getPreset(id) {
  return DESIGN_PRESETS.find((preset) => preset.id === id) ?? DESIGN_PRESETS[0];
}

export function clonePresetState(preset) {
  return {
    presetId: preset.id,
    ...preset.style,
    textureStrength: preset.style.textureStrength,
  };
}
