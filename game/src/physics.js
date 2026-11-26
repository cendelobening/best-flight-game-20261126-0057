// Ember Isles Airmail — arcade flight model: throttle, lift, stall, turns,
// wind gusts, ground and water contact. State is plain data; step() advances
// it one fixed tick. Angles: heading 0 = north (-z), pitch + = nose up.

import { PLANE, RUNWAY } from './config.js';
import { clamp, angleDiff } from './random.js';
import { groundHeight, onRunway } from './world.js';

export function makePlane() {
  return {
    x: RUNWAY.x,
    y: RUNWAY.elevation + 2,
    z: RUNWAY.z - RUNWAY.length / 2 + 40, // parked at the north end
    heading: Math.PI, // south, down the strip towards the sea
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    airborne: false,
    airTime: 0, // seconds since liftoff; guards the landing check at takeoff
    verticalSpeed: 0,
    flaps: false,
    brake: false,
    wind: 0, // current crosswind gust, m/s
    windHeading: 0,
  };
}

// ctl: { pitch: -1..1 (pull = +), bank: -1..1 (right = +),
//        throttleDelta: -1..1, brake: bool, flaps: bool }
export function stepPlane(p, ctl, dt, windGust) {
  // Throttle.
  p.throttle = clamp(p.throttle + ctl.throttleDelta * dt * 0.7, 0, 1);
  p.brake = ctl.brake;
  p.flaps = ctl.flaps;

  // Wind gusts push the nose sideways a touch and buffet the wings.
  p.wind = windGust;
  const gustPush = windGust * 0.02 * dt;

  // Speed: thrust vs drag, plus a rolling penalty on the ground.
  const thrust = p.throttle * PLANE.accel * (p.fuel > 0 ? 1 : 0);
  const drag = PLANE.drag * p.speed * p.speed * 0.02;
  let accel = thrust - drag;
  if (!p.airborne) {
    accel -= p.brake ? 26 : 1.2; // rolling friction / brakes
    if (p.speed < 0.5 && thrust < 2) accel = 0;
  }
  p.speed = Math.max(0, p.speed + accel * dt);

  // Take-off and stall.
  const stall = PLANE.stallSpeed * (p.flaps ? 0.85 : 1);
  if (!p.airborne && p.speed > stall + 6 && ctl.pitch > 0.15) p.airborne = true;
  if (p.airborne && p.speed < stall * 0.8) p.airborne = false;

  // Attitude follows the stick, eased toward it; bank drives the turn.
  const targetBank = clamp(ctl.bank, -1, 1) * PLANE.maxBank;
  const targetPitch = clamp(ctl.pitch, -1, 1) * PLANE.maxPitch;
  const ease = 1 - Math.exp(-dt * 3.2);
  p.bank += (targetBank - p.bank) * ease;
  p.pitch += (targetPitch - p.pitch) * ease;

  if (p.airborne) {
    p.airTime += dt;
    p.heading += Math.sin(p.bank) * PLANE.turnRate * dt * clamp(p.speed / 40, 0.3, 1.4);
    p.heading += gustPush;
    // Climb from pitch when the wing flies; sink when slow or idle.
    const lift = clamp((p.speed - stall) / 30, -0.6, 1);
    let climb = Math.sin(p.pitch) * PLANE.climbRate * lift;
    if (p.speed < stall) climb -= (stall - p.speed) * 0.35;
    if (p.throttle < 0.1) climb -= PLANE.sinkRate * 0.25;
    p.verticalSpeed = climb;
    p.y += climb * dt;
  } else {
    p.verticalSpeed = 0;
    p.airTime = 0;
    p.pitch *= 1 - Math.min(1, dt * 4);
    p.bank *= 1 - Math.min(1, dt * 4);
    p.y = groundHeight(p.x, p.z) + 2;
  }

  // Move along the heading.
  const ch = Math.cos(p.heading);
  const sh = Math.sin(p.heading);
  p.x += sh * p.speed * dt;
  p.z += -ch * p.speed * dt;

  // Fuel burns with throttle; empty tanks mean a glider.
  if (p.throttle > 0 && p.fuel > 0) {
    p.fuel = Math.max(0, p.fuel - PLANE.fuelBurn * p.throttle * dt);
  }

  return contact(p);
}

// Ground / water contact. Returns 'ok' | 'landed' | 'crash' | 'ditch'.
function contact(p) {
  const g = groundHeight(p.x, p.z);
  const gear = 2; // gear touches 2 m below the fuselage centre
  if (g < 0.5 && p.y <= 1.2) return 'ditch'; // into the sea
  const clearance = p.y - gear - g; // wheel height above the ground
  if (clearance > 0.6) return 'ok';
  const vs = Math.abs(p.verticalSpeed);
  const onStrip = onRunway(p.x, p.z, 4);
  if (p.airborne) {
    // A real touchdown: a descent onto the strip after a proper sortie —
    // not the instant of liftoff, when the wheels are still kissing it.
    if (onStrip && vs < 4.5 && p.speed < 55 && Math.abs(p.bank) < 0.35 && p.airTime > 2 && p.verticalSpeed < 1) {
      p.airborne = false;
      p.y = g + 2;
      return 'landed';
    }
    // Lifting off: the wheels just left the ground, let her climb — but
    // only right at the ground; a climbing plane deep under a hillside
    // is a crash, not a liftoff.
    if (p.verticalSpeed > 0.5 && clearance > -1) return 'ok';
    // Wheels skimming the strip — a bounce or a touch-and-go, not a crash.
    if (onStrip && vs < 4.5 && clearance > -0.5) {
      p.y = g + 2;
      return 'ok';
    }
    return 'crash';
  }
  p.y = g + 2;
  return 'ok';
}

export function headingDegrees(p) {
  // Bearing in degrees, 0 = north, clockwise: heading h rad points along
  // (sin h, -cos h), so its bearing is h converted to degrees, wrapped.
  let d = ((p.heading * 180) / Math.PI) % 360;
  if (d < 0) d += 360;
  return d;
}

export function distanceTo(p, target) {
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dz = target.z - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function bearingTo(p, target) {
  // Bearing in degrees, 0 = north, clockwise.
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  let b = (Math.atan2(dx, -dz) * 180) / Math.PI;
  if (b < 0) b += 360;
  return b;
}

export function relativeBearing(p, target) {
  const b = bearingTo(p, target) - headingDegrees(p);
  let r = b % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

export { angleDiff };
