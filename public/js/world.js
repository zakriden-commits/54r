/* DENI ISLAM — мир: суровый мультяшный город, дом, банк, оружейный магазин, NPC, трафик */
import * as THREE from '../vendor/three/three.module.js';
import { textures, stdMat, makeBed, makeWardrobe, makeSofa, makeTable, makeTV, makeFridge,
         makeLampPost, makeTree, makeTrash, makeCar, makeTruck, makeCrate, makeMoneyPile,
         makeGun, makeAmmoBox, makeDoor, makeBag, makeMoneyStack, TEX } from './models.js';
import { basicMat } from './models.js';
import { makeByKind, makeCivilian, makeDriver, animateChar, makeLabel } from './chars.js';

const D = window.DI;
const BOXES = D.rectBoxes();
const LOTS = D.cityLots();


/* ================================================================== */
/*  СКЛЕЙКА СТАТИКИ: один материал + один чанк = один draw call        */
/* ================================================================== */
const _m4 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s3 = new THREE.Vector3();
const _axisY = new THREE.Vector3(0, 1, 0);

function geoFrom(mesh) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  mesh.updateMatrixWorld(true);
  g.applyMatrix4(mesh.matrixWorld);
  const keep = { position: g.attributes.position, normal: g.attributes.normal };
  const uv = g.attributes.uv;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', keep.position);
  if (keep.normal) out.setAttribute('normal', keep.normal);
  if (uv) out.setAttribute('uv', uv);
  else {
    const n = keep.position.count, arr = new Float32Array(n * 2);
    out.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
  }
  return out;
}

export function mergeList(list) {
  const groups = new Map();
  for (const m of list) {
    if (!m || !m.isMesh || !m.visible || !m.geometry || !m.geometry.attributes.position) continue;
    const mat = m.material;
    if (Array.isArray(mat)) continue;                     // мульти-материал = лишние группы
    if (!mat || mat.transparent || mat.side === THREE.DoubleSide) continue;
    const g = m.geometry;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) continue;
    const key = mat.uuid;
    if (!groups.has(key)) groups.set(key, { mat, geos: [] });
    groups.get(key).geos.push(geoFrom(m));
  }
  const out = [];
  groups.forEach(({ mat, geos }) => {
    let vCount = 0;
    for (const g of geos) vCount += g.attributes.position.count;
    const hasUv = geos.every(g => !!g.attributes.uv);
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const uv = hasUv ? new Float32Array(vCount * 2) : null;
    let o = 0, o2 = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (uv) uv.set(g.attributes.uv.array, o2 * 2);
      o += g.attributes.position.count; o2 = o;
      g.dispose();
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    bg.computeBoundingSphere();
    bg.computeBoundingBox();
    const mesh = new THREE.Mesh(bg, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    out.push(mesh);
  });
  return out;
}

/* склеить все меши группы между собой (позиции относительно группы) —
   используется для движущихся объектов: машин трафика, грузовика */
export function mergeGroupInPlace(group) {
  const list = [];
  group.traverse(o => { if (o.isMesh && o !== group) list.push(o); });
  if (list.length < 2) return 0;
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const merged = mergeList(list);
  for (const m of list) { if (m.parent) m.parent.remove(m); }
  for (const m of merged) { m.applyMatrix4(inv); m.matrixAutoUpdate = false; group.add(m); }
  return merged.length;
}

/* режем мир на чанки, чтобы frustum culling отсекал дальние куски города.
   keep — список объектов, которые обязаны остаться подвижными (двери на петлях). */
