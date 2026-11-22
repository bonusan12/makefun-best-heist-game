// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, clean getaway and
// caught (or dawn). The best haul survives between visits in local storage.
//
// ?seed=N fixes the guard patrols' starting sway. ?shot=start|play|escape|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildLevel } from './level.js';
import { createWorld, EVENT_CAUGHT, EVENT_DAWN, EVENT_LOOT, EVENT_SMOKE, EVENT_SPOTTED, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_SMOKE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const level = buildLevel();
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, level.blockers);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best haul then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, null);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (clientX, clientY) => renderer.toField(clientX, clientY));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let tickTimer = 0;
  // A smoke press is taken once per frame and spent on the next world step, so a press
  // between two frames is never lost and never fires twice.
  let pendingSmoke = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Grab three treasures, then reach the exit.');
  }

  function endGame(won) {
    const haul = world.state.lootValue + (won ? Math.round(world.state.timeLeft) * 10 : 0);
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (haul > best) {
      best = haul;
      saveBest(best);
    }
    announce(
      won
        ? `Clean getaway. Total haul ${haul}. Best ${best}.`
        : `Caught. Loot pocketed ${world.state.lootValue}. Best ${best}.`,
    );
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (actions & ACTION_SMOKE && screen === SCREEN_PLAY) pendingSmoke = true;
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, 0, 0, false, false, true);
      return;
    }
    const move = input.direction(world.state.thief.x, world.state.thief.y);
    const smokePressed = pendingSmoke;
    pendingSmoke = false;
    const events = world.step(STEP, move.x, move.y, move.sneak, smokePressed, false);
    if (events & EVENT_LOOT) {
      audio.loot();
      announce(`Pocketed the ${world.state.lastLootName}. ${world.state.lootCount} of 5.`);
    }
    if (events & EVENT_SPOTTED) {
      audio.spotted();
      announce('Spotted! The alarm is climbing.');
    }
    if (events & EVENT_SMOKE) audio.smoke();
    if (events & EVENT_WIN) {
      audio.win();
      endGame(true);
    } else if (events & (EVENT_CAUGHT | EVENT_DAWN)) {
      audio.caught();
      endGame(false);
    }
    // A soft tick while a grab fills up.
    const near = world.nearestLoot();
    if (near.loot !== null && near.loot.grab > 0 && near.loot.grab < 1) {
      tickTimer -= STEP;
      if (tickTimer <= 0) {
        audio.grabTick();
        tickTimer = 0.25;
      }
    }
    audio.siren(world.state.alarm);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, input.clickTarget());
  }

  // Leaving the tab pauses a running game rather than letting the alarm climb unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Velvet Vault. Press Space or click to start the heist.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
