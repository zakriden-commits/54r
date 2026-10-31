/* Рендер-тест: настоящий three.js + настоящие билдеры мира и персонажей.
   Проверяет, что сцена строится, кадры рисуются, анимации не ломают позы,
   в геометриях нет NaN, интерактивы находятся, двери и жители живут.
   Работает на стабе WebGL (tools/dom-stub.mjs). */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

await import('./dom-stub.mjs');

/* протокол → window.DI (UMD) */
const protocolSrc = require('fs').readFileSync(new URL('../public/shared/protocol.js', import.meta.url), 'utf8');
(0, eval)(protocolSrc);
const DI = globalThis.DI;
if (!DI) throw new Error('DI не появился');

const THREE = await import('../public/vendor/three/three.module.js');
console.log('✓ three.js r' + THREE.REVISION);

const models = await import('../public/js/models.js');
models.textures();
const chars = await import('../public/js/chars.js');
const world = await import('../public/js/world.js');

/* ---------- рендерер ---------- */
const canvas = document.createElement('canvas');
canvas.width = 320; canvas.height = 240;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(320, 240, false);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
console.log('✓ WebGLRenderer создан:', renderer.getContext() ? 'контекст есть' : 'НЕТ КОНТЕКСТА');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 320 / 240, 0.1, 400);
camera.position.set(0, 8, 20);

/* ---------- мир ---------- */
const W = world.buildWorld(scene, 4242);
let root0;
if (!W || !W.root) throw new Error('buildWorld не вернул мир');
let meshes = 0, tris = 0, lights = 0;
scene.traverse(o => {
  if (o.isMesh) {
    meshes++;
    const g = o.geometry;
    if (!g) throw new Error('меш без геометрии');
    const pos = g.attributes && g.attributes.position;
    if (!pos) throw new Error('меш без position: ' + (o.name || o.type));
    for (let i = 0; i < pos.array.length; i++) {
      if (!Number.isFinite(pos.array[i])) throw new Error('NaN в геометрии меша ' + (o.name || o.type));
    }
    const idx = g.index;
    tris += (idx ? idx.count : pos.count) / 3;
  }
  if (o.isLight) lights++;
});
{
  const cnt = (o) => { let n = 0; o.traverse(x => { if (x.isMesh) n++; }); return n; };
  console.log('   static мешей:', cnt(W.static), '| динамических корневых:', cnt(root0 = (scene.children.find(c => c !== W.static && c.isGroup) || new THREE.Group())),
    '| всего в сцене:', cnt(scene), '| propDrawCalls:', W.propDrawCalls);
  const byTop = new Map();
  for (const c of scene.children) {
    let n = 0; c.traverse(x => { if (x.isMesh) n++; });
    byTop.set((c.name || c.type) + (c === W.static ? '(static)' : '') + (c === W.root ? '(root)' : ''), n);
  }
  console.log('   меши по детям сцены:', Array.from(byTop.entries()).map(e=>e[0]+':'+e[1]).join(', '));
  const byName = new Map();
  function walk(o, tag) {
    const t = o.name && /^(static|houseDyn|bankDyn|shopDyn|propsSrc)$/.test(o.name) ? o.name : tag;
    if (o.isMesh) byName.set(t, (byName.get(t) || 0) + 1);
    for (const c of o.children) walk(c, t);
  }
  walk(W.root, 'root/прочее');
  console.log('   меши по группам:', Array.from(byName.entries()).sort((a,b)=>b[1]-a[1]).map(e=>e[0]+':'+e[1]).join(', '));
  const perChild = [];
  for (const c of W.root.children) {
    let n = 0; c.traverse(x => { if (x.isMesh) n++; });
    perChild.push((c.name || c.type) + ':' + n);
  }
  console.log('   дети root:', perChild.sort((a,b)=>parseInt(b.split(':')[1])-parseInt(a.split(':')[1])).slice(0, 14).join(', '), '| всего детей', W.root.children.length);
}
console.log('✓ мир построен: мешей', meshes, '| треугольников ~' + Math.round(tris).toLocaleString('ru'),
  '| светильников', lights, '| коллизий', W.boxes.length, '| жителей', W.civilians.length,
  '| машин', W.traffic.length, '| интерактивов', W.interactions.length);
