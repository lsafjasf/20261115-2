export const WORLD = Object.freeze({
  width: 1560,
  baseY: 646,
  startX: 74,
  startY: 548,
  finishX: 1215,
  ridge1: { x: 566, halfWidth: 148, height: 116 },
  ridge2: { x: 966, halfWidth: 152, height: 166 },
  basketRadius: 25,
  totalBallast: 3,
  ambientTemp: 0.18,
});

function bump(x, ridge) {
  const distance = Math.abs(x - ridge.x) / ridge.halfWidth;
  if (distance >= 1) return 0;
  const curve = 1 - distance * distance;
  return ridge.height * curve * curve;
}

export function groundY(x) {
  return WORLD.baseY - bump(x, WORLD.ridge1) - bump(x, WORLD.ridge2);
}

export function windAt(time, y) {
  const higherWind = Math.max(0, Math.min(16, (520 - y) * 0.065));
  const gust = 6.5 * Math.sin(time * 0.82) + 2.4 * Math.sin(time * 2.17 + 0.8);
  return 27 + higherWind + gust;
}

export function createFlight() {
  return {
    phase: "flying",
    time: 0,
    x: WORLD.startX,
    y: WORLD.startY,
    vx: windAt(0, WORLD.startY),
    vy: 0,
    temp: 0.62,
    ballast: WORLD.totalBallast,
    dropped: 0,
    passengers: 3,
    ridge1Passed: false,
    ridge2Passed: false,
    landed: false,
    outcome: null,
    landingSpeed: 0,
    fireX: -230,
    events: [],
    trail: [],
  };
}

export function dropBallast(flight) {
  if (flight.ballast <= 0 || flight.phase !== "flying") return false;
  flight.ballast -= 1;
  flight.dropped += 1;
  flight.temp = Math.min(1, flight.temp + 0.012);
  flight.vy -= 3;
  flight.events.push({ type: "ballast", x: flight.x, y: flight.y + 18 });
  return true;
}

export function stepFlight(flight, input, dt) {
  if (flight.phase !== "flying") return flight.outcome;
  dt = Math.min(dt, 0.05);
  flight.time += dt;
  flight.fireX += (4.1 + Math.sin(flight.time * 0.35) * 0.6) * dt;

  if (flight.time >= 90) {
    flight.phase = "landed";
    flight.landed = true;
    flight.outcome = "too-late";
    flight.events.push({ type: "touchdown", outcome: flight.outcome });
    return flight.outcome;
  }

  if (input.burn) {
    flight.temp += 0.185 * dt;
  }
  if (input.vent) {
    flight.temp -= 0.22 * dt;
  }

  const cooling = 0.034 + 0.058 * Math.max(0, flight.temp - WORLD.ambientTemp);
  flight.temp = Math.max(0.08, Math.min(1, flight.temp - cooling * dt));

  const balancedTemp = 0.555 - 0.045 * flight.dropped;
  const lift = (flight.temp - balancedTemp) * 235;
  const acceleration = -lift - flight.vy * 0.88;
  flight.vy += acceleration * dt;
  flight.y += flight.vy * dt;
  if (flight.y < 36) {
    flight.y = 36;
    flight.vy = Math.max(0, flight.vy);
  }

  const wind = windAt(flight.time, flight.y);
  flight.vx += (wind - flight.vx) * Math.min(1, 0.16 * dt);
  flight.x += flight.vx * dt;

  if (!flight.ridge1Passed && flight.x > WORLD.ridge1.x) {
    flight.ridge1Passed = true;
    flight.events.push({ type: "ridge", index: 1 });
  }
  if (!flight.ridge2Passed && flight.x > WORLD.ridge2.x) {
    flight.ridge2Passed = true;
    flight.events.push({ type: "ridge", index: 2 });
  }

  const bottom = flight.y + WORLD.basketRadius;
  const floor = groundY(flight.x);
  if (bottom >= floor) {
    flight.y = floor - WORLD.basketRadius;
    flight.landingSpeed = Math.max(0, flight.vy);
    flight.landed = true;
    flight.vy = 0;
    flight.vx *= 0.3;
    flight.phase = "landed";

    if (flight.x < WORLD.finishX) {
      flight.outcome = "terrain";
    } else if (flight.landingSpeed > 9.5) {
      flight.outcome = "hard-landing";
    } else if (!flight.ridge1Passed || !flight.ridge2Passed) {
      flight.outcome = "incomplete";
    } else {
      flight.outcome = "success";
    }
    flight.events.push({ type: "touchdown", outcome: flight.outcome });
  }

  if (flight.x > WORLD.width - 20) {
    flight.x = WORLD.width - 20;
    flight.vx = 0;
  }
  if (flight.trail.length === 0 || flight.time - flight.trail.at(-1).time > 0.16) {
    flight.trail.push({ x: flight.x, y: flight.y, time: flight.time });
    if (flight.trail.length > 28) flight.trail.shift();
  }
  return flight.outcome;
}

export function flightSummary(flight) {
  return {
    outcome: flight.outcome,
    time: Number(flight.time.toFixed(2)),
    x: Number(flight.x.toFixed(1)),
    y: Number(flight.y.toFixed(1)),
    temp: Number(flight.temp.toFixed(3)),
    vy: Number(flight.vy.toFixed(2)),
    ridge1Passed: flight.ridge1Passed,
    ridge2Passed: flight.ridge2Passed,
    ballast: flight.ballast,
    landingSpeed: Number(flight.landingSpeed.toFixed(2)),
    passengers: flight.passengers,
  };
}
