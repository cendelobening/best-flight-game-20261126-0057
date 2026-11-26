// Ember Isles Airmail — game loop and state machine: title, flying, paused,
// crashed and mission complete. Keyboard and mouse fly the plane; the loop
// runs at a fixed 60 Hz tick with real-time rendering.

import { MISSIONS } from './config.js';
import { makePlane, stepPlane } from './physics.js';
import { makeMission, stepMission, missionLine, timerText, hudTargetInfo } from './missions.js';
import { makeRenderer } from './render.js';
import { makeInput } from './input.js';
import { makeAudio } from './audio.js';
import { buildVegetation, buildClouds } from './world.js';
import { drawHud } from './hud.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = makeRenderer(canvas);
const ctx = canvas.getContext('2d');
const input = makeInput(canvas);
const audio = makeAudio();
const { trees, huts } = buildVegetation();
const clouds = buildClouds();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

const game = {
  screen: 'title', // title | flying | paused | crashed | done
  missionIndex: 0,
  plane: makePlane(),
  mission: makeMission(MISSIONS[0].id),
  camera: 'chase',
  time: 0,
  score: 0,
  crashReason: '',
  gust: 0,
  gustTarget: 0,
  gustAt: 0,
  muted: false,
  shotMode: false,
};

function resetFlight(missionId) {
  game.plane = makePlane();
  game.mission = makeMission(missionId);
  game.camera = 'chase';
  game.screen = 'flying';
  game.crashReason = '';
  game.gust = 0;
  game.gustTarget = 0;
}

function startMission(index) {
  game.missionIndex = index;
  resetFlight(MISSIONS[index].id);
  audio.unlock();
  audio.click();
}

function crash(reason) {
  game.screen = 'crashed';
  game.crashReason = reason;
  game.plane.damage = 100;
  audio.crash();
}

function updateWind(dt) {
  // Gusts roll in every few seconds; the Storm Courier gets stronger ones.
  if (game.time - game.gustAt > 4) {
    game.gustAt = game.time;
    const strength = game.mission.def.id === 'storm' ? 14 : 6;
    game.gustTarget = (Math.random() * 2 - 1) * strength;
  }
  game.gust += (game.gustTarget - game.gust) * Math.min(1, dt * 0.8);
}

function tick(dt) {
  game.time += dt;
  updateWind(dt);
  const pressed = input.takePressed();
  const click = input.takeClick();

  if (pressed.has('KeyM')) {
    game.muted = !game.muted;
    audio.setMuted(game.muted);
  }

  if (game.screen === 'title') {
    // Menu: 1/2/3 pick a mission, Enter starts the highlighted one.
    if (pressed.has('Digit1')) startMission(0);
    else if (pressed.has('Digit2')) startMission(1);
    else if (pressed.has('Digit3')) startMission(2);
    else if (pressed.has('Enter') || pressed.has('Space')) startMission(game.missionIndex);
    if (pressed.has('ArrowUp') || pressed.has('KeyW')) {
      game.missionIndex = (game.missionIndex + MISSIONS.length - 1) % MISSIONS.length;
      audio.click();
    }
    if (pressed.has('ArrowDown') || pressed.has('KeyS')) {
      game.missionIndex = (game.missionIndex + 1) % MISSIONS.length;
      audio.click();
    }
    // Click a mission card.
    if (click) {
      const rect = canvas.getBoundingClientRect();
      const y = click.y - rect.top;
      const x = click.x - rect.left;
      const W = renderer.width;
      const H = renderer.height;
      MISSIONS.forEach((m, i) => {
        const cy = H * 0.44 + i * 92;
        if (x > W / 2 - 300 && x < W / 2 + 300 && y > cy - 36 && y < cy + 40) startMission(i);
      });
    }
    // Idle orbit around the parked plane for the title backdrop.
    const p = game.plane;
    const a = game.time * 0.08;
    p.heading = a;
    return;
  }

  if (game.screen === 'paused') {
    if (pressed.has('KeyP') || pressed.has('Escape')) game.screen = 'flying';
    if (pressed.has('KeyR')) startMission(game.missionIndex);
    if (pressed.has('KeyT')) game.screen = 'title';
    return;
  }

  if (game.screen === 'crashed' || game.screen === 'done') {
    if (pressed.has('KeyR') || pressed.has('Enter') || pressed.has('Space')) startMission(game.missionIndex);
    if (pressed.has('KeyT')) game.screen = 'title';
    return;
  }

  // Flying.
  if (pressed.has('KeyP') || pressed.has('Escape')) {
    game.screen = 'paused';
    return;
  }
  if (pressed.has('KeyC')) {
    game.camera = game.camera === 'chase' ? 'cockpit' : 'chase';
    audio.click();
  }
  if (pressed.has('KeyR')) {
    startMission(game.missionIndex);
    return;
  }

  const ctl = input.readControls();
  const events = [];
  const contact = stepPlane(game.plane, ctl, dt, game.gust);
  stepMission(game.mission, game.plane, dt, game.time, events);
  game.score = game.mission.score;

  for (const e of events) {
    if (e === 'ring') audio.ring();
    else if (e === 'land') audio.land();
    else if (e === 'win') audio.win();
  }

  if (contact === 'crash') {
    crash(game.plane.y <= 2 ? 'DITCHED IN THE SEA' : 'TERRAIN STRIKE — AIRFRAME LOST');
    return;
  }
  if (contact === 'ditch') {
    crash('DITCHED IN THE SEA');
    return;
  }
  if (contact === 'landed') audio.land();

  // Hard knocks on the ground add damage; a battered airframe gives up.
  if (!game.plane.airborne && game.plane.speed > 40) {
    game.plane.damage = Math.min(100, game.plane.damage + dt * 6);
    if (game.plane.damage >= 100) {
      crash('AIRFRAME SHOOK APART ON THE GROUND');
      return;
    }
  }

  if (game.mission.state === 'done') game.screen = 'done';
  else if (game.mission.state === 'failed') {
    game.screen = 'crashed';
    game.crashReason = 'OUT OF TIME — THE STORM WINS';
  }

  audio.update(game.plane.throttle, game.plane.speed, game.plane.airborne);
}

