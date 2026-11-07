/**
 * Audio: WebAudio SFX + optional About Time BGM file.
 * BGM path: /assets/bgm-about-time.mp3 (user-provided; no stock substitute).
 */

const BGM_SRC = '/assets/bgm-about-time.mp3';
const BGM_NEEDED = '어바웃 타임 OST (About Time) — 파일명 bgm-about-time.mp3';

const prefs = {
  bgmOn: true,
  sfxOn: true,
  bgmVol: 0.22,
  sfxVol: 0.55,
};

let ctx = null;
let bgmEl = null;
let bgmReady = false;
let bgmMissing = true;
let unlocked = false;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function audioNeededBgmLabel() {
  return BGM_NEEDED;
}

export function getAudioPrefs() {
  return { ...prefs, bgmReady, bgmMissing, unlocked };
}

export function setBgmOn(on) {
  prefs.bgmOn = !!on;
  applyBgmState();
}

export function setSfxOn(on) {
  prefs.sfxOn = !!on;
}

export function setBgmVolume(v) {
  prefs.bgmVol = Math.max(0, Math.min(1, Number(v) || 0));
  if (bgmEl) bgmEl.volume = prefs.bgmVol;
}

export function setSfxVolume(v) {
  prefs.sfxVol = Math.max(0, Math.min(1, Number(v) || 0));
}

function applyBgmState() {
  if (!bgmEl) return;
  bgmEl.volume = prefs.bgmVol;
  if (prefs.bgmOn && unlocked && bgmReady && !bgmMissing) {
    const p = bgmEl.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } else {
    bgmEl.pause();
  }
}

function tone(freq, dur, type = 'square', gain = 0.2, slideTo = null) {
  const ac = ensureCtx();
  if (!ac || !prefs.sfxOn) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
  const peak = gain * prefs.sfxVol;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Short cute pixel jump blip — only call when a ground jump actually starts. */
export function playJump() {
  tone(520, 0.07, 'square', 0.18, 780);
  tone(780, 0.05, 'square', 0.08, 420);
}

/** Bright heal chime — once per food pickup. */
export function playHeal() {
  tone(523.25, 0.08, 'triangle', 0.16);
  setTimeout(() => tone(659.25, 0.09, 'triangle', 0.14), 55);
  setTimeout(() => tone(783.99, 0.12, 'triangle', 0.12), 110);
}

export async function unlockAudio() {
  const ac = ensureCtx();
  if (ac && ac.state === 'suspended') {
    try {
      await ac.resume();
    } catch (_) {
      /* ignore */
    }
  }
  unlocked = true;
  if (!bgmEl) {
    bgmEl = new Audio(BGM_SRC);
    bgmEl.loop = true;
    bgmEl.preload = 'auto';
    bgmEl.volume = prefs.bgmVol;
    bgmEl.addEventListener('canplaythrough', () => {
      bgmReady = true;
      bgmMissing = false;
      applyBgmState();
    });
    bgmEl.addEventListener('error', () => {
      bgmMissing = true;
      bgmReady = false;
    });
    // Probe load
    try {
      bgmEl.load();
    } catch (_) {
      bgmMissing = true;
    }
  }
  applyBgmState();
  return getAudioPrefs();
}

/** Ensure a single BGM instance — safe across restarts. */
export function ensureBgmPlaying() {
  if (!unlocked) return;
  applyBgmState();
}

export function stopBgm() {
  if (bgmEl) {
    bgmEl.pause();
    bgmEl.currentTime = 0;
  }
}
