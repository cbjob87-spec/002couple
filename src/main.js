/**
 * 002couple — side scroller
 *
 * ROLE LOCK (do not swap sprites or controls):
 *   볼떵이 = PLAYER only
 *     cream face + forehead mark, white shirt, dark tie, black pants
 *     keyboard/touch move+jump, food, exercise; walks L→R
 *     sprite: boltongi-walk-jump.png (+ exercise encounter sheets)
 *   볼빵이 = ENDING NPC only (never player-controlled)
 *     white face, pointed ears, curly bangs, yellow dress
 *     waits at stage right; flowers behind → show front when approached
 *     sprites: bolppangi-flowers-behind/front.png
 *   포옹 시트 hug-4cut.png: 볼떵이 LEFT, 볼빵이 RIGHT (baked)
 *
 * One PLAYER_SCALE for idle/walk/jump/exercise/ending approach —
 * never introduce a second larger 볼떵이 only for the ending.
 */

import {
  unlockAudio,
  ensureBgmPlaying,
  playJump,
  playHeal,
  setBgmOn,
  setSfxOn,
  setBgmVolume,
  setSfxVolume,
  getAudioPrefs,
  audioNeededBgmLabel,
} from './audio.js';

const W = 960;
const H = 540;
/** Align with season BG road (not mid-air above the painted street). */
const GROUND_Y = Math.round(H * 0.865);
const BILLBOARD_H = Math.round(H * 0.6); // 55–65% of H
const GRAVITY = 0.55;
const MOVE_SPEED = 3.6;
const JUMP_V = -11.2;
const MAX_HEARTS = 3;
const INVINCIBLE_MS = 1400;
const FLOWER_HOLD_MS = 900;
const HUG_FRAME_MS = 700;
const ENDING_TRIGGER_DIST = 160;
const CLOSE_STEP = 40;
const SPACING = Math.round(W * 1.25); // 1.1–1.4×W

/**
 * Shared standing body height (head→feet).
 * Exclude ears / flower loft / dress flare from the match target.
 */
const CHARACTER_BODY_H = Math.round(H * 0.245);

const PLAYER_CELL = { cols: 5, rows: 3, fw: 323, fh: 323 };
/** Per-frame foot/body metrics in cell pixels (idle frame 0 is scale reference). */
const PLAYER_FRAMES = [
  { footY: 303, headTop: 33, bodyH: 271, bodyCx: 179, torsoW: 189, headW: 139 },
  { footY: 304, headTop: 33, bodyH: 272, bodyCx: 165, torsoW: 190, headW: 141 },
  { footY: 307, headTop: 34, bodyH: 274, bodyCx: 145, torsoW: 186, headW: 137 },
  { footY: 304, headTop: 31, bodyH: 274, bodyCx: 164, torsoW: 189, headW: 136 },
  { footY: 305, headTop: 33, bodyH: 273, bodyCx: 118, torsoW: 189, headW: 136 },
  { footY: 293, headTop: 28, bodyH: 266, bodyCx: 173, torsoW: 212, headW: 148 },
  { footY: 278, headTop: 22, bodyH: 257, bodyCx: 168, torsoW: 223, headW: 148 },
  { footY: 322, headTop: 27, bodyH: 296, bodyCx: 158, torsoW: 217, headW: 153 },
  { footY: 275, headTop: 24, bodyH: 252, bodyCx: 149, torsoW: 231, headW: 143 },
  { footY: 296, headTop: 61, bodyH: 236, bodyCx: 135, torsoW: 207, headW: 152 },
  { footY: 290, headTop: 26, bodyH: 265, bodyCx: 181, torsoW: 228, headW: 143 },
  { footY: 255, headTop: 8, bodyH: 248, bodyCx: 179, torsoW: 231, headW: 129 },
  { footY: 234, headTop: 0, bodyH: 235, bodyCx: 156, torsoW: 233, headW: 133 },
  { footY: 283, headTop: 20, bodyH: 264, bodyCx: 166, torsoW: 222, headW: 146 },
  { footY: 299, headTop: 62, bodyH: 238, bodyCx: 125, torsoW: 198, headW: 136 },
];
const PLAYER_REF = PLAYER_FRAMES[0];

/** 볼빵이 NPC — scale from behind-pose solid body (flowers excluded). */
const BOLPPANGI = {
  behind: {
    key: 'bolBehind',
    fw: 1254,
    fh: 1254,
    footY: 1119, // solid paws, not drop-shadow tip
    headTop: 139,
    bodyH: 981,
    bodyCx: 632,
    torsoW: 734,
    headW: 434,
  },
  front: {
    key: 'bolFront',
    fw: 1312,
    fh: 1199,
    footY: 1139,
    headTop: 73,
    bodyH: 1067,
    bodyCx: 638,
    torsoW: 778,
    headW: 553,
  },
};
const BOLPPANGI_SCALE = CHARACTER_BODY_H / BOLPPANGI.behind.bodyH;
/**
 * Same scale for every 볼떵이 draw (idle/walk/jump/exercise/ending approach).
 * +20% vs raw body match so head/torso read equal next to 볼빵이 dress mass
 * (still one scale — not an ending-only oversized double).
 */
const PLAYER_SCALE = (CHARACTER_BODY_H / PLAYER_REF.bodyH) * 1.2;
const PLAYER_H = Math.round(PLAYER_REF.bodyH * PLAYER_SCALE);
const PLAYER_W = Math.round(PLAYER_REF.torsoW * PLAYER_SCALE * 0.82);