if (meshes < 400) throw new Error('слишком мало мешей в мире: ' + meshes);
if (Object.keys(W.pileMeshes).length !== DI.MONEY_PILES.length) {
  throw new Error('кучи денег: ' + Object.keys(W.pileMeshes).length + ' из ' + DI.MONEY_PILES.length);
}
if (!W.doorMeshes.house || !W.doorMeshes.bank || !W.doorMeshes.bank2 || !W.doorMeshes.shop) {
  throw new Error('не все двери созданы: ' + Object.keys(W.doorMeshes).join(','));
}
// мир задаёт состояние дверей из комнаты: по умолчанию всё открыто
W.doors.house = true; W.doors.bank = true; W.doors.shop = true;
W.piles = DI.MONEY_PILES.map(p => ({ id: p.id, left: p.amount }));

/* ---------- персонажи ---------- */
const specs = [
  ['gentleman', () => chars.makeGentleman()],
  ['gopnik', () => chars.makeGopnik()],
  ['old', () => chars.makeCivilian('old', 0)],
  ['norm', () => chars.makeCivilian('norm', 1)],
  ['bad', () => chars.makeCivilian('bad', 2)],
  ['cop', () => chars.makeByKind('cop')],
  ['guard', () => chars.makeByKind('guard')],
  ['teller', () => chars.makeByKind('teller')],
  ['shopkeeper', () => chars.makeByKind('shopkeeper')],
  ['driver', () => chars.makeDriver()]
];
const made = [];
for (let i = 0; i < specs.length; i++) {
  const [k, fn] = specs[i];
  const g = fn();
  if (!g) throw new Error('не создался персонаж ' + k);
  const pp = g.userData.p;
  if (!pp || !g.userData.inner) throw new Error('у ' + k + ' нет userData.p/inner');
  for (const part of ['head', 'torso', 'armL', 'armR', 'legL', 'legR']) {
    if (!pp[part]) throw new Error('у ' + k + ' нет части ' + part);
  }
  g.position.set(i * 1.5 - 7, 0, DI.HOUSE.z + 16);
  scene.add(g);
  made.push({ g, k });
}
console.log('✓ персонажи: ' + specs.map(s => s[0]).join(', '));

const label = chars.makeLabel('ДЖЕНТЛЬМЕН', '#ffd76a', 'вы');
if (!label) throw new Error('makeLabel не сработал');
made[0].g.add(label);
label.position.y = 2.35;
chars.updateLabel(label, 'ГОПНИК', '#7fd4ff', 'напарник');

/* ---------- анимации ---------- */
const anims = ['idle', 'walk', 'run', 'attack', 'reload', 'aim', 'carry', 'grab', 'panic', 'cower', 'sleep', 'dead', 'sit'];
let t = 0;
for (const a of anims) {
  for (const m of made) {
    try { chars.animateChar(m.g, a, t, 1.2); }
    catch (e) { throw new Error('animateChar сломался на ' + m.k + '/' + a + ': ' + e.message); }
    const pp = m.g.userData.p;
    for (const part of ['head', 'torso', 'armL', 'armR', 'legL', 'legR']) {
      const o = pp[part];
      if (!Number.isFinite(o.rotation.x) || !Number.isFinite(o.rotation.z) || !Number.isFinite(o.position.y)) {
        throw new Error('NaN в позе ' + m.k + '/' + a + '/' + part);
      }
    }
    if (!Number.isFinite(m.g.userData.inner.position.y)) throw new Error('NaN в inner.y на ' + m.k + '/' + a);
  }
  t += 0.1;
}
console.log('✓ анимации (' + anims.length + ' шт.) прогнаны на всех моделях без NaN');

