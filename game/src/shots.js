// Ember Isles Airmail — deterministic screenshot scenes. ?shot=<name> puts
// the plane in a fixed pose over the same world so headless captures are
// stable renders of the game's own code. No network, no mocks.

import { RUNWAY } from './config.js';

export const SHOTS = {
  // Cover: chase view, mid-flight, runway ahead and the next ring glowing.
  // Seven rings already cleared, chasing the last one home.
  cover: {
    x: 40, y: 175, z: 780, heading: 0.12, pitch: -0.04, bank: 0.1,
    speed: 62, throttle: 0.72, fuel: 78, camera: 'chase', mission: 'rings',
    nextRing: 7,
  },
  // West along the south coast, ring 3 ahead over the beach.
  rings: {
    x: -350, y: 190, z: 980, heading: 5.22, pitch: -0.02, bank: -0.15,
    speed: 68, throttle: 0.8, fuel: 64, camera: 'chase', mission: 'rings',
    nextRing: 2,
  },
  // Cockpit view over the island chain, instruments lit.
  cockpit: {
    x: -180, y: 260, z: 120, heading: 0.5, pitch: -0.06, bank: 0.18,
    speed: 58, throttle: 0.66, fuel: 71, camera: 'cockpit', mission: 'hop',
  },
  // Final approach: low over the numbers, gear down, strip lit.
  landing: {
    x: 6, y: 62, z: 640, heading: 0.02, pitch: -0.08, bank: 0.02,
    speed: 46, throttle: 0.45, fuel: 52, camera: 'chase', mission: 'rings',
    nextRing: 8,
  },
};

export function applyShot(plane, mission, name) {
  const s = SHOTS[name];
  if (!s) return null;
  plane.x = s.x;
  plane.y = s.y;
  plane.z = s.z;
  plane.heading = s.heading;
  plane.pitch = s.pitch;
  plane.bank = s.bank;
  plane.speed = s.speed;
  plane.throttle = s.throttle;
  plane.fuel = s.fuel;
  plane.airborne = true;
  plane.verticalSpeed = 0;
  if (typeof s.nextRing === 'number') {
    for (let i = 0; i < s.nextRing && i < mission.rings.length; i++) {
      mission.rings[i].done = true;
    }
    mission.nextRing = s.nextRing;
    mission.ringsCleared = s.nextRing;
  }
  return { camera: s.camera, missionId: s.mission };
}

export { RUNWAY };
