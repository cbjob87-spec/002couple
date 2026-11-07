import { chromium } from '/tmp/pwplay/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const OUT = '/tmp/couple-game-verify';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function waitForGame(page) {
  await page.waitForFunction(() => window.__coupleGame && window.__coupleGame.getState());
}

async function snap(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await waitForGame(page);
await snap(page, '01-title');

// --- Normal boot start point ---
await page.click('#btnStart');
await page.waitForTimeout(300);
let s = await page.evaluate(() => window.__coupleGame.snapshot());
check('normal boot starts near start', s.playerX < 200 && s.mode === 'normal', `x=${s.playerX}`);
check('normal boot 3 hearts', s.hearts === 3, `hearts=${s.hearts}`);
await snap(page, '02-normal-start');

// --- Move right ---
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(800);
await page.keyboard.up('ArrowRight');
s = await page.evaluate(() => window.__coupleGame.snapshot());
check('move right increases x', s.playerX > 80, `x=${s.playerX}`);

// --- Jump ---
const yBefore = await page.evaluate(() => window.__coupleGame.getState().player.y);
await page.keyboard.down('ArrowRight');
await page.keyboard.down(' ');
await page.waitForTimeout(50);
await page.keyboard.up(' ');
await page.waitForTimeout(100);
const yAir = await page.evaluate(() => window.__coupleGame.getState().player.y);
await page.waitForTimeout(600);
await page.keyboard.up('ArrowRight');
check('jump lifts player', yAir < yBefore - 5, `yBefore=${yBefore} yAir=${yAir}`);
await snap(page, '03-move-jump');

// --- Food heal: reduce hearts then pick food via state mutation + collision ---
await page.evaluate(() => {
  const st = window.__coupleGame.getState();
  st.hearts = 2;
  // place chicken on player
  const f = st.foods.find((x) => x.kind === 'chicken' && !x.taken);
  f.x = st.player.x + 10;
  f.y = st.player.y + 10;
  f.taken = false;
});
await page.waitForTimeout(200);
s = await page.evaluate(() => window.__coupleGame.snapshot());
check('food restores heart to 3', s.hearts === 3, `hearts=${s.hearts} taken=${s.foodsTaken}`);

// --- Exercise damage + invincibility ---
await page.evaluate(() => {
  const st = window.__coupleGame.getState();
  st.hearts = 3;
  st.invUntil = 0;
  const ex = st.exercises[0];
  ex.used = false;
  ex.playing = false;
  ex.frame = 0;
  // put player on exercise
  st.player.x = ex.x + 30;
  st.player.y = ex.y + 50;
});
await page.waitForTimeout(100);
// wait for exercise anim to finish (~8*140ms + buffer)
await page.waitForFunction(() => {
  const s = window.__coupleGame.snapshot();
  return s.exercisesUsed.includes('tm') && s.hearts === 2;
}, null, { timeout: 5000 });
s = await page.evaluate(() => window.__coupleGame.snapshot());
check('exercise costs 1 heart', s.hearts === 2, `hearts=${s.hearts}`);
check('exercise marks used', s.exercisesUsed.includes('tm'), `${s.exercisesUsed}`);
const invLeft = await page.evaluate(() => {
  const st = window.__coupleGame.getState();
  return st.invUntil - st.now;
});
check('brief invincibility after exercise', invLeft > 500, `invLeft=${invLeft}`);
await snap(page, '04-after-exercise');

// Try consecutive hit during invincibility — second machine shouldn't immediately drain if we force touch while inv
await page.evaluate(() => {
  const st = window.__coupleGame.getState();
  const ex = st.exercises[1];
  ex.used = false;
  ex.playing = false;
  st.player.x = ex.x + 30;
  st.player.y = ex.y + 50;
});
await page.waitForTimeout(200);
s = await page.evaluate(() => window.__coupleGame.snapshot());
check('no consecutive hit during invincibility', s.hearts === 2 && !s.exercisesUsed.includes('bk'), `hearts=${s.hearts} used=${s.exercisesUsed}`);

// --- Near-ending test option (UI button on title, then API for in-run) ---
await page.evaluate(() => window.__coupleGame.start('normal'));
await page.waitForTimeout(100);
// Return to title overlay by finishing... instead open overlay via DOM for button test
await page.evaluate(() => {
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('btnNearEnding').classList.remove('hidden');
  document.getElementById('btnStart').classList.remove('hidden');
  document.getElementById('btnRestart').classList.add('hidden');
});
await page.click('#btnNearEnding');
await page.waitForTimeout(200);
s = await page.evaluate(() => window.__coupleGame.snapshot());
check('near-ending start position', s.playerX > 4000 && s.mode === 'nearEnding', `x=${s.playerX}`);
await snap(page, '05-near-ending-start');

// Walk into ending
await page.keyboard.down('ArrowRight');
await page.waitForFunction(() => window.__coupleGame.snapshot().phase !== 'idle', null, { timeout: 8000 });
await page.keyboard.up('ArrowRight');
s = await page.evaluate(() => window.__coupleGame.snapshot());
check('ending triggers', s.phase !== 'idle', `phase=${s.phase}`);
check('ending locks damage', s.damageLocked === true, `damageLocked=${s.damageLocked}`);
check('ending locks input', s.inputLocked === true, `inputLocked=${s.inputLocked}`);
await snap(page, '06-ending-triggered');

// Wait through flower → step → hug → done
const phasesSeen = new Set([s.phase]);
const startWait = Date.now();
while (Date.now() - startWait < 12000) {
  await page.waitForTimeout(200);
  s = await page.evaluate(() => window.__coupleGame.snapshot());
  phasesSeen.add(s.phase);
  if (s.phase === 'done' || s.won) break;
}
check('saw flower phase', phasesSeen.has('flower'), [...phasesSeen].join(','));
check('saw step or hug', phasesSeen.has('step') || phasesSeen.has('hug'), [...phasesSeen].join(','));
check('saw hug phase', phasesSeen.has('hug'), [...phasesSeen].join(','));
check('ending completes', s.won === true && s.phase === 'done', `won=${s.won} phase=${s.phase}`);

// During hug, hideIndividuals must be true
const hugSnap = await page.evaluate(() => {
  // rewind not possible; check last state
  return window.__coupleGame.snapshot();
});
// If done, hideIndividuals should still be true
check('individuals hidden in hug/done', hugSnap.hideIndividuals === true, `hide=${hugSnap.hideIndividuals}`);
await snap(page, '07-ending-done');

// Hearts unchanged during ending — set hearts low before ending and ensure no drop
await page.evaluate(() => window.__coupleGame.start('nearEnding'));
await page.evaluate(() => {
  const st = window.__coupleGame.getState();
  st.hearts = 1;
});
await page.keyboard.down('ArrowRight');
await page.waitForFunction(() => window.__coupleGame.snapshot().phase === 'done' || window.__coupleGame.snapshot().won, null, { timeout: 15000 });
await page.keyboard.up('ArrowRight');
s = await page.evaluate(() => window.__coupleGame.snapshot());
check('no damage during ending', s.hearts === 1, `hearts=${s.hearts}`);

// Restart → normal start
await page.click('#btnRestart');
await page.waitForTimeout(200);
s = await page.evaluate(() => window.__coupleGame.snapshot());
check('restart returns to normal start', s.mode === 'normal' && s.playerX < 200 && s.hearts === 3, `mode=${s.mode} x=${s.playerX} hearts=${s.hearts}`);
await snap(page, '08-restart-normal');

await browser.close();

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log('\n---');
console.log(`Passed ${results.length - failed.length}/${results.length}`);
if (failed.length) {
  console.error('FAILED:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
