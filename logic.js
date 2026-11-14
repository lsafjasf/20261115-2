// Pure game logic shared by browser and Node tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CameraLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ZONES = [
    { id: "near", label: "近景", min: 1.5, max: 4 },
    { id: "mid", label: "中景", min: 6, max: 12 },
    { id: "far", label: "远景", min: 18, max: 35 },
  ];

  const APERTURES = [4, 5.6, 8, 11, 16, 22, 32, 45, 64];
  const SHUTTERS = [1, 1/2, 1/4, 1/8, 1/15, 1/30, 1/60, 1/125, 1/250, 1/500];

  const FOCUS_MIN = 1.2;
  const FOCUS_MAX = 45;
  const EXPOSURE_TOLERANCE = 0.7;
  const FILM_TOTAL = 8;
  const KEEPERS_NEEDED = 3;

  function zoneOf(distance) {
    for (const z of ZONES) if (distance >= z.min && distance <= z.max) return z.id;
    return null;
  }

  function focusTolerance(birdDistance, aperture) {
    return birdDistance * 0.06 * Math.sqrt(aperture / 8) + 0.15;
  }

  function focusError(focusDistance, birdDistance, aperture) {
    const err = Math.abs(focusDistance - birdDistance);
    const tol = focusTolerance(birdDistance, aperture);
    return { err, tol, ok: err <= tol, ratio: Math.min(err / tol, 1) };
  }

  function exposureError(aperture, shutter, sceneEV) {
    return Math.log2((aperture * aperture) / shutter) - sceneEV;
  }

  function exposureOk(aperture, shutter, sceneEV) {
    return Math.abs(exposureError(aperture, shutter, sceneEV)) <= EXPOSURE_TOLERANCE;
  }

  function createGame(rng) {
    const rand = rng || Math.random;
    return {
      rand, film: FILM_TOTAL, keepers: [], shots: [],
      status: "playing", sceneEV: 13, bird: null, nextBirdIn: 1.5,
    };
  }

  function spawnBird(game) {
    const zone = ZONES[Math.floor(game.rand() * ZONES.length)];
    const distance = zone.min + game.rand() * (zone.max - zone.min);
    game.bird = { distance, timeLeft: 4 + game.rand() * 3, zone: zone.id };
    return game.bird;
  }

  function tick(game, dt) {
    if (game.status !== "playing") return;
    game.sceneEV += (game.rand() - 0.5) * 0.25 * dt;
    game.sceneEV = Math.max(11, Math.min(15, game.sceneEV));
    if (game.bird) {
      game.bird.timeLeft -= dt;
      if (game.bird.timeLeft <= 0) {
        game.bird = null;
        game.nextBirdIn = 1.5 + game.rand() * 2.5;
      }
    } else {
      game.nextBirdIn -= dt;
      if (game.nextBirdIn <= 0) spawnBird(game);
    }
  }

  function shoot(game, focusDistance, aperture, shutter) {
    if (game.status !== "playing") return { error: "游戏已结束" };
    if (game.film <= 0) return { error: "胶片已用完" };
    game.film -= 1;

    const result = { framesLeft: game.film, bird: game.bird ? game.bird.distance : null };
    if (!game.bird) {
      result.verdict = "blank";
      result.reason = "取景器里没有鸟";
    } else {
      const f = focusError(focusDistance, game.bird.distance, aperture);
      const evErr = exposureError(aperture, shutter, game.sceneEV);
      result.focus = f;
      result.exposureErr = evErr;
      if (!f.ok) {
        result.verdict = "misfocus";
        result.reason = "失焦";
      } else if (Math.abs(evErr) > EXPOSURE_TOLERANCE) {
        result.verdict = "badexposure";
        result.reason = evErr > 0 ? "欠曝" : "过曝";
      } else {
        const zone = game.bird.zone;
        const duplicate = game.keepers.includes(zone);
        result.verdict = "keeper";
        result.zone = zone;
        result.reason = duplicate ? "清晰合格，但距离分区重复" : "成功！";
        if (!duplicate) game.keepers.push(zone);
        game.bird = null;
        game.nextBirdIn = 1.5 + game.rand() * 2.5;
      }
    }
    game.shots.push(result);
    if (game.keepers.length >= KEEPERS_NEEDED) game.status = "won";
    else if (game.film <= 0) game.status = "lost";
    return result;
  }

  return {
    ZONES, APERTURES, SHUTTERS, FOCUS_MIN, FOCUS_MAX,
    EXPOSURE_TOLERANCE, FILM_TOTAL, KEEPERS_NEEDED,
    zoneOf, focusTolerance, focusError, exposureError, exposureOk,
    createGame, spawnBird, tick, shoot,
  };
});
