#!/usr/bin/env node
/* ============================================================
   DENI ISLAM — генератор ассетов (без внешних зависимостей)
   Создаёт:
     public/assets/audio/*.wav   — городской гул, музыка меню, тревога банка
     public/assets/tex/*.png     — 1024² текстуры города (asphalt, brick, facade…)
     public/assets/icons/*.png   — иконки PWA / App Store / Android
   Запуск:  npm run assets
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const A = p => path.join(ROOT, 'public', 'assets', p);
function mkdir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

/* ============================== WAV ============================== */
function writeWav(file, sampleRate, channels, samples) {
  const bytesPerSample = 2;
  const dataLen = samples.length * bytesPerSample;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);            // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buf.writeUInt16LE(channels * bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 32767) | 0, o); o += 2;
  }
  mkdir(file);
  fs.writeFileSync(file, buf);
  return buf.length;
}
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* -------- 1. городской гул (ambience) -------- */
function ambience() {
  const sr = 22050, dur = 30, rnd = seeded(7717);   // 30 c, 22 кГц — цикл
  const n = sr * dur;
  const out = new Float32Array(n);
  // низкий гул города + шум ветра + редкие машины и гудки
  let lp = 0, lp2 = 0, wind = 0;
  const cars = [];
  for (let i = 0; i < 26; i++) cars.push({ t: rnd() * dur, dur: 3 + rnd() * 5, pan: rnd(), freq: 60 + rnd() * 90 });
  const honks = [];
  for (let i = 0; i < 9; i++) honks.push({ t: 8 + rnd() * (dur - 16), dur: 0.35 + rnd() * 0.4, f: 320 + rnd() * 220 });
  const sirens = [{ t: 42, dur: 6 }, { t: 131, dur: 7 }];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = rnd() * 2 - 1;
    lp = lp * 0.965 + w * 0.035;
    lp2 = lp2 * 0.995 + lp * 0.005;
    wind += (rnd() * 2 - 1 - wind) * 0.002;
    let v = lp2 * 1.5 + wind * 0.5;
    // дальний трафик
    v += Math.sin(2 * Math.PI * 47 * t) * 0.05 * (0.6 + 0.4 * Math.sin(t * 0.11));
    v += Math.sin(2 * Math.PI * 93 * t + Math.sin(t * 0.7)) * 0.022;
    // проезжающие машины (доплер)
    for (const c of cars) {
      let dt = t - c.t;
      if (dt < -0.5 || dt > c.dur) continue;
      const k = Math.sin(Math.PI * Math.max(0, Math.min(1, dt / c.dur)));
      const f = c.freq * (1 + (0.5 - dt / c.dur) * 0.5);
      v += Math.sin(2 * Math.PI * f * t) * 0.075 * k + (rnd() * 2 - 1) * 0.05 * k;
    }
    // гудки
    for (const h of honks) {
      const dt = t - h.t;
      if (dt < 0 || dt > h.dur) continue;
      const k = Math.sin(Math.PI * dt / h.dur);
      v += (Math.sin(2 * Math.PI * h.f * t) * 0.5 + Math.sin(2 * Math.PI * h.f * 1.5 * t) * 0.25) * 0.09 * k;
    }
    // сирены вдалеке
    for (const s of sirens) {
      const dt = t - s.t;
      if (dt < 0 || dt > s.dur) continue;
      const k = Math.sin(Math.PI * dt / s.dur) * 0.5;
      const f = 640 + Math.sin(dt * Math.PI * 1.7) * 260;
      v += Math.sin(2 * Math.PI * f * t) * 0.055 * k;
    }
    // редкий лай/голоса — короткий тональный всплеск
    out[i] = v * 0.72;
  }
  // кроссфейд для бесшовной петли
  const fade = sr * 3;
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + out[n - fade + i] * (1 - k);
  }
  return writeWav(A('audio/ambience.wav'), sr, 1, out);
}