function mergeChunked(source, parent, cell, keep) {
  const size = cell || 60;
  const buckets = new Map();
  const keepList = keep || [];
  const isKept = (o) => {
    let p = o;
    while (p) { if (keepList.indexOf(p) >= 0) return true; p = p.parent; }
    return false;
  };
  source.traverse(o => {
    if (!o.isMesh) return;
    if (isKept(o)) return;
    o.updateMatrixWorld(true);
    const p = o.getWorldPosition(_v3);
    const key = Math.floor(p.x / size) + ':' + Math.floor(p.z / size);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  let n = 0;
  buckets.forEach(list => { for (const m of mergeList(list)) { parent.add(m); n++; } });
  source.traverse(o => { if (o.isMesh && o.geometry && !isKept(o)) o.geometry.dispose(); });
  return n;
}

/* клон текстуры с собственным repeat — чтобы не ломать чужие материалы */
function texRep(t, rx, ry) {
  const c = t.clone();
  c.needsUpdate = true;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  return c;
}

export function buildWorld(scene, seed) {
  textures();
  const rng = D.makeRng(seed || 4242);
  const root = new THREE.Group();
  root.name = 'worldRoot';
  scene.add(root);
  const W = {
    root, boxes: BOXES, doors: { house: false, bank: false, shop: false },
    doorMeshes: {}, piles: [], pileMeshes: {}, interactions: [],
    civilians: [], traffic: [], npcs: {}, truck: null, truckDriver: null, crates: [],
    houseRoof: null, bankRoof: null, shopRoof: null, sirenLights: [], alarm: false,
    labels: [],
    static: new THREE.Group(),     // всё неподвижное: потом склеивается в чанки
    drawStats: null
  };
  W.static.name = 'static';
  root.add(W.static);

  /* ---------------- небо / свет ---------------- */
  scene.background = new THREE.Color(0x9aa7b2);
  scene.fog = new THREE.Fog(0x9aa7b2, 50, 155);   // плотный смог: дальше 155 м ничего не видно

  const hemi = new THREE.HemisphereLight(0xcfd8e0, 0x4a4438, 1.05);
  scene.add(hemi);
  /* Солнце «ходит» за игроком: карта теней накрывает только окрестность.
     Иначе three.js рисует в shadow map вообще все меши города — на телефоне
     это ~2000 draw call'ов и слайд-шоу. */
  const sun = new THREE.DirectionalLight(0xffe6bd, 1.55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0016;
  sun.shadow.normalBias = 0.02;
  const SUN_OFF = new THREE.Vector3(38, 55, 26);
  sun.position.copy(SUN_OFF);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  W.sun = sun;
  W.sunOff = SUN_OFF;
  W.shadowPos = new THREE.Vector3();

  /* ---------------- земля ---------------- */
  const groundMat = new THREE.MeshLambertMaterial({ map: texRep(TEX.grass, 60, 60) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  W.static.add(ground);

  /* ---------------- дороги + тротуары + разметка (одним куском) ---------------- */
  const roadMat = new THREE.MeshLambertMaterial({ map: TEX.asphalt });
  const walkMat = new THREE.MeshLambertMaterial({ map: texRep(TEX.paving, 40, 40) });
  const dashMat = basicMat(0xd8cf7a);
  const SPAN = 240;
  const roads = [];
  for (const z of D.ROADS_Z) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, D.ROAD_W), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(0, 0.02, z); roads.push(r);
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(SPAN, 0.16, 3.0), walkMat);
      sw.position.set(0, 0.08, z + s * (D.ROAD_W / 2 + 1.5)); roads.push(sw);
    }
    for (let x = -SPAN / 2 + 4; x < SPAN / 2; x += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.28), dashMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.03, z); roads.push(dash);
    }
  }
  for (const x of D.ROADS_X) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(D.ROAD_W, SPAN), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.025, 0); roads.push(r);
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, SPAN), walkMat);
      sw.position.set(x + s * (D.ROAD_W / 2 + 1.5), 0.08, 0); roads.push(sw);
    }
    for (let z = -SPAN / 2 + 4; z < SPAN / 2; z += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 3.2), dashMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.035, z); roads.push(dash);
    }
  }
  // разметка, дороги и тротуары → 3 меша вместо ~140
  for (const m of mergeList(roads)) W.static.add(m);
  roads.forEach(m => m.geometry.dispose());

  /* ---------------- городские здания (всё instanced) ---------------- */
  const bMat = new THREE.MeshLambertMaterial({ map: TEX.facade });
  const roofMat = new THREE.MeshLambertMaterial({ map: texRep(TEX.roof, 3, 3) });
  const doorMat = stdMat(0x4a3524, 0.9);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(unit, bMat, LOTS.length);
  const roofInst = new THREE.InstancedMesh(unit, roofMat, LOTS.length);
  const doorInst = new THREE.InstancedMesh(unit, doorMat, LOTS.length);
  inst.castShadow = true; inst.receiveShadow = true;
  roofInst.castShadow = true; roofInst.receiveShadow = true;
  doorInst.castShadow = false; doorInst.receiveShadow = true;
  const mtx = new THREE.Matrix4();
  const col = new THREE.Color();
  const palette = [0xb0a48d, 0x9a8f7d, 0x8d8577, 0xa89880, 0x7f7a70, 0xb5a794, 0x8f8070, 0x9c9484];
  LOTS.forEach((l, i) => {
    mtx.makeScale(l.w, l.h, l.d);
    mtx.setPosition(l.x, l.h / 2, l.z);
    inst.setMatrixAt(i, mtx);
    col.setHex(palette[l.style % palette.length]);
    col.offsetHSL(0, 0, (rng.raw() - 0.5) * 0.08);
    inst.setColorAt(i, col);

    mtx.makeScale(l.w + 0.7, 0.5, l.d + 0.7);
    mtx.setPosition(l.x, l.h + 0.25, l.z);
    roofInst.setMatrixAt(i, mtx);
    roofInst.setColorAt(i, col.clone().offsetHSL(0, -0.05, -0.18));

    const side = rng.i(0, 3);
    _q.identity(); _s3.set(1.4, 2.4, 0.22);
    if (side === 0) { _v3.set(l.x, 1.2, l.z - l.d / 2 - 0.06); }
    else if (side === 1) { _v3.set(l.x + l.w / 2 + 0.06, 1.2, l.z); _q.setFromAxisAngle(_axisY, Math.PI / 2); }
    else if (side === 2) { _v3.set(l.x, 1.2, l.z + l.d / 2 + 0.06); }
    else { _v3.set(l.x - l.w / 2 - 0.06, 1.2, l.z); _q.setFromAxisAngle(_axisY, Math.PI / 2); }
    mtx.compose(_v3, _q, _s3);
    doorInst.setMatrixAt(i, mtx);
    doorInst.setColorAt(i, col.clone().offsetHSL(0.02, 0.05, -0.35));
  });
  for (const im of [inst, roofInst, doorInst]) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;      // город виден весь — так дешевле, чем считать сферы
    W.static.add(im);
  }
  W.cityMeshes = { inst, roofInst, doorInst };

  /* ---------------- уличная мебель (клеится в чанки) ---------------- */
  const props = new THREE.Group();
  props.name = 'propsSrc';
  const lampProto = makeLampPost();
  const treeProto = makeTree();
  const trashProto = makeTrash();
  for (const z of D.ROADS_Z) {
    for (let x = -105; x <= 105; x += 21) {
      if (D.nearRoad(x, z + 8.5, 2, 2)) continue;
      const l = lampProto.clone(); l.position.set(x, 0.1, z + 8.2); l.rotation.y = Math.PI; props.add(l);
    }
  }
  for (const x of D.ROADS_X) {
    for (let z = -105; z <= 105; z += 21) {
      if (D.nearRoad(x + 8.5, z, 2, 2)) continue;
      const l = lampProto.clone(); l.position.set(x + 8.2, 0.1, z); l.rotation.y = -Math.PI / 2; props.add(l);
    }
  }
  for (let i = 0; i < 90; i++) {
    const x = rng.f(-110, 110), z = rng.f(-110, 110);
    if (D.nearRoad(x, z, 5, 5)) continue;
    if (D.insideBuilding(x, z)) continue;
    if (D.resolveCollision(x, z, 1.6, BOXES).x !== x) continue;
    const t = treeProto.clone();
    t.position.set(x, 0, z);
    t.scale.setScalar(rng.f(0.75, 1.5));
    t.rotation.y = rng.f(0, 6.28);
    props.add(t);
  }
  for (let i = 0; i < 55; i++) {
    const x = rng.f(-100, 100), z = rng.f(-100, 100);
    if (D.insideBuilding(x, z)) continue;
    if (D.resolveCollision(x, z, 0.7, BOXES).x !== x) continue;
    const tr = trashProto.clone(); tr.position.set(x, 0, z); tr.rotation.y = rng.f(0, 6.28); props.add(tr);
  }
  // припаркованные машины
  const carColors = [0x8a2f2f, 0x2f4a8a, 0x3f3f45, 0x8a7a2f, 0x2f6a4a, 0x6a3f6a, 0xb0b0b4];
  for (let i = 0; i < 24; i++) {
    const onX = rng.chance(0.5);
    const road = rng.pick(onX ? D.ROADS_X : D.ROADS_Z);
    const other = rng.f(-95, 95);
    const x = onX ? road + (rng.chance(0.5) ? 7.6 : -7.6) : other;
    const z = onX ? other : road + (rng.chance(0.5) ? 7.6 : -7.6);
    if (D.insideBuilding(x, z)) continue;
    const c = makeCar(rng.pick(carColors));
    c.position.set(x, 0, z);
    c.rotation.y = onX ? 0 : Math.PI / 2;
    props.add(c);
  }
  W.propDrawCalls = mergeChunked(props, W.static, 55);

  /* ================= НАШ ДОМ ================= */
  buildHouse(root, W, rng);
  /* ================= БАНК ================= */
  buildBank(root, W, rng);
  /* ================= МАГАЗИН ОРУЖИЯ ================= */
  buildShop(root, W, rng);

  /* ---------------- трафик ---------------- */
  for (let i = 0; i < 7; i++) {
    const onX = rng.chance(0.5);
    const road = rng.pick(onX ? D.ROADS_X : D.ROADS_Z);
    const car = makeCar(rng.pick(carColors));
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = dir * 2.6;
    car.position.set(onX ? road + lane : rng.f(-100, 100), 0, onX ? rng.f(-100, 100) : road + lane);
    car.rotation.y = onX ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    mergeGroupInPlace(car);
    root.add(car);
    W.traffic.push({ mesh: car, onX, road, dir, speed: rng.f(7, 13), lane });
  }

  /* ---------------- жители (локальная симуляция, одинаковый сид у обоих) ---------------- */
  const kinds = ['normal', 'normal', 'normal', 'normal', 'old', 'old', 'bad'];
  for (let i = 0; i < 28; i++) {
    const kind = kinds[i % kinds.length];
    const mesh = makeCivilian(kind, i);
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 40 && !ok; k++) {
      x = rng.f(-95, 95); z = rng.f(-95, 95);
      if (D.insideBuilding(x, z)) continue;
      const r = D.resolveCollision(x, z, 0.8, BOXES);
      ok = (Math.abs(r.x - x) < 0.05 && Math.abs(r.z - z) < 0.05);
    }
    mesh.position.set(x, 0, z);
    root.add(mesh);
    const lod = makeCivLOD(kind, i);
    lod.position.set(x, 0, z);
    root.add(lod);
    const civ = {
      id: 'c' + i, kind, mesh, lod, lodOn: false,
      x, z, yaw: rng.f(0, 6.28), speed: kind === 'old' ? 0.85 : (kind === 'bad' ? 1.5 : 1.25),
      tx: x, tz: z, wait: rng.f(0, 4), state: 'walk', panicT: 0, dead: 0, t: rng.f(0, 10),
      sayT: rng.f(2, 12), gaze: false, anim: 'walk', aggro: false, hp: 100
    };
    W.civilians.push(civ);
  }

  /* ---------------- грузовик подработки ---------------- */
  W.truck = new THREE.Group();
  const truck = makeTruck();
  mergeGroupInPlace(truck);
  W.truck.add(truck);
  W.truckDriver = makeDriver();
  W.truckDriver.position.set(-1.8, 0, -2.4);
  W.truck.add(W.truckDriver);
  W.crateStack = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const c = makeCrate();
    c.position.set(3.2 + (i % 2) * 0.7, Math.floor(i / 2) * 0.64, 1.6);
    W.crateStack.add(c);
  }
  W.truck.add(W.crateStack);
  W.truckLabel = makeLabel('РАБОТА: ящики', '#ffd23b', 'подойди и нажми E');
  W.truck.add(W.truckLabel);
  W.truck.visible = false;
  root.add(W.truck);

  return W;
}

