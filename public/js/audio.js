/* DENI ISLAM — звук: процедурные эффекты через WebAudio + подгрузка WAV-ассетов */
import * as THREE from '../vendor/three/three.module.js';

let ctx = null, master = null, sfxGain = null, ambGain = null, voiceGain = null;
let ready = false;
const buffers = {};
let listener = null;
let muted = false;
let ambienceOn = false;

export function initAudio() {
  if (ready) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try { ctx = new AC(); } catch (e) { return false; }
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.85; sfxGain.connect(master);
  ambGain = ctx.createGain(); ambGain.gain.value = 0.0; ambGain.connect(master);
  voiceGain = ctx.createGain(); voiceGain.gain.value = 1.0; voiceGain.connect(master);
  listener = new THREE.AudioListener();
  ready = true;
  buildProcedural();
  loadWavs();
  loadRadios();
  return true;
}
export function resumeAudio() {
  if (!ready) initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}
export function audioCtx() { return ctx; }
export function voiceDestination() { return voiceGain; }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; }
export function isMuted() { return muted; }

function sr() { return ctx ? ctx.sampleRate : 44100; }
function buf(seconds, channels) {
  const n = Math.max(1, Math.floor(seconds * sr()));
  return ctx.createBuffer(channels || 1, n, sr());
}
function noiseBuffer(seconds, filter) {
  const b = buf(seconds, 1);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = filter === 'low' ? last * 0.72 + w * 0.28 : (filter === 'high' ? w - last * 0.6 : w);
    d[i] = last;
  }
  return b;
}
function env(shape, attack, decay, sustain, release) {
  return { attack, decay, sustain, release };
}

