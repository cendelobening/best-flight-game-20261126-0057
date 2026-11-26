// Ember Isles Airmail — missions, scoring, fuel and damage. One mission at
// a time: rings to thread, an island to round, a clock to beat. Landing on
// the strip refuels the plane and banks the score.

import { MISSIONS, RINGS, RUNWAY } from './config.js';
import { distanceTo, relativeBearing, bearingTo } from './physics.js';
import { onRunway } from './world.js';

export function makeMission(missionId) {
  const def = MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
  return {
    def,
    rings: RINGS.map((r) => ({ ...r, done: false, next: false })),
    nextRing: 0,
    score: 0,
    timer: def.id === 'storm' ? 210 : null, // 3:30 for the Storm Courier
    timeLeft: def.id === 'storm' ? 210 : null,
    elapsed: 0,
    state: 'flying', // flying | done | failed
    message: '',
    messageAt: 0,
    hopped: false, // Island Hop: reached Palm Cay
    landedOnce: false,
    ringsCleared: 0,
  };
}

export function missionTarget(m) {
  if (m.def.id === 'rings' || m.def.id === 'storm') {
    if (m.nextRing < m.rings.length) return m.rings[m.nextRing];
    return { x: RUNWAY.x, y: RUNWAY.elevation + 30, z: RUNWAY.z, runway: true };
  }
  // Island Hop: Palm Cay first, then home.
  if (!m.hopped) return { x: 950, y: 160, z: 650, cay: true };
  return { x: RUNWAY.x, y: RUNWAY.elevation + 30, z: RUNWAY.z, runway: true };
}

export function missionLine(m) {
  if (m.def.id === 'rings' || m.def.id === 'storm') {
    if (m.nextRing < m.rings.length) return `Ring ${m.nextRing + 1} of ${m.rings.length}`;
    return 'All rings clear — land on the strip!';
  }
  if (!m.hopped) return 'Round Palm Cay, then land home';
  return 'Cay rounded — land on the strip!';
}

export function timerText(m) {
  if (m.timeLeft === null) return `TIME ${fmtTime(m.elapsed)}`;
  return `TIME LEFT ${fmtTime(Math.max(0, m.timeLeft))}`;
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function say(m, text, now) {
  m.message = text;
  m.messageAt = now;
}

// Advance the mission one tick. `events` collects sounds to play:
// 'ring' | 'land' | 'crash' | 'win' | 'refuel'.
export function stepMission(m, p, dt, now, events) {
  m.elapsed += dt;
  if (m.timeLeft !== null) {
    m.timeLeft -= dt;
    if (m.timeLeft <= 0 && m.state === 'flying') {
      m.state = 'failed';
      say(m, 'OUT OF TIME — the storm wins this one', now);
      return;
    }
  }
  if (now - m.messageAt > 4) m.message = '';

  const target = missionTarget(m);
  const d = distanceTo(p, target);

  // Ring capture: within the ring's radius, roughly in its plane.
  if (m.nextRing < m.rings.length && (m.def.id === 'rings' || m.def.id === 'storm')) {
    const ring = m.rings[m.nextRing];
    const dz = Math.abs(p.z - ring.z);
    const inPlane = Math.hypot(p.x - ring.x, p.y - ring.y);
    if (dz < 26 && inPlane < ring.r) {
      ring.done = true;
      m.nextRing++;
      m.ringsCleared++;
      const pts = 150 + Math.round(Math.max(0, 100 - p.speed));
      m.score += pts;
      events.push('ring');
      say(m, m.nextRing < m.rings.length ? `RING ${m.nextRing} CLEAR  +${pts}` : 'ALL RINGS CLEAR — LAND NOW', now);
    }
  }

  // Island Hop waypoint: within 260 m of Palm Cay's peak.
  if (m.def.id === 'hop' && !m.hopped && d < 260) {
    m.hopped = true;
    m.score += 200;
    events.push('ring');
    say(m, 'PALM CAY ROUNDED  +200 — HEAD HOME', now);
  }

  // Landing on the strip: refuel, bank points, mission complete.
  if (onRunway(p.x, p.z, 2) && !p.airborne && p.speed < 12 && p.y < RUNWAY.elevation + 4) {
    if (!m.landedOnce) {
      m.landedOnce = true;
      const allRings = m.nextRing >= m.rings.length;
      const hopDone = m.def.id === 'hop' ? m.hopped : true;
      if ((m.def.id === 'rings' || m.def.id === 'storm') && !allRings) {
        say(m, 'TOUCHDOWN — refuelled. Rings still waiting!', now);
      } else if (m.def.id === 'hop' && !hopDone) {
        say(m, 'TOUCHDOWN — refuelled. Palm Cay still waiting!', now);
      } else {
        m.state = 'done';
        const bonus = m.def.id === 'storm' ? Math.round(m.timeLeft) * 5 : 300;
        m.score += bonus;
        events.push('win');
        say(m, `MISSION COMPLETE  +${bonus}`, now);
      }
    }
    if (p.fuel < 100) {
      p.fuel = Math.min(100, p.fuel + dt * 30);
      if (!events.includes('refuel')) events.push('refuel');
    }
  } else if (p.airborne) {
    m.landedOnce = false;
  }

  // Fuel starvation ends the sortie in a glide; damage is tracked by the caller.
  if (p.fuel <= 0 && p.airborne && p.speed < 20) {
    say(m, 'OUT OF FUEL — FIND THE STRIP', now);
  }
}

export function hudTargetInfo(m, p) {
  const target = missionTarget(m);
  const d = distanceTo(p, target);
  const rel = relativeBearing(p, target);
  const label = target.runway
    ? `RUNWAY ${Math.round(d)} m`
    : target.cay
      ? `PALM CAY ${Math.round(d)} m`
      : `RING ${m.nextRing + 1} · ${Math.round(d)} m`;
  return { bearing: rel, label, near: d < 400, distance: d };
}

export { bearingTo };