/* ================================================================== */
/*  ДОМ                                                                */
/* ================================================================== */
function buildHouse(root, W, rng) {
  const H = D.HOUSE;
  const g = new THREE.Group();
  const dyn = new THREE.Group();          // то, что двигается/мигает — не склеиваем
  dyn.name = 'houseDyn';
  root.add(dyn);
  const wallMat = new THREE.MeshLambertMaterial({ map: TEX.brick });
  TEX.brick.repeat.set(2, 1);
  const innerMat = new THREE.MeshLambertMaterial({ map: TEX.concrete, color: 0xd8cfc0 });
  const floorMat = new THREE.MeshLambertMaterial({ map: TEX.parquet });
  TEX.parquet.repeat.set(4, 3);

  // пол
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(H.w, H.d), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(H.x, 0.05, H.z); floor.receiveShadow = true;
  g.add(floor);
  g.add(makeRugMesh(3.4, 2.6, H.x + 3, H.z + 2.4));

  // стены (визуальные, совпадают с коллизиями)
  const walls = [
    { x: H.x, z: H.z + H.d / 2, w: H.w, d: 0.3, h: H.h },
    { x: H.x - H.w / 2, z: H.z, w: 0.3, d: H.d, h: H.h },
    { x: H.x + H.w / 2, z: H.z, w: 0.3, d: H.d, h: H.h }
  ];
  walls.forEach(w => {
    // один материал на меш — иначе three.js рисует 6 групп = 6 draw call'ов
    const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), wallMat);
    m.position.set(w.x, w.h / 2, w.z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(w.w - 0.06, w.h - 0.06, w.d - 0.06), innerMat);
    m2.position.set(w.x, w.h / 2, w.z); g.add(m2);
  });
  // фасад с проёмом
  const dd = D.HOUSE_DOOR;
  const leftW = (dd.x - dd.w / 2) - (H.x - H.w / 2);
  const rightW = (H.x + H.w / 2) - (dd.x + dd.w / 2);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(leftW, H.h, 0.3), wallMat);
  fl.position.set(H.x - H.w / 2 + leftW / 2, H.h / 2, H.z - H.d / 2); fl.castShadow = true; g.add(fl);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(rightW, H.h, 0.3), wallMat);
  fr.position.set(H.x + H.w / 2 - rightW / 2, H.h / 2, H.z - H.d / 2); fr.castShadow = true; g.add(fr);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(dd.w, H.h - 2.15, 0.3), wallMat);
  lintel.position.set(dd.x, 2.15 + (H.h - 2.15) / 2, H.z - H.d / 2); g.add(lintel);
  // внутренняя стена
  const iw1 = new THREE.Mesh(new THREE.BoxGeometry(4.8, H.h, 0.25), innerMat);
  iw1.position.set(H.x - 3.6, H.h / 2, H.z + 0.1); iw1.castShadow = true; g.add(iw1);
  const iw2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, H.h, 0.25), innerMat);
  iw2.position.set(H.x + 4.2, H.h / 2, H.z + 0.1); iw2.castShadow = true; g.add(iw2);

  // крыша (скрывается когда мы внутри)
  const roof = new THREE.Group();
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(H.w + 1.4, 0.35, H.d + 1.4), new THREE.MeshLambertMaterial({ map: TEX.roof }));
  r1.position.set(H.x, H.h + 0.18, H.z); r1.castShadow = true; roof.add(r1);
  const rg = new THREE.Mesh(new THREE.ConeGeometry(9.4, 2.6, 4), stdMat(0x5a3a2a, 0.9));
  rg.position.set(H.x, H.h + 1.5, H.z); rg.rotation.y = Math.PI / 4; rg.scale.set(1, 1, 0.72); rg.castShadow = true;
  roof.add(rg);
  root.add(roof);
  W.houseRoof = roof;

  // дверь
  const door = makeDoor(dd.w - 0.1, 2.15, 0x6b4526);
  door.position.set(dd.x - dd.w / 2 + 0.05, 0, H.z - H.d / 2);
  dyn.add(door);
  W.doorMeshes.house = door;

  // мебель: спальня
  D.BEDS.forEach((b, i) => {
    const bed = makeBed(i === 0 ? 0x5b3d28 : 0x4a3b2a);
    bed.position.set(b.x, 0.05, b.z);
    g.add(bed);
    W.interactions.push({ type: 'bed', x: b.x, z: b.z, r: 1.5, slot: i, label: 'Спальня: отдохнуть' });
  });
  D.WARDROBES.forEach((w, i) => {
    const wr = makeWardrobe();
    wr.position.set(w.x, 0.05, w.z);
    wr.rotation.y = Math.PI;
    g.add(wr);
    W.interactions.push({ type: 'wardrobe', x: w.x, z: w.z + 0.5, r: 1.9, slot: i, label: 'Шкаф ' + (i + 1) + ': положить/забрать вещи' });
  });
  // гостиная
  const sofa = makeSofa(); sofa.position.set(H.x + 3.6, 0.05, H.z + 3.6); sofa.rotation.y = Math.PI; g.add(sofa);
  const tv = makeTV(); tv.position.set(H.x + 3.6, 0.05, H.z + 1.0); g.add(tv);
  const table = makeTable(); table.position.set(H.x + 3.4, 0.05, H.z + 2.4); g.add(table);
  const fridge = makeFridge(); fridge.position.set(H.x - 5.0, 0.05, H.z - 3.9); g.add(fridge);
  const carpet = makeRugMesh(3, 2, H.x - 2.4, H.z - 2.6); g.add(carpet);
  // лампочка
  const bulb = new THREE.PointLight(0xffd9a0, 0.9, 16);
  bulb.position.set(H.x, 3.6, H.z); g.add(bulb);
  const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9c0 }));
  bulbMesh.position.copy(bulb.position); g.add(bulbMesh);

  // крыльцо
  const porch = new THREE.Mesh(new THREE.BoxGeometry(4, 0.18, 1.6), new THREE.MeshLambertMaterial({ map: TEX.concrete }));
  porch.position.set(dd.x, 0.09, H.z - H.d / 2 - 0.8); porch.receiveShadow = true; g.add(porch);

  W.interactions.push({ type: 'door', x: dd.x, z: dd.z, r: 2.4, key: 'house', label: 'Дверь дома: открыть/закрыть' });
  mergeChunked(g, W.static, 22, Object.values(W.doorMeshes));
}
function makeRugMesh(w, d, x, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: TEX.carpet }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); m.receiveShadow = true;
  return m;
}

