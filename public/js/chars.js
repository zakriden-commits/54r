/* DENI ISLAM — персонажи: джентльмен, гопник, жители, копы, охрана, кассирша, продавец */
import * as THREE from '../vendor/three/three.module.js';
import { stdMat, makeGun, C } from './models.js';

const M = {
  skin: stdMat(C.skin, 0.9), skinDark: stdMat(C.skinDark, 0.9), skinOld: stdMat(C.skinOld, 0.9),
  suit: stdMat(C.suit, 0.85), shirt: stdMat(C.shirt, 0.9), tie: stdMat(C.tie, 0.8),
  hat: stdMat(C.hat, 0.8), shoe: stdMat(C.shoe, 0.7),
  track: stdMat(C.track, 0.9), stripe: stdMat(C.trackStripe, 0.9), cap: stdMat(C.cap, 0.9),
  cop: stdMat(C.cop, 0.85), copShirt: stdMat(C.copShirt, 0.85), copHat: stdMat(C.copHat, 0.8),
  guard: stdMat(C.guard, 0.85), guardShirt: stdMat(C.guardShirt, 0.85),
  granny: stdMat(C.granny, 0.95), grandpa: stdMat(C.grandpa, 0.9),
  thug: stdMat(C.thug, 0.9), seller: stdMat(C.seller, 0.9),
  apron: stdMat(0x2f3a52, 0.9), white: stdMat(0xf4f4f0, 0.9),
  grey: stdMat(0x8a8f96, 0.9), dark: stdMat(0x23262b, 0.9),
  gold: stdMat(C.gold, 0.35, 0.7), wood: stdMat(0x6b4526, 0.9),
  hairBlack: stdMat(0x1b1712, 0.95), hairGrey: stdMat(0xb9b4ac, 0.95),
  mustache: stdMat(0x2a2118, 0.95), vest: stdMat(0xffb43b, 0.9)
};

function bx(w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x || 0, y || 0, z || 0);
  o.castShadow = true;
  return o;
}
function cy(rt, rb, h, m, x, y, z, s) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s || 10), m);
  o.position.set(x || 0, y || 0, z || 0);
  o.castShadow = true;
  return o;
}
function sp(r, m, x, y, z, s) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, s || 10, (s || 10) - 2), m);
  o.position.set(x || 0, y || 0, z || 0);
  o.castShadow = true;
  return o;
}

/* ---------- базовый скелет ---------- */
function baseRig(opts) {
  const o = opts || {};
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const p = {};

  // ноги
  p.legL = new THREE.Group(); p.legR = new THREE.Group();
  p.legL.position.set(-0.11, 0.86, 0); p.legR.position.set(0.11, 0.86, 0);
  const pantsM = o.pants || M.dark;
  p.legL.add(bx(0.17, 0.5, 0.19, pantsM, 0, -0.28, 0));
  p.legR.add(bx(0.17, 0.5, 0.19, pantsM, 0, -0.28, 0));
  p.legL.add(bx(0.19, 0.42, 0.21, pantsM, 0, -0.66, 0));
  p.legR.add(bx(0.19, 0.42, 0.21, pantsM, 0, -0.66, 0));
  p.legL.add(bx(0.2, 0.11, 0.3, o.shoes || M.shoe, 0, -0.83, 0.04));
  p.legR.add(bx(0.2, 0.11, 0.3, o.shoes || M.shoe, 0, -0.83, 0.04));
  inner.add(p.legL); inner.add(p.legR);

  // таз/торс
  p.torso = new THREE.Group();
  p.torso.position.set(0, 0.9, 0);
  inner.add(p.torso);

  // руки
  p.armL = new THREE.Group(); p.armR = new THREE.Group();
  p.armL.position.set(-0.25, 1.42, 0); p.armR.position.set(0.25, 1.42, 0);
  inner.add(p.armL); inner.add(p.armR);

  // голова
  p.head = new THREE.Group();
  p.head.position.set(0, 1.62, 0);
  inner.add(p.head);

  g.userData.p = p;
  g.userData.inner = inner;
  return g;
}

