/* DENI ISLAM — процедурные текстуры + библиотека 3D-моделей (мультяшно-суровый стиль) */
import * as THREE from '../vendor/three/three.module.js';

/* ================= ТЕКСТУРЫ (canvas) ================= */
function cnv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(canvas, rx, ry, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 4;
  if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(ctx, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (alpha || 0.06) + ')';
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export const TEX = {};
export function textures() {
  if (TEX.ready) return TEX;

  // асфальт
  let c = cnv(256, 256), g = c.getContext('2d');
  g.fillStyle = '#3a3a40'; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 9000, 0.10);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = 'rgba(20,20,22,' + (0.1 + Math.random() * 0.25) + ')';
    g.lineWidth = 0.5 + Math.random() * 2;
    g.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 90);
    g.stroke();
  }
  TEX.asphalt = tex(c, 1, 1);

  // тротуарная плитка
  c = cnv(256, 256); g = c.getContext('2d');
  g.fillStyle = '#7d7a72'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = 110 + Math.random() * 40;
    g.fillStyle = 'rgb(' + v + ',' + (v - 4) + ',' + (v - 14) + ')';
    g.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29);
  }
  noise(g, 256, 256, 4000, 0.07);
  TEX.paving = tex(c, 1, 1);

  // бетон / штукатурка
  c = cnv(256, 256); g = c.getContext('2d');
  g.fillStyle = '#9a938a'; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 12000, 0.09);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(60,55,50,' + Math.random() * 0.12 + ')';
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 22, 0, 7); g.fill();
  }
  TEX.concrete = tex(c, 1, 1);

  // кирпич
  c = cnv(256, 256); g = c.getContext('2d');
  g.fillStyle = '#6b3b30'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) {
      const off = (y % 2) * 16;
      const v = Math.random();
      g.fillStyle = v > 0.7 ? '#7d4636' : (v > 0.4 ? '#5f332a' : '#713d31');
      g.fillRect(x * 32 + off + 1, y * 16 + 1, 30, 14);
    }
  }
  noise(g, 256, 256, 5000, 0.1);
  TEX.brick = tex(c, 1, 1);

  // фасад с окнами
  c = cnv(512, 512); g = c.getContext('2d');
  g.fillStyle = '#8d8577'; g.fillRect(0, 0, 512, 512);
  noise(g, 512, 512, 8000, 0.06);
  for (let fy = 0; fy < 4; fy++) {
    for (let fx = 0; fx < 4; fx++) {
      const x = fx * 128 + 26, y = fy * 128 + 26;
      g.fillStyle = '#3b3a36'; g.fillRect(x - 6, y - 6, 88, 88);
      const lit = Math.random() < 0.22;
      g.fillStyle = lit ? '#ffd98a' : '#24313c';
      g.fillRect(x, y, 76, 76);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.beginPath(); g.moveTo(x, y + 76); g.lineTo(x + 76, y); g.lineTo(x + 76, y + 22); g.lineTo(x + 22, y + 76); g.fill();
      g.fillStyle = '#5c5a52'; g.fillRect(x + 36, y, 4, 76); g.fillRect(x, y + 36, 76, 4);
      g.fillStyle = '#6e6a60'; g.fillRect(x - 10, y + 76, 96, 8);
    }
  }
  TEX.facade = tex(c, 1, 1);

  // дерево
  c = cnv(256, 256); g = c.getContext('2d');
  g.fillStyle = '#8a5f38'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = 'rgba(' + (60 + Math.random() * 60) + ',40,20,' + (0.1 + Math.random() * 0.3) + ')';
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    const y = Math.random() * 256;
    g.moveTo(0, y);
    g.bezierCurveTo(80, y + (Math.random() - 0.5) * 18, 170, y + (Math.random() - 0.5) * 18, 256, y + (Math.random() - 0.5) * 10);
    g.stroke();
  }
  TEX.wood = tex(c, 1, 1);

  // паркет
  c = cnv(256, 256); g = c.getContext('2d');
  g.fillStyle = '#7a5330'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 120 + Math.random() * 45;
    g.fillStyle = 'rgb(' + v + ',' + Math.floor(v * 0.66) + ',' + Math.floor(v * 0.38) + ')';
    g.fillRect(x * 64 + 1, y * 64 + 1, 62, 62);
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.strokeRect(x * 64 + 1, y * 64 + 1, 62, 62);
  }
  TEX.parquet = tex(c, 1, 1);

  // мрамор
  c = cnv(256, 256); g = c.getContext('2d');
  g.fillStyle = '#e6e2d8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 22; i++) {
    g.strokeStyle = 'rgba(150,145,135,' + (0.1 + Math.random() * 0.35) + ')';
    g.lineWidth = 0.6 + Math.random() * 2.4;
    g.beginPath();
    let x = Math.random() * 256, y = 0;
    g.moveTo(x, y);
    while (y < 256) { x += (Math.random() - 0.5) * 40; y += 20 + Math.random() * 30; g.lineTo(x, y); }
    g.stroke();
  }
  noise(g, 256, 256, 2500, 0.05);
  TEX.marble = tex(c, 1, 1);

  // ковёр
  c = cnv(128, 128); g = c.getContext('2d');
  g.fillStyle = '#7b2b2b'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#c9a24a'; g.lineWidth = 3;
  g.strokeRect(8, 8, 112, 112); g.strokeRect(18, 18, 92, 92);
  noise(g, 128, 128, 3000, 0.08);
  TEX.carpet = tex(c, 1, 1);

  // металл (решётка/сейф)
  c = cnv(128, 128); g = c.getContext('2d');
  g.fillStyle = '#585f66'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 8) {
    g.fillStyle = 'rgba(255,255,255,' + (0.02 + Math.random() * 0.05) + ')';
    g.fillRect(0, i, 128, 2);
  }
  noise(g, 128, 128, 3000, 0.08);
  TEX.metal = tex(c, 1, 1);

  // деньги (пачка)
  c = cnv(128, 64); g = c.getContext('2d');
  g.fillStyle = '#3f7a45'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#5aa05f'; g.fillRect(4, 4, 120, 56);
  g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(64, 32, 15, 0, 7); g.fill();
  g.fillStyle = '#2f5c34'; g.font = 'bold 13px monospace'; g.fillText('100', 8, 20); g.fillText('100', 100, 56);
  g.strokeStyle = '#c9b47a'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 32); g.lineTo(128, 32); g.stroke();
  TEX.cash = tex(c, 1, 1);

  // трава/грязь
  c = cnv(256, 256); g = c.getContext('2d');
  g.fillStyle = '#4c5a35'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.6 ? '#5d6e3f' : (v > 0.3 ? '#414e2d' : '#6b6a45');
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  TEX.grass = tex(c, 1, 1);

  // жесть/крыша
  c = cnv(128, 128); g = c.getContext('2d');
  g.fillStyle = '#4a4e55'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 16) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i, 0, 3, 128); }
  noise(g, 128, 128, 2500, 0.07);
  TEX.roof = tex(c, 1, 1);

  // неоновая вывеска
  c = cnv(512, 128); g = c.getContext('2d');
  g.fillStyle = '#17131a'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ff3b5c'; g.lineWidth = 5; g.strokeRect(10, 10, 492, 108);
  g.fillStyle = '#ffd23b'; g.font = 'bold 62px Impact, sans-serif';
  g.textAlign = 'center'; g.fillText('ОРУЖИЕ 24/7', 256, 84);
  TEX.gunSign = tex(c, 1, 1, true);
  TEX.gunSign.wrapS = TEX.gunSign.wrapT = THREE.ClampToEdgeWrapping;

  c = cnv(1024, 256); g = c.getContext('2d');
  g.fillStyle = '#101820'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#e8c66a'; g.font = 'bold 128px Georgia, serif';
  g.textAlign = 'center'; g.fillText('DENI ISLAM BANK', 512, 172);
  g.strokeStyle = '#e8c66a'; g.lineWidth = 6; g.strokeRect(18, 18, 988, 220);
  TEX.bankSign = tex(c, 1, 1, true);
  TEX.bankSign.wrapS = TEX.bankSign.wrapT = THREE.ClampToEdgeWrapping;

  TEX.ready = true;
  return TEX;
}