/* ================================================================== */
/*  БАНК                                                               */
/* ================================================================== */
function buildBank(root, W, rng) {
  const B = D.BANK;
  const g = new THREE.Group();
  const dyn = new THREE.Group();
  dyn.name = 'bankDyn';
  root.add(dyn);
  const marbleMat = new THREE.MeshLambertMaterial({ map: TEX.marble });
  TEX.marble.repeat.set(8, 6);
  const wallMat = new THREE.MeshLambertMaterial({ map: TEX.concrete, color: 0xe0d8c8 });
  const darkWall = stdMat(0x3f454c, 0.7, 0.25);

  // пол
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.d), marbleMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(B.x, 0.06, B.z); floor.receiveShadow = true; g.add(floor);
  // ступени
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(B.w + 4 - i * 1.2, 0.22, 1.4 - i * 0.3), marbleMat);
    st.position.set(B.x, 0.11 + i * 0.0, B.z - B.d / 2 - 2.1 + i * 0.9);
    st.receiveShadow = true; g.add(st);
  }

  // стены
  const hw = B.w / 2, hd = B.d / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(B.w, B.h, 0.4), wallMat);
  back.position.set(B.x, B.h / 2, B.z + hd); back.castShadow = true; g.add(back);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.4, B.h, B.d), wallMat);
  left.position.set(B.x - hw, B.h / 2, B.z); left.castShadow = true; g.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.4, B.h, B.d), wallMat);
  right.position.set(B.x + hw, B.h / 2, B.z); right.castShadow = true; g.add(right);
  const dd = D.BANK_DOOR;
  const lw = (dd.x - dd.w / 2) - (B.x - hw);
  const rw = (B.x + hw) - (dd.x + dd.w / 2);
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(lw, B.h, 0.4), wallMat);
  f1.position.set(B.x - hw + lw / 2, B.h / 2, B.z - hd); f1.castShadow = true; g.add(f1);
  const f2 = new THREE.Mesh(new THREE.BoxGeometry(rw, B.h, 0.4), wallMat);
  f2.position.set(B.x + hw - rw / 2, B.h / 2, B.z - hd); f2.castShadow = true; g.add(f2);
  const lin = new THREE.Mesh(new THREE.BoxGeometry(dd.w, B.h - 3.0, 0.4), wallMat);
  lin.position.set(dd.x, 3.0 + (B.h - 3.0) / 2, B.z - hd); g.add(lin);
  // стеклянные двери
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.35 });
  const gd1 = makeDoor(dd.w / 2 - 0.1, 3.0, 0x2f3a44);
  gd1.position.set(dd.x - dd.w / 2, 0, B.z - hd); dyn.add(gd1);
  const gd2 = makeDoor(dd.w / 2 - 0.1, 3.0, 0x2f3a44);
  gd2.position.set(dd.x + dd.w / 2, 0, B.z - hd);
  gd2.userData.pivot.rotation.y = Math.PI; dyn.add(gd2);
  W.doorMeshes.bank = gd1;
  W.doorMeshes.bank2 = gd2;
  const gp1 = new THREE.Mesh(new THREE.PlaneGeometry(dd.w / 2 - 0.35, 2.3), glassMat);
  gp1.position.set((dd.w / 2 - 0.1) / 2, 1.45, 0.06);
  gd1.userData.pivot.add(gp1);
  const gp2 = new THREE.Mesh(new THREE.PlaneGeometry(dd.w / 2 - 0.35, 2.3), glassMat);
  gp2.position.set(-(dd.w / 2 - 0.1) / 2, 1.45, 0.06);
  gd2.userData.pivot.add(gp2);

  // крыша + карниз
  const roof = new THREE.Group();
  const rm = new THREE.Mesh(new THREE.BoxGeometry(B.w + 1.6, 0.8, B.d + 1.6), new THREE.MeshLambertMaterial({ map: TEX.roof }));
  rm.position.set(B.x, B.h + 0.4, B.z); rm.castShadow = true; roof.add(rm);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(B.w + 2.6, 1.1, B.d + 2.6), marbleMat);
  cornice.position.set(B.x, B.h - 0.4, B.z); roof.add(cornice);
  root.add(roof);
  W.bankRoof = roof;

  // вывеска
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: TEX.bankSign }));
  sign.position.set(B.x, B.h - 2.6, B.z - hd - 0.25); dyn.add(sign);

  // колонны
  for (let i = 0; i < 4; i++) {
    const x = B.x - 9 + i * 6;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, B.h - 1.5, 12), marbleMat);
    col.position.set(x, (B.h - 1.5) / 2, B.z - hd + 1.2); col.castShadow = true; g.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), marbleMat);
    cap.position.set(x, B.h - 1.5, B.z - hd + 1.2); g.add(cap);
  }

  // стойки касс + стекло
  const counterMat = new THREE.MeshLambertMaterial({ map: TEX.wood });
  for (let i = 0; i < 3; i++) {
    const x = B.x - 10 + i * 3.2;
    const c = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.15, 0.9), counterMat);
    c.position.set(x, 0.58, B.z - 4.2); c.castShadow = true; g.add(c);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.08), glassMat);
    gl.position.set(x, 1.85, B.z - 4.2); g.add(gl);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.14), stdMat(C_gold(), 0.4, 0.6));
    frame.position.set(x, 1.2, B.z - 4.2); g.add(frame);
    // кнопка тревоги под стойкой
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), new THREE.MeshBasicMaterial({ color: 0xd02020 }));
    btn.position.set(x + 0.6, 1.17, B.z - 3.9); dyn.add(btn);
    W.alarmBtn = W.alarmBtn || btn;
  }

  // хранилище
  const V = D.VAULT;
  const vFloor = new THREE.Mesh(new THREE.PlaneGeometry(V.w, V.d), new THREE.MeshLambertMaterial({ map: TEX.metal, color: 0x8f959c }));
  vFloor.rotation.x = -Math.PI / 2; vFloor.position.set(V.x, 0.07, V.z); vFloor.receiveShadow = true; g.add(vFloor);
  const vWallMat = new THREE.MeshLambertMaterial({ map: TEX.metal, color: 0x767d85 });
  const vBack = new THREE.Mesh(new THREE.BoxGeometry(V.w, 5, 0.4), vWallMat);
  vBack.position.set(V.x, 2.5, V.z + V.d / 2); g.add(vBack);
  const vRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, V.d), vWallMat);
  vRight.position.set(V.x + V.w / 2, 2.5, V.z); g.add(vRight);
  const vCeil = new THREE.Mesh(new THREE.BoxGeometry(V.w + 0.8, 0.5, V.d + 0.8), darkWall);
  vCeil.position.set(V.x, 5.2, V.z); g.add(vCeil);
  // круглая бронедверь хранилища (декор, откатана в сторону)
  const vdX = V.x - V.w / 2 - 0.55, vdZ = V.z + V.d / 2 - 1.55;
  const vdoor = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 0.42, 26), stdMat(0x5b6169, 0.4, 0.7));
  vdoor.rotation.z = Math.PI / 2;
  vdoor.position.set(vdX, 2.05, vdZ);
  vdoor.castShadow = true;
  g.add(vdoor);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.085, 8, 22), stdMat(C_gold(), 0.35, 0.8));
  wheel.position.set(vdX + 0.26, 2.05, vdZ);
  wheel.rotation.y = Math.PI / 2;
  g.add(wheel);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), stdMat(0x8d949c, 0.35, 0.8));
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(vdX, 2.05 + Math.sin(a) * 1.35, vdZ + Math.cos(a) * 1.35);
    g.add(bolt);
  }
  // рама проёма хранилища
  const frameMat = stdMat(0x4a5058, 0.5, 0.5);
  const fr1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.6), frameMat);
  fr1.position.set(V.x - V.w / 2 + 0.85, 2.5, V.z - V.d / 2 + 0.5); g.add(fr1);
  const fr2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.6), frameMat);
  fr2.position.set(V.x + V.w / 2 - 0.75, 2.5, V.z - V.d / 2 + 0.5); g.add(fr2);
  const fr3 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 0.6), frameMat);
  fr3.position.set(V.x - V.w / 2 + 2.5, 4.5, V.z - V.d / 2 + 0.5); g.add(fr3);
  // полки с деньгами вдоль дальней стены хранилища (не мешают проходу)
  for (let i = 0; i < 3; i++) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.12, 0.85), stdMat(0x4a5058, 0.6, 0.4));
    sh.position.set(V.x, 0.85 + i * 0.95, V.z + V.d / 2 - 0.55); g.add(sh);
    for (let k = 0; k < 16; k++) {
      const st = makeMoneyStack(0.4, 0.12, 0.23);
      st.position.set(V.x - 3.6 + k * 0.47, 0.97 + i * 0.95, V.z + V.d / 2 - 0.55);
      g.add(st);
    }
  }
  // решётка над кучами
  const grille = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 3.2), new THREE.MeshBasicMaterial({ color: 0x33383d, wireframe: true }));
  grille.position.set(V.x + 1.6, 0.14, V.z + 0.4); dyn.add(grille);

  // люстра
  const ch = new THREE.Group();
  ch.add(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.08, 8, 24), stdMat(C_gold(), 0.3, 0.85)));
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    b.position.set(Math.cos(a) * 1.5, 0.1, Math.sin(a) * 1.5); ch.add(b);
  }
  ch.position.set(B.x - 4, B.h - 2.6, B.z - 2);
  g.add(ch);
  const chLight = new THREE.PointLight(0xffe6b0, 1.0, 34);
  chLight.position.copy(ch.position); g.add(chLight);
  const vLight = new THREE.PointLight(0xfff0c8, 0.85, 16);
  vLight.position.set(V.x, 4.2, V.z); g.add(vLight);

  // растения
  for (const px of [B.x - 13.4, B.x + 3.6]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.7, 10), stdMat(0x7a4a32, 0.9));
    pot.position.set(px, 0.35, B.z - 8.6); pot.castShadow = true; g.add(pot);
    const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), stdMat(0x3f6b34, 0.95));
    pl.position.set(px, 1.3, B.z - 8.6); pl.castShadow = true; g.add(pl);
  }

  // кучи денег (интерактивные)
  D.MONEY_PILES.forEach(mp => {
    const pile = makeMoneyPile(mp.id === 3 ? 8 : 18);
    pile.position.set(mp.x, mp.id === 3 ? 1.2 : 0.08, mp.z);
    dyn.add(pile);
    W.pileMeshes[mp.id] = pile;
    W.interactions.push({ type: 'money', x: mp.x, z: mp.z, r: 2.3, pile: mp.id, label: 'Деньги: зажмите, чтобы грести' });
  });

  W.interactions.push({ type: 'door', x: dd.x, z: dd.z, r: 3.0, key: 'bank', label: 'Дверь банка' });
  mergeChunked(g, W.static, 18, Object.values(W.doorMeshes));
}
function C_gold() { return 0xd9b04a; }

