// Ember Isles Airmail — the HUD: lit instruments drawn on the canvas after
// the 3D scene. Altitude, speed and heading are always on screen, plus the
// artificial horizon, throttle, fuel, damage, mission line and messages.

import { PALETTE } from './config.js';
import { clamp, radToDeg } from './random.js';
import { headingDegrees } from './physics.js';

const AMBER = PALETTE.hudAmber;
const CYAN = PALETTE.hudCyan;

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,181,46,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function tape(ctx, x, y, w, h, value, step, unit, format) {
  panel(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const pxPerUnit = h / (step * 6);
  const centre = y + h / 2;
  const base = Math.floor(value / step) * step;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  for (let v = base - step * 3; v <= base + step * 3; v += step) {
    const yy = centre - (v - value) * pxPerUnit;
    if (yy < y - 8 || yy > y + h + 8) continue;
    ctx.strokeStyle = 'rgba(207,230,242,0.7)';
    ctx.beginPath();
    ctx.moveTo(x + w - 14, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
    ctx.fillStyle = '#cfe6f2';
    ctx.fillText(String(v), x + 6, yy + 4);
  }
  ctx.restore();
  // Centre readout.
  ctx.fillStyle = '#0d141d';
  ctx.fillRect(x - 4, centre - 15, w + 8, 30);
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, centre - 15, w + 8, 30);
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(format(value), x + w / 2, centre + 6);
  ctx.fillStyle = '#8fa8b8';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText(unit, x + w / 2, centre + 26);
}

export function drawHud(ctx, W, H, s) {
  const p = s.plane;
  const hdg = headingDegrees(p);
  const altFt = Math.max(0, Math.round(p.y * 3.28084));
  const spdKt = Math.round(p.speed * 1.94384);

  // Compass tape across the top.
  const tapeW = Math.min(560, W * 0.5);
  const tx = (W - tapeW) / 2;
  panel(ctx, tx, 10, tapeW, 44);
  ctx.save();
  ctx.beginPath();
  ctx.rect(tx, 10, tapeW, 44);
  ctx.clip();
  const pxPerDeg = tapeW / 60;
  const centre = tx + tapeW / 2;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  for (let d = Math.floor((hdg - 30) / 10) * 10; d <= hdg + 30; d += 5) {
    const dd = ((d % 360) + 360) % 360;
    const xx = centre + (((dd - hdg + 540) % 360) - 180) * pxPerDeg;
    if (xx < tx - 10 || xx > tx + tapeW + 10) continue;
    const major = dd % 10 === 0;
    ctx.strokeStyle = major ? '#cfe6f2' : 'rgba(207,230,242,0.5)';
    ctx.beginPath();
    ctx.moveTo(xx, 44);
    ctx.lineTo(xx, major ? 30 : 37);
    ctx.stroke();
    if (major) {
      const label = dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd).padStart(3, '0');
      ctx.fillStyle = '#cfe6f2';
      ctx.fillText(label, xx, 24);
    }
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`HDG ${String(Math.round(hdg)).padStart(3, '0')}°`, centre, 52 - 26 + 44);
  ctx.fillStyle = '#0d141d';
  ctx.beginPath();
  ctx.moveTo(centre - 7, 54);
  ctx.lineTo(centre + 7, 54);
  ctx.lineTo(centre, 62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(centre - 7, 54);
  ctx.lineTo(centre + 7, 54);
  ctx.lineTo(centre, 62);
  ctx.closePath();
  ctx.fill();

  // Airspeed (left) and altitude (right) tapes.
  tape(ctx, 14, H * 0.3, 86, 220, spdKt, 10, 'KT', (v) => String(Math.round(v)));
  tape(ctx, W - 100, H * 0.3, 86, 220, altFt, 100, 'FT', (v) => String(Math.round(v)));
  ctx.fillStyle = '#8fa8b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AIRSPEED', 57, H * 0.3 - 8);
  ctx.fillText('ALTITUDE', W - 57, H * 0.3 - 8);

  // Artificial horizon, bottom centre — raised above the cockpit panel
  // when the cockpit camera is on so it never covers the lit gauges.
  const hx = W / 2;
  const hy = s.camera === 'cockpit' ? H - 198 : H - 92;
  const hr = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(hx, hy);
  ctx.rotate(-p.bank);
  const pitchPx = clamp(p.pitch, -0.6, 0.6) * 90;
  ctx.fillStyle = '#3d7ab8';
  ctx.fillRect(-hr, -hr - pitchPx, hr * 2, hr + pitchPx);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-hr, -pitchPx, hr * 2, hr + pitchPx);
  ctx.strokeStyle = '#f5f2e8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-hr, -pitchPx);
  ctx.lineTo(hr, -pitchPx);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(245,242,232,0.6)';
  ctx.lineWidth = 1;
  for (const off of [-40, -20, 20, 40]) {
    ctx.beginPath();
    ctx.moveTo(-22, -pitchPx + off);
    ctx.lineTo(22, -pitchPx + off);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed wings marker.
  ctx.strokeStyle = '#ffb52e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx - 34, hy);
  ctx.lineTo(hx - 8, hy);
  ctx.moveTo(hx + 8, hy);
  ctx.lineTo(hx + 34, hy);
  ctx.stroke();
  ctx.fillStyle = '#8fa8b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', hx, hy + hr + 15);

  // Throttle + fuel, bottom left.
  const bx = 14;
  const by = H - 92;
  panel(ctx, bx, by - 18, 190, 96);
  ctx.fillStyle = '#cfe6f2';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THR', bx + 10, by + 2);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(bx + 56, by - 10, 120, 14);
  ctx.fillStyle = p.throttle > 0.85 ? PALETTE.hudRed : AMBER;
  ctx.fillRect(bx + 56, by - 10, 120 * p.throttle, 14);
  ctx.fillStyle = '#cfe6f2';
  ctx.fillText('FUEL', bx + 10, by + 26);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(bx + 56, by + 14, 120, 14);
  ctx.fillStyle = p.fuel < 20 ? PALETTE.hudRed : PALETTE.hudGreen;
  ctx.fillRect(bx + 56, by + 14, 120 * clamp(p.fuel / 100, 0, 1), 14);
  ctx.fillText('DMG', bx + 10, by + 50);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(bx + 56, by + 38, 120, 14);
  ctx.fillStyle = p.damage > 60 ? PALETTE.hudRed : CYAN;
  ctx.fillRect(bx + 56, by + 38, 120 * clamp(p.damage / 100, 0, 1), 14);
  ctx.fillStyle = p.fuel < 20 ? PALETTE.hudRed : '#8fa8b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(p.fuel < 20 ? 'LOW FUEL — LAND!' : `FUEL ${Math.round(p.fuel)}%`, bx + 10, by + 68);

  // Mission + score, bottom right.
  const mx = W - 204;
  panel(ctx, mx, by - 18, 190, 96);
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(s.mission.name, mx + 10, by + 2);
  ctx.fillStyle = '#cfe6f2';
  ctx.font = '12px sans-serif';
  ctx.fillText(s.missionLine, mx + 10, by + 22, 170);
  ctx.fillStyle = CYAN;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`SCORE ${s.score}`, mx + 10, by + 46);
  ctx.fillStyle = '#cfe6f2';
  ctx.font = '12px monospace';
  ctx.fillText(s.timerText, mx + 10, by + 66);

  // Centre crosshair + flight-path marker.
  const ccx = W / 2;
  const ccy = H / 2 - 30;
  ctx.strokeStyle = 'rgba(255,181,46,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ccx - 14, ccy);
  ctx.lineTo(ccx - 4, ccy);
  ctx.moveTo(ccx + 4, ccy);
  ctx.lineTo(ccx + 14, ccy);
  ctx.moveTo(ccx, ccy - 14);
  ctx.lineTo(ccx, ccy - 4);
  ctx.moveTo(ccx, ccy + 4);
  ctx.lineTo(ccx, ccy + 14);
  ctx.stroke();

  // Next-target chevron: points toward the objective.
  if (typeof s.targetBearing === 'number') {
    const a = (s.targetBearing * Math.PI) / 180;
    const rx = ccx + Math.sin(a) * 120;
    const ry = ccy - Math.cos(a) * 120;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(a);
    ctx.fillStyle = s.targetNear ? PALETTE.hudGreen : AMBER;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(9, 8);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff8e0';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.targetLabel, rx, ry + 26);
  }

  // Stall warning.
  if (p.airborne && p.speed < 30) {
    ctx.fillStyle = PALETTE.hudRed;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STALL — NOSE DOWN, FULL THROTTLE', W / 2, H * 0.24);
  }

  // Transient message banner.
  if (s.message) {
    ctx.fillStyle = '#fff8e0';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.message, W / 2, 84);
  }

  // Camera + sound hints, under the altitude tape where nothing sits.
  ctx.fillStyle = 'rgba(207,230,242,0.75)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('[C] camera  [P] pause  [M] mute  [R] restart', W - 12, H * 0.3 + 236);
}