function addArms(g, sleeve, cuff, skin, thick) {
  const p = g.userData.p;
  const t = thick || 0.135;
  for (const side of [p.armL, p.armR]) {
    side.add(bx(t, 0.34, t + 0.01, sleeve, 0, -0.19, 0));
    side.add(bx(t * 0.94, 0.3, t * 0.95, sleeve, 0, -0.5, 0));
    side.add(sp(t * 0.62, skin || cuff || M.skin, 0, -0.68, 0));
    if (cuff) side.add(bx(t * 1.08, 0.06, t * 1.05, cuff, 0, -0.36, 0));
  }
}
function head(g, skin, opts) {
  const o = opts || {};
  const p = g.userData.p;
  const h = bx(0.3, 0.34, 0.29, skin, 0, 0.17, 0);
  p.head.add(h);
  p.head.add(bx(0.31, 0.1, 0.3, o.hair || M.hairBlack, 0, 0.33, -0.01));
  // глаза
  const eyeW = bx(0.055, 0.045, 0.02, M.white, -0.075, 0.2, 0.145);
  const eyeW2 = bx(0.055, 0.045, 0.02, M.white, 0.075, 0.2, 0.145);
  p.head.add(eyeW); p.head.add(eyeW2);
  p.head.add(bx(0.026, 0.028, 0.02, M.dark, -0.075, 0.2, 0.157));
  p.head.add(bx(0.026, 0.028, 0.02, M.dark, 0.075, 0.2, 0.157));
  if (!o.noBrows) {
    p.head.add(bx(0.075, 0.018, 0.02, o.brow || M.hairBlack, -0.075, 0.255, 0.15));
    p.head.add(bx(0.075, 0.018, 0.02, o.brow || M.hairBlack, 0.075, 0.255, 0.15));
  }
  p.head.add(bx(0.055, 0.05, 0.04, skin, 0, 0.14, 0.16));   // нос
  p.head.add(bx(0.1, 0.02, 0.02, M.dark, 0, 0.055, 0.15));   // рот
  return p.head;
}

/* ================= ДЖЕНТЛЬМЕН (игрок, слот 0) ================= */
export function makeGentleman() {
  const g = baseRig({ pants: M.suit, shoes: M.shoe });
  const p = g.userData.p;
  // torso: жилет + пиджак + белая рубашка + галстук
  p.torso.add(bx(0.46, 0.62, 0.28, M.suit, 0, 0.53, 0));
  p.torso.add(bx(0.3, 0.5, 0.06, M.shirt, 0, 0.56, 0.14));
  p.torso.add(bx(0.09, 0.36, 0.03, M.tie, 0, 0.52, 0.175));
  p.torso.add(bx(0.055, 0.055, 0.03, M.gold, 0, 0.72, 0.18)); // заколка галстука
  p.torso.add(bx(0.5, 0.1, 0.3, M.suit, 0, 0.84, 0));          // плечи
  p.torso.add(bx(0.2, 0.05, 0.24, M.shirt, 0, 0.87, 0.02));    // воротник
  p.torso.add(bx(0.05, 0.05, 0.02, M.gold, 0.16, 0.62, 0.15)); // запонка-значок
  // фалды пиджака
  p.torso.add(bx(0.44, 0.26, 0.26, M.suit, 0, 0.13, -0.01));
  addArms(g, M.suit, M.shirt, M.skin, 0.14);
  // белые перчатки
  p.armL.children[2].material = M.white; p.armR.children[2].material = M.white;
  head(g, M.skin, { hair: M.hairBlack, brow: M.hairBlack });
  // усы
  p.head.add(bx(0.13, 0.028, 0.03, M.mustache, 0, 0.09, 0.15));
  // котелок
  p.head.add(cy(0.17, 0.17, 0.19, M.hat, 0, 0.44, 0, 12));
  p.head.add(cy(0.25, 0.25, 0.025, M.hat, 0, 0.355, 0, 14));
  p.head.add(cy(0.172, 0.172, 0.035, M.tie, 0, 0.375, 0, 12));
  // монокль
  const mono = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 14), M.gold);
  mono.position.set(0.075, 0.2, 0.16); p.head.add(mono);
  // трость
  const cane = new THREE.Group();
  cane.add(cy(0.018, 0.018, 0.85, M.wood, 0, -0.42, 0, 8));
  cane.add(sp(0.045, M.gold, 0, 0.02, 0, 8));
  cane.position.set(0, -0.6, 0.06);
  cane.rotation.x = 0.15;
  p.armR.add(cane);
  g.userData.cane = cane;
  g.userData.type = 'gentleman';
  return g;
}