function drawTitle() {
  const W = renderer.width;
  const H = renderer.height;
  // Backdrop: the parked plane on the strip, camera orbiting slowly.
  const p = game.plane;
  renderer.renderScene({
    plane: p,
    camera: 'chase',
    rings: game.mission.rings,
    trees,
    huts,
    clouds,
    time: game.time,
  });
  ctx.fillStyle = 'rgba(6, 12, 20, 0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb52e';
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText('EMBER ISLES AIRMAIL', W / 2, H * 0.2);
  ctx.fillStyle = '#fff8e0';
  ctx.font = '20px sans-serif';
  ctx.fillText('A bush-plane mail run over a volcanic island chain', W / 2, H * 0.2 + 34);
  ctx.fillStyle = '#cfe6f2';
  ctx.font = '15px sans-serif';
  ctx.fillText('Arrows / WASD — pitch & bank   ·   Shift / Ctrl — throttle   ·   Mouse drag steers, wheel throttles', W / 2, H * 0.28);
  ctx.fillText('C — camera   ·   Space — brake   ·   F — flaps   ·   P — pause   ·   M — mute', W / 2, H * 0.28 + 22);

  MISSIONS.forEach((m, i) => {
    const cy = H * 0.44 + i * 92;
    const sel = i === game.missionIndex;
    ctx.fillStyle = sel ? 'rgba(255,181,46,0.92)' : 'rgba(10,16,24,0.72)';
    ctx.fillRect(W / 2 - 300, cy - 36, 600, 76);
    ctx.strokeStyle = sel ? '#fff8e0' : 'rgba(255,181,46,0.5)';
    ctx.lineWidth = sel ? 3 : 1;
    ctx.strokeRect(W / 2 - 300, cy - 36, 600, 76);
    ctx.fillStyle = sel ? '#101820' : '#ffb52e';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}. ${m.name}`, W / 2 - 280, cy - 6);
    ctx.fillStyle = sel ? '#1c2733' : '#cfe6f2';
    ctx.font = '15px sans-serif';
    ctx.fillText(m.blurb, W / 2 - 280, cy + 20);
  });

  ctx.fillStyle = '#8fa8b8';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Press 1-3 or Enter to fly. Land gently on the lit strip to refuel — the sea is not a runway.', W / 2, H - 28);
}

function drawOverlay(text, sub, color) {
  const W = renderer.width;
  const H = renderer.height;
  ctx.fillStyle = 'rgba(6, 12, 20, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = color || '#ffb52e';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText(text, W / 2, H * 0.42);
  ctx.fillStyle = '#fff8e0';
  ctx.font = '19px sans-serif';
  ctx.fillText(sub, W / 2, H * 0.42 + 36);
  ctx.fillStyle = '#8fa8b8';
  ctx.font = '15px sans-serif';
  ctx.fillText('R — fly again   ·   T — missions', W / 2, H * 0.42 + 68);
}

function render() {
  const W = renderer.width;
  const H = renderer.height;
  if (game.screen === 'title') {
    drawTitle();
    return;
  }
  const target = hudTargetInfo(game.mission, game.plane);
  const cam = renderer.renderScene({
    plane: game.plane,
    camera: game.camera,
    rings: game.mission.rings.map((r, i) => ({ ...r, next: i === game.mission.nextRing })),
    trees,
    huts,
    clouds,
    time: game.time,
  });
  drawHud(ctx, W, H, {
    plane: game.plane,
    camera: game.camera,
    mission: game.mission.def,
    missionLine: missionLine(game.mission),
    score: game.score,
    timerText: timerText(game.mission),
    message: game.mission.message,
    targetBearing: target.bearing,
    targetLabel: target.label,
    targetNear: target.near,
  });
  if (game.screen === 'paused') {
    drawOverlay('PAUSED', 'The isles wait. P to keep flying.', '#7fe7ff');
  } else if (game.screen === 'crashed') {
    drawOverlay('SORTIE LOST', `${game.crashReason}  ·  Score ${game.score}`, '#ff5a4e');
  } else if (game.screen === 'done') {
    drawOverlay('MISSION COMPLETE', `Mail delivered! Score ${game.score} — the isles thank you.`, '#8dff9e');
  }
  void cam;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000 || 0.016);
  frame.last = now;
  if (!game.shotMode) tick(dt);
  render();
}

// Deterministic screenshot mode: fixed scene, no input, no ticking.
if (shotName) {
  game.shotMode = true;
  game.screen = 'flying';
  const shot = applyShot(game.plane, game.mission, shotName);
  if (shot) {
    game.camera = shot.camera;
    if (shot.missionId) {
      game.mission = makeMission(shot.missionId);
      applyShot(game.plane, game.mission, shotName);
    }
  }
  game.time = 42; // fixed sun, smoke and cloud drift
  document.title = `Ember Isles Airmail — ${shotName}`;
}

requestAnimationFrame(frame);