const gun = models.makeGun('ak');
if (!gun) throw new Error('makeGun(ak) не сработал');
made[0].g.add(gun);
chars.poseWithWeapon(made[0].g, gun, true);
chars.poseWithWeapon(made[1].g, null, false);
made[1].g.add(models.makeBag());
for (const g of Object.keys(DI.ITEMS)) {
  if (g === 'fist' || g === 'ammo' || g === 'bag' || g === 'medkit') continue;
  const m = models.makeGun(g);
  if (!m) throw new Error('makeGun(' + g + ') пустой');
  let n = 0; m.traverse(o => { if (o.isMesh) n++; });
  if (n < 4) throw new Error('модель ' + g + ' слишком бедная: ' + n + ' мешей');
}
console.log('✓ модели оружия (glock/deagle/mp5/ak/m4/shotgun/baton/pipe), сумка и аптечка создаются');

/* ---------- кадры ---------- */
let px = DI.HOUSE.x, pz = DI.HOUSE.z - 10;

/* draw call'ы в трёх характерных точках: улица, дом, банк */
function drawCallsAt(x, z, label, detail) {
  renderer.info.reset();
  for (let k = 0; k < 40; k++) world.updateWorld(W, 1 / 60, 1 + k / 60, { x, z }, events0);
  renderer.info.reset();
  camera.position.set(x - 4, 5.5, z - 6);
  camera.lookAt(x, 1.6, z + 2);
  renderer.render(scene, camera);
  const calls = renderer.info.render.calls;
  if (detail) {
    // сколько мешей реально попадает во фрустум по категориям
    const fr = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let visCiv = 0, visLod = 0, visCar = 0, visStatic = 0, visOther = 0, hidden = 0;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (!o.visible || (o.parent && !o.parent.visible)) { hidden++; return; }
      if (!fr.intersectsObject(o)) return;
      let tag = 'other', p = o.parent;
      while (p) { if (p.name === 'static') { tag = 'static'; break; } p = p.parent; }
      if (tag === 'static') visStatic++;
      else if (W.civilians.some(c => c.mesh === o.parent)) visCiv++;
      else if (W.civilians.some(c => c.lod === o.parent)) visLod++;
      else if (W.traffic.some(c => c.mesh === o.parent || c.mesh === o.parent.parent)) visCar++;
      else visOther++;
    });
    console.log('   видимо во фрустуме: статика ' + visStatic + ', жители ' + visCiv + ', LOD-жители ' + visLod +
      ', машины ' + visCar + ', прочее ' + visOther + ' (скрыто ' + hidden + ')');
  }
  console.log('   draw calls — ' + label + ':', calls);
  if (calls > 420) throw new Error('в точке «' + label + '» слишком много draw call: ' + calls);
  return calls;
}
const events0 = { shots: [], fx: [] };
// тестовые персонажи стоят у дома — на время замеров прячем, чтобы считать только город
made.forEach(m => { m.g.visible = false; });
const cStreet = drawCallsAt(-70, 20, 'перекрёсток', true);
const cHouse = drawCallsAt(DI.HOUSE.x + 2, DI.HOUSE.z + 2, 'внутри дома');
W.doors.bank = true;
const cBank = drawCallsAt(DI.MONEY_PILES[1].x, DI.MONEY_PILES[1].z, 'в хранилище банка');
made.forEach(m => { m.g.visible = true; });
console.log('✓ бюджет по сценам (без тестовых персонажей): улица ' + cStreet + ', дом ' + cHouse + ', банк ' + cBank);
const events = {
  shots: [], fx: [],
  civSay: (c, arr) => { if (!arr || !arr.length) throw new Error('civSay без фраз'); },
  badAttack: (c) => { if (!c) throw new Error('badAttack без цели'); }
};
const frames = 150;
for (let f = 0; f < frames; f++) {
  const dt = 1 / 30;
  t += dt;
  px += Math.sin(f / 20) * 0.12;
  pz += 0.06;
  for (const m of made) {
    chars.animateChar(m.g, f % 40 < 20 ? 'walk' : 'idle', t, 1.0);
    m.g.rotation.y += 0.01;
  }
  if (f === 20) W.doors.house = false;                 // закрываем дверь дома
  if (f === 40) { W.doors.bank = false; W.alarm = true; }
  if (f === 80) { W.doors.bank = true; W.doors.shop = !W.doors.shop; }
  try { world.updateWorld(W, dt, t, { x: px, z: pz }, events); }
  catch (e) { throw new Error('updateWorld упал на кадре ' + f + ': ' + e.stack); }
  camera.position.set(px - 4, 5.5, pz - 6);
  camera.lookAt(px, 1.6, pz + 2);
  renderer.render(scene, camera);
}
console.log('✓ ' + frames + ' кадров: draw calls', renderer.info.render.calls,
  '| треугольников', renderer.info.render.triangles,
  '| геометрий', renderer.info.memory.geometries, '| текстур', renderer.info.memory.textures);