/* ================= ГОПНИК (игрок, слот 1) ================= */
export function makeGopnik() {
  const g = baseRig({ pants: M.track, shoes: stdMat(0x2b2f36, 0.8) });
  const p = g.userData.p;
  p.torso.add(bx(0.48, 0.6, 0.3, M.track, 0, 0.52, 0));
  p.torso.add(bx(0.1, 0.5, 0.05, M.stripe, -0.12, 0.55, 0.155));
  p.torso.add(bx(0.1, 0.5, 0.05, M.stripe, 0.12, 0.55, 0.155));
  p.torso.add(bx(0.14, 0.16, 0.06, M.white, 0, 0.72, 0.15)); // майка
  p.torso.add(bx(0.52, 0.1, 0.32, M.track, 0, 0.83, 0));
  p.torso.add(bx(0.46, 0.22, 0.28, M.track, 0, 0.12, -0.01));
  // капюшон сзади
  p.torso.add(bx(0.3, 0.18, 0.16, M.track, 0, 0.9, -0.14));
  addArms(g, M.track, M.stripe, M.skinDark, 0.145);
  // полоски на рукавах
  for (const a of [p.armL, p.armR]) a.add(bx(0.155, 0.3, 0.02, M.stripe, 0, -0.2, 0.075));
  // спортивные штаны с полосками
  for (const l of [p.legL, p.legR]) {
    l.add(bx(0.02, 0.85, 0.02, M.stripe, -0.09, -0.45, 0));
    l.add(bx(0.02, 0.85, 0.02, M.stripe, 0.09, -0.45, 0));
  }
  head(g, M.skinDark, { hair: M.hairBlack, brow: M.hairBlack });
  // щетина
  p.head.add(bx(0.26, 0.09, 0.26, stdMat(0x3a322a, 0.95), 0, 0.07, 0.01));
  // кепка-восьмиклинка
  p.head.add(cy(0.19, 0.18, 0.11, M.cap, 0, 0.4, 0, 10));
  p.head.add(bx(0.3, 0.03, 0.2, M.cap, 0, 0.36, 0.16));
  p.head.add(bx(0.06, 0.05, 0.03, M.gold, 0, 0.4, 0.18));
  // золотая цепь
  p.head.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 6, 16), M.gold).translateY(-0.19).translateZ(0.02));
  // семечки в руке
  const seeds = bx(0.07, 0.09, 0.04, stdMat(0x2f2a20, 0.95), 0, -0.72, 0.06);
  p.armL.add(seeds);
  g.userData.type = 'gopnik';
  return g;
}