/* -------- 2. музыка меню (тёмный медленный бит) -------- */
function menuMusic() {
  const sr = 22050, dur = 52, rnd = seeded(31337);   // 52 c темы меню
  const n = sr * dur;
  const out = new Float32Array(n);
  const bpm = 74, beat = 60 / bpm;
  // минорная прогрессия: Am - F - C - G (низкая, мрачная)
  const prog = [
    [110.00, 130.81, 164.81],   // Am
    [87.31, 110.00, 130.81],    // F
    [98.00, 130.81, 164.81],    // C/G
    [82.41, 123.47, 146.83]     // E/G#
  ];
  const bars = Math.floor(dur / (beat * 4));
  function note(t, f, dur2, gain, type) {
    const i0 = Math.floor(t * sr), i1 = Math.min(n, Math.floor((t + dur2) * sr));
    for (let i = i0; i < i1; i++) {
      const lt = (i - i0) / sr;
      const env = Math.min(1, lt * 40) * Math.exp(-lt * (type === 'bass' ? 2.2 : 3.4));
      let v;
      if (type === 'bass') v = Math.sin(2 * Math.PI * f * lt) * 0.85 + Math.sin(2 * Math.PI * f * 2 * lt) * 0.18;
      else if (type === 'pad') v = (Math.sin(2 * Math.PI * f * lt) * 0.5 + Math.sin(2 * Math.PI * f * 2.005 * lt) * 0.22 + Math.sin(2 * Math.PI * f * 3.01 * lt) * 0.09);
      else v = (Math.sin(2 * Math.PI * f * lt) + 0.4 * Math.sin(2 * Math.PI * f * 2 * lt)) * 0.5;
      out[i] += v * env * gain;
    }
  }
  function kick(t) {
    const i0 = Math.floor(t * sr), L = Math.floor(0.32 * sr);
    for (let i = 0; i < L && i0 + i < n; i++) {
      const lt = i / sr;
      const f = 120 * Math.exp(-lt * 22) + 42;
      out[i0 + i] += Math.sin(2 * Math.PI * f * lt) * Math.exp(-lt * 9) * 0.95;
    }
  }
  function snare(t) {
    const i0 = Math.floor(t * sr), L = Math.floor(0.22 * sr);
    let lp = 0;
    for (let i = 0; i < L && i0 + i < n; i++) {
      const lt = i / sr;
      const w = rnd() * 2 - 1;
      lp = lp * 0.7 + w * 0.3;
      out[i0 + i] += (lp * 0.6 + w * 0.25) * Math.exp(-lt * 18) * 0.55;
    }
  }
  function hat(t, open) {
    const i0 = Math.floor(t * sr), L = Math.floor((open ? 0.18 : 0.05) * sr);
    for (let i = 0; i < L && i0 + i < n; i++) {
      const lt = i / sr;
      out[i0 + i] += (rnd() * 2 - 1) * Math.exp(-lt * (open ? 26 : 90)) * 0.16;
    }
  }
  for (let b = 0; b < bars; b++) {
    const t0 = b * beat * 4;
    const ch = prog[b % prog.length];
    const intro = b < 2;
    // бас
    note(t0, ch[0] / 2, beat * 3.4, 0.42, 'bass');
    note(t0 + beat * 2, ch[0] / 2 * 1.06, beat * 1.6, 0.3, 'bass');
    // пэд
    ch.forEach((f, k) => note(t0, f * 2, beat * 4, intro ? 0.10 : 0.15, 'pad'));
    // мелодия (редкие ноты)
    if (!intro && b % 2 === 0) {
      note(t0 + beat * 1.5, ch[2] * 4, beat * 0.9, 0.11, 'lead');
      note(t0 + beat * 3, ch[1] * 4, beat * 0.7, 0.09, 'lead');
    }
    if (b % 4 === 3) note(t0 + beat * 3.5, ch[2] * 6, beat * 0.5, 0.08, 'lead');
    // ударные
    if (!intro) {
      kick(t0); kick(t0 + beat * 1.5); kick(t0 + beat * 2.5);
      snare(t0 + beat); snare(t0 + beat * 3);
      for (let h = 0; h < 8; h++) hat(t0 + h * beat * 0.5, h % 4 === 3);
    }
  }
  // лёгкая сатурация + нормализация
  let peak = 0;
  for (let i = 0; i < n; i++) { out[i] = Math.tanh(out[i] * 1.25); peak = Math.max(peak, Math.abs(out[i])); }
  const g = 0.82 / (peak || 1);
  for (let i = 0; i < n; i++) out[i] *= g;
  const fade = sr * 2;
  for (let i = 0; i < fade; i++) { const k = i / fade; out[i] = out[i] * k + out[n - fade + i] * (1 - k); }
  // стерео с небольшим расширением
  const stereo = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    stereo[i * 2] = out[i] * 0.98;
    stereo[i * 2 + 1] = out[Math.max(0, i - 220)] * 0.9 + out[i] * 0.1;
  }
  return writeWav(A('audio/menu.wav'), sr, 2, stereo);
}

