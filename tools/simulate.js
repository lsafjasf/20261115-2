import { stepFlight, createFlight, flightSummary, dropBallast } from "../src/physics.js";
import { createPilot, pilotInput } from "../src/pilot.js";

const flight = createFlight();
const pilot = createPilot();
const dt = 1 / 120;

for (let frame = 0; frame < 120 * 80 && flight.phase === "flying"; frame += 1) {
  const input = pilotInput(flight, pilot, dt);
  stepFlight(flight, input, dt);
  if (frame % 1200 === 0) {
    console.log(
      `t=${flight.time.toFixed(1)} x=${flight.x.toFixed(0)} y=${flight.y.toFixed(0)}`,
      `temp=${flight.temp.toFixed(2)} ballast=${flight.ballast}`,
    );
  }
}

console.log(JSON.stringify(flightSummary(flight), null, 2));
if (flight.outcome !== "success") process.exitCode = 1;