/* ================= ЖИТЕЛИ ================= */
export function makeCivilian(kind, variant) {
  if (kind === 'old') return variant % 2 === 0 ? makeBabka() : makeDedka();
  if (kind === 'bad') return makeThug(variant);
  return makeVillager(variant);
}
function makeVillager(v) {
  const cols = [0x4a6b7c, 0x7c5a4a, 0x5a7c4a, 0x6b5a7c, 0x8a7a4a, 0x4a4a6b, 0x7c4a5a];
  const shirt = stdMat(cols[v % cols.length], 0.92);
  const pants = stdMat([0x2f3540, 0x4a4238, 0x333a33, 0x2a2f38][v % 4], 0.92);
  const g = baseRig({ pants, shoes: stdMat(0x2b2620, 0.9) });
  const p = g.userData.p;
  p.torso.add(bx(0.46, 0.6, 0.28, shirt, 0, 0.52, 0));
  p.torso.add(bx(0.5, 0.1, 0.3, shirt, 0, 0.83, 0));
  p.torso.add(bx(0.44, 0.2, 0.26, shirt, 0, 0.14, 0));
  addArms(g, shirt, null, M.skin, 0.135);
  head(g, M.skin, { hair: v % 3 === 0 ? M.hairGrey : M.hairBlack });
  if (v % 3 === 1) p.head.add(cy(0.2, 0.2, 0.08, stdMat(0x33404d, 0.9), 0, 0.4, 0, 10)); // шапка
  if (v % 4 === 2) {
    // сумка в руке
    p.armR.add(bx(0.18, 0.2, 0.1, stdMat(0x5a3b2a, 0.9), 0, -0.78, 0.02));
  }
  g.userData.type = 'civ';
  return g;
}
function makeBabka() {
  const g = baseRig({ pants: M.granny, shoes: stdMat(0x3a2f2a, 0.9) });
  const p = g.userData.p;
  // пальто-трапеция
  p.torso.add(bx(0.5, 0.62, 0.32, M.granny, 0, 0.52, 0));
  p.torso.add(bx(0.58, 0.42, 0.36, M.granny, 0, 0.08, 0));
  p.torso.add(bx(0.52, 0.1, 0.34, stdMat(0x5f4a6b, 0.9), 0, 0.84, 0));
  p.torso.add(bx(0.08, 0.5, 0.04, stdMat(0xc9a24a, 0.8), 0, 0.5, 0.17));
  addArms(g, M.granny, null, M.skinOld, 0.13);
  head(g, M.skinOld, { hair: M.hairGrey, noBrows: true });
  // платок
  p.head.add(bx(0.34, 0.2, 0.33, stdMat(0xa8455a, 0.95), 0, 0.3, -0.01));
  p.head.add(bx(0.2, 0.14, 0.1, stdMat(0xa8455a, 0.95), 0, 0.12, -0.16));
  // очки
  p.head.add(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 5, 12), M.gold).translateX(-0.075).translateY(0.2).translateZ(0.155));
  p.head.add(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 5, 12), M.gold).translateX(0.075).translateY(0.2).translateZ(0.155));
  // трость
  const cane = cy(0.02, 0.02, 0.8, M.wood, 0, -0.42, 0.05, 7);
  p.armR.add(cane);
  g.userData.type = 'old';
  g.userData.hunch = true;
  return g;
}
function makeDedka() {
  const g = baseRig({ pants: stdMat(0x4a4238, 0.9), shoes: stdMat(0x2b2620, 0.9) });
  const p = g.userData.p;
  p.torso.add(bx(0.48, 0.6, 0.3, stdMat(0x5a4a3a, 0.92), 0, 0.52, 0));
  p.torso.add(bx(0.44, 0.4, 0.28, stdMat(0x6b5a45, 0.92), 0, 0.1, 0));
  p.torso.add(bx(0.52, 0.1, 0.32, stdMat(0x4a3f32, 0.9), 0, 0.84, 0));
  addArms(g, stdMat(0x5a4a3a, 0.92), null, M.skinOld, 0.135);
  head(g, M.skinOld, { hair: M.hairGrey, brow: M.hairGrey });
  p.head.add(cy(0.21, 0.21, 0.1, stdMat(0x3a3a44, 0.9), 0, 0.4, 0, 10));   // кепка
  p.head.add(bx(0.3, 0.03, 0.18, stdMat(0x3a3a44, 0.9), 0, 0.36, 0.15));
  p.head.add(bx(0.14, 0.05, 0.03, M.hairGrey, 0, 0.06, 0.15));              // усы
  const cane = cy(0.022, 0.022, 0.85, M.wood, 0, -0.44, 0.05, 7);
  p.armR.add(cane);
  g.userData.type = 'old';
  g.userData.hunch = true;
  return g;
}
function makeThug(v) {
  const g = baseRig({ pants: stdMat(0x2a2320, 0.9), shoes: stdMat(0x1a1a1e, 0.9) });
  const p = g.userData.p;
  p.torso.add(bx(0.54, 0.62, 0.34, M.thug, 0, 0.52, 0));
  p.torso.add(bx(0.58, 0.12, 0.36, M.thug, 0, 0.84, 0));
  p.torso.add(bx(0.5, 0.22, 0.32, M.thug, 0, 0.12, 0));
  addArms(g, M.thug, null, M.skin, 0.165); // качок
  head(g, M.skin, { hair: M.hairBlack, brow: M.hairBlack });
  // ирокез
  p.head.add(bx(0.05, 0.16, 0.26, stdMat(0x8a2a2a, 0.9), 0, 0.42, -0.01));
  p.head.add(bx(0.24, 0.06, 0.24, stdMat(0x2b2620, 0.9), 0, 0.05, 0.02));
  // цепь
  p.head.add(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 6, 16), M.gold).translateY(-0.2));
  // бита/труба
  const w = makeGun(v % 2 === 0 ? 'baton' : 'pipe');
  w.scale.setScalar(1.15);
  w.position.set(0, -0.68, 0.1); w.rotation.x = -0.5;
  p.armR.add(w);
  g.userData.type = 'bad';
  g.userData.weapon = w;
  return g;
}