/* -------- 2b. радио: три трека для улицы/драки -------- */
function radioTracks() {
  const sr = 22050, dur = parseInt(process.env.RADIO_SEC || '64', 10);
  const n = sr * dur;

  function buildTrack(cfg) {
    const rnd = seeded(cfg.seed);
    const out = new Float32Array(n);
    const beat = 60 / cfg.bpm;
    const bars = Math.floor(dur / (beat * 4));
    function note(t, f, d2, gain, type) {
      const i0 = Math.floor(t * sr), i1 = Math.min(n, Math.floor((t + d2) * sr));
      for (let i = i0; i < i1; i++) {
        const lt = (i - i0) / sr;
        const dec = type === 'bass' ? cfg.decay * 0.6 : cfg.decay;
        const env = Math.min(1, lt * 60) * Math.exp(-lt * dec);
        let v;
        if (type === 'bass') v = Math.sin(2 * Math.PI * f * lt) * 0.9 + ((Math.sin(2 * Math.PI * f * 2 * lt) * 0.2) | 0);
        else if (type === 'pad') v = Math.sin(2 * Math.PI * f * lt) * 0.5 + Math.sin(2 * Math.PI * f * 2.004 * lt) * 0.2 + Math.sin(2 * Math.PI * f * 3.01 * lt) * 0.08;
        else if (type === 'saw') { const ph = (f * lt) % 1; v = (2 * ph - 1) * 0.5 + Math.sin(2 * Math.PI * f * lt) * 0.3; }
        else v = (Math.sin(2 * Math.PI * f * lt) + 0.45 * Math.sin(2 * Math.PI * f * 2 * lt)) * 0.5;
        out[i] += v * env * gain;
      }
    }
    function kick(t) {
      const i0 = Math.floor(t * sr), L = Math.floor(0.34 * sr);
      for (let i = 0; i < L && i0 + i < n; i++) {
        const lt = i / sr;
        out[i0 + i] += Math.sin(2 * Math.PI * (125 * Math.exp(-lt * 24) + 44) * lt) * Math.exp(-lt * 8.5) * 0.95;
      }
    }
    function snare(t) {
      const i0 = Math.floor(t * sr), L = Math.floor(0.24 * sr);
      let lp = 0;
      for (let i = 0; i < L && i0 + i < n; i++) {
        const lt = i / sr, w = rnd() * 2 - 1;
        lp = lp * 0.72 + w * 0.28;
        out[i0 + i] += (lp * 0.62 + w * 0.24) * Math.exp(-lt * 17) * 0.5;
      }
    }
    function hat(t, open) {
      const i0 = Math.floor(t * sr), L = Math.floor((open ? 0.2 : 0.05) * sr);
      for (let i = 0; i < L && i0 + i < n; i++) {
        const lt = i / sr;
        out[i0 + i] += (rnd() * 2 - 1) * Math.exp(-lt * (open ? 24 : 95)) * 0.15;
      }
    }
    for (let b = 0; b < bars; b++) {
      const t0 = b * beat * 4;
      const ch = cfg.prog[b % cfg.prog.length];
      const intro = b < 2;
      note(t0, ch[0] / 2, beat * 3.3, 0.4, 'bass');
      note(t0 + beat * 2, ch[0] / 2 * cfg.bassTurn, beat * 1.5, 0.28, 'bass');
      ch.forEach(f => note(t0, f * 2, beat * 4, intro ? 0.08 : (cfg.padGain || 0.13), cfg.padType || 'pad'));
      if (!intro && b % 2 === 0) {
        note(t0 + beat * 1.5, ch[2] * 4, beat * 0.85, cfg.leadGain || 0.1, 'lead');
        note(t0 + beat * 3, ch[1] * 4, beat * 0.65, (cfg.leadGain || 0.1) * 0.8, 'lead');
      }
      if (b % 4 === 3) note(t0 + beat * 3.5, ch[2] * 6, beat * 0.5, 0.075, 'lead');
      if (!intro) {
        cfg.kicks.forEach(k => kick(t0 + beat * k));
        cfg.snares.forEach(k => snare(t0 + beat * k));
        for (let h = 0; h < 8; h++) hat(t0 + h * beat * 0.5, cfg.openHat && h % 4 === 3);
      }
    }
    let peak = 0;
    for (let i = 0; i < n; i++) { out[i] = Math.tanh(out[i] * 1.3); peak = Math.max(peak, Math.abs(out[i])); }
    const g = 0.8 / (peak || 1);
    for (let i = 0; i < n; i++) out[i] *= g;
    const fade = sr * 2;
    for (let i = 0; i < fade; i++) { const k = i / fade; out[i] = out[i] * k + out[n - fade + i] * (1 - k); }
    const stereo = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      stereo[i * 2] = out[i] * 0.98;
      stereo[i * 2 + 1] = out[Math.max(0, i - 240)] * 0.9 + out[i] * 0.1;
    }
    return stereo;
  }

  let total = 0;
  // «Радио Район» — медленный мрачный бит (улица)
  total += writeWav(A('audio/radio1.wav'), sr, 2, buildTrack({
    seed: 4242, bpm: 84, decay: 3.0, bassTurn: 1.12, leadGain: 0.11, openHat: true,
    kicks: [0, 1.5, 2.5], snares: [1, 3],
    prog: [[98.00, 116.54, 146.83], [87.31, 110.00, 130.81], [82.41, 98.00, 123.47], [110.00, 130.81, 164.81]]
  }));
  console.log('  audio/radio1.wav');
  // «Кассета Санька» — быстрый дворовой драйв (драка/побег)
  total += writeWav(A('audio/radio2.wav'), sr, 2, buildTrack({
    seed: 777, bpm: 128, decay: 4.2, bassTurn: 1.06, leadGain: 0.09, padGain: 0.1, padType: 'saw',
    kicks: [0, 1, 2, 3], snares: [1, 3], openHat: false,
    prog: [[110.00, 130.81, 164.81], [110.00, 138.59, 164.81], [98.00, 123.47, 146.83], [87.31, 110.00, 130.81]]
  }));
  console.log('  audio/radio2.wav');
  // «Ночной патруль» — тягучий синт (ночные покатушки)
  total += writeWav(A('audio/radio3.wav'), sr, 2, buildTrack({
    seed: 31415, bpm: 96, decay: 2.4, bassTurn: 1.19, leadGain: 0.12, padGain: 0.16,
    kicks: [0, 2, 2.75], snares: [1, 3], openHat: true,
    prog: [[73.42, 87.31, 110.00], [82.41, 98.00, 123.47], [65.41, 82.41, 98.00], [87.31, 110.00, 130.81]]
  }));
  console.log('  audio/radio3.wav');
  return total;
}

