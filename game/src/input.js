// Keyboard and mouse input. Movement is polled (a set of held key codes), the mouse position
// is kept in logical world coordinates (the renderer reports its letterbox transform through
// the `toLogical` callback), and one-shot actions — confirm, pause, mute, bomb — are queued as
// a bitmask the game loop drains each frame.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_BOMB = 8;
/** Draft picks: the 1 / 2 / 3 keys choose between the three upgrade cards. */
export const ACTION_PICK1 = 16;
export const ACTION_PICK2 = 32;
export const ACTION_PICK3 = 64;

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyP', 'KeyQ', 'KeyM', 'Enter', 'Escape',
  'Digit1', 'Digit2', 'Digit3',
]);

export function createInput(canvas, toLogical) {
  const held = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let actions = 0;

  function updateMouse(event) {
    const point = toLogical(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
  }

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'KeyQ') actions |= ACTION_BOMB;
    if (event.code === 'Digit1') actions |= ACTION_PICK1;
    if (event.code === 'Digit2') actions |= ACTION_PICK2;
    if (event.code === 'Digit3') actions |= ACTION_PICK3;
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', updateMouse);
  canvas.addEventListener('mousedown', (event) => {
    updateMouse(event);
    if (event.button === 0) {
      mouse.down = true;
      actions |= ACTION_CONFIRM;
    }
    if (event.button === 2) actions |= ACTION_BOMB;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** The movement direction from the held keys, normalized (-1..1 on each axis). */
    direction() {
      let x = 0;
      let y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    /** True while the trigger is held: left mouse button or Space. */
    firing() {
      return mouse.down || held.has('Space');
    },
    /** Drain the queued one-shot actions. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