const HUG_CELL = { cols: 4, rows: 1, fw: 543, fh: 724 };
/** Hug plate: 볼떵이 left, 볼빵이 right. Scale from frame0 body; keep pose height changes. */
const HUG_FRAMES = [
  { footY: 525, headTop: 251, bodyH: 275, bodyCx: 281, torsoW: 438 },
  { footY: 526, headTop: 224, bodyH: 303, bodyCx: 269, torsoW: 483 },
  { footY: 529, headTop: 243, bodyH: 287, bodyCx: 275, torsoW: 406 },
  { footY: 529, headTop: 157, bodyH: 373, bodyCx: 265, torsoW: 382 },
];
const HUG_SCALE = CHARACTER_BODY_H / HUG_FRAMES[0].bodyH;
// Back-compat aliases used in ending state
const BOL = BOLPPANGI;
const BOL_SCALE = BOLPPANGI_SCALE;

const ASSETS = {
  playerSheet: 'boltongi-walk-jump.png',
  treadmillEncounter: 'exercise-treadmill-encounter.png',
  bikeEncounter: 'exercise-bike-encounter.png',
  treadmillVillain: 'treadmill-villain.png',
  bikeVillain: 'bike-villain.png',
  chicken: 'food-chicken.png',
  pizza: 'food-pizza.png',
  burger: 'food-burger.png',
  dropTower: 'drop-tower.png',
  mcdonalds: 'sign-mcdonalds.png',
  banchangko: 'billboard-banchangko.png',
  lesmis: 'billboard-lesmiserables.png',
  station: 'station-gosok.png',
  wolfboy: 'billboard-wolfboy.png',
  samsung: 'billboard-samsung.png',
  cu: 'cu-store.png',
  seventh: 'billboard-7throom.png',
  sealife: 'billboard-sealife.png',
  lv: 'billboard-lv.png',
  abouttime: 'billboard-abouttime.png',
  coffee: 'sign-toetmaru-coffee.png',
  paragliding: 'billboard-paragliding.png',
  mrsunshine: 'billboard-mrsunshine.png',
  extremejob: 'billboard-extremejob.png',
  cyrano: 'billboard-cyrano.png',
  dongbang: 'memory-dongbangshinki.png',
  wedding: 'wedding-billboard.png',
  bolBehind: 'bolppangi-flowers-behind.png',
  bolFront: 'bolppangi-flowers-front.png',
  hug: 'hug-4cut.png',
  bgWinter: 'bg-winter.png',
  bgSpring: 'bg-spring.png',
  bgSummer: 'bg-summer.png',
  bgAutumn: 'bg-autumn.png',
};

const SEASON_KEYS = ['bgWinter', 'bgSpring', 'bgSummer', 'bgAutumn'];

/** Opaque content bounds (precomputed; size by these, not full canvas padding) */
const BOUNDS = {
  cu: { ox: 108, oy: 118, ow: 1558, oh: 692 },
  station: { ox: 418, oy: 64, ow: 287, oh: 1298 },
  wolfboy: { ox: 175, oy: 62, ow: 772, oh: 1290 },
  lesmis: { ox: 141, oy: 31, ow: 840, oh: 1340 },
  banchangko: { ox: 166, oy: 92, ow: 790, oh: 1249 },
  dropTower: { ox: 365, oy: 14, ow: 375, oh: 1395 },
  mcdonalds: { ox: 220, oy: 99, ow: 775, oh: 1116 },
  coffee: { ox: 160, oy: 42, ow: 1216, oh: 931 },
  sealife: { ox: 170, oy: 109, ow: 1434, oh: 709 },
  paragliding: { ox: 159, oy: 38, ow: 1217, oh: 958 },
  mrsunshine: { ox: 369, oy: 39, ow: 574, oh: 1135 },
  seventh: { ox: 160, oy: 61, ow: 993, oh: 1085 },
  samsung: { ox: 264, oy: 67, ow: 1006, oh: 906 },
  abouttime: { ox: 117, oy: 44, ow: 1077, oh: 1124 },
  extremejob: { ox: 90, oy: 42, ow: 1133, oh: 1126 },
  cyrano: { ox: 113, oy: 48, ow: 1087, oh: 1126 },
  lv: { ox: 225, oy: 44, ow: 1086, oh: 949 },
  dongbang: { ox: 205, oy: 74, ow: 707, oh: 1286 },
  wedding: { ox: 102, oy: 23, ow: 818, oh: 1492 },
  bolBehind: { ox: 165, oy: 129, ow: 928, oh: 1004 },
  bolFront: { ox: 46, oy: 59, ow: 1187, oh: 1095 },
  chicken: { ox: 298, oy: 131, ow: 852, oh: 782 },
  pizza: { ox: 206, oy: 210, ow: 844, oh: 819 },
  burger: { ox: 78, oy: 150, ow: 1090, oh: 1038 },
  treadmillVillain: { ox: 83, oy: 111, ow: 1141, oh: 1028 },
  bikeVillain: { ox: 124, oy: 102, ow: 983, oh: 1094 },
};

/**
 * Exact memory order. 동방신기 has NO asset in inventory — skipped, gap reported.
 * kind: store | station | billboard | tower | ending
 */
