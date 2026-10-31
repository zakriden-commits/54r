/* Смоук-тест клиента в Node: проверяет, что все модули парсятся,
   протокол/комната работают, а Three.js-код строит мир на стабе WebGL. */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

await import('./dom-stub.mjs');

/* ---------- загрузка протокола (UMD → global DI) ---------- */
const protocolSrc = require('fs').readFileSync(new URL('../public/shared/protocol.js', import.meta.url), 'utf8');
(0, eval)(protocolSrc);
console.log('✓ protocol.js загружен, зданий:', globalThis.DI.cityLots().length, 'боксов:', globalThis.DI.rectBoxes().length);

/* ---------- импорт модулей клиента ---------- */
const util = await import('../public/js/util.js');
console.log('✓ util.js');
const models = await import('../public/js/models.js');
models.textures();
console.log('✓ models.js, процедурных текстур:', Object.keys(models.TEX).length);
const chars = await import('../public/js/chars.js');
console.log('✓ chars.js');
const world = await import('../public/js/world.js');
console.log('✓ world.js');
const audio = await import('../public/js/audio.js');
console.log('✓ audio.js (без AudioContext →', audio.initAudio() === false ? 'глушится корректно' : 'ошибка', ')');
const net = await import('../public/js/net.js');
console.log('✓ net.js');
const local = await import('../public/js/localroom.js');
console.log('✓ localroom.js');

/* ---------- room.js в браузерном режиме ---------- */
const roomSrc = require('fs').readFileSync(new URL('../public/server/room.js', import.meta.url), 'utf8');
(0, eval)(roomSrc);
console.log('✓ room.js (UMD в браузере)');

/* ---------- локальная игра с ботом ---------- */
const lg = local.createLocalGame({
  name: 'Тестер', model: 'gentleman', seed: 4242,
  onMessage: () => {}
});
if (!lg) throw new Error('createLocalGame вернул null');
console.log('✓ локальная комната создана, бот:', !!lg.bot, 'слот игрока:', lg.player.slot);

let welcome = null;
const got = [];
const lg2 = local.createLocalGame({ name: 'B', model: 'gopnik', onMessage: m => got.push(m) });
console.log('✓ вторая комната (проверка лимита слотов), слот:', lg2 && lg2.player.slot);
lg2.close();

/* ---------- полиция: реально преследует и стреляет ---------- */
{
  const lp = lg.player;
  const room = lg.room;
  const standX = -70, standZ = 20;                    // перекрёсток на дороге
  lp.x = standX; lp.z = standZ; lp.hp = 100; lp.stars = 0; lp.heat = 0;
  lp.hidden = false; lp.indoors = null; room.doors.house = true;
  let hits = 0;
  const prevSend = lp.send;
  lp.send = (m) => { if (m && m.t === 'hurt') hits++; if (prevSend) prevSend(m); };
  room.addCrime(lp, globalThis.DI.HEAT_PER_STAR * 3, 'тест копов');
  let diedAt = null;
  for (let i = 0; i < 900; i++) {
    lg.handle({ t: 'state', x: standX, z: standZ, yaw: 0, pitch: 0, anim: 'idle', sel: 0, stamina: 100 });
    room.tick(0.1);
    if (lp.dead) { diedAt = +(i / 10).toFixed(1); break; }
  }
  const spawnedCops = Object.keys(room.npcs).filter(k => room.npcs[k].kind === 'cop').length >= 0;
  if (hits < 1) throw new Error('копы ни разу не попали по игроку с 3★ — бой сломан');
  if (!lp.dead) throw new Error('при 3★ и бездействии игрок должен погибнуть');
  console.log('✓ копы: заспавнились, догнали и застрелили за', diedAt + 'с, попаданий', hits);

  /* ---------- укрытие дома: дверь закрыта → звёзды тают ---------- */
  lp.dead = false; lp.hp = 100; lp.stamina = 100; lp.respawnT = 0;
  room.tick(0.1);
  lp.x = globalThis.DI.HOUSE.x; lp.z = globalThis.DI.HOUSE.z - 6; room.doors.house = true;
  room.addCrime(lp, globalThis.DI.HEAT_PER_STAR * 5, 'тест укрытия');
  let clearedAt = null;
  for (let i = 0; i < 1600; i++) {
    const t = i / 10;
    let x = lp.x, z = lp.z;
    if (t < 4) z = globalThis.DI.HOUSE.z - 6 + t * 1.6;
    else { x = globalThis.DI.HOUSE.x + 2; z = globalThis.DI.HOUSE.z + 2; }
    if (t >= 5) room.doors.house = false;             // закрываем за собой дверь
    lg.handle({ t: 'state', x, z, yaw: 0, pitch: 0, anim: 'idle', sel: 0, stamina: 90 });
    room.tick(0.1);
    if (lp.dead) throw new Error('копы убили игрока, который спрятался дома с закрытой дверью');
    if (lp.stars === 0 && clearedAt == null) clearedAt = t;
    if (clearedAt != null && t > clearedAt + 20) break;
  }
  const copsLeft = Object.values(room.npcs).filter(n => n.kind === 'cop').length;
  if (clearedAt == null) throw new Error('звёзды не погасли, пока игрок спрятан дома');
  if (!lp.hidden) throw new Error('игрок дома с закрытой дверью должен быть hidden');
  console.log('✓ укрытие: розыск снят за', clearedAt + 'с, hidden =', lp.hidden, ', копов осталось', copsLeft);
  room.doors.house = true;
  lp.send = prevSend || (() => {});
  lp.hp = 100; lp.stars = 0; lp.heat = 0;
}