/* ================= КОП ================= */
export function makeCop() {
  const g = baseRig({ pants: M.cop, shoes: stdMat(0x14161a, 0.8) });
  const p = g.userData.p;
  p.torso.add(bx(0.5, 0.62, 0.3, M.copShirt, 0, 0.52, 0));
  p.torso.add(bx(0.52, 0.34, 0.34, M.cop, 0, 0.5, 0));      // бронежилет
  p.torso.add(bx(0.54, 0.1, 0.32, M.cop, 0, 0.84, 0));
  p.torso.add(bx(0.5, 0.07, 0.3, M.dark, 0, 0.24, 0));      // ремень
  p.torso.add(bx(0.07, 0.09, 0.05, M.gold, -0.14, 0.66, 0.16)); // значок
  p.torso.add(bx(0.08, 0.1, 0.06, M.dark, 0.18, 0.26, 0.12));
  addArms(g, M.copShirt, null, M.skin, 0.145);
  head(g, M.skin, { hair: M.hairBlack });
  // фуражка
  p.head.add(cy(0.19, 0.19, 0.1, M.copHat, 0, 0.4, 0, 12));
  p.head.add(cy(0.21, 0.21, 0.03, M.copHat, 0, 0.36, 0, 12));
  p.head.add(bx(0.34, 0.03, 0.22, M.dark, 0, 0.355, 0.14));
  p.head.add(bx(0.06, 0.06, 0.02, M.gold, 0, 0.42, 0.185));
  // пистолет в правой
  const gun = makeGun('glock');
  gun.position.set(0, -0.7, 0.12);
  p.armR.add(gun);
  g.userData.weapon = gun;
  g.userData.type = 'cop';
  return g;
}

/* ================= ОХРАННИК БАНКА ================= */
export function makeGuard() {
  const g = baseRig({ pants: M.guard, shoes: stdMat(0x14161a, 0.8) });
  const p = g.userData.p;
  p.torso.add(bx(0.54, 0.62, 0.32, M.guardShirt, 0, 0.52, 0));
  p.torso.add(bx(0.56, 0.12, 0.34, M.guard, 0, 0.84, 0));
  p.torso.add(bx(0.52, 0.24, 0.3, M.guard, 0, 0.12, 0));
  p.torso.add(bx(0.2, 0.09, 0.05, M.white, 0.12, 0.66, 0.17));
  p.torso.add(bx(0.1, 0.08, 0.04, M.gold, -0.14, 0.66, 0.17));
  addArms(g, M.guardShirt, null, M.skin, 0.16);
  head(g, M.skin, { hair: M.hairBlack, brow: M.hairBlack });
  p.head.add(cy(0.2, 0.2, 0.09, M.guard, 0, 0.4, 0, 12));
  p.head.add(bx(0.32, 0.03, 0.2, M.dark, 0, 0.36, 0.14));
  p.head.add(bx(0.22, 0.05, 0.03, M.mustache, 0, 0.075, 0.15));
  const baton = makeGun('baton');
  baton.position.set(0, -0.7, 0.1); baton.rotation.x = -0.4;
  p.armR.add(baton);
  g.userData.weapon = baton;
  g.userData.type = 'guard';
  return g;
}