/* ================================================================== */
/*  МАГАЗИН ОРУЖИЯ                                                     */
/* ================================================================== */
function buildShop(root, W, rng) {
  const S = D.SHOP;
  const g = new THREE.Group();
  const dyn = new THREE.Group();
  dyn.name = 'shopDyn';
  root.add(dyn);
  const woodMat = new THREE.MeshLambertMaterial({ map: TEX.wood });
  TEX.wood.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.d), woodMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(S.x, 0.06, S.z); floor.receiveShadow = true; g.add(floor);

  const wallMat = new THREE.MeshLambertMaterial({ map: TEX.brick, color: 0xa08878 });
  const hw = S.w / 2, hd = S.d / 2;
  const mk = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  mk(S.w, S.h, 0.3, S.x, S.h / 2, S.z + hd);
  mk(0.3, S.h, S.d, S.x - hw, S.h / 2, S.z);
  mk(0.3, S.h, S.d, S.x + hw, S.h / 2, S.z);
  const dd = D.SHOP_DOOR;
  const lw = (dd.x - dd.w / 2) - (S.x - hw), rw = (S.x + hw) - (dd.x + dd.w / 2);
  mk(lw, S.h, 0.3, S.x - hw + lw / 2, S.h / 2, S.z - hd);
  mk(rw, S.h, 0.3, S.x + hw - rw / 2, S.h / 2, S.z - hd);
  mk(dd.w, S.h - 2.15, 0.3, dd.x, 2.15 + (S.h - 2.15) / 2, S.z - hd);
  const door = makeDoor(dd.w - 0.1, 2.15, 0x4a3524);
  door.position.set(dd.x - dd.w / 2 + 0.05, 0, S.z - hd);
  dyn.add(door);
  W.doorMeshes.shop = door;

  // крыша
  const roof = new THREE.Mesh(new THREE.BoxGeometry(S.w + 1.2, 0.4, S.d + 1.2), new THREE.MeshLambertMaterial({ map: TEX.roof }));
  roof.position.set(S.x, S.h + 0.2, S.z); roof.castShadow = true;
  const rg = new THREE.Group(); rg.add(roof); root.add(rg);
  W.shopRoof = rg;

  // неон-вывеска
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: TEX.gunSign }));
  sign.position.set(S.x, S.h - 0.6, S.z - hd - 0.2); g.add(sign);
  const signLight = new THREE.PointLight(0xff5a7a, 0.8, 12);
  signLight.position.set(S.x, S.h - 0.6, S.z - hd - 1.2); g.add(signLight);

  // прилавок
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.1, 0.9), woodMat);
  counter.position.set(S.x, 0.55, S.z - 0.6); counter.castShadow = true; g.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.1, 1.1), stdMat(0x3a3f45, 0.5, 0.3));
  top.position.set(S.x, 1.15, S.z - 0.6); g.add(top);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.0, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.3 }));
  glass.position.set(S.x, 1.7, S.z - 0.6); g.add(glass);

  // витрины с оружием на стенах
  const guns = ['ak', 'm4', 'shotgun', 'mp5', 'deagle', 'glock'];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = S.z + 1.0 + Math.floor(i / 2) * 1.5;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 1.2), woodMat);
    shelf.position.set(S.x + side * (hw - 0.35), 1.5, z); g.add(shelf);
    const gun = makeGun(guns[i]);
    gun.scale.setScalar(2.2);
    gun.position.set(S.x + side * (hw - 0.35), 1.62, z);
    gun.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(gun);
    // подсветка
    const l = new THREE.PointLight(0xffe0a0, 0.35, 4);
    l.position.set(S.x + side * (hw - 0.8), 2.2, z); g.add(l);
  }
  // ящики с патронами на прилавке
  for (let i = 0; i < 4; i++) {
    const ab = makeAmmoBox(['pistol', 'rifle', 'smg', 'shotgun'][i]);
    ab.position.set(S.x - 1.6 + i * 1.05, 1.2, S.z - 0.6);
    ab.scale.setScalar(0.85);
    g.add(ab);
  }
  // сумки на витрине
  const bag = makeBag(); bag.position.set(S.x + 1.9, 1.2, S.z + 2.6); g.add(bag);
  const bag2 = makeBag(); bag2.position.set(S.x + 2.5, 1.2, S.z + 2.6); bag2.rotation.y = 0.5; g.add(bag2);

  const light = new THREE.PointLight(0xffe9c0, 0.95, 18);
  light.position.set(S.x, 3.6, S.z); g.add(light);

  W.interactions.push({ type: 'door', x: dd.x, z: dd.z, r: 2.4, key: 'shop', label: 'Дверь магазина' });
  W.interactions.push({ type: 'shop', x: S.x, z: S.z - 1.6, r: 3.2, label: 'Прилавок: купить оружие и патроны' });
  mergeChunked(g, W.static, 22, Object.values(W.doorMeshes));
}

