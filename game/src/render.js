// Ember Isles Airmail — a minimal software 3D renderer on Canvas 2D.
// No library: points are projected through a yaw/pitch/roll camera, and
// terrain, runway, rings, trees, clouds and the plane are drawn far-to-near
// from one sorted draw list, with distance fog and a sea-filled horizon.

import { PALETTE, RINGS, RUNWAY } from './config.js';
import { groundHeight, onRunway } from './world.js';
import { clamp, lerp } from './random.js';

const FOV = (68 * Math.PI) / 180;

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function css(c) {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

function shade(hex, f) {
  const [r, g, b] = hexRgb(hex);
  const m = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return [m(r), m(g), m(b)];
}

function mix(a, b, t) {
  // a and b are [r, g, b] arrays; returns a css colour string.
  const m = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
  return css([m(0), m(1), m(2)]);
}

// Camera basis from yaw (heading), pitch and roll, all radians.
export function buildCamera(px, py, pz, yaw, pitch, roll) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Forward, right, up before roll.
  let fx = sy * cp;
  let fy = sp;
  let fz = -cy * cp;
  let rx = cy;
  let ry = 0;
  let rz = sy;
  let ux = -sy * sp;
  let uy = cp;
  let uz = cy * sp;
  // Roll about the forward axis.
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const nrx = rx * cr + ux * sr;
  const nry = ry * cr + uy * sr;
  const nrz = rz * cr + uz * sr;
  const nux = ux * cr - rx * sr;
  const nuy = uy * cr - ry * sr;
  const nuz = uz * cr - rz * sr;
  return {
    pos: [px, py, pz],
    f: [fx, fy, fz],
    r: [nrx, nry, nrz],
    u: [nux, nuy, nuz],
  };
}