const MEMORY_DEFS = [
  { id: 'cu', key: 'cu', label: 'CU', kind: 'store', hFrac: 0.55 },
  { id: 'station', key: 'station', label: '고속터미널역', kind: 'station', hFrac: 0.62 },
  { id: 'wolfboy', key: 'wolfboy', label: '늑대소년', kind: 'billboard', hFrac: 0.6 },
  { id: 'lesmis', key: 'lesmis', label: '레미제라블', kind: 'billboard', hFrac: 0.6 },
  { id: 'banchangko', key: 'banchangko', label: '반창꼬', kind: 'billboard', hFrac: 0.6 },
  { id: 'dropTower', key: 'dropTower', label: '자이로드롭', kind: 'tower', hFrac: 0.65 },
  { id: 'mcdonalds', key: 'mcdonalds', label: '맥도날드', kind: 'billboard', hFrac: 0.58 },
  // Standalone portrait art (ea77438a ≡ bb05cdea) — grounded display, no extra frame
  { id: 'dongbang', key: 'dongbang', label: '동방신기', kind: 'portrait', hFrac: 0.58 },
  { id: 'coffee', key: 'coffee', label: '툇마루커피', kind: 'billboard', hFrac: 0.55 },
  { id: 'sealife', key: 'sealife', label: '아쿠아리움', kind: 'billboard', hFrac: 0.55 },
  { id: 'paragliding', key: 'paragliding', label: '패러글라이딩', kind: 'billboard', hFrac: 0.58 },
  { id: 'mrsunshine', key: 'mrsunshine', label: '미스터 션샤인', kind: 'billboard', hFrac: 0.6 },
  { id: 'seventh', key: 'seventh', label: '7번방의 선물', kind: 'billboard', hFrac: 0.6 },
  { id: 'samsung', key: 'samsung', label: '삼성 노트북', kind: 'billboard', hFrac: 0.55 },
  { id: 'abouttime', key: 'abouttime', label: '어바웃 타임', kind: 'billboard', hFrac: 0.6 },
  { id: 'extremejob', key: 'extremejob', label: '극한직업', kind: 'billboard', hFrac: 0.6 },
  { id: 'cyrano', key: 'cyrano', label: '뮤지컬 시라노', kind: 'billboard', hFrac: 0.6 },
  { id: 'lv', key: 'lv', label: '루이비통', kind: 'billboard', hFrac: 0.55 },
  { id: 'wedding', key: 'wedding', label: '결혼사진', kind: 'ending', hFrac: 0.62 },
];

const MISSING_ASSETS = [];

/** @type {Record<string, HTMLImageElement>} */
const images = {};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const hpLabel = document.getElementById('hpLabel');
const zoneLabel = document.getElementById('zoneLabel');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayBody = document.getElementById('overlayBody');
const btnStart = document.getElementById('btnStart');
const btnNearEnding = document.getElementById('btnNearEnding');
const btnRestart = document.getElementById('btnRestart');

const keys = new Set();
const touch = { left: false, right: false, jump: false };
let jumpQueued = false;

function loadImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${name}`));
    img.src = `/assets/${name}`;
  });
}

async function loadAll() {
  await Promise.all(
    Object.entries(ASSETS).map(async ([key, file]) => {
      images[key] = await loadImage(file);
    }),
  );
}

function layoutSize(key, hFrac = 0.6) {
  const b = BOUNDS[key];
  if (!b) return { w: 120, h: BILLBOARD_H };
  let h = Math.round(H * hFrac);
  let w = Math.round((b.ow / b.oh) * h);
  // Keep wide stores from exceeding ~0.95×W
  if (w > W * 0.92) {
    w = Math.round(W * 0.92);
    h = Math.round((b.oh / b.ow) * w);
  }
  // Tall thin signs: cap width floor so readable
  if (w < 70) {
    w = 70;
    h = Math.round((b.oh / b.ow) * w);
    if (h > H * 0.7) h = Math.round(H * 0.7);
  }
  return { w, h };
}

/** Draw opaque crop, feet on groundY, centered at worldCX */
function drawOpaqueAt(key, worldCX, groundY, hFrac, camX) {
  const img = images[key];
  const b = BOUNDS[key];
  if (!img || !b) return null;
  const { w, h } = layoutSize(key, hFrac);
  const sx = worldCX - w / 2 - camX;
  const sy = groundY - h; // base sits on ground line
  if (sx + w < -20 || sx > W + 20) return { w, h, sx, sy };
  ctx.drawImage(img, b.ox, b.oy, b.ow, b.oh, Math.round(sx), Math.round(sy), w, h);
  return { w, h, sx, sy };
}

function drawSheetFrame(img, cols, rows, index, dx, dy, dw, dh, flip = false) {
  if (!img) return;
  const fw = img.width / cols;
  const fh = img.height / rows;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const scale = Math.min(dw / fw, dh / fh);
  const w = fw * scale;
  const h = fh * scale;
  const x = dx + (dw - w) / 2;
  const y = dy + dh - h;
  ctx.save();
  if (flip) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, col * fw, row * fh, fw, fh, 0, 0, w, h);
  } else {
    ctx.drawImage(img, col * fw, row * fh, fw, fh, x, y, w, h);
  }
  ctx.restore();
}

/**
 * Draw a sheet frame with fixed world scale + foot anchor.
 * feetWorldX/Y = where the source footY pixel should land in world space.
 */
function drawSheetAtFeet(img, cols, rows, index, meta, scale, feetWorldX, feetWorldY, camX, flip = false) {
  if (!img || !meta) return null;
  const fw = img.width / cols;
  const fh = img.height / rows;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const w = fw * scale;
  const h = fh * scale;
  const dx = feetWorldX - meta.bodyCx * scale - camX;
  // footY row sits on the ground line (no +1 pad that lifts the sprite)
  const dy = feetWorldY - meta.footY * scale;
  ctx.save();
  if (flip) {
    const pivot = feetWorldX - camX;
    ctx.translate(pivot, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, col * fw, row * fh, fw, fh, -(meta.bodyCx * scale), 0, w, h);
  } else {
    ctx.drawImage(img, col * fw, row * fh, fw, fh, Math.round(dx), Math.round(dy), Math.round(w), Math.round(h));
  }
  ctx.restore();
  return { w, h, dx, dy, scale };
}

/** Full image (not sheet) with foot anchor + fixed scale from body metrics. */
function drawImageAtFeet(img, meta, scale, feetWorldX, feetWorldY, camX) {
  if (!img || !meta) return null;
  const w = meta.fw * scale;
  const h = meta.fh * scale;
  const dx = feetWorldX - meta.bodyCx * scale - camX;
  const dy = feetWorldY - meta.footY * scale;
  ctx.drawImage(img, Math.round(dx), Math.round(dy), Math.round(w), Math.round(h));
  return { w, h, dx, dy, scale };
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** HUD hearts as HTML — white unicode ♥ on HUD looked empty; use colored glyphs. */
function heartsHtml(n) {
  let html = '<span class="hp-label">하트</span> ';
  for (let i = 0; i < MAX_HEARTS; i++) {
    html +=
      i < n
        ? '<span class="hp-full" aria-hidden="true">♥</span>'
        : '<span class="hp-empty" aria-hidden="true">♥</span>';
  }
  return html;
}

function buildMemories() {
  const startX = 520;
  return MEMORY_DEFS.map((def, i) => {
    const size = layoutSize(def.key, def.hFrac);
    return {
      ...def,
      cx: startX + i * SPACING,
      w: size.w,
      h: size.h,
    };
  });
}

function betweenSpot(memories, i, t = 0.5) {
  if (i < 0) return memories[0].cx - SPACING * 0.45;
  if (i >= memories.length - 1) return memories[memories.length - 1].cx + SPACING * 0.4;
  return memories[i].cx + (memories[i + 1].cx - memories[i].cx) * t;
}

/** @type {ReturnType<typeof createState>} */
let state;

function createState(mode = 'normal') {
  const memories = buildMemories();
  const wedding = memories[memories.length - 1];
  const near = mode === 'nearEnding';
  const startMem = memories[0];
  const playerStartX = near ? wedding.cx - W * 0.55 : startMem.cx - W * 0.35;

  // Hazards ONLY in the middle of gaps between memories (never in viewing strip)
  function gapHazardX(afterIndex) {
    // place at 50% of gap — safely away from both boards' SAFE≈0.42W zones when SPACING=1.25W
    return betweenSpot(memories, afterIndex, 0.5) - 40;
  }

  // Encounter sheets include 볼떵이 — box sized so he reads at PLAYER_SCALE (not a second body size)
  const exH = Math.round(PLAYER_H * 1.2);
  const exW = Math.round(exH * 0.9);
  const exercises = [
    {
      id: 'tm',
      type: 'treadmill',
      x: gapHazardX(3), // between 레미제라블 → 반창꼬
      y: GROUND_Y - exH,
      w: exW,
      h: exH,
      used: false,
      playing: false,
      frame: 0,
      frameT: 0,
      cols: 4,
      rows: 2,
      frames: 8,
      sheet: 'treadmillEncounter',
      idle: 'treadmillVillain',
    },
    {
      id: 'bk',
      type: 'bike',
      x: gapHazardX(9), // between 패러글라이딩 → 미스터 션샤인
      y: GROUND_Y - exH,
      w: exW,
      h: exH,
      used: false,
      playing: false,
      frame: 0,
      frameT: 0,
      cols: 4,
      rows: 2,
      frames: 7,
      sheet: 'bikeEncounter',
      idle: 'bikeVillain',
    },
  ];

  const foods = [
    { id: 'c1', kind: 'chicken', x: gapHazardX(0) - 10, y: GROUND_Y - 64, w: 56, h: 56, taken: false },
    { id: 'p1', kind: 'pizza', x: gapHazardX(5) - 10, y: GROUND_Y - 64, w: 56, h: 56, taken: false },
    { id: 'b1', kind: 'burger', x: gapHazardX(7) - 10, y: GROUND_Y - 64, w: 56, h: 56, taken: false },
    { id: 'c2', kind: 'chicken', x: gapHazardX(12) - 10, y: GROUND_Y - 64, w: 56, h: 56, taken: false },
    { id: 'p2', kind: 'pizza', x: gapHazardX(15) - 10, y: GROUND_Y - 64, w: 56, h: 56, taken: false },
  ];

  const worldEnd = wedding.cx + W * 0.7;

  return {
    mode,
    running: true,
    dead: false,
    won: false,
    hearts: MAX_HEARTS,
    invUntil: 0,
    cameraX: Math.max(0, playerStartX - W * 0.28),
    cameraLock: false,
    memories,
    worldEnd,
    player: {
      x: playerStartX,
      y: GROUND_Y - PLAYER_H,
      w: PLAYER_W,
      h: PLAYER_H,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
      anim: 'idle',
      frame: 0,
      frameT: 0,
    },
    foods,
    exercises,
    ending: {
      // Sequence: approach → flower (볼빵이 shows) → step closer → hug 4-cut
      // 볼빵이 = NPC at bolX (no input). 볼떵이 = same player + PLAYER_SCALE.
      phase: 'idle',
      bolX: wedding.cx + Math.round(CHARACTER_BODY_H * 0.85), // 볼빵이 feet X
      bolFeetY: GROUND_Y,
      bolScale: BOLPPANGI_SCALE,
      playerScale: PLAYER_SCALE,
      hugScale: HUG_SCALE,
      weddingCx: wedding.cx,
      timer: 0,
      hugFrame: 0,
      hugTimer: 0,
      inputLocked: false,
      damageLocked: false,
      hideIndividuals: false,
      hugAnchorX: wedding.cx + Math.round(CHARACTER_BODY_H * 0.35),
    },
    now: performance.now(),
    floatMsgs: [],
    _exerciseLock: false,
  };
}

function showOverlay(title, body, { start = false, near = false, restart = false } = {}) {
  overlayTitle.textContent = title;
  overlayBody.textContent = body;
  btnStart.classList.toggle('hidden', !start);
  btnNearEnding.classList.toggle('hidden', !near);
  btnRestart.classList.toggle('hidden', !restart);
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function startGame(mode = 'normal') {
  state = createState(mode);
  hideOverlay();
  updateHud();
  // Resume same BGM instance — do not rewind on restart or ending return
  ensureBgmPlaying();
}

async function startFromButton(mode = 'normal') {
  await unlockAudio();
  syncAudioUi();
  startGame(mode);
}

function currentMemoryLabel() {
  if (!state) return '';
  let best = state.memories[0];
  let bestD = Infinity;
  const px = state.player.x + state.player.w / 2;
  for (const m of state.memories) {
    const d = Math.abs(m.cx - px);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best.label;
}

function updateHud() {
  if (!state) return;
  hpLabel.innerHTML = heartsHtml(state.hearts);
  zoneLabel.textContent = currentMemoryLabel();
}

/** Flat safe viewing strip in front of each memory — no exercise damage here. */
function inMemorySafeZone(px) {
  const SAFE = W * 0.42; // ~half-screen around board center
  for (const m of state.memories) {
    if (Math.abs(px - m.cx) < SAFE) return true;
  }
  return false;
}

function wantLeft() {
  return keys.has('ArrowLeft') || keys.has('a') || keys.has('A') || touch.left;
}
function wantRight() {
  return keys.has('ArrowRight') || keys.has('d') || keys.has('D') || touch.right;
}
function wantJump() {
  return (
    jumpQueued ||
    keys.has(' ') ||
    keys.has('Space') ||
    keys.has('z') ||
    keys.has('Z') ||
    keys.has('ArrowUp') ||
    keys.has('w') ||
    keys.has('W') ||
    touch.jump
  );
}
function isJumpKey(key) {
  return key === ' ' || key === 'Space' || key === 'z' || key === 'Z' || key === 'ArrowUp' || key === 'w' || key === 'W';
}

function pushMsg(text, x, y) {
  state.floatMsgs.push({ text, x, y, life: 900 });
}

function beginExercise(ex) {
  ex.playing = true;
  ex.used = true;
  ex.frame = 0;
  ex.frameT = 0;
  state._exerciseLock = true;
}

function finishExercise(ex) {
  ex.playing = false;
  state._exerciseLock = false;
  if (!state.ending.damageLocked) {
    state.hearts = Math.max(0, state.hearts - 1);
    state.invUntil = state.now + INVINCIBLE_MS;
    pushMsg('-1 하트', state.player.x, state.player.y - 20);
    updateHud();
    if (state.hearts <= 0) {
      state.dead = true;
      state.running = false;
      showOverlay('하트가 없어요…', '볼떵이가 지쳐 쓰러졌어요.', {
        start: false,
        near: true,
        restart: true,
      });
    }
  }
}

function triggerEndingApproach() {
  const e = state.ending;
  const p = state.player;
  if (e.phase !== 'idle') return;
  // Only begin ending when boltongi is planted on the ground
  if (!p.onGround) return;
  e.phase = 'approach';
  e.inputLocked = true;
  e.damageLocked = true;
  state.cameraLock = true;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  p.y = GROUND_Y - p.h;
  p.facing = 1;
  e.bolFeetY = GROUND_Y;
  e.hugAnchorX = (p.x + p.w / 2 + e.bolX) / 2;
}

function updateEnding(dt) {
  const e = state.ending;
  const p = state.player;

  if (e.phase === 'idle') {
    const dx = e.bolX - (p.x + p.w);
    if (dx < ENDING_TRIGGER_DIST && dx > -60 && p.onGround) triggerEndingApproach();
    return;
  }

  // 볼떵이 + 볼빵이 share GROUND_Y; 볼빵이 never receives move input
  p.vy = 0;
  p.onGround = true;
  p.y = GROUND_Y - p.h;
  e.bolFeetY = GROUND_Y;

  // 1) 볼떵이 approaches right toward waiting 볼빵이
  if (e.phase === 'approach') {
    const target = e.bolX - Math.round(CHARACTER_BODY_H * 0.95);
    if (p.x < target) {
      p.x += MOVE_SPEED * 0.85;
      p.facing = 1;
      p.anim = 'walk';
      p.frameT += dt;
      if (p.frameT > 90) {
        p.frameT = 0;
        p.frame = (p.frame + 1) % 5;
      }
    } else {
      p.x = target;
      p.anim = 'idle';
      p.frame = 0;
      e.phase = 'flower'; // 2) 볼빵이 shows flowers
      e.timer = 0;
      e.hugAnchorX = (p.x + p.w / 2 + e.bolX) / 2;
    }
    return;
  }

  if (e.phase === 'flower') {
    e.timer += dt;
    if (e.timer >= FLOWER_HOLD_MS) {
      e.phase = 'step'; // 3) 볼떵이 steps closer
      e.timer = 0;
    }
    return;
  }

  if (e.phase === 'step') {
    const target = e.bolX - Math.round(CHARACTER_BODY_H * 0.95) + CLOSE_STEP;
    if (p.x < target) {
      p.x += MOVE_SPEED * 0.7;
      p.anim = 'walk';
      p.frameT += dt;
      if (p.frameT > 90) {
        p.frameT = 0;
        p.frame = (p.frame + 1) % 5;
      }
    } else {
      p.x = target;
      e.phase = 'hug'; // 4) hug 4-cut — 볼떵이 left / 볼빵이 right
      e.hideIndividuals = true;
      e.hugFrame = 0;
      e.hugTimer = 0;
      e.hugAnchorX = (p.x + p.w / 2 + e.bolX) / 2;
    }
    return;
  }

  if (e.phase === 'hug') {
    e.hugTimer += dt;
    if (e.hugFrame < 3 && e.hugTimer >= HUG_FRAME_MS) {
      e.hugTimer = 0;
      e.hugFrame += 1;
    } else if (e.hugFrame >= 3 && e.hugTimer >= HUG_FRAME_MS + 400) {
      e.phase = 'done';
      state.won = true;
      state.running = false;
      showOverlay('볼떵이 ♥ 볼빵이', '만났어요! 꽃다발과 포옹의 엔딩입니다.', {
        start: false,
        near: true,
        restart: true,
      });
    }
  }
}

function update(dt) {
  if (!state || !state.running) return;
  state.now = performance.now();
  const p = state.player;
  const endingActive = state.ending.phase !== 'idle';
  const exerciseLock = !!state._exerciseLock;

  for (const ex of state.exercises) {
    if (!ex.playing) continue;
    ex.frameT += dt;
    if (ex.frameT >= 140) {
      ex.frameT = 0;
      ex.frame += 1;
      if (ex.frame >= ex.frames) finishExercise(ex);
    }
  }

  if (endingActive) {
    updateEnding(dt);
  } else if (!exerciseLock) {
    let move = 0;
    if (wantLeft()) move -= 1;
    if (wantRight()) move += 1;
    p.vx = move * MOVE_SPEED;
    if (move !== 0) p.facing = move > 0 ? 1 : -1;

    if (wantJump() && p.onGround) {
      p.vy = JUMP_V;
      p.onGround = false;
      jumpQueued = false;
      playJump();
    } else if (p.onGround) {
      jumpQueued = false;
    }

    p.vy += GRAVITY;
    p.x += p.vx;
    p.y += p.vy;
    p.x = Math.max(40, Math.min(state.worldEnd - p.w - 20, p.x));

    if (p.y + p.h >= GROUND_Y) {
      p.y = GROUND_Y - p.h;
      p.vy = 0;
      p.onGround = true;
    } else {
      p.onGround = false;
    }

    if (!p.onGround) {
      p.anim = 'jump';
      p.frameT += dt;
      if (p.frameT > 100) {
        p.frameT = 0;
        p.frame = p.vy < 0 ? 6 + Math.min(2, Math.floor(-p.vy / 4)) : 12;
      }
    } else if (Math.abs(p.vx) > 0.1) {
      p.anim = 'walk';
      p.frameT += dt;
      if (p.frameT > 90) {
        p.frameT = 0;
        p.frame = (p.frame + 1) % 5;
      }
    } else {
      p.anim = 'idle';
      p.frame = 0;
    }

    for (const f of state.foods) {
      if (f.taken) continue;
      if (aabb({ x: p.x + 8, y: p.y + 8, w: p.w - 16, h: p.h - 8 }, f)) {
        f.taken = true;
        playHeal();
        if (state.hearts < MAX_HEARTS) {
          state.hearts += 1;
          pushMsg('+1 하트', f.x, f.y - 10);
        } else {
          pushMsg('하트 가득!', f.x, f.y - 10);
        }
        updateHud();
      }
    }

    // Viewing a memory is always safe — no exercise damage in front of boards
    if (
      state.now >= state.invUntil &&
      !state.ending.damageLocked &&
      !inMemorySafeZone(p.x + p.w / 2)
    ) {
      for (const ex of state.exercises) {
        if (ex.used || ex.playing) continue;
        const hit = { x: ex.x + 20, y: ex.y + 36, w: ex.w - 40, h: ex.h - 40 };
        if (aabb({ x: p.x + 10, y: p.y + 10, w: p.w - 20, h: p.h - 10 }, hit)) {
          beginExercise(ex);
          break;
        }
      }
    }

    updateEnding(dt);
  }

  // Camera: world-scroll with player; lock for ending so wedding + chars visible
  if (state.cameraLock || endingActive) {
    const e = state.ending;
    const target = Math.max(0, Math.min(state.worldEnd - W, e.weddingCx - W * 0.42));
    state.cameraX += (target - state.cameraX) * 0.1;
  } else {
    const targetCam = Math.max(0, Math.min(state.worldEnd - W, p.x - W * 0.32));
    state.cameraX += (targetCam - state.cameraX) * 0.14;
  }

  for (const m of state.floatMsgs) {
    m.life -= dt;
    m.y -= 0.04 * dt;
  }
  state.floatMsgs = state.floatMsgs.filter((m) => m.life > 0);
  updateHud();
}

/* ---------- Background: real season plates (progress-based) ---------- */

function stageProgress() {
  if (!state) return 0;
  const span = Math.max(1, state.worldEnd - W);
  let p = state.cameraX / span;
  // Ending MUST be autumn evening
  if (state.cameraLock || state.ending.phase !== 'idle') p = 1;
  const wedding = state.memories[state.memories.length - 1];
  if (wedding && state.player.x > wedding.cx - W * 0.7) p = Math.max(p, 0.97);
  return Math.max(0, Math.min(1, p));
}

/** winter→spring→summer→autumn with smooth crossfade at boundaries (no horizontal tile). */
function seasonBlend() {
  const p = stageProgress();
  const scaled = p * (SEASON_KEYS.length - 1); // 0..3
  const i0 = Math.min(3, Math.floor(scaled));
  const i1 = Math.min(3, i0 + 1);
  let t = scaled - i0;
  t = t * t * (3 - 2 * t); // smoothstep
  return { i0, i1, t, p };
}

function drawCoverImage(img, alpha) {
  if (!img || alpha <= 0.001) return;
  // Cover full canvas; keep aspect — no stretch
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawSeasonBackground() {
  const { i0, i1, t } = seasonBlend();
  // Fill fallback under plates
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(0, 0, W, H);
  if (i0 === i1 || t < 0.02) {
    drawCoverImage(images[SEASON_KEYS[i0]], 1);
  } else {
    drawCoverImage(images[SEASON_KEYS[i0]], 1);
    drawCoverImage(images[SEASON_KEYS[i1]], t);
  }
}

function seasonIndex() {
  const { i0, i1, t } = seasonBlend();
  return t > 0.5 ? i1 : i0;
}

function drawGround() {
  // Opaque road from GROUND_Y down — covers season-BG painted street so feet don't look mid-air.
  // Foot line = top edge of this road (collision Y constant across seasons).
  const si = seasonIndex();
  let path;
  let deep;
  let dash;
  let accent = null;
  if (si === 0) {
    path = '#d8e0ea';
    deep = '#a8b4c4';
    dash = '#c0cad8';
    accent = '#ffffff';
  } else if (si === 1 || si === 2) {
    path = '#8a847c';
    deep = '#5a544c';
    dash = '#b0aaa0';
    accent = '#aea79e';
  } else {
    path = '#6a5a48';
    deep = '#3e3228';
    dash = '#c4b49a';
    accent = '#a07040';
  }
  ctx.fillStyle = path;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // Center dashes sit ON the road surface just under the feet (not a lower "true ground")
  ctx.fillStyle = dash;
  for (let x = 10; x < W; x += 28) {
    ctx.fillRect(x, GROUND_Y + 5, 14, 2);
  }
  ctx.fillStyle = deep;
  ctx.fillRect(0, GROUND_Y + 22, W, H - GROUND_Y - 22);
  if (si === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let x = 8; x < W; x += 22) ctx.fillRect(x, GROUND_Y + 10, 3, 2);
  } else if (si === 3 && accent) {
    ctx.fillStyle = accent;
    for (let x = 12; x < W; x += 28) {
      ctx.fillRect(x, GROUND_Y + 12, 4, 2);
      ctx.fillRect(x + 10, GROUND_Y + 18, 3, 2);
    }
  } else if (accent) {
    ctx.fillStyle = accent;
    for (let x = 20; x < W; x += 40) ctx.fillRect(x, GROUND_Y + 12, 6, 1);
  }
}

function drawMemories() {
  const cam = state.cameraX;
  for (const m of state.memories) {
    drawOpaqueAt(m.key, m.cx, GROUND_Y, m.hFrac, cam);
  }
}

function drawFoods() {
  const cam = state.cameraX;
  const bob = Math.sin(state.now / 280) * 3;
  for (const f of state.foods) {
    if (f.taken) continue;
    const key = f.kind === 'chicken' ? 'chicken' : f.kind === 'pizza' ? 'pizza' : 'burger';
    const b = BOUNDS[key];
    const img = images[key];
    if (!img || !b) continue;
    const h = f.h;
    const w = Math.round((b.ow / b.oh) * h);
    const sx = f.x - cam;
    const sy = f.y + bob;
    ctx.drawImage(img, b.ox, b.oy, b.ow, b.oh, sx, sy, w, h);
  }
}

function drawExercises() {
  const cam = state.cameraX;
  for (const ex of state.exercises) {
    const sx = ex.x - cam;
    if (sx + ex.w < -40 || sx > W + 40) continue;
    if (ex.playing) {
      drawSheetFrame(
        images[ex.sheet],
        ex.cols,
        ex.rows,
        Math.min(ex.frame, ex.frames - 1),
        sx - 10,
        ex.y - 10,
        ex.w + 20,
        ex.h + 10,
      );
    } else {
      const key = ex.idle;
      const b = BOUNDS[key];
      const img = images[key];
      if (img && b) {
        const h = ex.h;
        const w = Math.round((b.ow / b.oh) * h);
        ctx.drawImage(img, b.ox, b.oy, b.ow, b.oh, sx + (ex.w - w) / 2, GROUND_Y - h, w, h);
      }
      if (!ex.used) {
        ctx.fillStyle = 'rgba(232, 93, 76, 0.9)';
        ctx.font = '700 18px Gaegu, sans-serif';
        ctx.fillText('!', sx + ex.w / 2 - 4, ex.y + 14);
      }
    }
  }
}

/** Draw 볼떵이 (player) — always PLAYER_SCALE for every anim/state. */
function drawPlayer() {
  if (state.ending.hideIndividuals) return;
  const p = state.player;
  const cam = state.cameraX;
  const inv = state.now < state.invUntil && !state.ending.damageLocked;
  if (inv && Math.floor(state.now / 80) % 2 === 0) return;

  let frame = 0;
  if (p.anim === 'walk') frame = p.frame % 5;
  else if (p.anim === 'jump') frame = Math.min(14, Math.max(5, p.frame));
  else frame = 0;

  const meta = PLAYER_FRAMES[frame] || PLAYER_REF;
  const feetX = p.x + p.w / 2;
  // Plant sole on ground; footY already marks solid shoe (not pad)
  const feetY = p.y + p.h;
  drawSheetAtFeet(
    images.playerSheet,
    PLAYER_CELL.cols,
    PLAYER_CELL.rows,
    frame,
    meta,
    PLAYER_SCALE, // same scale in ending approach — no separate "big 볼떵이"
    feetX,
    feetY,
    cam,
    p.facing < 0,
  );
}

/**
 * Draw 볼빵이 NPC and (during hug) the pair plate.
 * 볼빵이 is never player-controlled.
 */
function drawEndingChars() {
  const e = state.ending;
  const cam = state.cameraX;
  if (e.hideIndividuals) {
    // hug-4cut: 볼떵이 left, 볼빵이 right — feet on ground, size ≈ standing pair
    const meta = HUG_FRAMES[e.hugFrame] || HUG_FRAMES[0];
    drawSheetAtFeet(
      images.hug,
      HUG_CELL.cols,
      HUG_CELL.rows,
      e.hugFrame,
      meta,
      e.hugScale || HUG_SCALE,
      e.hugAnchorX,
      e.bolFeetY || GROUND_Y,
      cam,
      false,
    );
    return;
  }
  // 볼빵이 waits at stage right (world-fixed). No move input.
  const wedding = state.memories[state.memories.length - 1];
  if (state.cameraX + W < wedding.cx - W * 0.6) return;

  // flowers behind until flower/step; then show bouquet in front
  const useFront =
    e.phase === 'flower' || e.phase === 'step' || e.phase === 'hug' || e.phase === 'done';
  const meta = useFront ? BOLPPANGI.front : BOLPPANGI.behind;
  const img = images[meta.key];
  drawImageAtFeet(
    img,
    meta,
    e.bolScale || BOLPPANGI_SCALE,
    e.bolX,
    e.bolFeetY || GROUND_Y,
    cam,
  );
}

function drawMsgs() {
  const cam = state.cameraX;
  ctx.font = '700 22px Gaegu, sans-serif';
  for (const m of state.floatMsgs) {
    ctx.globalAlpha = Math.max(0, m.life / 900);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    const x = m.x - cam;
    ctx.strokeText(m.text, x, m.y);
    ctx.fillText(m.text, x, m.y);
    ctx.globalAlpha = 1;
  }
}

function render() {
  if (!state) {
    ctx.fillStyle = '#1a1e28';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  // Layer: season bg → ground (foot line) → memories → props → characters on top of path
  drawSeasonBackground();
  drawGround();
  drawMemories();
  drawFoods();
  drawExercises();
  drawEndingChars();
  drawPlayer();
  drawMsgs();

  if (state.ending.damageLocked && state.ending.phase !== 'done' && state.ending.phase !== 'idle') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(W / 2 - 120, 48, 240, 32);
    ctx.fillStyle = '#fff';
    ctx.font = '700 20px Gaegu, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('엔딩…', W / 2, 70);
    ctx.textAlign = 'left';
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(40, now - last);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    keys.add(e.key);
    if (isJumpKey(e.key)) jumpQueued = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'Space', 'z', 'Z'].includes(e.key)) {
      e.preventDefault();
    }
    if (e.key === 'r' || e.key === 'R') {
      startFromButton('normal');
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key));

  const bindPad = (id, prop) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (ev) => {
      ev.preventDefault();
      touch[prop] = true;
      if (prop === 'jump') jumpQueued = true;
    };
    const off = (ev) => {
      ev.preventDefault();
      touch[prop] = false;
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  };
  bindPad('padLeft', 'left');
  bindPad('padRight', 'right');
  bindPad('padJump', 'jump');
}

btnStart.addEventListener('click', () => startFromButton('normal'));
btnNearEnding.addEventListener('click', () => startFromButton('nearEnding'));
btnRestart.addEventListener('click', () => startFromButton('normal'));

function syncAudioUi() {
  const prefs = getAudioPrefs();
  const bgmToggle = document.getElementById('bgmToggle');
  const sfxToggle = document.getElementById('sfxToggle');
  const bgmVol = document.getElementById('bgmVol');
  const sfxVol = document.getElementById('sfxVol');
  const bgmHint = document.getElementById('bgmHint');
  if (bgmToggle) bgmToggle.checked = prefs.bgmOn;
  if (sfxToggle) sfxToggle.checked = prefs.sfxOn;
  if (bgmVol) bgmVol.value = String(Math.round(prefs.bgmVol * 100));
  if (sfxVol) sfxVol.value = String(Math.round(prefs.sfxVol * 100));
  if (bgmHint) {
    bgmHint.textContent = prefs.bgmMissing
      ? `BGM 대기: ${audioNeededBgmLabel()}`
      : 'BGM: 어바웃 타임 OST';
  }
}

function bindAudioUi() {
  const bgmToggle = document.getElementById('bgmToggle');
  const sfxToggle = document.getElementById('sfxToggle');
  const bgmVol = document.getElementById('bgmVol');
  const sfxVol = document.getElementById('sfxVol');
  if (bgmToggle) {
    bgmToggle.addEventListener('change', () => {
      setBgmOn(bgmToggle.checked);
      ensureBgmPlaying();
    });
  }
  if (sfxToggle) {
    sfxToggle.addEventListener('change', () => setSfxOn(sfxToggle.checked));
  }
  if (bgmVol) {
    bgmVol.addEventListener('input', () => setBgmVolume(Number(bgmVol.value) / 100));
  }
  if (sfxVol) {
    sfxVol.addEventListener('input', () => setSfxVolume(Number(sfxVol.value) / 100));
  }
  syncAudioUi();
}

async function boot() {
  try {
    await loadAll();
  } catch (err) {
    showOverlay('에셋 오류', String(err.message || err), {
      start: false,
      near: false,
      restart: false,
    });
    throw err;
  }
  bindInput();
  bindAudioUi();
  // Start button unlocks audio (browser policy) and begins the run
  showOverlay('002couple', '볼떵이(플레이어)가 볼빵이에게 가는 길', {
    start: true,
    near: true,
    restart: false,
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'n' || e.key === 'N') startFromButton('nearEnding');
  });
  window.__coupleGame = {
    start: startFromButton,
    getState: () => state,
    missingAssets: MISSING_ASSETS,
    scales: {
      characterBodyH: CHARACTER_BODY_H,
      playerScale: PLAYER_SCALE,
      bolppangiScale: BOLPPANGI_SCALE,
      bolScale: BOLPPANGI_SCALE,
      hugScale: HUG_SCALE,
      playerH: PLAYER_H,
      playerW: PLAYER_W,
    },
    roles: {
      player: '볼떵이',
      endingNpc: '볼빵이',
      hug: '볼떵이 left / 볼빵이 right',
    },
    snapshot: () =>
      state
        ? {
            mode: state.mode,
            running: state.running,
            hearts: state.hearts,
            playerX: state.player.x,
            playerH: state.player.h,
            playerW: state.player.w,
            groundY: GROUND_Y,
            canvasH: H,
            phase: state.ending.phase,
            hideIndividuals: state.ending.hideIndividuals,
            hugFrame: state.ending.hugFrame,
            hugAnchorX: state.ending.hugAnchorX,
            bolX: state.ending.bolX,
            bolFeetY: state.ending.bolFeetY,
            damageLocked: state.ending.damageLocked,
            cameraX: state.cameraX,
            scales: {
              characterBodyH: CHARACTER_BODY_H,
              playerScale: PLAYER_SCALE,
              bolppangiScale: BOLPPANGI_SCALE,
              hugScale: HUG_SCALE,
            },
            memories: state.memories.map((m) => ({
              id: m.id,
              label: m.label,
              cx: m.cx,
              w: m.w,
              h: m.h,
              hFracOfCanvas: m.h / H,
            })),
            missingAssets: MISSING_ASSETS,
            season: (() => {
              const b = seasonBlend();
              return { progress: b.p, i0: b.i0, i1: b.i1, t: b.t, name: SEASON_KEYS[seasonIndex()] };
            })(),
          }
        : null,
  };
  requestAnimationFrame(loop);
}

boot();
