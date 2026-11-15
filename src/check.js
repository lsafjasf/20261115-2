// Geometric verification of a generated facade model.
// Every check is a pure predicate over the model, so the same rules run in
// the CLI report, the browser UI and the automated tests.
function intersects(a, b, pad = 0) {
  return (
    a.x < b.x + b.width + pad &&
    a.x + a.width + pad > b.x &&
    a.y < b.y + b.height + pad &&
    a.y + a.height + pad > b.y
  );
}

export function checkFacade(model) {
  const violations = [];
  const structures = [...model.columns, ...model.beams];

  for (const w of model.windows) {
    for (const s of structures) {
      if (intersects(w, s)) {
        violations.push(`window(floor ${w.cellFloor}, bay ${w.cellBay}) overlaps a structural member`);
      }
    }
    const cell = model.cells.find((c) => c.floor === w.cellFloor && c.bay === w.cellBay);
    if (cell && !inside(w, cell)) {
      violations.push(`window(floor ${w.cellFloor}, bay ${w.cellBay}) leaves its structural cell`);
    }
  }

  const groundWindows = model.windows.filter((w) => w.cellFloor === 0);
  for (const w of groundWindows) {
    if (intersects(w, model.door, 2)) {
      violations.push(`ground-floor window(bay ${w.cellBay}) crosses the door opening`);
    }
  }

  const doorCell = model.cells.find((c) => c.floor === 0 && c.bay === model.door.cellBay);
  if (doorCell && !inside(model.door, doorCell)) {
    violations.push('door leaves its structural cell');
  }
  if (model.door.y + model.door.height > model.groundLineY + 1) {
    violations.push('door crosses the ground line');
  }
  // A door must reach the ground, so contact with the plinth beam is expected;
  // only columns and floor beams count as forbidden overlaps.
  for (const s of model.columns) {
    if (intersects(model.door, s)) violations.push('door overlaps a structural member');
  }
  for (const s of model.beams.slice(1)) {
    if (intersects(model.door, s)) violations.push('door overlaps a floor beam');
  }

  for (const shade of model.sunshades) {
    for (const col of model.columns) {
      if (intersects(shade, col)) violations.push('sunshade overlaps a column');
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    stats: {
      floors: model.params.floors,
      bays: model.params.bays,
      windowCount: model.windows.length,
      groundWindowCount: groundWindows.length,
      doorBay: model.door.cellBay,
      sunshadeCount: model.sunshades.length
    }
  };
}

function inside(inner, outer) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
