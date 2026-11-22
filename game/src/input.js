// Keyboard and pointer input. Held keys give a steering direction; one-shot presses (start,
// restart, pause, smoke) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. A mouse click sets a walk target
// on the floor; the keys always override it.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SMOKE = 4;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SMOKE = new Set(['KeyQ']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(canvas, toField) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let sneak = false;
  let actions = 0;
  let clickTarget = null;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (SNEAK.has(event.code)) sneak = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (SMOKE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SMOKE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (SNEAK.has(event.code)) sneak = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    sneak = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    const point = toField(event.clientX, event.clientY);
    if (point !== null) clickTarget = point;
    actions |= ACTION_CONFIRM;
  });

  return {
    /**
     * The thief's wanted direction: keys first, else toward the clicked floor point.
     * Returns { x, y, sneak } with x and y in -1..1, or null when standing still.
     */
    direction(thiefX, thiefY) {
      const kx = (right ? 1 : 0) - (left ? 1 : 0);
      const ky = (down ? 1 : 0) - (up ? 1 : 0);
      if (kx !== 0 || ky !== 0) {
        clickTarget = null;
        const length = Math.sqrt(kx * kx + ky * ky);
        return { x: kx / length, y: ky / length, sneak };
      }
      if (clickTarget !== null) {
        const dx = clickTarget.x - thiefX;
        const dy = clickTarget.y - thiefY;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 10) {
          clickTarget = null;
          return { x: 0, y: 0, sneak };
        }
        return { x: dx / length, y: dy / length, sneak };
      }
      return { x: 0, y: 0, sneak };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The current click-to-move target, for the renderer to draw as a marker. */
    clickTarget() {
      return clickTarget;
    },
  };
}
