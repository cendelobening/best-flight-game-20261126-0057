// Ember Isles Airmail — keyboard and mouse input. The game reads a single
// control snapshot per frame: pitch, bank, throttle delta, brake, flaps and
// one-shot actions (camera toggle, pause, restart, menu picks).

import { KEYS } from './config.js';

export function makeInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // one-shot keys, consumed by takePressed()
  const mouse = { down: false, dx: 0, dy: 0, wheel: 0, x: 0, y: 0, clicked: false };
  let pointerLocked = false;

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseDown(e) {
    mouse.down = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.clicked = true;
  }
  function onMouseMove(e) {
    if (mouse.down) {
      mouse.dx += e.movementX || 0;
      mouse.dy += e.movementY || 0;
    }
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }
  function onMouseUp() {
    mouse.down = false;
  }
  function onWheel(e) {
    e.preventDefault();
    mouse.wheel += e.deltaY;
  }
  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('click', () => {
    if (!pointerLocked && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });

  return {
    // Continuous stick: keyboard first, mouse drag trims it.
    readControls() {
      let pitch = 0;
      let bank = 0;
      if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 1;
      if (keys.has('ArrowDown') || keys.has('KeyS')) pitch -= 1;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) bank -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) bank += 1;
      if (mouse.down) {
        bank += Math.max(-1, Math.min(1, mouse.dx * 0.004));
        pitch -= Math.max(-1, Math.min(1, mouse.dy * 0.004));
        mouse.dx *= 0.6;
        mouse.dy *= 0.6;
      }
      let throttleDelta = 0;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyE')) throttleDelta += 1;
      if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyQ')) throttleDelta -= 1;
      if (mouse.wheel !== 0) {
        throttleDelta -= Math.max(-1, Math.min(1, mouse.wheel * 0.002));
        mouse.wheel = 0;
      }
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        bank: Math.max(-1, Math.min(1, bank)),
        throttleDelta,
        brake: keys.has('Space'),
        flaps: keys.has('KeyF'),
      };
    },
    // One-shot keys pressed since the last call.
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    takeClick() {
      const c = mouse.clicked;
      mouse.clicked = false;
      const pos = { x: mouse.x, y: mouse.y };
      return c ? pos : null;
    },
    keyDown(code) {
      return keys.has(code);
    },
    get mousePos() {
      return { x: mouse.x, y: mouse.y };
    },
    get pointerLocked() {
      return pointerLocked;
    },
  };
}

export { KEYS };