/* Подмена процедурных текстур на файловые (1024² PNG из assets/tex) —
   качество выше, стиль тот же. Если файла нет — остаётся canvas-вариант. */
const TEX_MAP = [
  ['asphalt', 'asphalt', 42, 42], ['paving', 'paving', 40, 40], ['brick', 'brick', 6, 3],
  ['concrete', 'concrete', 6, 6], ['facade', 'facade', 3, 3], ['wood', 'wood', 4, 4],
  ['marble', 'marble', 8, 6], ['metal', 'metal', 6, 6], ['parquet', 'parquet', 4, 3],
  ['roof', 'roof', 5, 5], ['carpet', 'carpet', 1, 1]
];
export function loadFileTextures(onProgress) {
  const loader = new THREE.TextureLoader();
  let done = 0;
  TEX_MAP.forEach(([key, file, rx, ry]) => {
    loader.load('assets/tex/' + file + '.png', t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.repeat.set(rx, ry);
      const old = TEX[key];
      TEX[key] = t;
      if (old) old.dispose();
      done++;
      if (onProgress) onProgress(done, TEX_MAP.length);
    }, undefined, () => { done++; if (onProgress) onProgress(done, TEX_MAP.length); });
  });
}

/* ================= МАТЕРИАЛЫ ================= */
const MAT = {};
export function mat(key, opts) {
  if (!MAT[key]) MAT[key] = new THREE.MeshLambertMaterial(opts);
  return MAT[key];
}
const _STD = new Map();
/* ВАЖНО: материалы кэшируются. Без этого каждый меш тащил свой материал и
   three.js не мог склеить draw call'ы — на телефоне были бы лаги. */