/* ---------- упрощённая модель жителя для дальней дистанции (4 меша) ---------- */
const _LOD_COLS = {
  normal: [0x4a6b7c, 0x7c5a4a, 0x5a7c4a, 0x6b5a7c, 0x8a7a4a, 0x4a4a6b, 0x7c4a5a],
  old: [0x7a5f8c, 0x6b5a3f],
  bad: [0x3a2b2b]
};
function makeCivLOD(kind, variant) {
  const g = new THREE.Group();
  const cols = _LOD_COLS[kind === 'old' ? 'old' : (kind === 'bad' ? 'bad' : 'normal')];
  const shirt = stdMat(cols[variant % cols.length], 0.92);
  const pants = stdMat(kind === 'bad' ? 0x2a2f38 : 0x2f3540, 0.92);
  const skin = stdMat(kind === 'old' ? 0xddab86 : 0xe8b48c, 0.9);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.86, 0.24), pants);
  leg.position.y = 0.43; leg.castShadow = true; g.add(leg);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), shirt);
  torso.position.y = 1.16; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.29), skin);
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  if (kind === 'old') {
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.33), stdMat(0x9c1f27, 0.95));
    scarf.position.y = 1.54; g.add(scarf);
  } else if (kind === 'bad') {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), stdMat(0x22262e, 0.9));
    cap.position.y = 1.9; g.add(cap);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.1, 0.3), stdMat(0x2b2118, 0.95));
    hair.position.y = 1.9; g.add(hair);
  }
  g.visible = false;
  return g;
}

