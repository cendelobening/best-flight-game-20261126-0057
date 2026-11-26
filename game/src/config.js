// Ember Isles Airmail — shared constants, palette and mission definitions.
// All units are metres, metres per second and degrees unless noted.

export const WORLD = {
  size: 4200, // terrain spans -2100..2100 m on x and z
  seaLevel: 0,
  gravity: 9.81,
};

export const PLANE = {
  stallSpeed: 26, // m/s — below this the wing stops flying
  cruiseSpeed: 62,
  maxSpeed: 98,
  accel: 14, // m/s^2 at full throttle
  drag: 0.055, // quadratic drag coefficient
  climbRate: 13, // m/s at full pull and cruise speed
  sinkRate: 7, // m/s gliding with no power
  turnRate: 0.55, // rad/s at full bank
  maxBank: 1.1, // rad
  maxPitch: 0.6, // rad
  fuelBurn: 0.55, // % per second at full throttle
  fuelCapacity: 100,
};

export const RUNWAY = {
  // Flat strip on Ember Isle, heading south (towards +z): take off over
  // the beach and the open sea, away from the volcano's foothills.
  x: 0,
  z: 260,
  heading: 180, // degrees, 180 = south (+z)
  length: 720,
  width: 34,
  elevation: 12,
};

// Glowing gate rings for the Ring Run, in flight order. The circuit leaves
// the strip to the south, tours the coast west, then comes home east over
// the sea — a gentle altitude profile a bush plane can actually fly, with
// the volcano as the backdrop, and every ring at least 55 m above the
// ground beneath it.
export const RINGS = [
  { x: 150, y: 95, z: 900, r: 20 },
  { x: -350, y: 100, z: 950, r: 20 },
  { x: -800, y: 115, z: 700, r: 20 },
  { x: -950, y: 150, z: 250, r: 20 },
  { x: -600, y: 130, z: 550, r: 20 },
  { x: -150, y: 110, z: 800, r: 20 },
  { x: 350, y: 100, z: 650, r: 20 },
  { x: 550, y: 110, z: 150, r: 20 },
];

export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    blurb: 'Thread all 8 sky rings over the Ember valley, then land on the strip.',
    goal: 'Fly through rings 1-8, then land on the runway.',
  },
  {
    id: 'hop',
    name: 'ISLAND HOP',
    blurb: 'Airmail run: lift off the strip, round Palm Cay, and set her down gently.',
    goal: 'Take off, circle Palm Cay, land back on the runway.',
  },
  {
    id: 'storm',
    name: 'STORM COURIER',
    blurb: 'A squall is rolling in. Beat the clock through the rings before the wind wins.',
    goal: 'Clear all 8 rings before the 3:30 timer runs out.',
  },
];

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7fb2dd',
  skyLow: '#cfe6f2',
  sun: '#fff3c4',
  seaDeep: '#0d4d7a',
  seaShallow: '#2e86b8',
  sand: '#e8d29a',
  grass: '#5d9b4a',
  jungle: '#3e7a35',
  rock: '#a08d78',
  ash: '#8d857c',
  snow: '#e9e6df',
  runway: '#3a3f46',
  runwayLine: '#f5f2e8',
  ring: '#ffb52e',
  ringDone: '#58d68d',
  hudAmber: '#ffb52e',
  hudCyan: '#7fe7ff',
  hudGreen: '#8dff9e',
  hudRed: '#ff5a4e',
  panel: 'rgba(10, 16, 24, 0.72)',
};

export const KEYS = {
  pitchUp: ['ArrowUp', 'KeyW'],
  pitchDown: ['ArrowDown', 'KeyS'],
  bankLeft: ['ArrowLeft', 'KeyA'],
  bankRight: ['ArrowRight', 'KeyD'],
};