export function stdMat(color, rough, metal) {
  const r = rough == null ? 0.85 : rough, m = metal == null ? 0.05 : metal;
  const key = color + '|' + r + '|' + m;
  let v = _STD.get(key);
  if (!v) { v = new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m }); _STD.set(key, v); }
  return v;
}
export function stdMatCount() { return _STD.size; }

const _BASIC = new Map();
export function basicMat(color) {
  let v = _BASIC.get(color);
  if (!v) { v = new THREE.MeshBasicMaterial({ color }); _BASIC.set(color, v); }
  return v;
}
const C = {
  skin: 0xe8b48c, skinDark: 0xc68e62, skinOld: 0xddab86,
  suit: 0x1d2129, shirt: 0xf2f2ee, tie: 0x9c1f27, hat: 0x14161b, shoe: 0x101014,
  track: 0x1f4d8f, trackStripe: 0xe8e8e8, cap: 0x22262e,
  cop: 0x24344f, copShirt: 0x33456b, copHat: 0x141a26,
  guard: 0x2b2f36, guardShirt: 0x59606b,
  granny: 0x7a5f8c, grandpa: 0x6b5a3f,
  thug: 0x3a2b2b, seller: 0x6d2f2f,
  money: 0x4d8a52, gold: 0xd9b04a, steel: 0x8d949c
};
export { C };

/* ================= МЕЛОЧИ ================= */
function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, material, x, y, z, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 10), material);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ============ КРОВАТЬ ============ */
export function makeBed(frameColor) {
  const g = new THREE.Group();
  const frame = stdMat(frameColor || 0x5b3d28, 0.9);
  const sheet = stdMat(0xd9d4c6, 0.95);
  const blanket = stdMat(0x7b2b2b, 0.95);
  const pillow = stdMat(0xf0ece0, 0.95);
  g.add(box(1.05, 0.32, 2.1, frame, 0, 0.24, 0));
  g.add(box(1.1, 0.14, 2.15, sheet, 0, 0.46, 0));
  g.add(box(1.08, 0.12, 1.25, blanket, 0, 0.55, 0.36));
  g.add(box(0.72, 0.16, 0.4, pillow, 0, 0.56, -0.78));
  g.add(box(1.1, 0.8, 0.1, frame, 0, 0.72, -1.05));
  g.add(box(1.1, 0.5, 0.1, frame, 0, 0.55, 1.05));
  for (const s of [[-0.48, -0.95], [0.48, -0.95], [-0.48, 0.95], [0.48, 0.95]]) {
    g.add(box(0.1, 0.24, 0.1, frame, s[0], 0.12, s[1]));
  }
  return g;
}