if (renderer.info.memory.geometries < 50) throw new Error('геометрии не дошли до GPU');
const drawLimit = 620;   // в тестовой сцене dodatkowo 10 персонажей (~200 draw call)
if (renderer.info.render.calls > drawLimit) {
  throw new Error('слишком много draw call: ' + renderer.info.render.calls + ' > ' + drawLimit + ' — на телефоне будут лаги');
}
console.log('✓ draw calls в бюджете телефона (лимит ' + drawLimit + ')');
// двери: отдельная проверка анимации (в кадрах выше состояние могло перезаписаться)
const pivH = W.doorMeshes.house.userData.pivot;
const pivB = W.doorMeshes.bank.userData.pivot;
const pivB2 = W.doorMeshes.bank2.userData.pivot;
const pivS = W.doorMeshes.shop.userData.pivot;
W.doors.house = true;
for (let i = 0; i < 150; i++) world.updateWorld(W, 1 / 30, t + i / 30, { x: DI.HOUSE.x, z: DI.HOUSE.z - 8 }, events);
const openY = pivH.rotation.y;
W.doors.house = false; W.doors.bank = false; W.doors.shop = false;
for (let i = 0; i < 150; i++) world.updateWorld(W, 1 / 30, t + i / 30, { x: DI.HOUSE.x, z: DI.HOUSE.z - 8 }, events);
console.log('   дверь дома: открыто ' + openY.toFixed(3) + ' → закрыто ' + pivH.rotation.y.toFixed(3));
if (Math.abs(openY) < 1.0) throw new Error('дверь дома не открылась: ' + openY);
if (Math.abs(pivH.rotation.y) > 0.35) throw new Error('дверь дома не закрылась: ' + pivH.rotation.y);
if (Math.abs(pivB.rotation.y) > 0.35) throw new Error('стеклянная дверь банка не закрылась: ' + pivB.rotation.y);
// вторая створка банка: закрыта = π (прижата к раме), открыта = +π/2*0.92
if (Math.abs(pivB2.rotation.y - Math.PI) > 0.3) throw new Error('вторая створка банка не закрылась: ' + pivB2.rotation.y);
if (Math.abs(pivS.rotation.y) > 0.35) throw new Error('дверь магазина не закрылась: ' + pivS.rotation.y);
W.doors.bank = true;
for (let i = 0; i < 150; i++) world.updateWorld(W, 1 / 30, t + i / 30, { x: DI.HOUSE.x, z: DI.HOUSE.z - 8 }, events);
if (pivB2.rotation.y < 1.0) throw new Error('вторая створка банка не открылась: ' + pivB2.rotation.y);
W.doors.bank = false;
const closedY = pivH.rotation.y;
W.doors.house = true;
for (let i = 0; i < 150; i++) world.updateWorld(W, 1 / 30, t + i / 30, { x: DI.HOUSE.x, z: DI.HOUSE.z - 8 }, events);
if (Math.abs(pivH.rotation.y) < 1.0) throw new Error('дверь дома не открылась снова: ' + pivH.rotation.y);
console.log('✓ двери анимируются: открытие ' + pivH.rotation.y.toFixed(2) + ' рад, закрытие ' + closedY.toFixed(2) + ' рад');
W.doors.house = true; W.doors.bank = true; W.doors.shop = true;
if (renderer.info.memory.geometries < 50) throw new Error('геометрии не дошли до GPU');