/* -------- 3. тревога банка -------- */
function alarmLoop() {
  const sr = 22050, dur = 6;    // короткая петля сирены
  const n = sr * dur;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const cyc = t % 2;
    const f = 700 + Math.sin(cyc * Math.PI * 2) * 280;
    const env = 0.55 + 0.45 * Math.sin(cyc * Math.PI);
    out[i] = (Math.sin(2 * Math.PI * f * t) * 0.55 + Math.sin(2 * Math.PI * f * 2 * t) * 0.2 + Math.sin(2 * Math.PI * f * 3 * t) * 0.08) * env * 0.6;
  }
  const fade = sr * 0.2;
  for (let i = 0; i < fade; i++) { const k = i / fade; out[i] *= k; out[n - 1 - i] *= k; }
  return writeWav(A('audio/alarm_loop.wav'), sr, 1, out);
}

/* -------- 4. дождь/ветер на улице (дополнительный слой) -------- */
function windLoop() {
  const sr = 22050, dur = 14, rnd = seeded(991);
  const n = sr * dur;
  const out = new Float32Array(n);
  let lp = 0, mod = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = rnd() * 2 - 1;
    lp = lp * 0.94 + w * 0.06;
    mod = mod * 0.999 + (rnd() * 2 - 1) * 0.001;
    out[i] = lp * (0.35 + 0.3 * Math.sin(t * 0.23 + mod * 6)) * 0.7;
  }
  const fade = sr * 2;
  for (let i = 0; i < fade; i++) { const k = i / fade; out[i] = out[i] * k + out[n - fade + i] * (1 - k); }
  return writeWav(A('audio/wind.wav'), sr, 1, out);
}

