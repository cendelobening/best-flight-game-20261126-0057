[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/cendelobening/best-flight-game-20261126-0057/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/cendelobening/best-flight-game-20261126-0057/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

# Ember Isles Airmail

A bush-plane mail run over a volcanic island chain — an original flight game
built for the [make.fun best flight game bounty](https://make.fun/c/best-flight-game-20261126-0057).
Fly a single-engine mail plane in a chase or cockpit view over recognisable
terrain: a smoking volcano, palm-covered isles, open sea and a lit runway.
Thread glowing sky rings, mind your fuel, and set her down gently on the
strip — the sea is not a runway.

## Play

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and open
http://localhost:8080). No network, no build step, no libraries — plain
static files and vanilla JavaScript.

- **Arrows / WASD** — pitch and bank
- **Shift / Ctrl** — throttle up / down (mouse wheel works too)
- **Mouse drag** — steer; **Space** — brake; **F** — flaps
- **C** — chase / cockpit camera · **P** — pause · **M** — mute · **R** — restart

## Missions

1. **Ring Run** — thread all 8 sky rings over the Ember valley, then land.
2. **Island Hop** — lift off, round Palm Cay, and land back on the strip.
3. **Storm Courier** — clear the rings before the 3:30 storm clock runs out.

Landing on the lit runway refuels the plane and banks your score. Fuel burns
with throttle, hard ground contact adds damage, and stalling below flying
speed drops you out of the sky.

## HUD

Altitude, airspeed and heading are always lit: compass tape across the top,
airspeed and altitude tapes left and right, an artificial horizon, throttle /
fuel / damage gauges, a mission line, a score and a target chevron that
points at the next ring, the cay or the runway.

## How it is built

Pure standard library, no dependencies: a minimal software 3D renderer on
Canvas 2D (yaw/pitch/roll camera, painter-sorted terrain, runway, rings,
trees, huts, clouds and volcano smoke), an arcade flight model, a seeded
procedural island chain, and WebAudio-synthesised engine, wind, chime and
crash sounds.

- `game/src/config.js` — constants, palette and mission definitions
- `game/src/random.js` — seeded random numbers and value noise
- `game/src/world.js` — island terrain, runway, palms, huts, clouds
- `game/src/physics.js` — arcade flight model and ground contact
- `game/src/input.js` — keyboard and mouse input
- `game/src/audio.js` — synthesised WebAudio sounds
- `game/src/render.js` — software 3D renderer and the plane model
- `game/src/hud.js` — lit instruments: tapes, horizon, gauges
- `game/src/missions.js` — missions, scoring, fuel and damage
- `game/src/shots.js` — deterministic screenshot scenes (`?shot=`)
- `game/src/main.js` — game loop and state machine
- `main.ts` — hand-in program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with `vendor/makefun-game.ts`

## License

MIT — see `LICENSE`.