/* ================= КАССИРША ================= */
export function makeTeller() {
  const g = baseRig({ pants: stdMat(0x3a3f52, 0.9), shoes: stdMat(0x2a232a, 0.9) });
  const p = g.userData.p;
  p.torso.add(bx(0.44, 0.6, 0.27, M.white, 0, 0.52, 0));
  p.torso.add(bx(0.46, 0.28, 0.29, stdMat(0x9c2a3a, 0.9), 0, 0.2, 0));
  p.torso.add(bx(0.48, 0.1, 0.29, M.white, 0, 0.83, 0));
  p.torso.add(bx(0.3, 0.08, 0.05, stdMat(0x2a5a4a, 0.9), 0, 0.86, 0.02)); // платок на шее
  addArms(g, M.white, null, M.skin, 0.12);
  head(g, M.skin, { hair: stdMat(0x6b3a1f, 0.95), noBrows: false, brow: stdMat(0x6b3a1f) });
  // причёска + пучок
  p.head.add(bx(0.33, 0.22, 0.32, stdMat(0x6b3a1f, 0.95), 0, 0.28, -0.02));
  p.head.add(sp(0.11, stdMat(0x6b3a1f, 0.95), 0, 0.36, -0.16, 8));
  p.head.add(bx(0.09, 0.02, 0.02, stdMat(0xc23a4a, 0.8), 0, 0.055, 0.155)); // губы
  p.head.add(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 10), M.gold).translateX(-0.15).translateY(0.09));
  g.userData.type = 'teller';
  return g;
}

/* ================= ПРОДАВЕЦ ================= */
export function makeShopkeeper() {
  const g = baseRig({ pants: stdMat(0x2f2a24, 0.9), shoes: stdMat(0x1e1a16, 0.9) });
  const p = g.userData.p;
  p.torso.add(bx(0.52, 0.62, 0.32, M.seller, 0, 0.52, 0));
  p.torso.add(bx(0.42, 0.5, 0.06, M.apron, 0, 0.42, 0.17));   // фартук
  p.torso.add(bx(0.54, 0.1, 0.34, M.seller, 0, 0.84, 0));
  addArms(g, M.seller, null, M.skinDark, 0.155);
  head(g, M.skinDark, { hair: M.hairBlack, brow: M.hairBlack });
  p.head.add(bx(0.24, 0.09, 0.04, M.mustache, 0, 0.075, 0.155));   // большие усы
  p.head.add(cy(0.2, 0.2, 0.12, stdMat(0x2a2118, 0.9), 0, 0.41, 0, 12));
  p.head.add(cy(0.26, 0.26, 0.025, stdMat(0x2a2118, 0.9), 0, 0.355, 0, 14)); // шляпа
  // золотой зуб
  p.head.add(bx(0.025, 0.02, 0.02, M.gold, 0.03, 0.055, 0.155));
  g.userData.type = 'shop';
  return g;
}

/* ================= ВОДИТЕЛЬ ГРУЗОВИКА ================= */
export function makeDriver() {
  const g = baseRig({ pants: stdMat(0x3a4a5a, 0.9), shoes: stdMat(0x22262b, 0.9) });
  const p = g.userData.p;
  p.torso.add(bx(0.5, 0.6, 0.3, M.vest, 0, 0.52, 0));
  p.torso.add(bx(0.52, 0.12, 0.32, stdMat(0xd0d2d6, 0.85), 0, 0.82, 0));
  p.torso.add(bx(0.1, 0.5, 0.04, stdMat(0xe8e8e8, 0.6), -0.13, 0.52, 0.16));
  p.torso.add(bx(0.1, 0.5, 0.04, stdMat(0xe8e8e8, 0.6), 0.13, 0.52, 0.16));
  addArms(g, M.vest, null, M.skin, 0.15);
  head(g, M.skin, { hair: M.hairBlack });
  p.head.add(cy(0.2, 0.2, 0.09, stdMat(0xffb43b, 0.8), 0, 0.4, 0, 12));
  p.head.add(bx(0.3, 0.03, 0.18, stdMat(0xffb43b, 0.8), 0, 0.36, 0.13));
  g.userData.type = 'driver';
  return g;
}