/* -------- процедурные эффекты -------- */
function buildProcedural() {
  if (!ctx) return;
  // выстрелы
  buffers.shotPistol = shotBuffer(0.24, 900, 0.55);
  buffers.shotRifle = shotBuffer(0.34, 620, 0.9);
  buffers.shotSmg = shotBuffer(0.2, 1100, 0.5);
  buffers.shotShotgun = shotBuffer(0.55, 380, 1.0);
  buffers.shotFar = shotBuffer(0.5, 300, 0.4);
  // прочее
  buffers.dry = clickBuffer(0.07, 2400, 0.5);
  buffers.reloadOut = clickBuffer(0.12, 1500, 0.7);
  buffers.reloadIn = clickBuffer(0.16, 900, 0.85);
  buffers.slide = noiseBurst(0.16, 0.5, 'high');
  buffers.melee = noiseBurst(0.18, 0.35, 'high');
  buffers.hit = thudBuffer(0.16, 220, 0.7);
  buffers.hitBody = thudBuffer(0.22, 150, 0.9);
  buffers.hurt = gruntBuffer(260, 0.4);
  buffers.death = gruntBuffer(150, 0.75);
  buffers.cash = cashBuffer();
  buffers.buy = chimeBuffer([660, 880, 1320], 0.35);
  buffers.error = chimeBuffer([220, 175], 0.35, 'square');
  buffers.click = clickBuffer(0.05, 1800, 0.35);
  buffers.open = clickBuffer(0.2, 500, 0.5);
  buffers.door = thudBuffer(0.3, 120, 0.6);
  buffers.alarm = alarmBuffer();
  buffers.siren = sirenBuffer();
  buffers.toast = chimeBuffer([520, 780], 0.22);
  buffers.footstep = noiseBurst(0.07, 0.22, 'low');
  buffers.heart = thudBuffer(0.24, 70, 0.8);
  buffers.levelup = chimeBuffer([440, 660, 880, 1100], 0.5);
}
function shotBuffer(dur, freq, power) {
  const b = buf(dur, 1);
  const d = b.getChannelData(0);
  const n = d.length;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const crack = (Math.random() * 2 - 1) * Math.pow(1 - t, 7);
    const body = Math.sin(2 * Math.PI * freq * (1 - t * 0.6) * (i / sr())) * Math.pow(1 - t, 4);
    const tail = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * 0.28;
    d[i] = Math.tanh((crack * 0.75 + body * power + tail) * 1.5) * 0.9;
  }
  return b;
}
function clickBuffer(dur, freq, amp) {
  const b = buf(dur, 1); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    d[i] = (Math.sin(2 * Math.PI * freq * t * dur * 8) * Math.pow(1 - t, 9) + (Math.random() * 2 - 1) * Math.pow(1 - t, 14) * 0.4) * amp;
  }
  return b;
}
function noiseBurst(dur, amp, filter) {
  const b = noiseBuffer(dur, filter);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] *= Math.pow(1 - i / d.length, 2.4) * amp;
  return b;
}
function thudBuffer(dur, freq, amp) {
  const b = buf(dur, 1); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    d[i] = (Math.sin(2 * Math.PI * freq * (1 - t * 0.5) * t * dur * 4) * Math.pow(1 - t, 5) +
            (Math.random() * 2 - 1) * Math.pow(1 - t, 10) * 0.3) * amp;
  }
  return b;
}
function gruntBuffer(freq, amp) {
  const dur = 0.45;
  const b = buf(dur, 1); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    const f = freq * (1 - t * 0.45) + Math.sin(t * 40) * 12;
    d[i] = (Math.sin(2 * Math.PI * f * t * dur * 3) * 0.6 + (Math.random() * 2 - 1) * 0.25) *
           Math.pow(Math.sin(Math.PI * t), 1.4) * amp;
  }
  return b;
}
function cashBuffer() {
  const dur = 0.5; const b = buf(dur, 1); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    let v = 0;
    for (let k = 0; k < 5; k++) {
      const st = k * 0.08;
      if (t > st) v += (Math.random() * 2 - 1) * Math.pow(1 - (t - st) * 6, 3) * 0.5;
    }
    d[i] = v * 0.6;
  }
  return b;
}
function chimeBuffer(freqs, dur, type) {
  const b = buf(dur, 1); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr();
    let v = 0;
    freqs.forEach((f, k) => {
      const st = k * 0.06;
      if (t > st) v += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) * 9) / (k + 1);
    });
    d[i] = v * 0.42;
  }
  return b;
}
function alarmBuffer() {
  const dur = 1.6; const b = buf(dur, 1); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr();
    const f = 720 + Math.sin(t * Math.PI * 3.2) * 260;
    d[i] = (Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 2 * t) * 0.18) *
           Math.min(1, t * 6) * Math.min(1, (dur - t) * 4) * 0.5;
  }
  return b;
}
function sirenBuffer() {
  const dur = 2.6; const b = buf(dur, 1); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr();
    const f = 620 + Math.sin(t * Math.PI * 1.6) * 300;
    d[i] = (Math.sin(2 * Math.PI * f * t) * 0.4 + Math.sin(2 * Math.PI * f * 0.5 * t) * 0.2) *
           Math.min(1, t * 3) * Math.min(1, (dur - t) * 2) * 0.45;
  }
  return b;
}

/* -------- подгрузка WAV-ассетов -------- */
const WAV_LIST = ['ambience', 'menu', 'alarm_loop', 'wind'];
/* тяжёлые треки радио догружаются в фоне — старт игры они не тормозят */
const RADIO_LIST = ['radio1', 'radio2', 'radio3'];
let wavLoaded = 0;
function loadWavs() {
  WAV_LIST.forEach(n => {
    fetch('assets/audio/' + n + '.wav')
      .then(r => r.ok ? r.arrayBuffer() : null)
      .then(ab => {
        if (!ab || !ctx) return;
        ctx.decodeAudioData(ab, b => {
          buffers[n] = b;
          wavLoaded++;
          if (n === 'ambience' && ambienceOn) startAmbience();
          if (n === 'menu' && musicWanted) startMusic();
        }, () => {});
      }).catch(() => {});
  });
}
let radioSrc = null, radioGain = null, radioWanted = false, radioIdx = -1;
function loadRadios() {
  RADIO_LIST.forEach(n => {
    fetch('assets/audio/' + n + '.wav')
      .then(r => r.ok ? r.arrayBuffer() : null)
      .then(ab => {
        if (!ab || !ctx) return;
        ctx.decodeAudioData(ab, b => {
          buffers[n] = b;
          wavLoaded++;
          if (radioWanted && !radioSrc) startRadio();
        }, () => {});
      }).catch(() => {});
  });
}
export function assetsLoaded() { return wavLoaded; }

