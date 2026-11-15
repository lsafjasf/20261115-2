export const STORAGE_KEY = "cutloop.project.v1";

export const SCENE_BLUEPRINTS = [
  {
    id: "first-light",
    number: "01",
    title: "First Light",
    subtitle: "ORBITAL DAWN / ANAMORPHIC STUDY",
    preset: "orbit",
    duration: 4.2,
    accent: "#ff9a68",
    ink: "#1a1c2d"
  },
  {
    id: "tide-signal",
    number: "02",
    title: "Tide Signal",
    subtitle: "DEEP CURRENT / FREQUENCY SHIFT",
    preset: "tide",
    duration: 4.2,
    accent: "#d7ff6a",
    ink: "#0b2d2e"
  },
  {
    id: "soft-geometry",
    number: "03",
    title: "Soft Geometry",
    subtitle: "PAPER BLOOM / CHROMATIC MOTION",
    preset: "bloom",
    duration: 4.2,
    accent: "#ff7198",
    ink: "#e8dfcf"
  }
];

export const TRANSITION_TYPES = {
  push: {
    label: "推移",
    english: "PUSH",
    glyph: "→",
    note: "双场景横向推移"
  },
  dissolve: {
    label: "叠化",
    english: "DISSOLVE",
    glyph: "◐",
    note: "双场景透明度融合"
  },
  mask: {
    label: "遮罩",
    english: "MASK",
    glyph: "◎",
    note: "圆形遮罩向外展开"
  },
  flash: {
    label: "闪白",
    english: "FLASH",
    glyph: "✦",
    note: "高光峰值过渡"
  }
};

export const DEFAULT_TRANSITIONS = [
  { type: "push", duration: 1.1 },
  { type: "mask", duration: 1.25 }
];

export function createDefaultProject() {
  return normalizeProject({
    version: 1,
    title: "Three Movements",
    scenes: SCENE_BLUEPRINTS.map((scene) => ({ ...scene })),
    transitions: DEFAULT_TRANSITIONS.map((transition) => ({ ...transition }))
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeDuration(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, 0.25, 2.2) : fallback;
}

function blueprintFor(scene) {
  const blueprint = SCENE_BLUEPRINTS.find((item) => item.id === scene?.id);
  if (blueprint) {
    return {
      ...blueprint,
      duration: Number.isFinite(Number(scene.duration))
        ? clamp(Number(scene.duration), 2.5, 7)
        : blueprint.duration
    };
  }

  const preset = SCENE_BLUEPRINTS.find((item) => item.preset === scene?.preset);
  if (!preset) return null;

  return {
    ...preset,
    id: String(scene.id),
    number: String(scene.number || preset.number).slice(0, 3),
    title: String(scene.title || preset.title).slice(0, 40),
    subtitle: String(scene.subtitle || preset.subtitle).slice(0, 64),
    duration: Number.isFinite(Number(scene.duration))
      ? clamp(Number(scene.duration), 2.5, 7)
      : preset.duration
  };
}

export function normalizeProject(rawProject) {
  const rawScenes = Array.isArray(rawProject?.scenes) ? rawProject.scenes : [];
  const scenes = [];
  const seen = new Set();

  for (const rawScene of rawScenes) {
    const scene = blueprintFor(rawScene);
    if (!scene || seen.has(scene.id)) continue;
    seen.add(scene.id);
    scenes.push(scene);
  }

  for (const blueprint of SCENE_BLUEPRINTS) {
    if (!seen.has(blueprint.id)) {
      scenes.push({ ...blueprint });
      seen.add(blueprint.id);
    }
  }

  const transitions = [];
  for (let index = 0; index < scenes.length - 1; index += 1) {
    const raw = rawProject?.transitions?.[index];
    const fallback = DEFAULT_TRANSITIONS[index] || { type: "dissolve", duration: 1 };
    const type = raw?.type && TRANSITION_TYPES[raw.type] ? raw.type : fallback.type;
    const maxDuration = Math.max(
      0.25,
      Math.min(scenes[index].duration, scenes[index + 1].duration) - 0.2
    );
    transitions.push({
      type,
      duration: Math.min(safeDuration(raw?.duration, fallback.duration), maxDuration)
    });
  }

  return {
    version: 1,
    title: "Three Movements",
    scenes,
    transitions
  };
}

export function loadProject() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { project: createDefaultProject(), restored: false };
    return { project: normalizeProject(JSON.parse(stored)), restored: true };
  } catch {
    return { project: createDefaultProject(), restored: false };
  }
}

export function saveProject(project) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeProject(project)));
}

export function clearSavedProject() {
  localStorage.removeItem(STORAGE_KEY);
}

export function buildTimeline(project) {
  const scenes = [];
  let cursor = 0;

  project.scenes.forEach((scene, index) => {
    if (index > 0) {
      cursor -= project.transitions[index - 1].duration;
    }

    const start = cursor;
    cursor += scene.duration;
    scenes.push({
      scene,
      index,
      start,
      end: start + scene.duration,
      duration: scene.duration
    });
  });

  const transitions = project.transitions.map((transition, index) => {
    const from = scenes[index];
    const to = scenes[index + 1];
    return {
      ...transition,
      index,
      from,
      to,
      start: to.start,
      end: to.start + transition.duration
    };
  });

  const total = scenes.length ? scenes[scenes.length - 1].end : 0;
  return { scenes, transitions, total };
}

export function resolvePlaybackState(timeline, time) {
  const clampedTime = clamp(Number(time) || 0, 0, timeline.total);
  const activeTransition = timeline.transitions.find(
    (transition) => clampedTime >= transition.start && clampedTime < transition.end
  );

  if (activeTransition) {
    const progress = clamp(
      (clampedTime - activeTransition.start) / activeTransition.duration,
      0,
      1
    );
    return {
      kind: "transition",
      time: clampedTime,
      transition: activeTransition,
      fromScene: activeTransition.from,
      toScene: activeTransition.to,
      fromLocalTime: clampedTime - activeTransition.from.start,
      toLocalTime: clampedTime - activeTransition.to.start,
      progress
    };
  }

  const activeScene =
    timeline.scenes.find(
      (item) => clampedTime >= item.start && clampedTime < item.end
    ) || timeline.scenes[timeline.scenes.length - 1];

  return {
    kind: "scene",
    time: clampedTime,
    scene: activeScene,
    localTime: clampedTime - activeScene.start
  };
}

export function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const remainder = (safe % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${remainder}`;
}

export function moveScene(project, fromIndex, toIndex) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= project.scenes.length ||
    toIndex >= project.scenes.length ||
    fromIndex === toIndex
  ) {
    return false;
  }

  const next = {
    ...project,
    scenes: project.scenes.map((scene) => ({ ...scene })),
    transitions: project.transitions.map((transition) => ({ ...transition }))
  };
  const [scene] = next.scenes.splice(fromIndex, 1);
  next.scenes.splice(toIndex, 0, scene);
  return next;
}
