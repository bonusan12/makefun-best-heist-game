// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The room is drawn floor first, then the exit, the vision cones, the furniture,
// the loot, the smoke, the people and the cameras, then the HUD and any panel. Safe cover,
// danger and loot are coloured so each reads at a glance: gold for loot, green for the exit,
// yellow cones for guards, red cones for cameras.

import { ALARM, CAMERA, FIELD, FONT, GUARD, LOOT_TO_WIN, PALETTE, THIEF, TIME_LIMIT } from './config.js';
import { conePolygon } from './geometry.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const HUD_HEIGHT = 64;
const TILE = 80;

function formatMoney(value) {
  return `$${value.toLocaleString('en-US')}`;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function alarmColor(alarm) {
  if (alarm >= ALARM.sirenAt) return PALETTE.alarmHigh;
  if (alarm >= 35) return PALETTE.alarmMid;
  return PALETTE.alarmLow;
}

export function createRenderer(canvas, blockers) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = baseline ?? 'alphabetic';
    context.fillText(value, x, y);
  }

  function drawFloor() {
    for (let ty = 0; ty < FIELD.height / TILE; ty += 1) {
      for (let tx = 0; tx < FIELD.width / TILE; tx += 1) {
        context.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        context.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // The red carpet runner down the middle of the gallery.
    context.fillStyle = PALETTE.carpet;
    context.fillRect(600, 24, 80, FIELD.height - 48);
    context.fillStyle = PALETTE.carpetEdge;
    context.fillRect(596, 24, 4, FIELD.height - 48);
    context.fillRect(680, 24, 4, FIELD.height - 48);
  }

  function drawWalls() {
    context.fillStyle = PALETTE.wall;
    context.fillRect(0, 0, FIELD.width, 24);
    context.fillRect(0, FIELD.height - 24, FIELD.width, 24);
    context.fillRect(0, 0, 24, FIELD.height);
    context.fillRect(FIELD.width - 24, 0, 24, FIELD.height);
    context.fillStyle = PALETTE.wallTrim;
    context.fillRect(0, 24, FIELD.width, 3);
    context.fillRect(0, FIELD.height - 27, FIELD.width, 3);
    context.fillRect(24, 0, 3, FIELD.height);
    context.fillRect(FIELD.width - 27, 0, 3, FIELD.height);
  }

  function drawExit(state) {
    const exit = state.exit;
    const open = state.lootCount >= LOOT_TO_WIN;
    const pulse = open ? 0.5 + 0.5 * Math.sin(state.elapsed * 5) : 0;
    context.fillStyle = open ? `rgba(55, 201, 120, ${0.25 + pulse * 0.2})` : 'rgba(55, 201, 120, 0.12)';
    context.fillRect(exit.x, exit.y, exit.width, exit.height);
    context.strokeStyle = open ? PALETTE.exit : '#2c6b47';
    context.lineWidth = 3;
    context.strokeRect(exit.x, exit.y, exit.width, exit.height);
    text('EXIT', exit.x + exit.width / 2, exit.y + 42, 26, open ? PALETTE.exit : '#7fae92', 'center');
    text(
      open ? 'GO! GO! GO!' : `NEED ${LOOT_TO_WIN} LOOT`,
      exit.x + exit.width / 2,
      exit.y + 70,
      15,
      open ? PALETTE.text : PALETTE.muted,
      'center',
    );
  }

  function drawCone(ox, oy, angle, halfAngle, range, fill, edge) {
    const points = conePolygon(ox, oy, angle, halfAngle, range, blockers);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.5;
    context.stroke();
  }

  function drawObstacles(state) {
    for (let index = 0; index < state.obstacles.length; index += 1) {
      const rect = state.obstacles[index];
      if (rect.kind === 'vault') {
        context.fillStyle = PALETTE.vault;
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        context.fillStyle = PALETTE.vaultDoor;
        context.beginPath();
        context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, 42, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = PALETTE.wallTrim;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, 42, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = PALETTE.text;
        context.beginPath();
        context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, 8, 0, Math.PI * 2);
        context.fill();
        text('VAULT', rect.x + rect.width / 2, rect.y + rect.height - 12, 13, PALETTE.muted, 'center');
      } else if (rect.kind === 'pedestal') {
        context.fillStyle = PALETTE.pedestal;
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        context.fillStyle = PALETTE.pedestalTop;
        context.fillRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8);
        context.strokeStyle = PALETTE.wallTrim;
        context.lineWidth = 2;
        context.strokeRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8);
      } else if (rect.kind === 'rope') {
        context.fillStyle = PALETTE.rope;
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        context.fillStyle = PALETTE.wallTrim;
        context.fillRect(rect.x, rect.y - 3, 6, rect.height + 6);
        context.fillRect(rect.x + rect.width - 6, rect.y - 3, 6, rect.height + 6);
      } else {
        // Pillar: a stone column.
        context.fillStyle = PALETTE.pedestal;
        context.beginPath();
        context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = PALETTE.wallTrim;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawLoot(state) {
    for (let index = 0; index < state.loot.length; index += 1) {
      const loot = state.loot[index];
      if (loot.taken) continue;
      const bob = Math.sin(state.elapsed * 3 + index * 1.7) * 2;
      context.fillStyle = PALETTE.lootGlow;
      context.beginPath();
      context.arc(loot.x, loot.y + bob, 26, 0, Math.PI * 2);
      context.fill();
      // A gold diamond for the treasure.
      context.save();
      context.translate(loot.x, loot.y + bob);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.loot;
      context.fillRect(-10, -10, 20, 20);
      context.strokeStyle = '#fff3b0';
      context.lineWidth = 2;
      context.strokeRect(-10, -10, 20, 20);
      context.restore();
      text(loot.name, loot.x, loot.y + 34 + bob, 13, PALETTE.text, 'center');
      text(formatMoney(loot.value), loot.x, loot.y + 50 + bob, 12, PALETTE.loot, 'center');
      if (loot.grab > 0) {
        context.strokeStyle = PALETTE.loot;
        context.lineWidth = 4;
        context.beginPath();
        context.arc(loot.x, loot.y + bob, 30, -Math.PI / 2, -Math.PI / 2 + loot.grab * Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawSmoke(state) {
    for (let index = 0; index < state.smokes.length; index += 1) {
      const smoke = state.smokes[index];
      if (smoke.timeLeft <= 0) continue;
      const alpha = Math.min(1, smoke.timeLeft / 1.5) * 0.5;
      context.fillStyle = `rgba(200, 200, 210, ${alpha})`;
      context.beginPath();
      context.arc(smoke.x, smoke.y, smoke.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = `rgba(220, 220, 230, ${alpha * 0.7})`;
      context.beginPath();
      context.arc(smoke.x - 30, smoke.y - 18, smoke.radius * 0.55, 0, Math.PI * 2);
      context.arc(smoke.x + 28, smoke.y + 16, smoke.radius * 0.6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawGuard(guard) {
    const alert = guard.seesThief || guard.chasing;
    drawCone(
      guard.x,
      guard.y,
      guard.angle,
      GUARD.visionHalfAngle,
      GUARD.visionRange,
      alert ? PALETTE.coneAlert : PALETTE.coneGuard,
      alert ? 'rgba(255, 60, 60, 0.6)' : PALETTE.coneGuardEdge,
    );
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.beginPath();
    context.ellipse(guard.x, guard.y + 12, 14, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.guard;
    context.beginPath();
    context.arc(guard.x, guard.y, 14, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.guardTrim;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(guard.x, guard.y, 14, 0, Math.PI * 2);
    context.stroke();
    // Cap brim pointing where the guard looks.
    context.fillStyle = PALETTE.guardTrim;
    context.beginPath();
    context.arc(
      guard.x + Math.cos(guard.angle) * 10,
      guard.y + Math.sin(guard.angle) * 10,
      5,
      0,
      Math.PI * 2,
    );
    context.fill();
    if (guard.seesThief) {
      text('!', guard.x, guard.y - 22, 26, '#ff3b30', 'center');
    } else if (guard.suspicion > 0.25) {
      text('?', guard.x, guard.y - 22, 24, PALETTE.loot, 'center');
    }
  }

  function drawCamera(camera) {
    drawCone(
      camera.x,
      camera.y,
      camera.angle,
      CAMERA.visionHalfAngle,
      CAMERA.visionRange,
      camera.seesThief ? PALETTE.coneAlert : PALETTE.coneCamera,
      camera.seesThief ? 'rgba(255, 60, 60, 0.6)' : PALETTE.coneCameraEdge,
    );
    context.fillStyle = PALETTE.cameraBody;
    context.fillRect(camera.x - 11, camera.y - 8, 22, 16);
    context.fillStyle = camera.seesThief ? '#ff3b30' : '#ff5c5c';
    context.beginPath();
    context.arc(camera.x + Math.cos(camera.angle) * 12, camera.y + Math.sin(camera.angle) * 12, 5, 0, Math.PI * 2);
    context.fill();
    if (camera.seesThief) text('!', camera.x, camera.y - 20, 22, '#ff3b30', 'center');
  }

  function drawThief(state) {
    const thief = state.thief;
    const radius = thief.sneak ? 11 : THIEF.radius;
    context.fillStyle = 'rgba(0, 0, 0, 0.4)';
    context.beginPath();
    context.ellipse(thief.x, thief.y + 11, 13, 5, 0, 0, Math.PI * 2);
    context.fill();
    // Hooded cloak, pointing where the thief moves. A warm bronze cloak with a dark
    // rim, so the thief reads on the dark floor at a glance (the old slate cloak
    // vanished into it in the screenshots).
    context.fillStyle = PALETTE.thiefCloak;
    context.beginPath();
    context.arc(thief.x, thief.y, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(20, 12, 6, 0.85)';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = PALETTE.thief;
    context.beginPath();
    context.moveTo(thief.x + Math.cos(thief.angle) * (radius + 7), thief.y + Math.sin(thief.angle) * (radius + 7));
    context.lineTo(
      thief.x + Math.cos(thief.angle + 2.6) * radius,
      thief.y + Math.sin(thief.angle + 2.6) * radius,
    );
    context.lineTo(
      thief.x + Math.cos(thief.angle - 2.6) * radius,
      thief.y + Math.sin(thief.angle - 2.6) * radius,
    );
    context.closePath();
    context.fill();
    // The pale mask.
    context.fillStyle = PALETTE.thiefMask;
    context.beginPath();
    context.arc(
      thief.x + Math.cos(thief.angle) * 4,
      thief.y + Math.sin(thief.angle) * 4,
      6,
      0,
      Math.PI * 2,
    );
    context.fill();
    if (thief.sneak) {
      context.strokeStyle = 'rgba(242, 234, 216, 0.5)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(thief.x, thief.y, radius + 5, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawClickTarget(target) {
    if (target === null) return;
    context.strokeStyle = 'rgba(242, 234, 216, 0.7)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(target.x, target.y, 8, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(target.x - 12, target.y);
    context.lineTo(target.x + 12, target.y);
    context.moveTo(target.x, target.y - 12);
    context.lineTo(target.x, target.y + 12);
    context.stroke();
  }

  function drawFloats(state) {
    for (let index = 0; index < state.floats.length; index += 1) {
      const float = state.floats[index];
      context.globalAlpha = Math.max(0, Math.min(1, float.life));
      text(float.text, float.x, float.y, 20, float.color, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, screen) {
    context.fillStyle = PALETTE.hud;
    context.fillRect(0, 0, FIELD.width, HUD_HEIGHT);
    context.fillStyle = PALETTE.wallTrim;
    context.fillRect(0, HUD_HEIGHT, FIELD.width, 2);

    // Loot, left.
    text('LOOT', 24, 26, 15, PALETTE.muted, 'left');
    text(`${formatMoney(state.lootValue)}  (${state.lootCount}/${state.loot.length})`, 24, 52, 24, PALETTE.loot, 'left');

    // Alarm, centre: a bar that fills as the heat rises.
    const barX = FIELD.width / 2 - 170;
    const barWidth = 340;
    text('ALARM', FIELD.width / 2, 26, 15, state.alarm >= ALARM.sirenAt ? PALETTE.alarmHigh : PALETTE.muted, 'center');
    context.fillStyle = '#241d33';
    context.fillRect(barX, 34, barWidth, 18);
    context.fillStyle = alarmColor(state.alarm);
    context.fillRect(barX, 34, (barWidth * state.alarm) / 100, 18);
    context.strokeStyle = PALETTE.wallTrim;
    context.lineWidth = 2;
    context.strokeRect(barX, 34, barWidth, 18);
    text(`${Math.round(state.alarm)}%`, FIELD.width / 2, 66, 13, PALETTE.text, 'center');

    // Timer and smoke, right.
    const lowTime = state.timeLeft <= 30;
    text('TIME', FIELD.width - 24, 26, 15, lowTime ? PALETTE.alarmHigh : PALETTE.muted, 'right');
    text(formatTime(state.timeLeft), FIELD.width - 24, 52, 24, lowTime ? PALETTE.alarmHigh : PALETTE.text, 'right');
    text(`SMOKE ${'●'.repeat(state.smokeLeft)}${'○'.repeat(2 - state.smokeLeft)}  [Q]`, FIELD.width - 170, 26, 15, PALETTE.muted, 'right');

    // Objective line under the bar.
    const objective =
      state.lootCount >= LOOT_TO_WIN
        ? 'You have enough — reach the green EXIT door!'
        : `Grab ${LOOT_TO_WIN - state.lootCount} more treasure${LOOT_TO_WIN - state.lootCount === 1 ? '' : 's'}, then reach the EXIT.`;
    text(objective, 24, HUD_HEIGHT + 22, 15, PALETTE.muted, 'left');
    if (screen === SCREEN_PLAY) {
      text('WASD / arrows to move · Shift to sneak · click to walk · Q smoke', FIELD.width - 24, HUD_HEIGHT + 22, 13, PALETTE.muted, 'right');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const lineHeight = 30;
    const height = 150 + lines.length * lineHeight + 66;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(5, 4, 10, 0.42)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent ?? PALETTE.panelEdge;
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 72, 46, accent ?? PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 118 + index * lineHeight, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 34, 22, PALETTE.loot, 'center');
  }

  /** Paint one frame: the room, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, clickTarget) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawFloor();
    drawExit(state);
    for (let index = 0; index < state.cameras.length; index += 1) drawCamera(state.cameras[index]);
    for (let index = 0; index < state.guards.length; index += 1) drawGuard(state.guards[index]);
    drawObstacles(state);
    drawLoot(state);
    drawSmoke(state);
    drawThief(state);
    drawClickTarget(clickTarget);
    drawFloats(state);
    drawWalls();

    // The HUD stays up on the title screen too: the alarm meter, the loot and the timer
    // are part of the room, and every screenshot should show the whole heist at a glance.
    drawHud(state, screen);
    if (screen === SCREEN_TITLE) {
      const lines = [
        'The Gilded Gallery, after closing time. Five treasures, three guards,',
        'two sweeping cameras and one very loud alarm. Take at least three',
        'treasures, then slip out through the green EXIT door before dawn.',
        '',
        'Move: WASD / arrows or click the floor · Sneak: hold Shift (slower, quieter)',
        'Grab loot: stand close and wait · Smoke pellet: Q (2 per heist, it hisses)',
        '',
        `Best haul so far: ${formatMoney(best)}`,
      ];
      drawPanel('VELVET VAULT', lines, 'Press Space or click to start the heist', PALETTE.loot);
      return;
    }
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The guards will wait for you.'], 'Press P to keep sneaking');
    } else if (screen === SCREEN_WIN) {
      const bonus = Math.round(state.timeLeft) * 10;
      const lines = [
        state.reason,
        `Loot: ${formatMoney(state.lootValue)}  ·  Time bonus: ${formatMoney(bonus)}`,
        `Total haul: ${formatMoney(state.lootValue + bonus)}`,
        `Best haul so far: ${formatMoney(best)}`,
      ];
      drawPanel('CLEAN GETAWAY!', lines, 'Press Space or click to steal again', PALETTE.exit);
    } else if (screen === SCREEN_OVER) {
      const lines = [
        state.reason,
        `Loot pocketed: ${formatMoney(state.lootValue)}  (${state.lootCount}/${state.loot.length})`,
        `Best haul so far: ${formatMoney(best)}`,
      ];
      drawPanel(state.outcome === 'dawn' ? 'DAWN BREAKS' : 'CAUGHT!', lines, 'Press Space or click to try again', PALETTE.alarmHigh);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return {
      x: (x * canvas.width - view.x) / view.scale,
      y: (y * canvas.height - view.y) / view.scale,
    };
  } };
}