/* -------- радио (играет в городе) -------- */
export function startRadio(which) {
  if (!ready) initAudio();
  if (!ctx) { radioWanted = true; return; }
  const avail = RADIO_LIST.filter(n => buffers[n]);
  if (!avail.length) { radioWanted = true; if (typeof loadRadios === 'function') loadRadios(); return; }
  if (radioSrc) stopRadio(0.6);
  radioWanted = true;
  if (which != null && buffers[which]) radioIdx = RADIO_LIST.indexOf(which);
  else radioIdx = RADIO_LIST.indexOf(avail[Math.floor(Math.random() * avail.length)]);
  const b = buffers[RADIO_LIST[radioIdx]];
  if (!b) return;
  radioSrc = ctx.createBufferSource();
  radioSrc.buffer = b; radioSrc.loop = true;
  radioGain = ctx.createGain(); radioGain.gain.value = 0.0001;
  radioSrc.connect(radioGain); radioGain.connect(master);
  radioSrc.onended = () => { if (radioWanted) startRadio(); };
  try { radioSrc.start(); } catch (e) { radioSrc = null; return; }
  radioGain.gain.linearRampToValueAtTime(0.26, ctx.currentTime + 1.8);
}
export function stopRadio(fadeSec) {
  radioWanted = false;
  if (!radioGain || !radioSrc || !ctx) return;
  const src = radioSrc; radioSrc = null;
  const f = fadeSec == null ? 0.8 : fadeSec;
  try {
    radioGain.gain.cancelScheduledValues(ctx.currentTime);
    radioGain.gain.setValueAtTime(radioGain.gain.value, ctx.currentTime);
    radioGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + f);
    setTimeout(() => { try { src.stop(); } catch (e) {} }, f * 1000 + 200);
  } catch (e) { try { src.stop(); } catch (e2) {} }
  radioGain = null;
}
export function nextRadio() {
  if (!RADIO_LIST.filter(n => buffers[n]).length) return null;
  let i = radioIdx;
  const avail = RADIO_LIST.filter(n => buffers[n]);
  do { i = (i + 1) % RADIO_LIST.length; } while (!buffers[RADIO_LIST[i]] && avail.length > 1);
  startRadio(RADIO_LIST[i]);
  return RADIO_LIST[i];
}
export function radioTrackName() {
  const names = { radio1: 'Радио «Район»', radio2: 'Кассета Санька', radio3: 'Ночной патруль' };
  return radioIdx >= 0 ? names[RADIO_LIST[radioIdx]] : null;
}

/* -------- музыка меню -------- */
let musicSrc = null, musicGain = null, musicWanted = false;
export function startMusic() {
  if (!ready) initAudio();
  if (!ctx || !buffers.menu) { musicWanted = true; return; }
  if (musicSrc) return;
  musicWanted = true;
  musicSrc = ctx.createBufferSource();
  musicSrc.buffer = buffers.menu; musicSrc.loop = true;
  musicGain = ctx.createGain(); musicGain.gain.value = 0.0001;
  musicSrc.connect(musicGain); musicGain.connect(master);
  musicSrc.start();
  musicGain.gain.linearRampToValueAtTime(0.34, ctx.currentTime + 2.5);
}
export function stopMusic() {
  musicWanted = false;
  if (!musicGain || !musicSrc || !ctx) return;
  const src = musicSrc; musicSrc = null;
  try {
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    setTimeout(() => { try { src.stop(); } catch (e) {} }, 1100);
  } catch (e) { try { src.stop(); } catch (e2) {} }
  musicGain = null;
}