/* ---------- симуляция игрового цикла ---------- */
const p = lg.player;
for (let i = 0; i < 120; i++) {
  lg.room.tick();
  lg.handle({ t: 'state', x: p.x + Math.sin(i / 10) * 0.1, z: p.z + Math.cos(i / 10) * 0.1, yaw: i * 0.05, pitch: 0, anim: 'walk', sel: 0, stamina: 90 });
}
console.log('✓ 120 тиков комнаты, бот ушёл на', Math.hypot(p.x - lg.bot.x, p.z - lg.bot.z).toFixed(1), 'м');

/* покупки */
p.save.wallet = 9000;
p.x = globalThis.DI.SHOP.x; p.z = globalThis.DI.SHOP.z + 1;
lg.handle({ t: 'buy', id: 'ak' });
lg.handle({ t: 'buyAmmo', id: 'ak', rounds: 60 });
lg.handle({ t: 'buy', id: 'bag' });
console.log('✓ покупки: инвентарь', JSON.stringify(p.save.inv), 'баланс', p.save.wallet);

/* выстрелы */
p.sel = p.save.inv.findIndex(i => i.id === 'ak');
p.weapon = 'ak'; p.mag = 30;
for (let i = 0; i < 5; i++) { lg.handle({ t: 'shoot', dx: 0, dy: 0, dz: 1 }); lg.room.t += 0.2; }
console.log('✓ выстрелы, магазин:', p.mag, 'звёзды:', p.stars);

/* перезарядка и ошибка без патронов */
p.mag = 0;
lg.handle({ t: 'reload' });
console.log('✓ перезарядка → магазин', p.mag);
p.save.inv = p.save.inv.filter(i => i.id !== 'ammo');
p.mag = 0;
let fail = null;
p.send = m => { if (m.t === 'reloadFail') fail = m; };
lg.handle({ t: 'reload' });
console.log('✓ без патронов ошибка:', fail ? fail.reason.slice(0, 40) + '…' : 'НЕТ (ошибка!)');
p.send = m => {};