/* ================================================================== */
/*  ОБНОВЛЕНИЕ МИРА                                                    */
/* ================================================================== */
function doLodWorld(W, dt) {
  W.lodT2 = (W.lodT2 || 0) + dt;
  if (W.lodT2 > 0.5) { W.lodT2 = 0; return true; }
  return false;
}

export function updateWorld(W, dt, time, playerPos, events) {
  // солнце и центр карты теней — за игроком (шаг 4 м, чтобы тени не «дрожали»)
  if (W.sun) {
    const sx = Math.round(playerPos.x / 4) * 4, sz = Math.round(playerPos.z / 4) * 4;
    W.sun.target.position.set(sx, 0, sz);
    W.sun.position.set(sx + W.sunOff.x, W.sunOff.y, sz + W.sunOff.z);
    W.sun.target.updateMatrixWorld();
  }

  // двери (bank2 — вторая створка, её считаем отдельно ниже)
  for (const key in W.doorMeshes) {
    if (key === 'bank2') continue;
    const d = W.doorMeshes[key];
    if (!d || !d.userData.pivot) continue;
    const open = W.doors[key];
    const target = open ? -Math.PI / 2 * 0.92 : 0;
    d.userData.pivot.rotation.y = THREE.MathUtils.lerp(d.userData.pivot.rotation.y, target, 1 - Math.exp(-dt * 9));
  }
  if (W.doorMeshes.bank2) {
    const t = W.doors.bank ? Math.PI / 2 * 0.92 : Math.PI;
    W.doorMeshes.bank2.userData.pivot.rotation.y =
      THREE.MathUtils.lerp(W.doorMeshes.bank2.userData.pivot.rotation.y, t, 1 - Math.exp(-dt * 9));
  }

  // крыши скрываются, когда игрок внутри
  const inside = D.insideBuilding(playerPos.x, playerPos.z);
  if (W.houseRoof) W.houseRoof.visible = inside !== 'house';
  if (W.bankRoof) W.bankRoof.visible = inside !== 'bank';
  if (W.shopRoof) W.shopRoof.visible = inside !== 'shop';

  // трафик
  for (const c of W.traffic) {
    const v = c.speed * dt * c.dir;
    if (c.onX) {
      c.mesh.position.z += v;
      if (c.mesh.position.z > 118) c.mesh.position.z = -118;
      if (c.mesh.position.z < -118) c.mesh.position.z = 118;
      c.mesh.position.x = c.road + c.lane;
    } else {
      c.mesh.position.x += v;
      if (c.mesh.position.x > 118) c.mesh.position.x = -118;
      if (c.mesh.position.x < -118) c.mesh.position.x = 118;
      c.mesh.position.z = c.road + c.lane;
    }
    c.mesh.rotation.y = c.onX ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    // дальние машины не рисуем вообще
    if (doLodWorld(W, dt)) {
      c.mesh.visible = Math.hypot(c.mesh.position.x - playerPos.x, c.mesh.position.z - playerPos.z) < 72;
    }
  }

  // жители
  updateCivilians(W, dt, time, playerPos, events);

  // мигалки при тревоге
  if (W.alarm && W.alarmBtn) {
    const k = (Math.sin(time * 12) + 1) / 2;
    W.alarmBtn.material.color.setRGB(1, 0.1 + k * 0.4, 0.1);
  }
}