export function makeRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let focal = 600;

  function resize() {
    W = canvas.clientWidth || canvas.width;
    H = canvas.clientHeight || canvas.height;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    focal = (H / 2) / Math.tan(FOV / 2);
  }

  function project(cam, x, y, z) {
    const dx = x - cam.pos[0];
    const dy = y - cam.pos[1];
    const dz = z - cam.pos[2];
    const cz = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
    if (cz < 1.5) return null;
    const cx = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2];
    const cy2 = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
    return {
      x: W / 2 + (cx / cz) * focal,
      y: H / 2 - (cy2 / cz) * focal,
      z: cz,
      s: focal / cz, // pixels per metre at this depth
    };
  }

  function fogFactor(d) {
    return clamp((d - 500) / 2600, 0, 0.85);
  }

  function terrainColor(h, slope, d) {
    let base;
    if (h < 1) base = d > 900 ? PALETTE.seaDeep : PALETTE.seaShallow;
    else if (h < 5) base = PALETTE.sand;
    else if (h < 90) base = slope > 0.55 ? PALETTE.rock : PALETTE.grass;
    else if (h < 200) base = slope > 0.45 ? PALETTE.rock : PALETTE.jungle;
    else if (h < 320) base = PALETTE.ash;
    else base = PALETTE.snow;
    const lit = clamp(1 - slope * 0.26, 0.66, 1);
    const c = shade(base, lit);
    const f = fogFactor(d);
    return f > 0 ? mix(c, hexRgb(PALETTE.skyLow), f) : css(c);
  }

  function drawSky(cam, time) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.55, PALETTE.skyMid);
    g.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun: fixed compass direction, high in the east.
    const sun = project(cam, cam.pos[0] + 2600, cam.pos[1] + 1500, cam.pos[2] - 900);
    if (sun) {
      const r = 34;
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, r * 3);
      glow.addColorStop(0, 'rgba(255, 243, 196, 0.95)');
      glow.addColorStop(0.35, 'rgba(255, 236, 170, 0.45)');
      glow.addColorStop(1, 'rgba(255, 236, 170, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sea below the horizon line.
    const horizonY = H / 2 + Math.tan(Math.asin(clamp(cam.f[1], -1, 1))) * focal;
    if (horizonY < H) {
      const sg = ctx.createLinearGradient(0, Math.max(0, horizonY), 0, H);
      sg.addColorStop(0, PALETTE.seaShallow);
      sg.addColorStop(1, PALETTE.seaDeep);
      ctx.fillStyle = sg;
      ctx.fillRect(0, Math.max(0, horizonY), W, H - Math.max(0, horizonY));
    }
  }

  function drawTerrain(cam) {
    const cell = 110;
    const half = 23; // 46 x 46 cells around the camera
    const cx0 = Math.round(cam.pos[0] / cell);
    const cz0 = Math.round(cam.pos[2] / cell);
    const tris = [];
    for (let ix = cx0 - half; ix < cx0 + half; ix++) {
      for (let iz = cz0 - half; iz < cz0 + half; iz++) {
        const x0 = ix * cell;
        const z0 = iz * cell;
        const x1 = x0 + cell;
        const z1 = z0 + cell;
        const h00 = groundHeight(x0, z0);
        const h10 = groundHeight(x1, z0);
        const h01 = groundHeight(x0, z1);
        const h11 = groundHeight(x1, z1);
        const dcx = (x0 + cell / 2 - cam.pos[0]) ** 2 + (z0 + cell / 2 - cam.pos[2]) ** 2;
        const d = Math.sqrt(dcx);
        if (d > 3200) continue;
        const slope = Math.abs(h10 - h00) / cell + Math.abs(h01 - h00) / cell;
        const avg = (h00 + h10 + h01 + h11) / 4;
        const col = terrainColor(avg, slope, d);
        tris.push({ d, col, pts: [[x0, h00, z0], [x1, h10, z0], [x1, h11, z1]] });
        tris.push({ d, col, pts: [[x0, h00, z0], [x1, h11, z1], [x0, h01, z1]] });
      }
    }
    tris.sort((a, b) => b.d - a.d);
    for (const t of tris) {
      const p0 = project(cam, ...t.pts[0]);
      const p1 = project(cam, ...t.pts[1]);
      const p2 = project(cam, ...t.pts[2]);
      if (!p0 || !p1 || !p2) continue;
      ctx.fillStyle = t.col;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRunway(cam) {
    const y = RUNWAY.elevation + 0.4;
    const hw = RUNWAY.width / 2;
    const z0 = RUNWAY.z - RUNWAY.length / 2;
    const z1 = RUNWAY.z + RUNWAY.length / 2;
    const items = [];
    // Asphalt strip in 8 segments so fog shades it by distance.
    for (let i = 0; i < 8; i++) {
      const a = z0 + ((z1 - z0) * i) / 8;
      const b = z0 + ((z1 - z0) * (i + 1)) / 8;
      const d = Math.hypot(RUNWAY.x - cam.pos[0], (a + b) / 2 - cam.pos[2]);
      items.push({ d, kind: 'poly', col: mix(hexRgb(PALETTE.runway), hexRgb(PALETTE.skyLow), fogFactor(d)),
        pts: [[RUNWAY.x - hw, y, a], [RUNWAY.x + hw, y, a], [RUNWAY.x + hw, y, b], [RUNWAY.x - hw, y, b]] });
    }
    // Centre dashes and edge lights.
    for (let z = z0 + 30; z < z1 - 10; z += 60) {
      const d = Math.hypot(RUNWAY.x - cam.pos[0], z - cam.pos[2]);
      items.push({ d, kind: 'poly', col: mix(hexRgb(PALETTE.runwayLine), hexRgb(PALETTE.skyLow), fogFactor(d)),
        pts: [[RUNWAY.x - 1.5, y + 0.05, z], [RUNWAY.x + 1.5, y + 0.05, z], [RUNWAY.x + 1.5, y + 0.05, z + 22], [RUNWAY.x - 1.5, y + 0.05, z + 22]] });
      for (const sx of [-1, 1]) {
        items.push({ d, kind: 'dot', x: RUNWAY.x + sx * hw, y: y + 0.3, z, col: '#ffe9a8', r: 2.2 });
      }
    }
    // Threshold bars at both ends.
    for (const zt of [z0 + 6, z1 - 10]) {
      const d = Math.hypot(RUNWAY.x - cam.pos[0], zt - cam.pos[2]);
      items.push({ d, kind: 'poly', col: '#ffffff',
        pts: [[RUNWAY.x - hw + 2, y + 0.05, zt], [RUNWAY.x + hw - 2, y + 0.05, zt], [RUNWAY.x + hw - 2, y + 0.05, zt + 4], [RUNWAY.x - hw + 2, y + 0.05, zt + 4]] });
    }
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      if (it.kind === 'dot') {
        const p = project(cam, it.x, it.y, it.z);
        if (!p) continue;
        ctx.fillStyle = it.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, it.r * clamp(p.s / 40, 0.4, 2.4)), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const ps = it.pts.map((pt) => project(cam, ...pt));
      if (ps.some((p) => !p)) continue;
      ctx.fillStyle = it.col;
      ctx.beginPath();
      ctx.moveTo(ps[0].x, ps[0].y);
      for (let i = 1; i < ps.length; i++) ctx.lineTo(ps[i].x, ps[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRings(cam, rings) {
    for (const ring of rings) {
      const d = Math.hypot(ring.x - cam.pos[0], ring.y - cam.pos[1], ring.z - cam.pos[2]);
      if (d > 1600 || d < 4) continue;
      const pts = [];
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        // Rings stand vertical, facing the flight path (normal along z).
        pts.push(project(cam, ring.x + Math.cos(a) * ring.r, ring.y + Math.sin(a) * ring.r, ring.z));
      }
      if (pts.some((p) => !p)) continue;
      const col = ring.done ? PALETTE.ringDone : PALETTE.ring;
      const w = clamp(10 - d / 220, 1.5, 9);
      ctx.strokeStyle = col;
      ctx.globalAlpha = ring.done ? 0.45 : 0.95;
      ctx.lineWidth = w * 2.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = w;
      ctx.strokeStyle = '#fff8e0';
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Distance tag above the next ring.
      if (ring.next) {
        const top = project(cam, ring.x, ring.y + ring.r + 14, ring.z);
        if (top) {
          ctx.fillStyle = '#fff8e0';
          ctx.font = `bold ${Math.max(13, Math.round(clamp(900 / d, 13, 30)))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(`${Math.round(d)} m`, top.x, top.y);
        }
      }
    }
  }

  // The mail plane, built from flat polygons in plane-local space:
  // x = right, y = up, z = backward (nose at z = -4.6).
  const PLANE_POLYS = (() => {
    const cream = '#f2e3c2';
    const red = '#c0392b';
    const dark = '#2c343c';
    const glass = '#274b63';
    const polys = [];
    const quad = (a, b, c, d, col) => polys.push({ pts: [a, b, c, d], col });
    const tri = (a, b, c, col) => polys.push({ pts: [a, b, c], col });
    // Fuselage: tapered box, nose to tail.
    quad([-0.7, -0.4, -4.6], [0.7, -0.4, -4.6], [0.55, -0.3, 3.4], [-0.55, -0.3, 3.4], cream); // belly
    quad([-0.7, 0.5, -4.6], [0.7, 0.5, -4.6], [0.55, 0.45, 3.4], [-0.55, 0.45, 3.4], cream); // spine
    quad([-0.7, -0.4, -4.6], [-0.7, 0.5, -4.6], [-0.55, 0.45, 3.4], [-0.55, -0.3, 3.4], cream); // left
    quad([0.7, -0.4, -4.6], [0.7, 0.5, -4.6], [0.55, 0.45, 3.4], [0.55, -0.3, 3.4], cream); // right
    quad([-0.55, -0.3, 3.4], [0.55, -0.3, 3.4], [0.55, 0.45, 3.4], [-0.55, 0.45, 3.4], red); // tail cap
    // Red cheatline along the fuselage.
    quad([-0.71, 0.05, -4.4], [-0.71, 0.28, -4.4], [-0.56, 0.22, 3.3], [-0.56, 0.02, 3.3], red);
    quad([0.71, 0.05, -4.4], [0.71, 0.28, -4.4], [0.56, 0.22, 3.3], [0.56, 0.02, 3.3], red);
    // Canopy.
    quad([-0.55, 0.5, -1.6], [0.55, 0.5, -1.6], [0.45, 0.62, 0.4], [-0.45, 0.62, 0.4], glass);
    quad([-0.55, 0.5, -1.6], [-0.45, 0.62, 0.4], [-0.45, 0.62, 0.4], [-0.55, 0.5, -1.6], glass);
    // Main wing (low wing) with red tips.
    quad([-5.4, -0.1, -0.4], [-0.7, -0.1, -0.9], [-0.7, -0.1, 0.9], [-5.4, -0.1, 1.1], cream);
    quad([0.7, -0.1, -0.9], [5.4, -0.1, -0.4], [5.4, -0.1, 1.1], [0.7, -0.1, 0.9], cream);
    quad([-5.4, -0.1, -0.4], [-4.4, -0.1, -0.5], [-4.4, -0.1, 1.0], [-5.4, -0.1, 1.1], red);
    quad([4.4, -0.1, -0.5], [5.4, -0.1, -0.4], [5.4, -0.1, 1.1], [4.4, -0.1, 1.0], red);
    // Tailplane and fin.
    quad([-1.9, 0.15, 2.9], [-0.4, 0.15, 2.7], [-0.4, 0.15, 3.5], [-1.9, 0.15, 3.6], cream);
    quad([0.4, 0.15, 2.7], [1.9, 0.15, 2.9], [1.9, 0.15, 3.6], [0.4, 0.15, 3.5], cream);
    quad([-0.05, 0.45, 2.6], [0.05, 0.45, 2.6], [0.05, 1.5, 3.4], [-0.05, 1.5, 3.4], red);
    // Propeller hub.
    tri([-0.15, 0.15, -4.7], [0.15, 0.15, -4.7], [0, -0.15, -4.7], dark);
    // Landing gear.
    quad([-0.6, -0.4, -0.6], [-0.5, -0.4, -0.6], [-0.5, -1.1, -0.6], [-0.6, -1.1, -0.6], dark);
    quad([0.5, -0.4, -0.6], [0.6, -0.4, -0.6], [0.6, -1.1, -0.6], [0.5, -1.1, -0.6], dark);
    return polys;
  })();

  function planeToWorld(p, lx, ly, lz) {
    // Rotate local (x right, y up, z back) by heading/pitch/bank, then add pos.
    const ch = Math.cos(p.heading);
    const sh = Math.sin(p.heading);
    const cp = Math.cos(p.pitch);
    const sp = Math.sin(p.pitch);
    const cb = Math.cos(p.bank);
    const sb = Math.sin(p.bank);
    // Apply bank (roll about z), then pitch (about x), then heading (about y).
    // Positive bank is a right bank: the right wing goes down.
    let x = lx * cb + ly * sb;
    let y = -lx * sb + ly * cb;
    let z = lz;
    const y2 = y * cp - z * sp;
    const z2 = y * sp + z * cp;
    y = y2;
    z = z2;
    const wx = x * ch + z * sh;
    const wz = -x * sh + z * ch;
    return [p.x + wx, p.y + y, p.z + wz];
  }

  function drawPlaneModel(cam, p, time) {
    const items = PLANE_POLYS.map((poly) => {
      const pts = poly.pts.map(([lx, ly, lz]) => planeToWorld(p, lx, ly, lz));
      const d = pts.reduce((s, q) => s + Math.hypot(q[0] - cam.pos[0], q[1] - cam.pos[1], q[2] - cam.pos[2]), 0) / pts.length;
      return { d, pts, col: poly.col };
    });
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      const ps = it.pts.map((pt) => project(cam, ...pt));
      if (ps.some((q) => !q)) continue;
      ctx.fillStyle = it.col;
      ctx.beginPath();
      ctx.moveTo(ps[0].x, ps[0].y);
      for (let i = 1; i < ps.length; i++) ctx.lineTo(ps[i].x, ps[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,20,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Spinning prop: a translucent disc at the nose, drawn as the ellipse
    // the disc really projects to — a circle from behind, a sliver from
    // the side — with one blade streaking around inside it.
    const hub = planeToWorld(p, 0, 0.05, -4.75);
    const tipTop = planeToWorld(p, 0, 1.5, -4.75);
    const tipSide = planeToWorld(p, 1.5, 0.05, -4.75);
    const hubP = project(cam, ...hub);
    const tipP = project(cam, ...tipTop);
    const sideP = project(cam, ...tipSide);
    if (hubP && tipP && sideP) {
      const rx = Math.max(1.5, Math.abs(sideP.x - hubP.x));
      const ry = Math.max(1.5, Math.abs(tipP.y - hubP.y));
      const alpha = clamp(0.1 + p.throttle * 0.2, 0.1, 0.3);
      ctx.fillStyle = `rgba(220,225,230,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(hubP.x, hubP.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      const a = time * (4 + p.throttle * 30);
      ctx.strokeStyle = `rgba(60,60,60,${0.35 + p.throttle * 0.3})`;
      ctx.lineWidth = Math.max(1.5, ry * 0.08);
      ctx.beginPath();
      ctx.moveTo(hubP.x - Math.cos(a) * rx, hubP.y - Math.sin(a) * ry);
      ctx.lineTo(hubP.x + Math.cos(a) * rx, hubP.y + Math.sin(a) * ry);
      ctx.stroke();
    }
  }

  function drawBillboard(cam, x, y, z, radius, draw) {
    const p = project(cam, x, y, z);
    if (!p) return;
    const r = Math.max(1, radius * p.s);
    draw(p.x, p.y, r, p.z);
  }

  function drawTrees(cam, trees) {
    for (const t of trees) {
      const d = Math.hypot(t.x - cam.pos[0], t.z - cam.pos[2]);
      if (d > 1400 || d < 8) continue;
      drawBillboard(cam, t.x, t.y + 7 * t.s, t.z, 7 * t.s, (sx, sy, r) => {
        ctx.strokeStyle = '#6b4a2f';
        ctx.lineWidth = Math.max(1, r * 0.16);
        ctx.beginPath();
        ctx.moveTo(sx, sy + r * 0.9);
        ctx.lineTo(sx + t.lean * r, sy);
        ctx.stroke();
        ctx.fillStyle = '#2f7a2e';
        ctx.beginPath();
        ctx.arc(sx + t.lean * r, sy - r * 0.35, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3f9a35';
        ctx.beginPath();
        ctx.arc(sx + t.lean * r - r * 0.3, sy - r * 0.5, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function drawHuts(cam, huts) {
    for (const h of huts) {
      const d = Math.hypot(h.x - cam.pos[0], h.z - cam.pos[2]);
      if (d > 1200 || d < 10) continue;
      drawBillboard(cam, h.x, h.y + 2.5 * h.s, h.z, 5 * h.s, (sx, sy, r) => {
        ctx.fillStyle = '#c9a06a';
        ctx.fillRect(sx - r, sy - r * 0.5, r * 2, r);
        ctx.fillStyle = '#8a5a2e';
        ctx.beginPath();
        ctx.moveTo(sx - r * 1.2, sy - r * 0.5);
        ctx.lineTo(sx, sy - r * 1.4);
        ctx.lineTo(sx + r * 1.2, sy - r * 0.5);
        ctx.closePath();
        ctx.fill();
      });
    }
  }

  function drawClouds(cam, clouds, time) {
    for (const c of clouds) {
      const x = c.x + time * c.drift;
      const d = Math.hypot(x - cam.pos[0], c.y - cam.pos[1], c.z - cam.pos[2]);
      if (d > 4200) continue;
      drawBillboard(cam, x, c.y, c.z, c.r, (sx, sy, r) => {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sx - r * 0.45, sy + r * 0.08, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sx + r * 0.45, sy + r * 0.08, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function drawVolcanoSmoke(cam, time) {
    // Rising puffs over the crater.
    for (let i = 0; i < 7; i++) {
      const t = ((time * 0.05 + i / 7) % 1);
      const y = 400 + t * 260;
      const x = -650 + Math.sin(i * 2.4 + time * 0.1) * 26 * t;
      const z = -750 + Math.cos(i * 1.7) * 20 * t;
      drawBillboard(cam, x, y, z, 26 + t * 55, (sx, sy, r) => {
        ctx.fillStyle = `rgba(120,112,108,${0.5 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // Cockpit view: dashboard, canopy frame, nose and prop blur.
  function drawCockpitFrame(p, time) {
    const panelH = H * 0.3;
    const g = ctx.createLinearGradient(0, H - panelH, 0, H);
    g.addColorStop(0, '#1c2733');
    g.addColorStop(1, '#0a0f16');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - panelH, W, panelH);
    ctx.strokeStyle = '#3a4a5c';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, H - panelH, W, panelH);
    // Lit gauge cluster on the panel.
    const gy = H - panelH / 2;
    const gauges = [
      { x: W * 0.2, label: 'RPM', v: p.throttle },
      { x: W * 0.32, label: 'OIL', v: 0.72 },
      { x: W * 0.44, label: 'FUEL', v: p.fuel / 100 },
    ];
    for (const gg of gauges) {
      ctx.fillStyle = '#0d141d';
      ctx.beginPath();
      ctx.arc(gg.x, gy, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.hudAmber;
      ctx.lineWidth = 2;
      ctx.stroke();
      const a = -Math.PI * 0.75 + gg.v * Math.PI * 1.5;
      ctx.strokeStyle = '#ffb52e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(gg.x, gy);
      ctx.lineTo(gg.x + Math.cos(a) * 26, gy + Math.sin(a) * 26);
      ctx.stroke();
      ctx.fillStyle = '#cfe6f2';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(gg.label, gg.x, gy + 52);
    }
    // Canopy frame pillars.
    ctx.fillStyle = '#101820';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W * 0.07, 0);
    ctx.lineTo(W * 0.16, H - panelH);
    ctx.lineTo(0, H - panelH);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W * 0.93, 0);
    ctx.lineTo(W * 0.84, H - panelH);
    ctx.lineTo(W, H - panelH);
    ctx.closePath();
    ctx.fill();
    // Nose + spinning prop blur at the top centre: a thin, faint disc.
    ctx.fillStyle = '#e8d9b8';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 46, H - panelH);
    ctx.lineTo(W / 2 - 14, H * 0.52);
    ctx.lineTo(W / 2 + 14, H * 0.52);
    ctx.lineTo(W / 2 + 46, H - panelH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(220,225,230,${0.1 + p.throttle * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.52, 95, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function renderScene(s) {
    resize();
    const p = s.plane;
    const cam = s.camera === 'cockpit'
      ? buildCamera(
          p.x + Math.sin(p.heading) * 1.2,
          p.y + 0.9,
          p.z - Math.cos(p.heading) * 1.2,
          p.heading,
          p.pitch * 0.9,
          p.bank * 0.25,
        )
      : buildCamera(
          p.x - Math.sin(p.heading) * 13 - Math.sin(p.heading + Math.PI / 2) * 0,
          p.y + 4.5 + p.pitch * 2,
          p.z + Math.cos(p.heading) * 13,
          p.heading,
          p.pitch * 0.55 - 0.06,
          p.bank * 0.35,
        );
    drawSky(cam, s.time);
    drawTerrain(cam);
    drawRunway(cam);
    drawRings(cam, s.rings);
    drawTrees(cam, s.trees);
    drawHuts(cam, s.huts);
    drawClouds(cam, s.clouds, s.time);
    drawVolcanoSmoke(cam, s.time);
    if (s.camera === 'cockpit') drawCockpitFrame(p, s.time);
    else drawPlaneModel(cam, p, s.time);
    return cam;
  }

  return { renderScene, project, resize, get width() { return W; }, get height() { return H; } };
}
