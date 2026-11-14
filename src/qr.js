import qrcode from "qrcode-generator";

export function createQR(value) {
  const qr = qrcode(0, "H");
  qr.addData(value);
  qr.make();

  const size = qr.getModuleCount();
  const matrix = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => qr.isDark(row, col)),
  );

  return {
    value,
    size,
    matrix,
    version: (size - 17) / 4,
  };
}

export function getFinderZones(size) {
  const pattern = 7;
  const guard = 1;
  return [
    { id: "tl", label: "左上", row: 0, col: 0 },
    { id: "tr", label: "右上", row: 0, col: size - pattern },
    { id: "bl", label: "左下", row: size - pattern, col: 0 },
  ].map((zone) => ({
    ...zone,
    startRow: Math.max(0, zone.row - guard),
    startCol: Math.max(0, zone.col - guard),
    endRow: Math.min(size - 1, zone.row + pattern),
    endCol: Math.min(size - 1, zone.col + pattern),
    patternRow: zone.row,
    patternCol: zone.col,
  }));
}

export function isFinderModule(row, col, size) {
  return getFinderZones(size).some(
    (zone) =>
      row >= zone.startRow &&
      row <= zone.endRow &&
      col >= zone.startCol &&
      col <= zone.endCol,
  );
}

export function isFinderDark(localRow, localCol) {
  const edge =
    localRow === 0 ||
    localRow === 6 ||
    localCol === 0 ||
    localCol === 6;
  const core =
    localRow >= 2 &&
    localRow <= 4 &&
    localCol >= 2 &&
    localCol <= 4;
  return edge || core;
}

export function getLogoModules(size, logo) {
  if (!logo || logo === "none") {
    return null;
  }

  const span = Math.max(5, Math.round(size * 0.19));
  const start = Math.floor((size - span) / 2);
  return {
    start,
    end: start + span - 1,
    span,
    coverage: (span * span) / (size * size),
  };
}

export function isInsideLogo(row, col, size, logo) {
  const box = getLogoModules(size, logo);
  if (!box) {
    return false;
  }
  return (
    row >= box.start &&
    row <= box.end &&
    col >= box.start &&
    col <= box.end
  );
}
