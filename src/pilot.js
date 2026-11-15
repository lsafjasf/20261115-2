import { WORLD, dropBallast } from "./physics.js";

function targetAltitude(flight) {
  if (flight.x < 390) return 475;
  if (flight.x < 690) return 462;
  if (flight.x < 840) return 445;
  if (flight.x < 1085) return 408;
  if (flight.x < WORLD.finishX) return 565;
  return 621;
}

export function createPilot() {
  return { lastDropAt: -10 };
}

export function pilotInput(flight, pilot, dt) {
  const target = targetAltitude(flight);
  const desiredVy = Math.max(-34, Math.min(35, (target - flight.y) * 0.55));
  const error = desiredVy - flight.vy;
  const input = {
    burn: error < -2.5 && flight.temp < 0.86,
    vent: error > 5 && flight.temp > 0.34,
  };

  const nearRidge = flight.x > 610 && flight.x < 1040;
  const lowAndSlow = flight.y > target + 34 && flight.vy < 2;
  if (
    nearRidge &&
    lowAndSlow &&
    flight.ballast > 0 &&
    flight.time - pilot.lastDropAt > 2.2
  ) {
    if (dropBallast(flight)) pilot.lastDropAt = flight.time;
  }

  pilot.lastDropAt += dt * 0;
  return input;
}