/* -------- тревога банка (петля) -------- */
let alarmSrc = null, alarmGain = null;
export function startAlarmLoop() {
  if (!ready || !ctx) return;
  const b = buffers.alarm_loop;
  if (!b || alarmSrc) return;
  alarmSrc = ctx.createBufferSource();
  alarmSrc.buffer = b; alarmSrc.loop = true;
  alarmGain = ctx.createGain(); alarmGain.gain.value = 0.0001;
  alarmSrc.connect(alarmGain); alarmGain.connect(sfxGain);
  alarmSrc.start();
  alarmGain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.4);
}
export function stopAlarmLoop() {
  if (!alarmSrc || !ctx) return;
  const src = alarmSrc; alarmSrc = null;
  try {
    alarmGain.gain.cancelScheduledValues(ctx.currentTime);
    alarmGain.gain.setValueAtTime(alarmGain.gain.value, ctx.currentTime);
    alarmGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    setTimeout(() => { try { src.stop(); } catch (e) {} }, 750);
  } catch (e) { try { src.stop(); } catch (e2) {} }
  alarmGain = null;
}

/* -------- воспроизведение -------- */
export function play(name, opts) {
  if (!ready || muted) return null;
  resumeAudio();
  const o = opts || {};
  const b = buffers[name];
  if (!b) return null;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = o.rate || (1 + (Math.random() - 0.5) * (o.variation || 0.04));
  const g = ctx.createGain();
  g.gain.value = o.gain == null ? 1 : o.gain;
  let node = src;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter; f.frequency.value = o.freq || 900;
    src.connect(f); f.connect(g);
  } else src.connect(g);

  if (o.pos && listener && ctx.listener.positionX) {
    const p = ctx.listener;
    // позиционируем вручную через паннер
    const pan = ctx.createPanner ? ctx.createPanner() : null;
    if (pan) {
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = 6; pan.maxDistance = 140; pan.rolloffFactor = 1.1;
      pan.positionX.value = o.pos.x; pan.positionY.value = o.pos.y == null ? 1.4 : o.pos.y; pan.positionZ.value = o.pos.z;
      g.connect(pan); pan.connect(sfxGain);
      src.start(0, o.offset || 0);
      return src;
    }
  }
  g.connect(sfxGain);
  src.start(0, o.offset || 0);
  if (o.stopAfter) setTimeout(() => { try { src.stop(); } catch (e) {} }, o.stopAfter * 1000);
  return src;
}
export function playAt(name, x, y, z, gain) {
  if (!ready || muted) return;
  const cam = window.GAME && window.GAME.camera ? window.GAME.camera.position : null;
  if (cam) {
    const d = Math.hypot(cam.x - x, cam.z - z);
    if (d > 130) return;
    gain = (gain == null ? 1 : gain) * Math.max(0.05, 1 - d / 130);
  }
  play(name, { pos: { x, y, z }, gain });
}
export function setListener(cam) {
  if (!ctx || !cam) return;
  const l = ctx.listener;
  if (l.positionX) {
    l.positionX.value = cam.position.x; l.positionY.value = cam.position.y; l.positionZ.value = cam.position.z;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    if (l.forwardX) { l.forwardX.value = dir.x; l.forwardY.value = dir.y; l.forwardZ.value = dir.z; }
    if (l.upX) { l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
  } else if (l.setPosition) {
    l.setPosition(cam.position.x, cam.position.y, cam.position.z);
  }
}
export function startAmbience() {
  if (!ready || ambienceOn) return;
  ambienceOn = true;
  ambGain.gain.value = 0.0;
  // процедурный городской гул
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 48;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 96;
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(4, 'low'); n.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
  const g = ctx.createGain(); g.gain.value = 0.5;
  o1.connect(f); o2.connect(f); n.connect(f); f.connect(g); g.connect(ambGain);
  o1.start(); o2.start(); n.start();
  ambGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 3);
  if (buffers.ambience) {
    const s = ctx.createBufferSource(); s.buffer = buffers.ambience; s.loop = true;
    const gg = ctx.createGain(); gg.gain.value = 0.5;
    s.connect(gg); gg.connect(ambGain); s.start();
  }
}
export function stopAmbience() { ambienceOn = false; if (ambGain) ambGain.gain.value = 0; }

export const SFX = {
  shot: function (cls, pos) {
    const map = { pistol: 'shotPistol', rifle: 'shotRifle', smg: 'shotSmg', shotgun: 'shotShotgun' };
    if (pos) playAt(map[cls] || 'shotPistol', pos.x, pos.y, pos.z, 1.0);
    else play(map[cls] || 'shotPistol', { gain: 0.95 });
  }
};
