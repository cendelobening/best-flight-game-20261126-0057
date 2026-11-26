// Ember Isles Airmail — the island chain: terrain height, runway flattening,
// palm groves, huts, clouds and the volcano. Everything is analytic so the
// physics and the renderer always agree about the ground.

import { makeNoise2D, fbm, clamp, lerp } from './random.js';
import { RUNWAY, WORLD } from './config.js';

const noise = makeNoise2D(20261126);

// Island cones: [x, z, radius, height].
const ISLANDS = [
  { x: -650, z: -750, r: 1150, h: 430 }, // Ember Isle, the volcano
  { x: 950, z: 650, r: 520, h: 95 }, // Palm Cay
  { x: 420, z: -1450, r: 330, h: 60 }, // Turtle Rock
  { x: -1550, z: 1150, r: 420, h: 70 }, // Gull Rock
];

function cone(x, z, isl) {
  const dx = x - isl.x;
  const dz = z - isl.z;
  const d = Math.sqrt(dx * dx + dz * dz) / isl.r;
  if (d >= 1) return 0;
  // Smooth dome with a cratered top on the volcano.
  let h = isl.h * Math.pow(Math.cos(d * Math.PI * 0.5), 1.4);
  if (isl.h > 300) {
    const crater = Math.sqrt(dx * dx + dz * dz);
    if (crater < 130) h -= (130 - crater) * 0.9; // volcano crater bowl
  }
  return h;
}

function ridge(x, z) {
  // A broken ridge along the Ember valley for the rings to thread.
  const n = fbm(noise, x * 0.0011 + 7.3, z * 0.0011 - 2.1, 3);
  return Math.max(0, n) * 90 * Math.exp(-Math.pow((x + 700) / 700, 2));
}

// Raw terrain height in metres; sea level is 0.
export function groundHeight(x, z) {
  let h = -26; // ocean floor
  for (const isl of ISLANDS) h += cone(x, z, isl);
  h += ridge(x, z);
  h += fbm(noise, x * 0.004 + 31, z * 0.004 - 17, 3) * 14;
  // Flatten the runway strip so landings are fair.
  const rx = x - RUNWAY.x;
  const rz = z - RUNWAY.z;
  const along = Math.abs(rz);
  const across = Math.abs(rx);
  if (along < RUNWAY.length / 2 + 90 && across < RUNWAY.width / 2 + 90) {
    const t = clamp(
      Math.min(
        (RUNWAY.length / 2 + 90 - along) / 90,
        (RUNWAY.width / 2 + 90 - across) / 90,
      ),
      0,
      1,
    );
    h = lerp(h, RUNWAY.elevation, t * t * (3 - 2 * t));
  }
  return h;
}

export function isWater(x, z) {
  return groundHeight(x, z) < 0.5;
}

export function onRunway(x, z, margin = 0) {
  return (
    Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 + margin &&
    Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + margin
  );
}

// Palm trees and huts, scattered on dry land away from the runway.
export function buildVegetation() {
  const rand = (() => {
    let s = 918273;
    return () => {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  })();
  const trees = [];
  const huts = [];
  let guard = 0;
  while (trees.length < 240 && guard++ < 4000) {
    const x = (rand() * 2 - 1) * (WORLD.size / 2);
    const z = (rand() * 2 - 1) * (WORLD.size / 2);
    const h = groundHeight(x, z);
    if (h < 4 || h > 130 || onRunway(x, z, 60)) continue;
    trees.push({ x, z, y: h, s: 0.8 + rand() * 0.9, lean: (rand() - 0.5) * 0.25 });
  }
  guard = 0;
  while (huts.length < 26 && guard++ < 2000) {
    const x = (rand() * 2 - 1) * (WORLD.size / 2);
    const z = (rand() * 2 - 1) * (WORLD.size / 2);
    const h = groundHeight(x, z);
    if (h < 6 || h > 60 || onRunway(x, z, 120)) continue;
    huts.push({ x, z, y: h, rot: rand() * Math.PI * 2, s: 0.9 + rand() * 0.5 });
  }
  return { trees, huts };
}

// Puffy clouds drifting over the isles.
export function buildClouds() {
  const clouds = [];
  let s = 445566;
  const rand = () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: (rand() * 2 - 1) * 2600,
      y: 520 + rand() * 320,
      z: (rand() * 2 - 1) * 2600,
      r: 90 + rand() * 160,
      drift: 2 + rand() * 4,
    });
  }
  return clouds;
}

export const VOLCANO = { x: -650, z: -750, peak: 400 };