/* ============================== PNG ============================== */
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePNG(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  mkdir(file);
  fs.writeFileSync(file, png);
  return png.length;
}
function makeCanvasTex(size, draw) {
  const buf = Buffer.alloc(size * size * 4);
  const ctx = {
    w: size, h: size, buf,
    set(x, y, r, g, b, a) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const i = (y * size + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a == null ? 255 : a;
    },
    fill(r, g, b) { for (let i = 0; i < size * size; i++) { buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = 255; } },
    rect(x, y, w, h, r, g, b) {
      for (let j = Math.max(0, y | 0); j < Math.min(size, (y + h) | 0); j++)
        for (let i = Math.max(0, x | 0); i < Math.min(size, (x + w) | 0); i++) this.set(i, j, r, g, b);
    },
    circle(cx, cy, rad, r, g, b) {
      for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++)
        if (i * i + j * j <= rad * rad) this.set((cx + i) | 0, (cy + j) | 0, r, g, b);
    },
    noise(amount, alpha, rnd) {
      for (let k = 0; k < amount; k++) {
        const x = (rnd() * size) | 0, y = (rnd() * size) | 0;
        const v = (rnd() * 255) | 0;
        const i = (y * size + x) * 4;
        buf[i] = (buf[i] * (1 - alpha) + v * alpha) | 0;
        buf[i + 1] = (buf[i + 1] * (1 - alpha) + v * alpha) | 0;
        buf[i + 2] = (buf[i + 2] * (1 - alpha) + v * alpha) | 0;
      }
    }
  };
  draw(ctx, size);
  return buf;
}

