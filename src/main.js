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
  enableBgmFromGesture,
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

/** Live build stamp — must appear on published site after refresh. */
export const BUILD_VERSION = '20261107-1905-fix3';
export const BUILD_EDITED_AT = '2026-11-07T19:05+09:00';

const W = 960;
const H = 540;
/** Align with season BG road (not mid-air above the painted street). */
const GROUND_Y = Math.round(H * 0.865);
const BILLBOARD_H = Math.round(H * 0.6); // 55–65% of H
const MOVE_SPEED = 3.9;
/** Gravity per ~16.67ms frame; scaled by dt/16.67 for stable hang. */
const GRAVITY = 0.55;
const JUMP_V_MAX = -17.5; // hang ~1.05s @60fps; peak ≥ villain+0.5 body
const JUMP_CUT_MULT = 0.4; // release early → short hop
const COYOTE_MS = 100;
const JUMP_BUFFER_MS = 120;
const AIR_CONTROL = 1.0; // full L/R in air
const PATROL_SPEED_FRAC = 0.4; // 30–45% of player speed
const INVINCIBLE_MS = 2000; // after exercise eject
const MAX_HEARTS = 3;
const FLOWER_HOLD_MS = 900;
const HUG_FRAME_MS = 700;
const ENDING_TRIGGER_DIST = 160;
const CLOSE_STEP = 40;
const SPACING = Math.round(W * 1.25); // 1.1–1.4×W
/** Peak jump height (px) from JUMP_V_MAX + GRAVITY (frame-normalized). */
const MAX_JUMP_H = (JUMP_V_MAX * JUMP_V_MAX) / (2 * GRAVITY);
const JUMP_HANG_S = (2 * Math.abs(JUMP_V_MAX)) / GRAVITY / 60;

/**
 * Shared standing body height (head→feet opaque).
 * Exclude ears / flower loft / dress flare from the match target.
 */
const CHARACTER_BODY_H = Math.round(H * 0.255);

/** Integer cell size — NEVER use img.width/cols (1619/5=323.8 bleeds next frame). */
const PLAYER_CELL = { cols: 5, rows: 3, fw: 323, fh: 323 };
/** Encounter sheets include character+machine; integer cells (1774/4→443.5). */
const EXERCISE_CELL = { cols: 4, rows: 2, fw: 443, fh: 443 };
const EXERCISE_META = {
  treadmillEncounter: { footY: 403, headTop: 39, bodyCx: 230, bodyH: 364 },
  bikeEncounter: { footY: 413, headTop: 26, bodyCx: 235, bodyH: 387 },
};
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
 * Match opaque body height to 볼빵이, then scale face width to hers
 * (dress/ears excluded). ONE scale for walk/jump/exercise/ending.
 */
const BODY_MATCH = CHARACTER_BODY_H / PLAYER_REF.bodyH;
const FACE_MATCH =
  (BOLPPANGI.behind.headW * BOLPPANGI_SCALE) / Math.max(1, PLAYER_REF.headW);
const PLAYER_SCALE = Math.max(BODY_MATCH, FACE_MATCH) * 1.18;
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
let jumpHeld = false;
let jumpWasHeld = false;

/** Season bands by memory index (19 memories: 0..18). */
const SEASON_BANDS = [
  { id: 'winter', i0: 0, i1: 3, label: '겨울' },
  { id: 'spring', i0: 4, i1: 8, label: '봄' },
  { id: 'summer', i0: 9, i1: 13, label: '여름' },
  { id: 'autumn', i0: 14, i1: 18, label: '가을' },
];

function loadImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${name}`));
    img.src = `/assets/${name}`;
  });
}

/**
 * Remove detached edge-bleed fragments from sheet cells.
 * Keeps the largest opaque component (body + attached tail) intact.
 */
function sanitizeSheetCells(img, cols, rows, fw, fh, maxExtraPx = 500) {
  const out = document.createElement('canvas');
  out.width = cols * fw;
  out.height = rows * fh;
  const g = out.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, out.width, out.height);
  g.drawImage(img, 0, 0);

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * fw;
    const oy = row * fh;
    const data = g.getImageData(ox, oy, fw, fh);
    const a = data.data;
    const seen = new Uint8Array(fw * fh);
    const comps = [];
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const i0 = y * fw + x;
        if (seen[i0] || a[i0 * 4 + 3] < 24) continue;
        const stack = [i0];
        seen[i0] = 1;
        const pixels = [i0];
        let minX = x;
        let maxX = x;
        while (stack.length) {
          const cur = stack.pop();
          const cx = cur % fw;
          const cy = (cur / fw) | 0;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          const tryPush = (nx, ny) => {
            if (nx < 0 || ny < 0 || nx >= fw || ny >= fh) return;
            const ni = ny * fw + nx;
            if (seen[ni] || a[ni * 4 + 3] < 24) return;
            seen[ni] = 1;
            stack.push(ni);
            pixels.push(ni);
          };
          tryPush(cx + 1, cy);
          tryPush(cx - 1, cy);
          tryPush(cx, cy + 1);
          tryPush(cx, cy - 1);
        }
        comps.push({ n: pixels.length, minX, maxX, pixels });
      }
    }
    if (comps.length < 2) continue;
    comps.sort((u, v) => v.n - u.n);
    for (let c = 1; c < comps.length; c++) {
      const blob = comps[c];
      const nearEdge =
        blob.minX <= 2 || blob.maxX >= fw - 3 || blob.maxX <= 14 || blob.minX >= fw - 15;
      if (blob.n <= maxExtraPx && nearEdge) {
        for (const pi of blob.pixels) {
          const o = pi * 4;
          a[o] = 0;
          a[o + 1] = 0;
          a[o + 2] = 0;
          a[o + 3] = 0;
        }
      }
    }
    g.putImageData(data, ox, oy);
  }
  return out;
}

async function loadAll() {
  await Promise.all(
    Object.entries(ASSETS).map(async ([key, file]) => {
      images[key] = await loadImage(file);
    }),
  );
  // Fix adjacent-frame ear/tail slivers on 볼떵이 walk/jump sheet (keep attached tail).
  if (images.playerSheet) {
    images.playerSheet = sanitizeSheetCells(
      images.playerSheet,
      PLAYER_CELL.cols,
      PLAYER_CELL.rows,
      PLAYER_CELL.fw,
      PLAYER_CELL.fh,
    );
  }
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

function sheetCellSize(img, cols, rows, cellW, cellH) {
  const fw = cellW || Math.floor(img.width / cols);
  const fh = cellH || Math.floor(img.height / rows);
  return { fw, fh };
}

function drawSheetFrame(img, cols, rows, index, dx, dy, dw, dh, flip = false, cellW = null, cellH = null) {
  if (!img) return;
  const { fw, fh } = sheetCellSize(img, cols, rows, cellW, cellH);
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
 * Pass integer cellW/cellH to avoid fractional bleed into the next frame.
 */
function drawSheetAtFeet(
  img,
  cols,
  rows,
  index,
  meta,
  scale,
  feetWorldX,
  feetWorldY,
  camX,
  flip = false,
  cellW = null,
  cellH = null,
) {
  if (!img || !meta) return null;
  const { fw, fh } = sheetCellSize(img, cols, rows, cellW, cellH);
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

  function gapCenter(afterIndex) {
    return betweenSpot(memories, afterIndex, 0.5);
  }

  // Tallest general villain body (solid) — jump must clear this + 0.5× player body
  const VILLAIN_H = Math.round(PLAYER_H * 1.15);
  const VILLAIN_W = Math.round(VILLAIN_H * 0.85);
  const patrolSpeed = MOVE_SPEED * PATROL_SPEED_FRAC;

  function makeVillain(cfg) {
    const h = cfg.h || VILLAIN_H;
    const w = cfg.w || VILLAIN_W;
    return {
      id: cfg.id,
      type: cfg.type,
      x: cfg.x0,
      y: GROUND_Y - h,
      w,
      h,
      // Tight body hitbox (ignore sprite pad)
      hitPadX: Math.round(w * 0.22),
      hitPadTop: Math.round(h * 0.18),
      hitPadBot: Math.round(h * 0.08),
      patrolMin: cfg.x0,
      patrolMax: cfg.x1,
      dir: 1,
      speed: cfg.speed || patrolSpeed,
      season: cfg.season,
      used: false,
      playing: false,
      frame: 0,
      frameT: 0,
      cols: cfg.cols,
      rows: cfg.rows,
      frames: cfg.frames,
      sheet: cfg.sheet,
      idle: cfg.idle,
      contactLock: false,
    };
  }

  // Winter: 1 slow villain | Spring: 1 | Summer: 2 staggered | Autumn: none near ending
  const exercises = [
    makeVillain({
      id: 'tm-w',
      type: 'treadmill',
      season: 'winter',
      x0: gapCenter(2) - 70,
      x1: gapCenter(2) + 70,
      speed: patrolSpeed * 0.85,
      cols: 4,
      rows: 2,
      frames: 8,
      sheet: 'treadmillEncounter',
      idle: 'treadmillVillain',
    }),
    makeVillain({
      id: 'bk-s',
      type: 'bike',
      season: 'spring',
      x0: gapCenter(5) - 90,
      x1: gapCenter(5) + 90,
      speed: patrolSpeed,
      cols: 4,
      rows: 2,
      frames: 7,
      sheet: 'bikeEncounter',
      idle: 'bikeVillain',
    }),
    makeVillain({
      id: 'tm-su1',
      type: 'treadmill',
      season: 'summer',
      x0: gapCenter(10) - 100,
      x1: gapCenter(10) + 60,
      speed: patrolSpeed * 1.05,
      cols: 4,
      rows: 2,
      frames: 8,
      sheet: 'treadmillEncounter',
      idle: 'treadmillVillain',
    }),
    makeVillain({
      id: 'bk-su2',
      type: 'bike',
      season: 'summer',
      x0: gapCenter(12) - 50,
      x1: gapCenter(12) + 110,
      speed: patrolSpeed * 0.95,
      cols: 4,
      rows: 2,
      frames: 7,
      sheet: 'bikeEncounter',
      idle: 'bikeVillain',
    }),
  ];

  // Platforms: one-way tops. Heights within jump envelope; widths ≥ 2× player.
  const platW = Math.max(PLAYER_W * 2.2, 160);
  const h1 = Math.round(MAX_JUMP_H * 0.5);
  const h2 = Math.round(MAX_JUMP_H * 0.5 + MAX_JUMP_H * 0.35);
  const h3 = Math.round(MAX_JUMP_H * 0.48);
  const platforms = [
    // Winter practice — low ledge
    { id: 'w1', x: gapCenter(1) - platW / 2, y: GROUND_Y - h1, w: platW, h: 16, kind: 'stone', season: 'winter' },
    // Spring chain (2–3)
    { id: 'sp1', x: gapCenter(4) - platW / 2 - 40, y: GROUND_Y - h1, w: platW, h: 16, kind: 'brick', season: 'spring' },
    { id: 'sp2', x: gapCenter(5) - platW / 2 + 20, y: GROUND_Y - h2, w: platW, h: 16, kind: 'brick', season: 'spring' },
    { id: 'sp3', x: gapCenter(6) - platW / 2 - 20, y: GROUND_Y - h1, w: platW * 1.1, h: 16, kind: 'wood', season: 'spring' },
    // Summer varied heights (bypass ground patrols)
    { id: 'su1', x: gapCenter(9) - platW / 2, y: GROUND_Y - h3, w: platW, h: 16, kind: 'stone', season: 'summer' },
    { id: 'su2', x: gapCenter(10) - platW / 2 + 50, y: GROUND_Y - h2, w: platW, h: 16, kind: 'wood', season: 'summer' },
    { id: 'su3', x: gapCenter(11) - platW / 2 - 30, y: GROUND_Y - h1, w: platW * 1.15, h: 16, kind: 'brick', season: 'summer' },
    { id: 'su4', x: gapCenter(12) - platW / 2 + 10, y: GROUND_Y - h2, w: platW, h: 16, kind: 'stone', season: 'summer' },
    // Autumn — gentle low step only, clear of wedding
    { id: 'a1', x: gapCenter(15) - platW / 2, y: GROUND_Y - Math.round(MAX_JUMP_H * 0.35), w: platW, h: 16, kind: 'wood', season: 'autumn' },
  ];

  const foods = [
    { id: 'c1', kind: 'chicken', x: gapCenter(0) - 20, y: GROUND_Y - 56, w: 48, h: 48, taken: false, season: 'winter' },
    { id: 'p-w', kind: 'pizza', x: platforms[0].x + platforms[0].w / 2 - 24, y: platforms[0].y - 52, w: 48, h: 48, taken: false, season: 'winter' },
    { id: 'p-sp', kind: 'burger', x: platforms[2].x + platforms[2].w / 2 - 24, y: platforms[2].y - 52, w: 48, h: 48, taken: false, season: 'spring' },
    { id: 'c-sp', kind: 'chicken', x: gapCenter(7) - 10, y: GROUND_Y - 56, w: 48, h: 48, taken: false, season: 'spring' },
    { id: 'p-su', kind: 'pizza', x: platforms[5].x + platforms[5].w / 2 - 24, y: platforms[5].y - 52, w: 48, h: 48, taken: false, season: 'summer' },
    { id: 'b-su', kind: 'burger', x: platforms[7].x + platforms[7].w / 2 - 24, y: platforms[7].y - 52, w: 48, h: 48, taken: false, season: 'summer' },
    { id: 'c-a', kind: 'chicken', x: gapCenter(16) - 10, y: GROUND_Y - 56, w: 48, h: 48, taken: false, season: 'autumn' },
  ];

  const checkpoints = SEASON_BANDS.map((b) => {
    const m = memories[b.i0];
    return {
      id: b.id,
      label: b.label,
      x: m.cx - W * 0.35,
      memoryIndex: b.i0,
    };
  });

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
    platforms,
    checkpoints,
    checkpointId: 'winter',
    villainH: VILLAIN_H,
    maxJumpH: MAX_JUMP_H,
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
      coyote: 0,
      jumpBuffer: 0,
      jumping: false,
      onPlatform: null,
      hidden: false,
    },
    foods,
    exercises,
    ending: {
      phase: 'idle',
      bolX: wedding.cx + Math.round(CHARACTER_BODY_H * 0.85),
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
function isJumpHeld() {
  return (
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

function playerHitbox(p) {
  // Solid body — trim transparent padding feel
  return {
    x: p.x + Math.round(p.w * 0.18),
    y: p.y + Math.round(p.h * 0.12),
    w: Math.round(p.w * 0.64),
    h: Math.round(p.h * 0.82),
  };
}

function villainHitbox(ex) {
  return {
    x: ex.x + ex.hitPadX,
    y: ex.y + ex.hitPadTop,
    w: ex.w - ex.hitPadX * 2,
    h: ex.h - ex.hitPadTop - ex.hitPadBot,
  };
}

function currentCheckpoint() {
  if (!state) return SEASON_BANDS[0];
  const px = state.player.x + state.player.w / 2;
  let best = state.checkpoints[0];
  for (const cp of state.checkpoints) {
    if (px >= cp.x - 20) best = cp;
  }
  return best;
}

function seasonIdForX(x) {
  const memories = state.memories;
  let idx = 0;
  for (let i = 0; i < memories.length; i++) {
    if (x + PLAYER_W / 2 >= memories[i].cx - SPACING * 0.5) idx = i;
  }
  for (const b of SEASON_BANDS) {
    if (idx >= b.i0 && idx <= b.i1) return b.id;
  }
  return 'autumn';
}

function respawnAtCheckpoint() {
  const cp = state.checkpoints.find((c) => c.id === state.checkpointId) || state.checkpoints[0];
  const p = state.player;
  p.x = cp.x;
  p.y = GROUND_Y - p.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  p.onPlatform = null;
  p.jumping = false;
  state.hearts = MAX_HEARTS;
  state.invUntil = state.now + 1200;
  state.dead = false;
  state.running = true;
  state.cameraX = Math.max(0, p.x - W * 0.28);
  // Reset foods/villains for this season and later? Spec: reset for that segment
  const sid = cp.id;
  for (const f of state.foods) {
    if (f.season === sid) f.taken = false;
  }
  for (const ex of state.exercises) {
    if (ex.season === sid) {
      ex.used = false;
      ex.playing = false;
      ex.frame = 0;
      ex.contactLock = false;
      ex.x = ex.patrolMin;
      ex.dir = 1;
      ex.y = GROUND_Y - ex.h;
    }
  }
  state._exerciseLock = false;
  p.hidden = false;
  hideOverlay();
  updateHud();
  pushMsg(`${cp.label} 체크포인트!`, p.x, p.y - 30);
}

function beginExercise(ex) {
  if (ex.playing || ex.contactLock || state._exerciseLock) return;
  ex.playing = true;
  ex.contactLock = true;
  ex.frame = 0;
  ex.frameT = 0;
  ex.dir = 0; // pause patrol during interaction
  state._exerciseLock = true;
  const p = state.player;
  p.hidden = true; // exclusive with encounter sheet (character+machine)
  // Pin player hitbox to this machine's world position so camera stays glued.
  p.x = ex.x + (ex.w - p.w) / 2;
  p.y = GROUND_Y - p.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  p.onPlatform = null;
  p.anim = 'idle';
  p.frame = 0;
}

function finishExercise(ex) {
  ex.playing = false;
  ex.frame = 0;
  ex.frameT = 0;
  state._exerciseLock = false;
  // Eject player to a safe ground position (never leave mid-air ghost)
  const p = state.player;
  p.hidden = false;
  const ejectLeft = p.x + p.w / 2 < ex.x + ex.w / 2;
  p.x = ejectLeft ? ex.patrolMin - p.w - 24 : ex.patrolMax + 24;
  p.y = GROUND_Y - p.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  p.onPlatform = null;
  p.anim = 'idle';
  p.frame = 0;
  p.h = PLAYER_H;
  p.w = PLAYER_W;
  // Resume patrol at current machine world x
  ex.dir = ejectLeft ? 1 : -1;
  ex.x = Math.max(ex.patrolMin, Math.min(ex.patrolMax, ex.x));
  ex.y = GROUND_Y - ex.h;
  // One-contact damage only; 2s i-frames; contactLock until separate
  if (!state.ending.damageLocked) {
    state.hearts = Math.max(0, state.hearts - 1);
    state.invUntil = state.now + INVINCIBLE_MS;
    pushMsg('-1 하트', p.x, p.y - 20);
    updateHud();
    if (state.hearts <= 0) {
      state.checkpointId = currentCheckpoint().id;
      respawnAtCheckpoint();
      return;
    }
  }
}

function tryJump(p) {
  const canCoyote = p.coyote > 0;
  const buffered = p.jumpBuffer > 0 || jumpQueued;
  if (!(p.onGround || canCoyote) || !buffered) return false;
  p.vy = JUMP_V_MAX;
  p.onGround = false;
  p.onPlatform = null;
  p.jumping = true;
  p.coyote = 0;
  p.jumpBuffer = 0;
  jumpQueued = false;
  playJump();
  return true;
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

function updatePatrol(dt) {
  for (const ex of state.exercises) {
    if (ex.playing || state._exerciseLock) continue;
    if (ex.dir === 0) ex.dir = 1;
    // Keep out of memory safe zones / ending — clamp patrol already set in gaps
    ex.x += ex.dir * ex.speed * (dt / 16.67);
    if (ex.x <= ex.patrolMin) {
      ex.x = ex.patrolMin;
      ex.dir = 1;
    } else if (ex.x >= ex.patrolMax) {
      ex.x = ex.patrolMax;
      ex.dir = -1;
    }
    ex.y = GROUND_Y - ex.h;
    // Clear contact lock once separated
    if (ex.contactLock) {
      const ph = playerHitbox(state.player);
      if (!aabb(ph, villainHitbox(ex))) ex.contactLock = false;
    }
  }
}

function resolvePlatforms(p, prevBottom) {
  p.onPlatform = null;
  if (p.vy < 0) return; // rising — pass through from below
  for (const pl of state.platforms) {
    const withinX = p.x + p.w * 0.25 < pl.x + pl.w && p.x + p.w * 0.75 > pl.x;
    if (!withinX) continue;
    const feet = p.y + p.h;
    // Land when crossing the top while falling
    if (prevBottom <= pl.y + 4 && feet >= pl.y && feet <= pl.y + pl.h + 8) {
      p.y = pl.y - p.h;
      p.vy = 0;
      p.onGround = true;
      p.onPlatform = pl.id;
      p.jumping = false;
      return;
    }
  }
}

function update(dt) {
  if (!state || !state.running) return;
  state.now = performance.now();
  const p = state.player;
  const endingActive = state.ending.phase !== 'idle';
  const exerciseLock = !!state._exerciseLock;

  jumpHeld = isJumpHeld();
  if (jumpHeld && !jumpWasHeld) {
    jumpQueued = true;
    p.jumpBuffer = JUMP_BUFFER_MS;
  }
  jumpWasHeld = jumpHeld;

  for (const ex of state.exercises) {
    if (!ex.playing) continue;
    // Keep player + encounter on the same world machine x while animating
    p.x = ex.x + (ex.w - p.w) / 2;
    p.y = GROUND_Y - p.h;
    p.vx = 0;
    p.vy = 0;
    p.onGround = true;
    ex.frameT += dt;
    if (ex.frameT >= 140) {
      ex.frameT = 0;
      ex.frame += 1;
      if (ex.frame >= ex.frames) finishExercise(ex);
    }
  }

  if (!endingActive && !exerciseLock) {
    updatePatrol(dt);
  }

  if (endingActive) {
    updateEnding(dt);
  } else if (!exerciseLock) {
    // Track checkpoint as player advances
    const cp = currentCheckpoint();
    if (cp && cp.id !== state.checkpointId) {
      // only advance forward
      const order = SEASON_BANDS.map((b) => b.id);
      if (order.indexOf(cp.id) > order.indexOf(state.checkpointId)) {
        state.checkpointId = cp.id;
      }
    }

    let move = 0;
    if (wantLeft()) move -= 1;
    if (wantRight()) move += 1;
    const control = p.onGround ? 1 : AIR_CONTROL;
    p.vx = move * MOVE_SPEED * control;
    if (move !== 0) p.facing = move > 0 ? 1 : -1;

    if (p.onGround) p.coyote = COYOTE_MS;
    else p.coyote = Math.max(0, p.coyote - dt);
    if (p.jumpBuffer > 0) p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

    tryJump(p);

    // Variable jump height: release early while rising → cut upward velocity
    if (p.jumping && p.vy < 0 && !jumpHeld) {
      p.vy *= JUMP_CUT_MULT;
      p.jumping = false;
    }
    if (p.vy >= 0) p.jumping = false;

    const prevBottom = p.y + p.h;
    const gScale = dt / 16.67;
    p.vy += GRAVITY * gScale;
    // Keep horizontal step stable with dt so mobile 30/60fps both work
    p.x += p.vx * gScale;
    p.y += p.vy * gScale;
    p.x = Math.max(40, Math.min(state.worldEnd - p.w - 20, p.x));

    p.onGround = false;
    resolvePlatforms(p, prevBottom);

    if (p.y + p.h >= GROUND_Y) {
      p.y = GROUND_Y - p.h;
      p.vy = 0;
      p.onGround = true;
      p.onPlatform = null;
      p.jumping = false;
    }

    // Consume buffered jump on landing
    if (p.onGround) tryJump(p);

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

    const ph = playerHitbox(p);
    for (const f of state.foods) {
      if (f.taken) continue;
      if (aabb(ph, f)) {
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

    // Avoid obstacles by jumping — touch triggers exercise once
    if (
      state.now >= state.invUntil &&
      !state.ending.damageLocked &&
      !inMemorySafeZone(p.x + p.w / 2)
    ) {
      for (const ex of state.exercises) {
        if (ex.playing || ex.contactLock) continue;
        if (aabb(ph, villainHitbox(ex))) {
          beginExercise(ex);
          break;
        }
      }
    }

    updateEnding(dt);
  }

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

function drawPlatforms() {
  const cam = state.cameraX;
  for (const pl of state.platforms) {
    const sx = pl.x - cam;
    if (sx + pl.w < -20 || sx > W + 20) continue;
    let top;
    let side;
    let lip;
    if (pl.kind === 'brick') {
      top = '#c45c48';
      side = '#8a3a2e';
      lip = '#e8a090';
    } else if (pl.kind === 'wood') {
      top = '#c4a06a';
      side = '#7a5a30';
      lip = '#e8d0a0';
    } else {
      top = '#9aa0a8';
      side = '#5a6068';
      lip = '#d0d4d8';
    }
    ctx.fillStyle = side;
    ctx.fillRect(Math.round(sx), Math.round(pl.y), Math.round(pl.w), pl.h + 6);
    ctx.fillStyle = top;
    ctx.fillRect(Math.round(sx), Math.round(pl.y), Math.round(pl.w), pl.h);
    ctx.fillStyle = lip;
    ctx.fillRect(Math.round(sx), Math.round(pl.y), Math.round(pl.w), 3);
    // pixel studs
    ctx.fillStyle = side;
    for (let x = 8; x < pl.w - 4; x += 18) {
      ctx.fillRect(Math.round(sx + x), Math.round(pl.y + 6), 4, 3);
    }
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

function activeExercise() {
  if (!state) return null;
  return state.exercises.find((ex) => ex.playing) || null;
}

function drawExercises() {
  const cam = state.cameraX;
  for (const ex of state.exercises) {
    const sx = ex.x - cam;
    if (sx + ex.w < -40 || sx > W + 40) continue;
    if (ex.playing) {
      // Encounter PNG already includes 볼떵이 + machine — draw only that, hide idle machine.
      const meta = EXERCISE_META[ex.sheet];
      const img = images[ex.sheet];
      if (!img || !meta) continue;
      const scale = ex.h / meta.bodyH;
      const feetX = ex.x + ex.w / 2;
      drawSheetAtFeet(
        img,
        EXERCISE_CELL.cols,
        EXERCISE_CELL.rows,
        Math.min(ex.frame, ex.frames - 1),
        meta,
        scale,
        feetX,
        GROUND_Y,
        cam,
        false,
        EXERCISE_CELL.fw,
        EXERCISE_CELL.fh,
      );
    } else {
      const key = ex.idle;
      const b = BOUNDS[key];
      const img = images[key];
      if (img && b) {
        const h = ex.h;
        const w = Math.round((b.ow / b.oh) * h);
        ctx.drawImage(img, b.ox, b.oy, b.ow, b.oh, sx + (ex.w - w) / 2, ex.y, w, h);
      }
      ctx.fillStyle = 'rgba(232, 93, 76, 0.9)';
      ctx.font = '700 18px Gaegu, sans-serif';
      ctx.fillText('!', sx + ex.w / 2 - 4, ex.y + 14);
    }
  }
}

/** Draw 볼떵이 (player) — always PLAYER_SCALE for every anim/state. */
function drawPlayer() {
  if (state.ending.hideIndividuals) return;
  const p = state.player;
  // Exclusive with exercise encounter art (which already contains 볼떵이 + machine).
  if (p.hidden || state._exerciseLock || activeExercise()) return;
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
    PLAYER_CELL.fw,
    PLAYER_CELL.fh,
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
      HUG_CELL.fw,
      HUG_CELL.fh,
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
  // Layer: season bg → ground → memories → platforms → props → characters
  drawSeasonBackground();
  drawGround();
  drawMemories();
  drawPlatforms();
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
    if (isJumpKey(e.key)) {
      jumpQueued = true;
      if (state?.player) state.player.jumpBuffer = JUMP_BUFFER_MS;
    }
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
      if (prop === 'jump') {
        jumpQueued = true;
        if (state?.player) state.player.jumpBuffer = JUMP_BUFFER_MS;
      }
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
  const btnEnable = document.getElementById('btnEnableBgm');
  if (bgmToggle) bgmToggle.checked = prefs.bgmOn;
  if (sfxToggle) sfxToggle.checked = prefs.sfxOn;
  if (bgmVol) bgmVol.value = String(Math.round(prefs.bgmVol * 100));
  if (sfxVol) sfxVol.value = String(Math.round(prefs.sfxVol * 100));
  if (bgmHint) {
    if (prefs.bgmStatus === 'ok' && !prefs.bgmMissing) {
      bgmHint.textContent = prefs.bgmOn ? `BGM 재생 중 · ${audioNeededBgmLabel()}` : `BGM 음소거 · ${audioNeededBgmLabel()}`;
    } else if (prefs.bgmStatus === 'play-blocked') {
      bgmHint.textContent = 'BGM: 재생이 차단됨 — 「음악 켜기」를 누르세요';
    } else if (prefs.bgmStatus === 'missing' || prefs.bgmStatus === 'not-audio' || prefs.bgmStatus === 'load-error') {
      bgmHint.textContent = 'BGM: 파일을 불러오지 못했습니다';
    } else {
      bgmHint.textContent = `BGM · ${audioNeededBgmLabel()}`;
    }
  }
  if (btnEnable) {
    // Keep mid-run so a blocked autoplay can still be unlocked by gesture
    btnEnable.classList.toggle('hidden', false);
  }
}

function bindAudioUi() {
  const bgmToggle = document.getElementById('bgmToggle');
  const sfxToggle = document.getElementById('sfxToggle');
  const bgmVol = document.getElementById('bgmVol');
  const sfxVol = document.getElementById('sfxVol');
  const btnEnable = document.getElementById('btnEnableBgm');
  if (bgmToggle) {
    bgmToggle.addEventListener('change', async () => {
      setBgmOn(bgmToggle.checked);
      if (bgmToggle.checked) await unlockAudio();
      else ensureBgmPlaying();
      syncAudioUi();
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
  if (btnEnable) {
    btnEnable.addEventListener('click', async () => {
      await enableBgmFromGesture();
      syncAudioUi();
    });
  }
  syncAudioUi();
}

function paintBuildStamp() {
  const el = document.getElementById('buildStamp');
  if (el) {
    el.textContent = `build ${BUILD_VERSION}\n${BUILD_EDITED_AT}`;
  }
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
  paintBuildStamp();
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
    build: { version: BUILD_VERSION, editedAt: BUILD_EDITED_AT },
    audio: () => getAudioPrefs(),
    forceExercise: (id) => {
      const ex = state?.exercises?.find((e) => e.id === id) || state?.exercises?.[0];
      if (ex) beginExercise(ex);
      return !!ex;
    },
    scales: {
      characterBodyH: CHARACTER_BODY_H,
      playerScale: PLAYER_SCALE,
      bolppangiScale: BOLPPANGI_SCALE,
      bolScale: BOLPPANGI_SCALE,
      hugScale: HUG_SCALE,
      playerH: PLAYER_H,
      playerW: PLAYER_W,
      jumpHangS: JUMP_HANG_S,
      maxJumpH: MAX_JUMP_H,
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
            checkpointId: state.checkpointId,
            onGround: state.player.onGround,
            onPlatform: state.player.onPlatform,
            maxJumpH: state.maxJumpH,
            villainH: state.villainH,
            platforms: state.platforms.length,
            exercises: state.exercises.map((ex) => ({
              id: ex.id,
              x: ex.x,
              min: ex.patrolMin,
              max: ex.patrolMax,
              playing: ex.playing,
            })),
          }
        : null,
  };
  requestAnimationFrame(loop);
}

boot();