/* ================= ТАБЛИЧКА ИМЕНИ ================= */
export function makeLabel(text, color, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = sub ? 168 : 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = 'bold 62px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 256, 64);
  g.fillStyle = color || '#ffffff';
  g.fillText(text, 256, 64);
  if (sub) {
    g.font = 'bold 42px system-ui, sans-serif';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.strokeText(sub, 256, 128);
    g.fillStyle = '#ffd23b'; g.fillText(sub, 256, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp2.scale.set(1.7, sub ? 0.56 : 0.42, 1);
  sp2.position.y = 2.25;
  sp2.renderOrder = 999;
  return sp2;
}
export function updateLabel(sprite, text, color, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = sub ? 168 : 128;
  const g = c.getContext('2d');
  g.font = 'bold 62px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 256, 64);
  g.fillStyle = color || '#ffffff';
  g.fillText(text, 256, 64);
  if (sub) {
    g.font = 'bold 42px system-ui, sans-serif';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.strokeText(sub, 256, 128);
    g.fillStyle = '#ffd23b'; g.fillText(sub, 256, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  sprite.material.map.dispose();
  sprite.material.map = t;
  sprite.material.needsUpdate = true;
  sprite.scale.set(1.7, sub ? 0.56 : 0.42, 1);
}

/* ================= АНИМАЦИЯ ================= */
/* anim: idle | walk | run | attack | reload | carry | sleep | dead | panic | sit */
export function animateChar(g, anim, t, speed) {
  const p = g.userData.p, inner = g.userData.inner;
  if (!p) return;
  const s = speed == null ? 1 : speed;
  let aL = 0, aR = 0, legA = 0, bob = 0, lean = 0, armOut = 0;

  switch (anim) {
    case 'walk': legA = Math.sin(t * 7.2 * s) * 0.55; bob = Math.abs(Math.sin(t * 7.2 * s)) * 0.045; lean = 0.05; break;
    case 'run': legA = Math.sin(t * 11.5 * s) * 0.85; bob = Math.abs(Math.sin(t * 11.5 * s)) * 0.08; lean = 0.22; armOut = 0.5; break;
    case 'attack': {
      const k = (Math.sin(t * 13) + 1) / 2;
      aR = -1.9 + k * 2.6; lean = 0.18; legA = Math.sin(t * 6) * 0.2;
      break;
    }
    case 'reload':
      aR = -1.15 + Math.sin(t * 9) * 0.18;
      aL = -1.25 - Math.sin(t * 9) * 0.22;
      lean = 0.12; legA = Math.sin(t * 3) * 0.06;
      break;
    case 'aim':
      aR = -1.5; aL = -1.45; lean = 0.06; break;
    case 'carry':
      aL = -1.35; aR = -1.35; legA = Math.sin(t * 7.5) * 0.5; bob = Math.abs(Math.sin(t * 7.5)) * 0.05; lean = 0.14;
      break;
    case 'grab':
      aL = -0.9 + Math.sin(t * 5.5) * 0.35; aR = -0.9 - Math.sin(t * 5.5) * 0.35;
      lean = 0.5; legA = 0.12;
      break;
    case 'panic':
      aL = -2.6; aR = -2.6; legA = Math.sin(t * 13) * 0.7; bob = Math.abs(Math.sin(t * 13)) * 0.07; lean = -0.1;
      break;
    case 'cower':
      lean = 0.5; aL = -0.6; aR = -0.6; legA = Math.sin(t * 16) * 0.08; bob = -0.28;
      break;
    case 'sleep':
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x || 0, -Math.PI / 2, 0.15);
      g.rotation.z = 0;
      inner.position.y = 0.92;
      p.legL.rotation.x = 0.05; p.legR.rotation.x = 0.08;
      p.armL.rotation.x = 0.25 + Math.sin(t * 1.2) * 0.04; p.armR.rotation.x = 0.2;
      p.armL.rotation.z = 0.1; p.armR.rotation.z = -0.1;
      p.torso.rotation.x = 0;
      p.head.rotation.x = Math.sin(t * 1.1) * 0.03;
      p.head.rotation.y = 0;
      return;
    case 'dead':
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x || 0, -Math.PI / 2, 0.12);
      g.rotation.z = 0.25;
      inner.position.y = 0.78;
      p.legL.rotation.x = 0.3; p.legR.rotation.x = -0.15;
      p.armL.rotation.x = 0.9; p.armR.rotation.x = -0.6;
      p.armL.rotation.z = 0.6; p.armR.rotation.z = -0.5;
      p.torso.rotation.x = 0;
      p.head.rotation.x = 0.3; p.head.rotation.y = 0.4;
      return;
    case 'sit':
      g.rotation.x = 0; g.rotation.z = 0;
      inner.position.y = -0.42;
      p.legL.rotation.x = -1.35; p.legR.rotation.x = -1.35;
      p.armL.rotation.x = 0.35; p.armR.rotation.x = 0.35;
      p.torso.rotation.x = 0.06;
      p.head.rotation.x = Math.sin(t * 0.8) * 0.05;
      p.head.rotation.y = 0;
      return;
    default:
      legA = 0; bob = Math.sin(t * 1.9) * 0.018; aL = Math.sin(t * 1.5) * 0.05; aR = -Math.sin(t * 1.5) * 0.05;
  }

  g.rotation.x = THREE.MathUtils.lerp(g.rotation.x || 0, 0, 0.2);
  g.rotation.z = THREE.MathUtils.lerp(g.rotation.z || 0, 0, 0.2);
  inner.position.y = THREE.MathUtils.lerp(inner.position.y, bob, 0.35);
  p.legL.rotation.x = THREE.MathUtils.lerp(p.legL.rotation.x, legA, 0.3);
  p.legR.rotation.x = THREE.MathUtils.lerp(p.legR.rotation.x, -legA, 0.3);
  p.armL.rotation.x = THREE.MathUtils.lerp(p.armL.rotation.x, aL || -legA * (armOut || 0.55), 0.28);
  p.armR.rotation.x = THREE.MathUtils.lerp(p.armR.rotation.x, aR || legA * (armOut || 0.55), 0.28);
  p.armL.rotation.z = THREE.MathUtils.lerp(p.armL.rotation.z, 0.08 + (anim === 'run' ? 0.15 : 0), 0.2);
  p.armR.rotation.z = THREE.MathUtils.lerp(p.armR.rotation.z, -0.08 - (anim === 'run' ? 0.15 : 0), 0.2);
  p.torso.rotation.x = THREE.MathUtils.lerp(p.torso.rotation.x, lean, 0.18);
  const hunch = g.userData.hunch ? 0.18 : 0;
  p.head.rotation.x = THREE.MathUtils.lerp(p.head.rotation.x, -lean * 0.55 + hunch + Math.sin(t * 1.3) * 0.02, 0.2);
  p.head.rotation.y = Math.sin(t * 0.7) * (anim === 'idle' ? 0.16 : 0.04);
}

/* поза с оружием в руках (вид от третьего лица) */
export function poseWithWeapon(g, held, twoHanded) {
  const p = g.userData.p;
  if (!p) return;
  if (!held || held === 'fist') return;
  p.armR.rotation.x = -1.45;
  p.armL.rotation.x = twoHanded ? -1.4 : -0.25;
  p.armR.rotation.z = -0.18;
  p.armL.rotation.z = twoHanded ? 0.22 : 0.08;
}

export const CHARS = {
  gentleman: makeGentleman,
  gopnik: makeGopnik,
  cop: makeCop,
  guard: makeGuard,
  teller: makeTeller,
  shopkeeper: makeShopkeeper,
  driver: makeDriver
};
export function makeByKind(kind, variant) {
  if (CHARS[kind]) return CHARS[kind]();
  return makeCivilian(kind, variant || 0);
}