function textures() {
  // Самые заметные текстуры — крупные (их видно под ногами и на фасадах),
  // остальные 1024². 3072² — компромисс: на телефоне 4 таких текстуры
  // с мипмапами занимают ~190 МБ видеопамяти, 4096² уже рискованно.
  const BASE = parseInt(process.env.TEX_SIZE || '1024', 10);
  const HI = parseInt(process.env.TEX_SIZE_HI || '3072', 10);
  const HI2 = parseInt(process.env.TEX_SIZE_HI2 || '2048', 10);   // кирпич и фасад
  let total = 0;

  // асфальт
  total += writePNG(A('tex/asphalt.png'), HI, HI, makeCanvasTex(HI, (c, s) => {
    const r = seeded(11), k = s / 1024;
    c.fill(56, 56, 62);
    c.noise(220000 * k * k, 0.16, r);
    for (let i = 0; i < 900 * k * k; i++) {
      const x = r() * s, y = r() * s, len = (10 + r() * 90) * k, a = r() * 6.28;
      const w = Math.max(1, Math.round(2 * k));
      for (let t = 0; t < len; t++) {
        const px = (x + Math.cos(a) * t) | 0, py = (y + Math.sin(a) * t) | 0;
        c.rect(px, py, w, w, 34, 34, 38);
        c.rect(px + w, py, w, w, 30, 30, 34);
      }
    }
    for (let i = 0; i < 240 * k * k; i++) c.circle(r() * s, r() * s, (1 + r() * 5) * k, 74, 74, 80);
  }));

  // плитка
  total += writePNG(A('tex/paving.png'), HI, HI, makeCanvasTex(HI, (c, s) => {
    const r = seeded(22), k = s / 1024;
    c.fill(120, 116, 108);
    const cell = s / 8, j = 3 * k;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 104 + r() * 46;
      c.rect(x * cell + j, y * cell + j, cell - j * 2, cell - j * 2, v, v - 3, v - 12);
      // фаска и царапины на каждой плитке
      c.rect(x * cell + j, y * cell + j, cell - j * 2, 2 * k, v + 22, v + 18, v + 8);
      for (let n = 0; n < 6 * k; n++) {
        c.rect(x * cell + r() * cell, y * cell + r() * cell, 2 * k, 2 * k, v - 26, v - 28, v - 34);
      }
    }
    c.noise(160000 * k * k, 0.1, r);
  }));

  // кирпич
  total += writePNG(A('tex/brick.png'), HI2, HI2, makeCanvasTex(HI2, (c, s) => {
    const r = seeded(33), k = s / 1024;
    c.fill(96, 56, 46);
    const bh = s / 20, bw = s / 8, j = 3 * k;
    for (let y = 0; y < 20; y++) {
      const off = (y % 2) * bw / 2;
      for (let x = -1; x < 9; x++) {
        const v = r();
        const base = v > 0.72 ? [132, 74, 58] : (v > 0.4 ? [104, 58, 46] : [118, 66, 52]);
        c.rect(x * bw + off + j, y * bh + j, bw - j * 2, bh - j * 2, base[0], base[1], base[2]);
        // потёртости и сколы на кирпиче
        for (let n = 0; n < 5 * k; n++) {
          const d = (r() - 0.5) * 34;
          c.circle(x * bw + off + r() * bw, y * bh + r() * bh, (1 + r() * 5) * k,
            Math.max(0, base[0] + d), Math.max(0, base[1] + d), Math.max(0, base[2] + d));
        }
      }
    }
    c.noise(200000 * k * k, 0.13, r);
  }));

  // бетон
  total += writePNG(A('tex/concrete.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(44), k = s / 1024;
    c.fill(154, 148, 138);
    c.noise(280000 * k * k, 0.14, r);
    for (let i = 0; i < 260 * k * k; i++) c.circle(r() * s, r() * s, (4 + r() * 40) * k, 122, 116, 108);
    for (let i = 0; i < 90 * k * k; i++) {
      const x = r() * s, y = r() * s;
      for (let t = 0; t < 60 * k; t++) c.rect((x + t * (r() - 0.5) * 3) | 0, (y + t) | 0, Math.max(1, k), 1, 108, 102, 94);
    }
  }));

  // фасад с окнами
  total += writePNG(A('tex/facade.png'), HI2, HI2, makeCanvasTex(HI2, (c, s) => {
    const r = seeded(55), k = s / 1024;
    c.fill(142, 134, 120);
    c.noise(180000 * k * k, 0.09, r);
    const cell = s / 4;
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      const x = fx * cell + cell * 0.18, y = fy * cell + cell * 0.2;
      const w = cell * 0.64, h = cell * 0.62;
      c.rect(x - 8 * k, y - 8 * k, w + 16 * k, h + 16 * k, 58, 56, 52);
      const lit = r() < 0.24;
      const glass = lit ? [255, 214, 138] : [34, 48, 60];
      c.rect(x, y, w, h, glass[0], glass[1], glass[2]);
      // блик
      const bw = Math.max(1, 8 * k);
      for (let t = 0; t < w; t++) {
        const yy = y + h - t * (h / w);
        for (let q = 0; q < bw; q++) c.rect((x + t) | 0, (yy + q) | 0, 1, 1,
          Math.min(255, glass[0] + 40), Math.min(255, glass[1] + 40), Math.min(255, glass[2] + 40));
      }
      c.rect(x + w / 2 - 3 * k, y, 6 * k, h, 88, 86, 80);
      c.rect(x, y + h / 2 - 3 * k, w, 6 * k, 88, 86, 80);
      c.rect(x - 12 * k, y + h, w + 24 * k, 10 * k, 110, 106, 98);
      // подтёки и грязь под окном
      for (let n = 0; n < 10 * k; n++) {
        const sx = x + r() * w;
        for (let t = 0; t < 40 * k; t++) c.rect(sx | 0, (y + h + t) | 0, Math.max(1, 2 * k), 1, 118, 110, 98);
      }
    }
  }));

  // дерево
  total += writePNG(A('tex/wood.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(66), k = s / 1024;
    c.fill(138, 95, 56);
    for (let i = 0; i < 500 * k; i++) {
      const y = r() * s;
      const v = 60 + r() * 90;
      for (let x = 0; x < s; x++) {
        const yy = (y + Math.sin(x * 0.02 + i) * 6 * k) | 0;
        c.rect(x, yy, 1, Math.max(1, k), v, v * 0.68, v * 0.4);
        c.rect(x, yy + Math.max(1, k), 1, Math.max(1, k), v * 0.9, v * 0.6, v * 0.35);
      }
    }
    c.noise(120000 * k * k, 0.08, r);
  }));

  // мрамор
  total += writePNG(A('tex/marble.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(77), k = s / 1024;
    c.fill(230, 226, 216);
    for (let i = 0; i < 120 * k; i++) {
      let x = r() * s, y = 0;
      const g = 130 + r() * 60;
      while (y < s) {
        for (let q = -1; q <= 1; q++) c.rect((x + q * k) | 0, y | 0, Math.max(1, k), Math.max(1, k), g, g - 4, g - 12);
        x += (r() - 0.5) * 12 * k; y += (2 + r() * 4) * k;
      }
    }
    c.noise(90000 * k * k, 0.05, r);
  }));

  // металл
  total += writePNG(A('tex/metal.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(88), k = s / 1024;
    c.fill(96, 102, 110);
    for (let y = 0; y < s; y += 10 * k) {
      const v = 84 + r() * 34;
      c.rect(0, y, s, 3 * k, v, v + 4, v + 8);
    }
    for (let i = 0; i < 700 * k * k; i++) c.circle(r() * s, r() * s, (1 + r() * 3) * k, 70, 76, 84);
    // заклёпки по углам листов
    for (let y = 12 * k; y < s; y += 40 * k) for (let x = 12 * k; x < s; x += 40 * k) {
      c.circle(x, y, 2 * k, 128, 134, 142);
    }
    c.noise(160000 * k * k, 0.1, r);
  }));

  // паркет
  total += writePNG(A('tex/parquet.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(99), k = s / 1024;
    c.fill(122, 83, 48);
    const cell = s / 8, j = 2 * k;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 108 + r() * 60;
      c.rect(x * cell + j, y * cell + j, cell - j * 2, cell - j * 2, v, v * 0.66, v * 0.38);
      for (let q = 0; q < 12 * k; q++) {
        const yy = y * cell + 4 * k + r() * (cell - 8 * k);
        c.rect(x * cell + 4 * k, yy, cell - 8 * k, Math.max(1, k), v * 0.85, v * 0.55, v * 0.3);
      }
    }
    c.noise(90000 * k * k, 0.06, r);
  }));

  // крыша (жесть)
  total += writePNG(A('tex/roof.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(111), k = s / 1024;
    c.fill(74, 78, 85);
    for (let x = 0; x < s; x += 32 * k) c.rect(x, 0, 4 * k, s, 52, 55, 60);
    for (let y = 0; y < s; y += 96 * k) c.rect(0, y, s, 3 * k, 62, 66, 72);
    c.noise(140000 * k * k, 0.1, r);
    for (let i = 0; i < 240 * k * k; i++) c.circle(r() * s, r() * s, (2 + r() * 8) * k, 96, 82, 66);
  }));

  // ковёр
  total += writePNG(A('tex/carpet.png'), 512, 512, makeCanvasTex(512, (c, s) => {
    const r = seeded(123);
    c.fill(123, 43, 43);
    const border = (o, col) => { c.rect(o, o, s - o * 2, 6, col[0], col[1], col[2]); c.rect(o, s - o - 6, s - o * 2, 6, col[0], col[1], col[2]); c.rect(o, o, 6, s - o * 2, col[0], col[1], col[2]); c.rect(s - o - 6, o, 6, s - o * 2, col[0], col[1], col[2]); };
    border(14, [201, 162, 74]); border(34, [170, 130, 60]); border(52, [201, 162, 74]);
    for (let i = 0; i < 12; i++) c.circle(256, 256, 20 + i * 8, 140 - i * 4, 50, 50);
    c.noise(70000, 0.09, r);
  }));

  return total;
}

