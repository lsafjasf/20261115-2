// Shared geometric constants and default generator parameters.
export const GROUND_FLOOR_H = 140;
export const UPPER_FLOOR_H = 112;
export const COLUMN_W = 14;
export const BEAM_H = 14;
export const MARGIN_X = 30;
export const MARGIN_TOP = 36;
export const PLINTH_H = 22;
export const PARAPET_H = 26;
export const CELL_GAP = 10;
export const CORNER_RETURN_W = 64;

export const DEFAULT_PARAMS = {
  seed: 7,
  floors: 4,          // total floors including ground floor
  bays: 6,
  paneRatio: 1.5,     // window width / height
  sunshades: 'some',  // 'none' | 'some' | 'all'
  sunshadeDepth: 18,
  sign: 'parapet',    // 'none' | 'parapet' | 'above-door' | 'side-wall'
  constructionLines: true
};

// ASCII-only so the built-in raster font can render every export format.
export const SIGN_TEXTS = ['CORNER CAFE', 'BAKERY', '24H', 'BOOKS', 'PHARMACY', 'TEA HOUSE'];
