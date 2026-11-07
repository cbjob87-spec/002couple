/**
 * Audio: WebAudio SFX (separate graph) + user-provided BGM file.
 *
 * Track: How Long Will I Love You (About Time / 어바웃 타임 OST)
 * Reference only (do not rip): https://youtu.be/tFFic1iYM-c
 *
 * Drop a licensed file at one of:
 *   public/assets/bgm-how-long-will-i-love-you.mp3  (preferred)
 *   public/assets/bgm-how-long-will-i-love-you.ogg
 *   public/assets/bgm-about-time.mp3                 (alias)
 */

const BGM_CANDIDATES = [
  '/assets/bgm-how-long-will-i-love-you.mp3',
  '/assets/bgm-how-long-will-i-love-you.ogg',
  '/assets/bgm-about-time.mp3',
];

const BGM_NEEDED =
  'How Long Will I Love You (어바웃 타임 OST) — public/assets/bgm-how-long-will-i-love-you.mp3';

const prefs = {
  bgmOn: true,
  sfxOn: true,
  bgmVol: 0.18,
  sfxVol: 0.55,
};

let ctx = null;
let sfxGain = null;
let bgmEl = null;
let bgmReady = false;
let bgmMissing = true;
let bgmSrc = null;
let unlocked = false;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = prefs.sfxVol;
    sfxGain.connect(ctx.destination);
  }
  return ctx;
}

export function audioNeededBgmLabel() {
  return BGM_NEEDED;
}

export function getAudioPrefs() {
  return {
    ...prefs,
    bgmReady,
    bgmMissing,
    bgmSrc,
    unlocked,
    track: 'How Long Will I Love You',
  };
}

export function setBgmOn(on) {
  prefs.bgmOn = !!on;
  applyBgmState({ resumeOnly: true });
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
  if (sfxGain) sfxGain.gain.value = prefs.sfxVol;
}

/**
 * Keep a single looping BGM element.
 * Never resets currentTime on resume — ending / restart must not rewind.
 */
function applyBgmState({ resumeOnly = true } = {}) {
  if (!bgmEl) return;
  bgmEl.volume = prefs.bgmVol;
  if (prefs.bgmOn && unlocked && bgmReady && !bgmMissing) {
    if (bgmEl.paused) {
      const p = bgmEl.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } else if (!prefs.bgmOn) {
    bgmEl.pause();
    // do not rewind — turning BGM back on continues where it left off
    if (!resumeOnly) bgmEl.currentTime = 0;
  }
}

function tone(freq, dur, type = 'square', gain = 0.2, slideTo = null) {
  const ac = ensureCtx();
  if (!ac || !prefs.sfxOn || !sfxGain) return;
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
  g.connect(sfxGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Short cute pixel jump blip — only when a ground jump actually starts. */
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

function tryAttachBgm(src) {
  return new Promise((resolve) => {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = true;
    el.volume = prefs.bgmVol;
    let settled = false;
    const ok = () => {
      if (settled) return;
      settled = true;
      resolve({ el, src, ok: true });
    };
    const bad = () => {
      if (settled) return;
      settled = true;
      resolve({ el: null, src, ok: false });
    };
    el.addEventListener('canplaythrough', ok, { once: true });
    el.addEventListener('error', bad, { once: true });
    el.src = src;
    el.load();
    // Timeout fallback
    setTimeout(() => {
      if (!settled) {
        if (el.readyState >= 2) ok();
        else bad();
      }
    }, 2500);
  });
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
    bgmMissing = true;
    bgmReady = false;
    for (const src of BGM_CANDIDATES) {
      const result = await tryAttachBgm(src);
      if (result.ok && result.el) {
        bgmEl = result.el;
        bgmSrc = result.src;
        bgmReady = true;
        bgmMissing = false;
        break;
      }
    }
  }

  applyBgmState({ resumeOnly: true });
  return getAudioPrefs();
}

/** Continue the same BGM instance — never rewinds (ending / restart safe). */
export function ensureBgmPlaying() {
  if (!unlocked) return;
  applyBgmState({ resumeOnly: true });
}

/** Explicit stop + rewind (not used by ending / restart). */
export function stopBgm() {
  if (bgmEl) {
    bgmEl.pause();
    bgmEl.currentTime = 0;
  }
}