/* ============ ШКАФ ============ */
export function makeWardrobe() {
  const g = new THREE.Group();
  const w = stdMat(0x6a4a2c, 0.9);
  const dark = stdMat(0x3d2a19, 0.9);
  g.add(box(1.5, 2.3, 0.62, w, 0, 1.15, 0));
  g.add(box(0.66, 2.1, 0.06, dark, -0.36, 1.15, 0.32));
  g.add(box(0.66, 2.1, 0.06, dark, 0.36, 1.15, 0.32));
  g.add(cyl(0.035, 0.035, 0.12, stdMat(C.gold, 0.3, 0.8), -0.08, 1.2, 0.37));
  g.add(cyl(0.035, 0.035, 0.12, stdMat(C.gold, 0.3, 0.8), 0.08, 1.2, 0.37));
  g.add(box(1.56, 0.12, 0.66, w, 0, 2.34, 0));
  g.add(box(1.4, 0.08, 0.06, stdMat(0x8a6a3c), 0, 0.9, 0.33));
  return g;
}

/* ============ МЕБЕЛЬ ДОМА ============ */
export function makeSofa() {
  const g = new THREE.Group();
  const f = stdMat(0x4a5a44, 0.95);
  g.add(box(2.4, 0.45, 0.95, f, 0, 0.3, 0));
  g.add(box(2.4, 0.75, 0.22, f, 0, 0.72, -0.38));
  g.add(box(0.22, 0.62, 0.95, f, -1.1, 0.55, 0));
  g.add(box(0.22, 0.62, 0.95, f, 1.1, 0.55, 0));
  g.add(box(1.05, 0.18, 0.8, stdMat(0x5c6d54), -0.55, 0.6, 0.02));
  g.add(box(1.05, 0.18, 0.8, stdMat(0x5c6d54), 0.55, 0.6, 0.02));
  return g;
}
export function makeTable() {
  const g = new THREE.Group();
  const w = stdMat(0x7a5330, 0.85);
  g.add(box(1.5, 0.09, 0.9, w, 0, 0.76, 0));
  for (const s of [[-0.66, -0.36], [0.66, -0.36], [-0.66, 0.36], [0.66, 0.36]]) g.add(box(0.09, 0.76, 0.09, w, s[0], 0.38, s[1]));
  return g;
}
export function makeTV() {
  const g = new THREE.Group();
  g.add(box(1.5, 0.86, 0.09, stdMat(0x111318, 0.5), 0, 1.15, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 0.74), basicMat(0x2d5f7a));
  scr.position.set(0, 1.15, 0.05); g.add(scr);
  g.add(box(1.9, 0.5, 0.45, stdMat(0x5b3d28, 0.9), 0, 0.25, 0));
  return g;
}
export function makeFridge() {
  const g = new THREE.Group();
  g.add(box(0.8, 1.9, 0.75, stdMat(0xdadde0, 0.4, 0.3), 0, 0.95, 0));
  g.add(box(0.74, 0.02, 0.02, stdMat(0x999), 0, 1.25, 0.38));
  g.add(box(0.05, 0.34, 0.05, stdMat(0x666, 0.4, 0.6), 0.3, 1.5, 0.4));
  g.add(box(0.05, 0.34, 0.05, stdMat(0x666, 0.4, 0.6), 0.3, 0.85, 0.4));
  return g;
}
export function makeRug(w, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat('carpet', { map: TEX.carpet }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.015; m.receiveShadow = true;
  return m;
}
export function makeLampPost() {
  const g = new THREE.Group();
  g.add(cyl(0.09, 0.13, 5.4, stdMat(0x2f343a, 0.6, 0.4), 0, 2.7, 0));
  g.add(box(0.9, 0.09, 0.09, stdMat(0x2f343a, 0.6, 0.4), 0.4, 5.3, 0));
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), basicMat(0xffe6a8));
  head.position.set(0.8, 5.2, 0); g.add(head);
  return g;
}
export function makeTree() {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.24, 2.2, stdMat(0x54402c, 0.95), 0, 1.1, 0, 7));
  const leaf = stdMat(0x3f5c2c, 0.95);
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 0), leaf).translateY(2.7));
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), leaf).translateX(0.6).translateY(3.4));
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), leaf).translateX(-0.55).translateY(3.1));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function makeTrash() {
  const g = new THREE.Group();
  g.add(cyl(0.34, 0.3, 0.9, stdMat(0x3c4a3a, 0.9), 0, 0.45, 0, 9));
  g.add(cyl(0.36, 0.36, 0.08, stdMat(0x2b352a, 0.9), 0, 0.92, 0, 9));
  return g;
}
export function makeCar(color) {
  const g = new THREE.Group();
  const body = stdMat(color, 0.55, 0.25);
  const glass = stdMat(0x22303c, 0.2, 0.6);
  g.add(box(1.9, 0.6, 4.3, body, 0, 0.62, 0));
  g.add(box(1.7, 0.62, 2.2, body, 0, 1.2, -0.15));
  g.add(box(1.72, 0.42, 0.9, glass, 0, 1.24, 0.9));
  g.add(box(1.72, 0.42, 0.8, glass, 0, 1.24, -1.2));
  const wheel = stdMat(0x14161a, 0.95);
  for (const s of [[-0.92, 1.35], [0.92, 1.35], [-0.92, -1.35], [0.92, -1.35]]) {
    const w = cyl(0.36, 0.36, 0.26, wheel, s[0], 0.36, s[1], 12);
    w.rotation.z = Math.PI / 2; g.add(w);
  }
  const lightM = basicMat(0xfff2c4);
  g.add(box(0.4, 0.2, 0.08, lightM, -0.6, 0.72, 2.16));
  g.add(box(0.4, 0.2, 0.08, lightM, 0.6, 0.72, 2.16));
  g.add(box(0.4, 0.18, 0.08, basicMat(0xff3b30), -0.6, 0.72, -2.16));
  g.add(box(0.4, 0.18, 0.08, basicMat(0xff3b30), 0.6, 0.72, -2.16));
  return g;
}
export function makeTruck() {
  const g = new THREE.Group();
  const cab = stdMat(0x9c3a2a, 0.7);
  const trailer = stdMat(0x5b6169, 0.8);
  g.add(box(2.4, 2.1, 2.4, cab, 0, 1.45, -2.4));
  g.add(box(2.2, 0.9, 0.1, stdMat(0x22303c, 0.2, 0.6), 0, 1.85, -3.6));
  g.add(box(2.6, 2.6, 5.0, trailer, 0, 1.7, 1.4));
  g.add(box(2.62, 0.14, 5.02, stdMat(0x3d4249), 0, 3.02, 1.4));
  const wheel = stdMat(0x14161a, 0.95);
  for (const s of [[-1.15, -2.6], [1.15, -2.6], [-1.15, 0.6], [1.15, 0.6], [-1.15, 2.6], [1.15, 2.6]]) {
    const w = cyl(0.52, 0.52, 0.34, wheel, s[0], 0.52, s[1], 12);
    w.rotation.z = Math.PI / 2; g.add(w);
  }
  return g;
}
export function makeCrate() {
  const g = new THREE.Group();
  const w = stdMat(0x9a703c, 0.9);
  g.add(box(0.62, 0.62, 0.62, w, 0, 0.31, 0));
  const d = stdMat(0x6d4c26, 0.9);
  g.add(box(0.66, 0.09, 0.06, d, 0, 0.12, 0.31));
  g.add(box(0.66, 0.09, 0.06, d, 0, 0.5, 0.31));
  g.add(box(0.06, 0.66, 0.09, d, 0.31, 0.31, 0.31));
  return g;
}
export function makeMoneyStack(w, h, d) {
  const g = new THREE.Group();
  const m = mat('cash', { map: TEX.cash });
  const b = new THREE.Mesh(new THREE.BoxGeometry(w || 0.42, h || 0.13, d || 0.24), m);
  b.castShadow = true;
  g.add(b);
  return g;
}
export function makeMoneyPile(count) {
  const g = new THREE.Group();
  const m = mat('cash', { map: TEX.cash });
  const geo = new THREE.BoxGeometry(0.42, 0.12, 0.24);
  for (let i = 0; i < (count || 14); i++) {
    const s = new THREE.Mesh(geo, m);
    s.position.set((Math.random() - 0.5) * 1.1, 0.06 + Math.floor(i / 5) * 0.125, (Math.random() - 0.5) * 0.7);
    s.rotation.y = (Math.random() - 0.5) * 0.5;
    s.castShadow = true;
    g.add(s);
  }
  return g;
}
export function makeBag() {
  const g = new THREE.Group();
  const f = stdMat(0x3b3f45, 0.95);
  g.add(box(0.5, 0.42, 0.32, f, 0, 0.21, 0));
  g.add(box(0.52, 0.1, 0.34, stdMat(0x2a2d33), 0, 0.44, 0));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 12, Math.PI), stdMat(0x22252a));
  handle.position.set(0, 0.48, 0); g.add(handle);
  g.add(box(0.2, 0.14, 0.02, stdMat(C.money, 0.9), 0, 0.24, 0.17));
  return g;
}