function updateCivilians(W, dt, time, playerPos, events) {
  W.lodT = (W.lodT || 0) + dt;
  const doLod = W.lodT > 0.4;
  if (doLod) W.lodT = 0;
  for (const c of W.civilians) {
    c.t += dt;
    const dpc = Math.hypot(c.x - playerPos.x, c.z - playerPos.z);
    if (doLod) {
      // дальше тумана жителей просто не показываем — экономим сотни draw call'ов
      const vis = dpc < 42;          // в смоге дальше 42 м жителя уже не разглядеть
      c.cull = !vis;
      c.mesh.visible = vis && !c.lodOn;
      if (c.lod) c.lod.visible = vis && c.lodOn;
      const wantLod = vis && dpc > 16;
      if (wantLod !== c.lodOn && c.lod) {
        c.lodOn = wantLod;
        c.mesh.visible = vis && !c.lodOn;
        c.lod.visible = vis && c.lodOn;
      }
    }
    if (c.cull) continue;
    if (c.state === 'dead') {
      c.dead += dt;
      if (c.lod) c.lod.visible = false;
      animateChar(c.mesh, 'dead', c.t);
      if (c.dead > 70) {
        // ресpawn подальше
        c.dead = 0; c.state = 'walk'; c.hp = 100;
        c.x = playerPos.x + (Math.random() - 0.5) * 160;
        c.z = playerPos.z + (Math.random() - 0.5) * 160;
        c.x = THREE.MathUtils.clamp(c.x, -100, 100); c.z = THREE.MathUtils.clamp(c.z, -100, 100);
        c.mesh.visible = !c.lodOn;
        if (c.lod) c.lod.visible = c.lodOn;
      }
      continue;
    }
    if (c.state === 'panic') {
      c.panicT -= dt;
      const dx = c.x - playerPos.x, dz = c.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      c.tx = c.x + dx / d * 6; c.tz = c.z + dz / d * 6;
      moveCiv(c, dt, 3.2);
      c.anim = 'panic';
      if (c.panicT <= 0) { c.state = 'walk'; c.anim = 'walk'; }
    } else if (c.state === 'gaze') {
      // смотрят на нас
      c.yaw = THREE.MathUtils.lerp(c.yaw, Math.atan2(playerPos.x - c.x, playerPos.z - c.z), 0.1);
      c.mesh.rotation.y = c.yaw;
      c.anim = 'idle';
      c.wait -= dt;
      if (c.wait <= 0) c.state = 'walk';
    } else if (c.aggro && c.kind === 'bad') {
      const d = Math.hypot(playerPos.x - c.x, playerPos.z - c.z);
      if (d > 2.4) { c.tx = playerPos.x; c.tz = playerPos.z; moveCiv(c, dt, 2.4); c.anim = 'run'; }
      else {
        c.anim = 'attack';
        c.yaw = Math.atan2(playerPos.x - c.x, playerPos.z - c.z);
        c.atk = (c.atk || 0) - dt;
        if (c.atk <= 0 && events && events.badAttack) { c.atk = 1.4; events.badAttack(c); }
      }
    } else {
      c.wait -= dt;
      if (c.wait <= 0) {
        c.wait = 3 + Math.random() * 7;
        if (Math.random() < 0.3) { c.state = 'idle'; c.anim = 'idle'; c.wait = 1.5 + Math.random() * 2.5; }
        else {
          const ang = Math.random() * Math.PI * 2, r = 6 + Math.random() * 22;
          c.tx = THREE.MathUtils.clamp(c.x + Math.cos(ang) * r, -104, 104);
          c.tz = THREE.MathUtils.clamp(c.z + Math.sin(ang) * r, -104, 104);
          c.state = 'walk'; c.anim = 'walk';
        }
      }
      if (c.state === 'walk') moveCiv(c, dt, c.speed);
      else c.anim = 'idle';

      // взгляд на игрока
      const dp = Math.hypot(playerPos.x - c.x, playerPos.z - c.z);
      if (dp < 9 && Math.random() < dt * 0.55) {
        c.state = 'gaze'; c.wait = 1.2 + Math.random() * 2.0;
        if (events && events.civSay && Math.random() < 0.5) {
          events.civSay(c, c.kind === 'bad' ? D.BAD_PHRASES : D.CIVILIAN_PHRASES);
        }
      }
      // плохие нападают, если мы в розыске
      if (c.kind === 'bad' && dp < 13 && events && events.wanted > 0 && Math.random() < dt * 0.1) {
        c.aggro = true;
      }
      if (c.aggro && dp > 34) c.aggro = false;
    }

    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.yaw;
    if (c.lodOn) {
      if (c.lod) {
        c.lod.position.set(c.x, 0, c.z);
        c.lod.rotation.y = c.yaw;
        // дешёвая «анимация»: лёгкое покачивание при ходьбе
        const moving = c.state === 'walk' || c.state === 'panic' || c.anim === 'run';
        c.lod.position.y = moving ? Math.abs(Math.sin(c.t * 7.5)) * 0.06 : 0;
      }
      c.mesh.visible = false;
    } else {
      animateChar(c.mesh, c.anim, c.t, c.speed);
    }
  }
}
function moveCiv(c, dt, speed) {
  const dx = c.tx - c.x, dz = c.tz - c.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.4) { c.wait = Math.min(c.wait, 0.2); return; }
  const step = Math.min(d, speed * dt);
  const nx = c.x + dx / d * step, nz = c.z + dz / d * step;
  const r = D.resolveCollision(nx, nz, 0.42, BOXES);
  if (Math.abs(r.x - nx) > 0.01 || Math.abs(r.z - nz) > 0.01) {
    // обход
    const perp = Math.sin(c.t * 3) > 0 ? 1 : -1;
    const sx = nx + (-dz / d) * perp * 0.8, sz = nz + (dx / d) * perp * 0.8;
    const r2 = D.resolveCollision(sx, sz, 0.42, BOXES);
    c.x = r2.x; c.z = r2.z;
  } else { c.x = r.x; c.z = r.z; }
  c.yaw = Math.atan2(dx, dz);
}

/* ---------------- события выстрелов для жителей ---------------- */
export function civiliansPanic(W, x, z, radius) {
  for (const c of W.civilians) {
    if (c.state === 'dead') continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < (radius || 45)) {
      c.state = 'panic';
      c.panicT = 7 + Math.random() * 8;
      c.anim = 'panic';
    }
  }
}
export function killCivilian(W, id) {
  const c = W.civilians.find(v => v.id === id);
  if (!c) return;
  c.state = 'dead'; c.dead = 0; c.anim = 'dead'; c.aggro = false;
}
export function hurtCivilian(W, id, dmg) {
  const c = W.civilians.find(v => v.id === id);
  if (!c) return;
  c.hp -= dmg;
  if (c.hp <= 0) { killCivilian(W, id); return true; }
  c.state = 'panic'; c.panicT = 10; c.aggro = c.kind === 'bad';
  return false;
}
export function damageCivilianLocal(W, id, dmg) { return hurtCivilian(W, id, dmg); }

/* ---------------- ближайший интерактив ---------------- */
export function nearestInteraction(W, px, pz, camDir) {
  let best = null, bestScore = 1e9;
  for (const it of W.interactions) {
    const d = Math.hypot(it.x - px, it.z - pz);
    if (d > it.r + 1.2) continue;
    let score = d;
    if (camDir) {
      const dx = (it.x - px) / (d || 1), dz = (it.z - pz) / (d || 1);
      const dot = dx * camDir.x + dz * camDir.z;
      score -= dot * 2.2;
    }
    if (it.type === 'money') {
      const pile = W.piles.find(p => p.id === it.pile);
      if (pile && pile.left <= 0) continue;
    }
    if (score < bestScore) { bestScore = score; best = it; }
  }
  if (W.truck && W.truck.visible) {
    const d = Math.hypot(W.truck.position.x - px, W.truck.position.z - pz);
    if (d < 7 && d - 2 < bestScore) {
      best = { type: 'job', x: W.truck.position.x, z: W.truck.position.z, r: 7, label: W.jobLabel || 'Грузовик: взять работу' };
      bestScore = d - 2;
    }
  }
  return best;
}
