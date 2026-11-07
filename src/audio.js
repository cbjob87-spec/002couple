/**
 * Audio: WebAudio SFX + looping BGM from bundled MP3.
 * File: public/assets/bgm-how-long-will-i-love-you.mp3
 */

const BGM_URL = '/assets/bgm-how-long-will-i-love-you.mp3';
const BGM_TITLE = 'How Long Will I Love You';

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
/** 'ok' | 'missing' | 'not-audio' | 'load-error' | 'play-blocked' | 'idle' */
let bgmStatus = 'idle';
let bgmErrorDetail = '';

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
  return BGM_TITLE;
}

export function getAudioPrefs() {
  return {
    ...prefs,
    bgmReady,
    bgmMissing,
    bgmSrc,
    unlocked,
    bgmStatus,
    bgmErrorDetail,
    track: BGM_TITLE,
  };
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
  if (sfxGain) sfxGain.gain.value = prefs.sfxVol;
}

function applyBgmState() {
  if (!bgmEl) return;
  bgmEl.volume = prefs.bgmVol;
  if (prefs.bgmOn && unlocked && bgmReady && !bgmMissing) {
    if (bgmEl.paused) {
      const p = bgmEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          bgmStatus = 'play-blocked';
          bgmErrorDetail = String(err && err.message ? err.message : err);
        });
      }
    }
  } else if (!prefs.bgmOn && bgmEl && !bgmEl.paused) {
    bgmEl.pause();
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

export function playJump() {
  tone(520, 0.07, 'square', 0.18, 780);
  tone(780, 0.05, 'square', 0.08, 420);
}

export function playHeal() {
  tone(523.25, 0.08, 'triangle', 0.16);
  setTimeout(() => tone(659.25, 0.09, 'triangle', 0.14), 55);
  setTimeout(() => tone(783.99, 0.12, 'triangle', 0.12), 110);
}

/**
 * Fetch BGM and verify it is real audio (not an HTML SPA fallback page).
 */
async function loadBgmElement() {
  bgmStatus = 'idle';
  bgmErrorDetail = '';
  bgmMissing = true;
  bgmReady = false;
  bgmSrc = null;

  let res;
  try {
    res = await fetch(BGM_URL, { method: 'GET', cache: 'force-cache' });
  } catch (err) {
    bgmStatus = 'load-error';
    bgmErrorDetail = String(err && err.message ? err.message : err);
    return null;
  }
  if (!res.ok) {
    bgmStatus = 'missing';
    bgmErrorDetail = `HTTP ${res.status}`;
    return null;
  }
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (ctype.includes('text/html') || ctype.includes('application/json')) {
    bgmStatus = 'not-audio';
    bgmErrorDetail = ctype || 'html-fallback';
    return null;
  }
  const buf = await res.arrayBuffer();
  if (!buf || buf.byteLength < 1000) {
    bgmStatus = 'missing';
    bgmErrorDetail = 'empty-body';
    return null;
  }
  // MP3 frames often start after ID3; reject obvious HTML
  const head = new Uint8Array(buf.slice(0, 16));
  const asText = String.fromCharCode(...head);
  if (asText.startsWith('<!') || asText.startsWith('<html')) {
    bgmStatus = 'not-audio';
    bgmErrorDetail = 'html-body';
    return null;
  }

  const blob = new Blob([buf], { type: ctype.includes('audio') ? ctype : 'audio/mpeg' });
  const objectUrl = URL.createObjectURL(blob);
  const el = new Audio();
  el.preload = 'auto';
  el.loop = true;
  el.volume = prefs.bgmVol;
  await new Promise((resolve, reject) => {
    let settled = false;
    const ok = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const bad = () => {
      if (settled) return;
      settled = true;
      reject(new Error('audio-element-error'));
    };
    el.addEventListener('canplaythrough', ok, { once: true });
    el.addEventListener('error', bad, { once: true });
    el.src = objectUrl;
    el.load();
    setTimeout(() => {
      if (!settled) {
        if (el.readyState >= 2) ok();
        else bad();
      }
    }, 4000);
  }).catch((err) => {
    bgmStatus = 'load-error';
    bgmErrorDetail = String(err && err.message ? err.message : err);
    try {
      URL.revokeObjectURL(objectUrl);
    } catch (_) {
      /* ignore */
    }
    throw err;
  });

  bgmEl = el;
  bgmSrc = BGM_URL;
  bgmReady = true;
  bgmMissing = false;
  bgmStatus = 'ok';
  bgmErrorDetail = '';
  return el;
}

/**
 * Must be called from a user gesture (Start / 음악 켜기).
 * Reuses the same Audio element so restart/ending never double-play.
 */
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
    try {
      await loadBgmElement();
    } catch (_) {
      /* status already set */
    }
  }

  if (bgmEl && prefs.bgmOn) {
    try {
      await bgmEl.play();
      bgmStatus = 'ok';
      bgmErrorDetail = '';
    } catch (err) {
      bgmStatus = 'play-blocked';
      bgmErrorDetail = String(err && err.message ? err.message : err);
    }
  }
  return getAudioPrefs();
}

/** Explicit user action while a run is already going. */
export async function enableBgmFromGesture() {
  prefs.bgmOn = true;
  return unlockAudio();
}

/** Continue same instance — never rewinds, never creates a second player. */
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