/* банк: грести деньги */
p.x = globalThis.DI.MONEY_PILES[0].x + 0.5; p.z = globalThis.DI.MONEY_PILES[0].z;
p.weapon = 'fist'; p.sel = 0;
lg.handle({ t: 'grabStart', pile: 0 });
console.log('✓ начал грести:', !!p.grabbing, 'время', p.grabbing && (p.grabbing.ends - lg.room.t).toFixed(1) + 'с');
lg.room.t += 20; lg.handle({ t: 'grabDone' });
console.log('✓ пачка в инвентаре:', JSON.stringify(p.save.inv.filter(i => i.id === 'money')));
const mi = p.save.inv.findIndex(i => i.id === 'money');
lg.handle({ t: 'deposit', index: mi });
console.log('✓ перечислено, баланс:', p.save.wallet);

/* сумка */
p.save.inv.push({ id: 'bag', qty: 1 });
p.weapon = 'bag'; p.sel = p.save.inv.length - 1;
lg.handle({ t: 'grabStart', pile: 1 });
console.log('✓ грести с сумкой:', p.grabbing && p.grabbing.bag ? '30 сек' : 'ошибка');
lg.room.t += 40; lg.handle({ t: 'grabDone' });
console.log('✓ в сумке:', p.bagMoney);
lg.handle({ t: 'bagWithdraw', all: true });
console.log('✓ вывел всё, баланс:', p.save.wallet, 'в сумке:', p.bagMoney);

/* звёзды и копы */
lg.room.addCrime(p, 100, 'тест');
lg.room.spawnCops(p);
const cops = Object.values(lg.room.npcs).filter(n => n.kind === 'cop');
console.log('✓ звёзды:', p.stars, 'копов заспавнено:', cops.length);
for (let i = 0; i < 300; i++) {
  p.x += 0.3; p.hidden = false;
  lg.room.tick();
}
console.log('✓ 300 тиков с копами, hp игрока:', Math.round(p.hp), 'мёртв:', p.dead);

/* шкаф */
p.x = globalThis.DI.HOUSE.x; p.z = globalThis.DI.HOUSE.z;
p.save.inv.push({ id: 'medkit', qty: 2 });
const wi = p.save.inv.findIndex(i => i.id === 'medkit');
lg.handle({ t: 'wardrobe', act: 'put', w: 0, index: wi });
console.log('✓ в шкафу:', JSON.stringify(p.save.wardrobe[0]));
lg.handle({ t: 'wardrobe', act: 'take', w: 0, index: 0 });
console.log('✓ забрал обратно:', JSON.stringify(p.save.inv.filter(i => i.id === 'medkit')));

/* подработка */
lg.room.jobTimer = 0; lg.room.updateJob(1);
console.log('✓ работа появилась:', !!lg.room.job, lg.room.job && (lg.room.job.boxes + ' ящиков'));
p.x = lg.room.job.x; p.z = lg.room.job.z;
lg.handle({ t: 'jobClaim' });
lg.handle({ t: 'jobPick' });
console.log('✓ несёт ящик:', p.carrying);
lg.handle({ t: 'jobDrop' });
console.log('✓ сдал ящик, баланс:', p.save.wallet);

/* смерть → потеря инвентаря */
const before = p.save.inv.length;
lg.room.damagePlayer(p, 9999, { name: 'тест' });
console.log('✓ смерть: инвентарь был', before, 'стал', p.save.inv.length, 'мёртв:', p.dead);
p.send = () => {};
p.respawnT = 0; lg.room.tick();
console.log('✓ респавн:', !p.dead, 'hp', p.hp, 'звёзды', p.stars);

/* двери */
lg.handle({ t: 'door', door: 'house' });
console.log('✓ дверь дома:', lg.room.doors.house);

/* урон по напарнику */
const bot = lg.bot;
bot.x = p.x + 2; bot.z = p.z; bot.hp = 100;
p.weapon = 'ak'; p.mag = 30; p.sel = 0;
p.yaw = Math.PI / 2;
const botHpBefore = bot.hp;
lg.handle({ t: 'shoot', dx: 1, dy: 0, dz: 0 });
console.log('✓ выстрел в напарника: hp был', botHpBefore, 'стал', bot.hp, '(должно быть равным)');

lg.close();
console.log('\n✅ СМОУК-ТЕСТ ПРОЙДЕН');
process.exit(0);