/* ============ ОРУЖИЕ (похожие на реальные силуэты) ============ */
const gunMats = {
  black: stdMat(0x1b1d21, 0.55, 0.35),
  dark: stdMat(0x2a2d33, 0.6, 0.3),
  wood: stdMat(0x6b4526, 0.85, 0.05),
  steel: stdMat(0x767d85, 0.35, 0.75),
  chrome: stdMat(0xb9c0c7, 0.18, 0.9),
  green: stdMat(0x3d4a33, 0.7, 0.2),
  rubber: stdMat(0x14161a, 0.95, 0.0)
};
function gunPart(g, geo, m, x, y, z, rx, ry, rz) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  if (rx) mesh.rotation.x = rx; if (ry) mesh.rotation.y = ry; if (rz) mesh.rotation.z = rz;
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
export function makeGun(id) {
  const g = new THREE.Group();
  const B = new THREE.BoxGeometry(1, 1, 1);
  const Cy = (r, h, s) => new THREE.CylinderGeometry(r, r, h, s || 10);
  if (id === 'glock') {
    gunPart(g, B, gunMats.dark, 0.035, 0.06, 0.05).scale.set(0.055, 0.1, 0.3);      // затвор
    gunPart(g, B, gunMats.rubber, 0.035, 0.005, 0.02).scale.set(0.05, 0.055, 0.26);   // рамка
    const grip = gunPart(g, B, gunMats.rubber, 0.035, -0.08, -0.06); grip.scale.set(0.05, 0.13, 0.07); grip.rotation.x = 0.28;
    gunPart(g, Cy(0.012, 0.28), gunMats.black, 0.035, 0.055, 0.16, Math.PI / 2);      // ствол
    gunPart(g, B, gunMats.black, 0.035, 0.1, 0.19).scale.set(0.012, 0.018, 0.012);    // мушка
    gunPart(g, B, gunMats.black, 0.035, 0.1, -0.05).scale.set(0.03, 0.016, 0.012);
    gunPart(g, B, gunMats.steel, 0.035, -0.01, 0.09).scale.set(0.03, 0.02, 0.03);
  } else if (id === 'deagle') {
    gunPart(g, B, gunMats.chrome, 0.04, 0.07, 0.09).scale.set(0.065, 0.11, 0.36);
    gunPart(g, B, gunMats.steel, 0.04, 0.0, 0.06).scale.set(0.06, 0.06, 0.3);
    const grip = gunPart(g, B, gunMats.rubber, 0.04, -0.1, -0.05); grip.scale.set(0.058, 0.16, 0.085); grip.rotation.x = 0.2;
    gunPart(g, Cy(0.017, 0.34), gunMats.chrome, 0.04, 0.07, 0.24, Math.PI / 2);
    gunPart(g, B, gunMats.black, 0.04, 0.135, 0.26).scale.set(0.014, 0.022, 0.014);
    gunPart(g, B, gunMats.black, 0.04, 0.135, -0.06).scale.set(0.04, 0.02, 0.014);
  } else if (id === 'mp5') {
    gunPart(g, B, gunMats.black, 0.04, 0.05, 0.05).scale.set(0.075, 0.11, 0.44);      // ресивер
    gunPart(g, Cy(0.016, 0.3), gunMats.black, 0.04, 0.05, 0.36, Math.PI / 2);         // ствол в кожухе
    gunPart(g, Cy(0.03, 0.2), gunMats.dark, 0.04, 0.05, 0.24, Math.PI / 2);
    const mag = gunPart(g, B, gunMats.dark, 0.04, -0.11, 0.06); mag.scale.set(0.045, 0.2, 0.07); mag.rotation.x = 0.18;
    const grip = gunPart(g, B, gunMats.rubber, 0.04, -0.09, -0.07); grip.scale.set(0.05, 0.14, 0.06); grip.rotation.x = 0.3;
    gunPart(g, B, gunMats.rubber, 0.04, 0.02, -0.2).scale.set(0.05, 0.09, 0.2);       // приклад
    gunPart(g, B, gunMats.rubber, 0.04, -0.03, -0.3).scale.set(0.04, 0.05, 0.06);
    gunPart(g, Cy(0.011, 0.16), gunMats.dark, 0.04, -0.02, 0.24, Math.PI / 2, 0, 0);  // цевьё
    gunPart(g, B, gunMats.black, 0.04, 0.115, 0.2).scale.set(0.02, 0.02, 0.02);
  } else if (id === 'ak') {
    gunPart(g, B, gunMats.steel, 0.04, 0.06, 0.02).scale.set(0.07, 0.1, 0.42);        // ствольная коробка
    gunPart(g, Cy(0.014, 0.46), gunMats.black, 0.04, 0.06, 0.42, Math.PI / 2);        // ствол
    gunPart(g, B, gunMats.wood, 0.04, 0.02, 0.3).scale.set(0.06, 0.07, 0.2);          // цевьё
    const mag = gunPart(g, B, gunMats.dark, 0.04, -0.11, 0.05); mag.scale.set(0.045, 0.24, 0.09); mag.rotation.x = 0.32;
    const stock = gunPart(g, B, gunMats.wood, 0.04, 0.03, -0.28); stock.scale.set(0.05, 0.1, 0.26); stock.rotation.x = -0.1;
    const grip = gunPart(g, B, gunMats.wood, 0.04, -0.07, -0.08); grip.scale.set(0.045, 0.14, 0.055); grip.rotation.x = 0.35;
    gunPart(g, B, gunMats.black, 0.04, 0.14, 0.36).scale.set(0.012, 0.03, 0.012);     // мушка
    gunPart(g, B, gunMats.black, 0.04, 0.13, -0.1).scale.set(0.03, 0.024, 0.012);     // прицел
    gunPart(g, Cy(0.02, 0.06), gunMats.black, 0.04, 0.06, 0.66, Math.PI / 2);         // ДТК
  } else if (id === 'm4') {
    gunPart(g, B, gunMats.dark, 0.04, 0.06, 0.02).scale.set(0.068, 0.1, 0.4);
    gunPart(g, Cy(0.013, 0.44), gunMats.black, 0.04, 0.06, 0.42, Math.PI / 2);
    gunPart(g, B, gunMats.rubber, 0.04, 0.055, 0.28).scale.set(0.055, 0.075, 0.26);   // цевьё rails
    for (let i = 0; i < 5; i++) gunPart(g, B, gunMats.black, 0.04, 0.1, 0.18 + i * 0.05).scale.set(0.05, 0.012, 0.02);
    const mag = gunPart(g, B, gunMats.dark, 0.04, -0.1, 0.04); mag.scale.set(0.045, 0.22, 0.075); mag.rotation.x = 0.08;
    gunPart(g, B, gunMats.rubber, 0.04, 0.04, -0.26).scale.set(0.05, 0.09, 0.24);     // телескоп приклад
    gunPart(g, B, gunMats.rubber, 0.04, 0.03, -0.39).scale.set(0.055, 0.11, 0.04);
    const grip = gunPart(g, B, gunMats.rubber, 0.04, -0.06, -0.07); grip.scale.set(0.045, 0.13, 0.055); grip.rotation.x = 0.25;
    gunPart(g, B, gunMats.black, 0.04, 0.14, 0.06).scale.set(0.03, 0.05, 0.09);       // коллиматор
    gunPart(g, B, gunMats.black, 0.04, 0.12, 0.44).scale.set(0.012, 0.028, 0.012);
  } else if (id === 'shotgun') {
    gunPart(g, B, gunMats.steel, 0.04, 0.055, 0.0).scale.set(0.07, 0.1, 0.4);
    gunPart(g, Cy(0.019, 0.62), gunMats.black, 0.04, 0.055, 0.5, Math.PI / 2);        // ствол
    gunPart(g, Cy(0.016, 0.5), gunMats.dark, 0.04, -0.005, 0.44, Math.PI / 2);        // магазин
    gunPart(g, B, gunMats.wood, 0.04, -0.005, 0.28).scale.set(0.06, 0.075, 0.2);      // цевьё
    const stock = gunPart(g, B, gunMats.wood, 0.04, 0.0, -0.26); stock.scale.set(0.055, 0.13, 0.28); stock.rotation.x = -0.12;
    const grip = gunPart(g, B, gunMats.wood, 0.04, -0.07, -0.08); grip.scale.set(0.045, 0.14, 0.06); grip.rotation.x = 0.3;
    gunPart(g, B, gunMats.black, 0.04, 0.12, 0.5).scale.set(0.012, 0.024, 0.012);
  } else if (id === 'baton') {
    gunPart(g, Cy(0.022, 0.6), gunMats.rubber, 0, 0, 0.2, Math.PI / 2);
    gunPart(g, Cy(0.03, 0.14), gunMats.dark, 0, 0, -0.05, Math.PI / 2);
  } else if (id === 'pipe') {
    gunPart(g, Cy(0.028, 0.72), gunMats.steel, 0, 0, 0.24, Math.PI / 2);
  } else {
    // кулаки
    gunPart(g, new THREE.SphereGeometry(0.055, 8, 6), gunMats.rubber, 0, 0, 0.03);
  }
  g.userData.gunId = id;
  return g;
}
export function makeAmmoBox(cls) {
  const g = new THREE.Group();
  const colors = { pistol: 0x8a6a3c, rifle: 0x4a5a3a, smg: 0x7a5a3c, shotgun: 0x8a3a2a };
  g.add(box(0.3, 0.18, 0.22, stdMat(colors[cls] || 0x8a6a3c, 0.9), 0, 0.09, 0));
  for (let i = 0; i < 6; i++) g.add(cyl(0.012, 0.012, 0.07, stdMat(C.gold, 0.3, 0.8), -0.1 + (i % 3) * 0.1, 0.2, -0.05 + Math.floor(i / 3) * 0.1, 6));
  return g;
}

/* ============ ДВЕРЬ ============ */
export function makeDoor(w, h, color) {
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  const d = box(w, h || 2.15, 0.09, stdMat(color || 0x6b4526, 0.85), w / 2, (h || 2.15) / 2, 0);
  pivot.add(d);
  pivot.add(cyl(0.035, 0.035, 0.06, stdMat(C.gold, 0.3, 0.8), w - 0.18, (h || 2.15) * 0.5, 0.07, 8).rotateX(Math.PI / 2));
  g.add(pivot);
  g.userData.pivot = pivot;
  return g;
}