/* ---------- интерактивы ---------- */
function near(x, z, want) {
  const it = world.nearestInteraction(W, x, z, { x: 0, z: 1 });
  if (!it) throw new Error('у (' + x.toFixed(1) + ',' + z.toFixed(1) + ') нет интерактива, ждали ' + want);
  if (want && it.type !== want) throw new Error('у (' + x.toFixed(1) + ',' + z.toFixed(1) + ') тип ' + it.type + ', ждали ' + want);
  return it;
}
const p0 = DI.MONEY_PILES[0];
const itMoney = near(p0.x, p0.z + 1.4, 'money');
near(DI.BEDS[0].x, DI.BEDS[0].z + 1.4, 'bed');
near(DI.WARDROBES[0].x, DI.WARDROBES[0].z + 1.6, 'wardrobe');
near(DI.SHOPKEEPER.x, DI.SHOPKEEPER.z - 1.4, 'shop');
near(DI.HOUSE_DOOR.x, DI.HOUSE.z - DI.HOUSE.d / 2 - 1.2, 'door');
near(DI.BANK_DOOR.x, DI.BANK.z - DI.BANK.d / 2 - 1.4, 'door');
near(DI.SHOP_DOOR.x, DI.SHOP.z - DI.SHOP.d / 2 - 1.2, 'door');
console.log('✓ интерактивы находятся: деньги («' + itMoney.label + '»), кровати, шкафы, прилавок, 3 двери');

// куча с нулём денег не кликается
W.piles.find(p => p.id === itMoney.pile).left = 0;
const gone = world.nearestInteraction(W, p0.x, p0.z + 1.4, { x: 0, z: 1 });
if (gone && gone.type === 'money' && gone.pile === itMoney.pile) throw new Error('пустая куча всё ещё интерактивна');
W.piles.find(p => p.id === itMoney.pile).left = 5000;
console.log('✓ пустая куча денег перестаёт быть интерактивной');

/* ---------- жители ---------- */
const civ = W.civilians[0];
if (!civ) throw new Error('в мире нет жителей');
world.civiliansPanic(W, civ.x, civ.z, 40);
if (civ.state !== 'panic') throw new Error('житель не испугался');
world.hurtCivilian(W, civ.id, 40);
world.killCivilian(W, civ.id);
if (civ.state !== 'dead') throw new Error('житель не умер');
const kindsFound = new Set(W.civilians.map(c => c.kind));
console.log('✓ жители: паника/урон/смерть работают, типы в городе:', Array.from(kindsFound).join(', '));
for (let f = 0; f < 60; f++) world.updateWorld(W, 1 / 30, t + f / 30, { x: civ.x, z: civ.z }, events);

/* ---------- грузовик с работой ---------- */
if (!W.truck) throw new Error('нет грузовика для подработки');
W.truck.visible = true;
const job = world.nearestInteraction(W, W.truck.position.x + 1, W.truck.position.z, { x: 0, z: 1 });
if (!job || job.type !== 'job') throw new Error('грузовик не даёт работу: ' + (job && job.type));
console.log('✓ грузовик виден и предлагает работу («' + job.label + '»)');

renderer.dispose();
console.log('\n✅ РЕНДЕР-ТЕСТ ПРОЙДЕН');