/* -------- иконки -------- */
function icon(size, maskable) {
  return makeCanvasTex(size, (c, s) => {
    const r = seeded(size);
    // фон
    for (let y = 0; y < s; y++) {
      const k = y / s;
      const rr = 20 + k * 12, gg = 22 + k * 10, bb = 27 + k * 8;
      c.rect(0, y, s, 1, rr | 0, gg | 0, bb | 0);
    }
    const pad = maskable ? s * 0.14 : s * 0.04;
    // красная диагональная полоса
    for (let y = 0; y < s; y++) for (let x = 0; x < s * 0.42; x++) {
      const yy = y + x * 0.55;
      if (yy < s) c.set((x + pad * 0.6) | 0, yy | 0, 184, 52, 31);
    }
    // жёлтая полоса
    for (let y = 0; y < s; y++) for (let x = 0; x < s * 0.12; x++) {
      const yy = y + (x + s * 0.44) * 0.55;
      if (yy < s) c.set((x + s * 0.44 + pad * 0.6) | 0, yy | 0, 255, 194, 59);
    }
    // «пистолет» — простой силуэт
    const gx = s * 0.30, gy = s * 0.56, u = s * 0.055;
    c.rect(gx, gy, u * 5.4, u * 1.15, 22, 24, 28);
    c.rect(gx + u * 0.6, gy + u * 1.05, u * 1.15, u * 2.1, 22, 24, 28);
    c.rect(gx + u * 4.6, gy - u * 0.5, u * 0.4, u * 0.5, 22, 24, 28);
    // буквы DI
    const letter = (ox, shape) => {
      const t = s * 0.055;
      shape.forEach(([x, y, w, h]) => c.rect(ox + x * t, s * 0.16 + y * t, w * t, h * t, 244, 241, 232));
    };
    letter(s * 0.16, [[0, 0, 1.1, 6], [1.1, 0, 1.6, 1.1], [1.1, 4.9, 1.6, 1.1], [2.4, 1.1, 1.1, 3.8]]);
    letter(s * 0.52, [[0, 0, 1.1, 6]]);
    // шум/зерно
    c.noise((s * s * 0.06) | 0, 0.05, r);
  });
}
function icons() {
  let total = 0;
  [[192, false], [512, false], [512, true], [180, false], [32, false]].forEach(([sz, mask]) => {
    const name = mask ? 'icon-512-maskable.png' : (sz === 180 ? 'apple-touch-icon.png' : (sz === 32 ? 'favicon-32.png' : 'icon-' + sz + '.png'));
    total += writePNG(A('icons/' + name), sz, sz, icon(sz, mask));
  });
  return total;
}

/* ============================== ГЛАВНАЯ ============================== */
let grand = 0;
const t0 = Date.now();
console.log('Генерация ассетов DENI ISLAM…');
grand += ambience();   console.log('  audio/ambience.wav');
grand += menuMusic();  console.log('  audio/menu.wav');
grand += radioTracks();
grand += alarmLoop();  console.log('  audio/alarm_loop.wav');
grand += windLoop();   console.log('  audio/wind.wav');
grand += textures();   console.log('  tex/*.png (11 шт.)');
grand += icons();      console.log('  icons/*.png (5 шт.)');
console.log('Готово: ' + (grand / 1048576).toFixed(2) + ' МБ за ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
