/* ============================================================
   DENI ISLAM — общий протокол / мир / баланс
   Один и тот же файл используется сервером (Node) и клиентом (браузер).
   Всё, что здесь лежит — детерминировано и одинаково для обоих игроков.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- детерминированный ГПСЧ ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    var r = mulberry32(seed >>> 0);
    return {
      f: function (a, b) { return a + (b - a) * r(); },
      i: function (a, b) { return Math.floor(a + (b - a + 1) * r()) ; },
      pick: function (arr) { return arr[Math.floor(r() * arr.length) % arr.length]; },
      chance: function (p) { return r() < p; },
      raw: r
    };
  }

  /* ---------------- константы ---------------- */
  var TICK = 0.1;                 // серверный тик, сек
  var MAX_PLAYERS = 2;            // 1 сервер = 2 человека
  var NET_HZ = 15;                // частота отправки состояния игрока
  var NPC_HZ = 10;                // частота отправки состояния NPC

  var HOUSE = { x: -40, z: 42, w: 12, d: 10, h: 4.4 };   // наш дом (спавн)
  var BANK  = { x: 26,  z: -40, w: 30, d: 22, h: 13 };   // большой банк
  var SHOP  = { x: 2,   z: -16, w: 10, d: 8,  h: 5 };    // магазин оружия
  var ROADS_Z = [-70, -28, 14, 56];
  var ROADS_X = [-70, -28, 14, 56];
  var ROAD_W = 11;

  var BEDS = [
    { x: HOUSE.x - 3.0, z: HOUSE.z + 2.6, rot: 0, slot: 0 },
    { x: HOUSE.x + 3.0, z: HOUSE.z + 2.6, rot: 0, slot: 1 }
  ];
  var WARDROBES = [
    { x: HOUSE.x - 5.2, z: HOUSE.z - 3.4, slot: 0 },
    { x: HOUSE.x + 5.2, z: HOUSE.z - 3.4, slot: 1 }
  ];
  var HOUSE_DOOR = { x: HOUSE.x + 2.2, z: HOUSE.z - HOUSE.d / 2, w: 2.2 };
  var SHOP_DOOR  = { x: SHOP.x, z: SHOP.z - SHOP.d / 2, w: 2.2 };
  var BANK_DOOR  = { x: BANK.x - 6, z: BANK.z - BANK.d / 2, w: 3.2 };

  // кучи денег: три в хранилище + одна у кассы
  var MONEY_PILES = [
    { id: 0, x: BANK.x + 7.6, z: BANK.z + 7.0, total: 0 },
    { id: 1, x: BANK.x + 10.6, z: BANK.z + 7.0, total: 0 },
    { id: 2, x: BANK.x + 13.4, z: BANK.z + 7.0, total: 0 },
    { id: 3, x: BANK.x - 7.0, z: BANK.z - 5.4, total: 0 } // у кассы
  ];
  // хранилище: северо-восток банка, вход с юга (щель между стенами)
  var VAULT = { x: BANK.x + 10.5, z: BANK.z + 7.5, w: 9.2, d: 6.6 };

  var GUARD_PATROL = [
    [{ x: BANK.x - 11, z: BANK.z - 6.5 }, { x: BANK.x + 1, z: BANK.z - 6.5 },
     { x: BANK.x + 1, z: BANK.z + 1.4 }, { x: BANK.x - 11, z: BANK.z + 1.4 }],
    [{ x: BANK.x + 4.5, z: BANK.z - 1.5 }, { x: BANK.x + 13, z: BANK.z - 1.5 },
     { x: BANK.x + 13, z: BANK.z + 2.6 }, { x: BANK.x + 10.5, z: BANK.z + 2.8 },
     { x: BANK.x + 8.6, z: BANK.z + 3.0 }, { x: BANK.x + 4.5, z: BANK.z + 1.0 }]
  ];
  var TELLER = { x: BANK.x - 7.0, z: BANK.z - 3.2 };
  var SHOPKEEPER = { x: SHOP.x, z: SHOP.z + 1.2 };
  var JOB_SITES = [
    { x: -22, z: 14 }, { x: 44, z: -28 }, { x: -58, z: -28 }, { x: 14, z: 56 }, { x: 56, z: 14 }
  ];

  /* ---------------- предметы / магазин ---------------- */
  var AMMO_KIND = { pistol: '9x19', rifle: '5.45', smg: '9x19', shotgun: '12к' };

  var ITEMS = {
    fist:    { id: 'fist', name: 'Кулаки', kind: 'melee', dmg: 11, rate: 0.55, range: 2.1, price: 0,
               desc: 'Старые добрые. Бесплатно, зато всегда с собой.' },

    glock:   { id: 'glock', name: 'Glock 17', kind: 'gun', cls: 'pistol', dmg: 21, rate: 0.15, mag: 17,
               reload: 1.4, spread: 0.016, range: 70, price: 450, ammoPrice: 3,
               desc: 'Лёгкий пистолет, 17 патронов. Дёшево и сердито.' },
    deagle:  { id: 'deagle', name: 'Desert Eagle .50', kind: 'gun', cls: 'pistol', dmg: 62, rate: 0.55, mag: 7,
               reload: 1.9, spread: 0.010, range: 90, price: 1500, ammoPrice: 7,
               desc: 'Ручная пушка. Сносит половину здоровья с одного попадания.' },
    mp5:     { id: 'mp5', name: 'HK MP5', kind: 'gun', cls: 'smg', dmg: 17, rate: 0.085, mag: 30,
              reload: 2.1, spread: 0.026, range: 60, price: 1300, ammoPrice: 3,
              desc: 'Пистолет-пулемёт. Льёт свинец очередями.' },
    ak:      { id: 'ak', name: 'АК-74', kind: 'gun', cls: 'rifle', dmg: 30, rate: 0.11, mag: 30,
              reload: 2.5, spread: 0.022, range: 120, price: 2600, ammoPrice: 4,
              desc: 'Автомат Калашникова. Классика суровых улиц.' },
    m4:      { id: 'm4', name: 'M4A1', kind: 'gun', cls: 'rifle', dmg: 27, rate: 0.095, mag: 30,
              reload: 2.3, spread: 0.018, range: 120, price: 3000, ammoPrice: 4,
              desc: 'Точнее Калаша, бьёт чуть мягче. Выбор джентльмена.' },
    shotgun: { id: 'shotgun', name: 'Mossberg 500', kind: 'gun', cls: 'shotgun', dmg: 15, rate: 0.85, mag: 6,
              reload: 2.9, spread: 0.075, range: 26, pellets: 7, price: 1500, ammoPrice: 5,
              desc: 'Дробовик. В упор — 7 дробин, очень больно.' },

    ammo:    { id: 'ammo', name: 'Патроны', kind: 'ammo', desc: 'Пачка патронов. Дёшево: 3-7$ за штуку.' },
    bag:     { id: 'bag', name: 'Сумка для денег', kind: 'bag', capacity: 90000, price: 380,
               desc: 'Вместительная сумка. С ней грести деньги в банке 30 секунд, но забираешь ВСЮ пачку сразу.' },
    medkit:  { id: 'medkit', name: 'Аптечка', kind: 'heal', heal: 55, price: 120,
               desc: 'Восстанавливает 55 HP. Использовать из инвентаря.' }
  };
  var SHOP_CATALOG = ['glock', 'deagle', 'mp5', 'ak', 'm4', 'shotgun', 'bag', 'medkit'];

  var INV_SLOTS = 10;
  var WARDROBE_SLOTS = 15;
  var MAX_CARRY_BUNDLES = 5;      // голыми руками
  var GRAB_TIME_HANDS = 15;       // сек
  var GRAB_TIME_BAG = 30;         // сек

  /* ---------------- игрок ---------------- */
  var PLAYER = {
    hp: 100, stamina: 100,
    speed: 4.5, sprint: 8.0, crouch: 2.4,
    radius: 0.42, eye: 1.62,
    sprintDrain: 15, sprintRegen: 13, idleRegen: 9,
    respawnTime: 5
  };

  /* ---------------- звёзды розыска ---------------- */
  var MAX_STARS = 5;
  var STAR_COOLDOWN = 14;      // сек без преступления до начала остывания
  var HEAT_MAX = 100;
  var HEAT_DECAY_OPEN = 1.9;   // на улице
  var HEAT_DECAY_HIDDEN = 6.5; // в доме с закрытой дверью
  var HEAT_PER_STAR = 20;
  var COP_SPEED = 4.85;
  var COP_DMG = 5;              // урон при 1★, +1 за каждую звезду
  var COP_RANGE = 32;
  var COP_FIRERATE = 1.35;      // базовая пауза между выстрелами одного копа
  var COP_ACC_NEAR = 0.44;      // точность в упор
  var COP_ACC_FAR = 0.11;       // точность на пределе дальности
  var COP_HP = 70;              // здоровье при 1★, +14 за звезду
  var COP_SPAWN_MIN = 55;       // наряд появляется не ближе
  var COP_SPAWN_MAX = 95;
  // общая очередь выстрелов на всю полицию: чем больше звёзд, тем чаще стреляют
  var COP_VOLLEY = [0, 1.5, 1.1, 0.85, 0.65, 0.5];
  var GUARD_DMG = 14;
  var GUARD_RANGE = 2.3;
  var GUARD_SPEED = 4.5;

  /* ---------------- подработки ---------------- */
  var JOBS = {
    boxValueMin: 30, boxValueMax: 110,
    bonusMin: 60, bonusMax: 520,
    respawnMin: 50, respawnMax: 95,
    lifetime: 130,
    phrases: [
      'Эй, братки! Помогите ящики в грузовик покидать, заплачу!',
      'Слушай, выручи — грузчик сбежал. Деньги дам, не обижу.',
      'Мужики, работа есть. Ящики, грузовик, наличные. Идёт?'
    ]
  };

  var CIVILIAN_PHRASES = [
    'Куда катишь, земляк?', 'Слышь, а правда банк грабанули?', 'Погодка суровая сегодня...',
    'Осторожно тут, копы шастают.', 'Красивый костюм, уважаю.', 'А чё это у вас тут?',
    'Я тут 40 лет живу, такого не видел.', 'Дай дорогу старому человеку.',
    'Слышал, в магазине оружия скидки...', 'Не шумите, дети спят.'
  ];
  var BAD_PHRASES = [
    'Чё зыришь? Проблемы?', 'Кошелёк гони, быстро!', 'Ты с какого района?',
    'Сейчас получишь битой по кепке.', 'Не liked мне твоя рожа.'
  ];

  /* ---------------- столкновения мира ---------------- */
  // дверные полотна: когда дверь ЗАКРЫТА, она становится стеной
  var DOOR_SLABS = {
    house: { x: HOUSE_DOOR.x, z: HOUSE.z - HOUSE.d / 2, w: HOUSE_DOOR.w - 0.1, d: 0.24, h: 2.15 },
    bank: { x: BANK_DOOR.x, z: BANK.z - BANK.d / 2, w: BANK_DOOR.w - 0.1, d: 0.24, h: 3.0 },
    shop: { x: SHOP_DOOR.x, z: SHOP.z - SHOP.d / 2, w: SHOP_DOOR.w - 0.1, d: 0.24, h: 2.15 }
  };
  function doorSlab(key) {
    var d = DOOR_SLABS[key];
    return { x: d.x, z: d.z, w: d.w, d: d.d, h: d.h, kind: 'door', door: key };
  }
  function rectBoxes() {
    var b = [];
    // городские дома (детерминированно из сида)
    var lots = cityLots();
    for (var i = 0; i < lots.length; i++) {
      b.push({ x: lots[i].x, z: lots[i].z, w: lots[i].w, d: lots[i].d, h: lots[i].h, kind: 'building', id: i });
    }
    // наш дом: 4 стены с проёмом под дверь
    wallSet(b, HOUSE, HOUSE_DOOR.x, HOUSE_DOOR.w, 'house');
    wallSet(b, SHOP, SHOP_DOOR.x, SHOP_DOOR.w, 'shop');
    wallSet(b, BANK, BANK_DOOR.x, BANK_DOOR.w, 'bank');
    // внутренняя стена дома (спальня | гостиная) с проёмом
    b.push({ x: HOUSE.x - 3.6, z: HOUSE.z + 0.1, w: 4.8, d: 0.25, h: HOUSE.h, kind: 'wall', indoor: 'house' });
    b.push({ x: HOUSE.x + 4.2, z: HOUSE.z + 0.1, w: 3.6, d: 0.25, h: HOUSE.h, kind: 'wall', indoor: 'house' });
    // хранилище банка: южная стена со входом (щель 5 м), западная стена
    // южная стена хранилища: вход-щель 4 м (от x+6.6 до x+10.6)
    b.push({ x: BANK.x + 1.75, z: BANK.z + 4.0, w: 9.9, d: 0.5, h: 5, kind: 'wall', indoor: 'bank' });
    b.push({ x: BANK.x + 12.95, z: BANK.z + 4.0, w: 4.7, d: 0.5, h: 5, kind: 'wall', indoor: 'bank' });
    b.push({ x: BANK.x + 5.7, z: BANK.z + 7.5, w: 0.5, d: 7.0, h: 5, kind: 'wall', indoor: 'bank' });
    // стойка кассы
    b.push({ x: BANK.x - 7.0, z: BANK.z - 4.2, w: 7.0, d: 0.9, h: 1.15, kind: 'counter', indoor: 'bank' });
    // стойка магазина
    b.push({ x: SHOP.x, z: SHOP.z - 0.6, w: 4.6, d: 0.9, h: 1.1, kind: 'counter', indoor: 'shop' });
    return b;
  }

  function wallSet(out, bld, doorX, doorW, kind) {
    var x = bld.x, z = bld.z, w = bld.w, d = bld.d, h = bld.h;
    // южная стена (фасад) с дверным проёмом
    var left = (doorX - doorW / 2) - (x - w / 2);
    var right = (x + w / 2) - (doorX + doorW / 2);
    if (left > 0.2) out.push({ x: x - w / 2 + left / 2, z: z - d / 2, w: left, d: 0.3, h: h, kind: kind + '-wall' });
    if (right > 0.2) out.push({ x: x + w / 2 - right / 2, z: z - d / 2, w: right, d: 0.3, h: h, kind: kind + '-wall' });
    out.push({ x: doorX, z: z - d / 2, w: doorW, d: 0.3, h: h - 2.15, kind: kind + '-lintel', top: 2.15 });
    // остальные стены
    out.push({ x: x, z: z + d / 2, w: w, d: 0.3, h: h, kind: kind + '-wall' });
    out.push({ x: x - w / 2, z: z, w: 0.3, d: d, h: h, kind: kind + '-wall' });
    out.push({ x: x + w / 2, z: z, w: 0.3, d: d, h: h, kind: kind + '-wall' });
  }

  function cityLots() {
    var rng = makeRng(9137);
    var out = [];
    var gx = ROADS_X.slice().sort(function (a, b) { return a - b; });
    var gz = ROADS_Z.slice().sort(function (a, b) { return a - b; });
    var EDGE = 108;
    var bx = [-EDGE].concat(gx).concat([EDGE]);
    var bz = [-EDGE].concat(gz).concat([EDGE]);
    for (var i = 0; i < bx.length - 1; i++) {
      for (var j = 0; j < bz.length - 1; j++) {
        var x0 = bx[i] + ROAD_W / 2 + 3.4, x1 = bx[i + 1] - ROAD_W / 2 - 3.4;
        var z0 = bz[j] + ROAD_W / 2 + 3.4, z1 = bz[j + 1] - ROAD_W / 2 - 3.4;
        var bw = x1 - x0, bd = z1 - z0;
        if (bw < 9 || bd < 9) continue;
        var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (reserved(cx, cz)) continue;
        if (rng.chance(0.14)) continue; // сквер/пустырь
        var nx = bw > 21 ? 2 : 1, nz = bd > 21 ? 2 : 1;
        for (var a = 0; a < nx; a++) {
          for (var b = 0; b < nz; b++) {
            var cw = bw / nx, cd = bd / nz;
            var lx = x0 + cw * (a + 0.5), lz = z0 + cd * (b + 0.5);
            if (reserved(lx, lz)) continue;
            if (rng.chance(0.13)) continue;
            var w = Math.min(cw - 3.0, rng.f(9.5, 15));
            var d = Math.min(cd - 3.0, rng.f(9.5, 15));
            if (w < 7 || d < 7) continue;
            var h = rng.chance(0.2) ? rng.f(18, 46) : rng.f(6, 17);
            out.push({
              x: lx + rng.f(-1.2, 1.2), z: lz + rng.f(-1.2, 1.2), w: w, d: d, h: h,
              hue: rng.i(0, 359), style: rng.i(0, 3), seed: rng.i(1, 99999)
            });
          }
        }
      }
    }
    return out;
  }
  function reserved(x, z) {
    function inb(b, pad) {
      return Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad;
    }
    if (inb(HOUSE, 10)) return true;
    if (inb(BANK, 12)) return true;
    if (inb(SHOP, 8)) return true;
    for (var i = 0; i < JOB_SITES.length; i++) if (inb(JOB_SITES[i], 9)) return true;
    return false;
  }
  function nearRoad(x, z, padX, padZ) {
    padX = padX || 0; padZ = padZ || 0;
    for (var i = 0; i < ROADS_Z.length; i++) if (Math.abs(z - ROADS_Z[i]) < ROAD_W / 2 + padZ) return true;
    for (var j = 0; j < ROADS_X.length; j++) if (Math.abs(x - ROADS_X[j]) < ROAD_W / 2 + padX) return true;
    return false;
  }

  function insideBuilding(x, z) {
    function inb(b) { return Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2; }
    if (inb(HOUSE)) return 'house';
    if (inb(BANK)) return 'bank';
    if (inb(SHOP)) return 'shop';
    return null;
  }

  /* ---------------- физика: круг против AABB ---------------- */
  function resolveCollision(px, pz, r, boxes) {
    var x = px, z = pz;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.top) continue; // перемычка над дверью — не мешает
      var hx = b.w / 2, hz = b.d / 2;
      var cx = Math.max(b.x - hx, Math.min(x, b.x + hx));
      var cz = Math.max(b.z - hz, Math.min(z, b.z + hz));
      var dx = x - cx, dz = z - cz;
      var d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        var d = Math.sqrt(d2) || 0.0001;
        if (d2 > 0.00001) { x = cx + dx / d * r; z = cz + dz / d * r; }
        else {
          // центр внутри бокса — выталкиваем по кратчайшей оси
          var ox = hx + r - Math.abs(x - b.x), oz = hz + r - Math.abs(z - b.z);
          if (ox < oz) x += (x < b.x ? -ox : ox); else z += (z < b.z ? -oz : oz);
        }
      }
    }
    if (x < -118) x = -118; if (x > 118) x = 118;
    if (z < -118) z = -118; if (z > 118) z = 118;
    return { x: x, z: z };
  }

  // отрезок против AABB (slab-метод): для пуль и линии видимости
  function segHitsBox(x0, z0, x1, z1, b) {
    var t0 = 0, t1 = 1;
    var dx = x1 - x0, dz = z1 - z0;
    var minX = b.x - b.w / 2, maxX = b.x + b.w / 2;
    var minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;

    if (Math.abs(dx) < 1e-9) { if (x0 < minX || x0 > maxX) return false; }
    else {
      var ta = (minX - x0) / dx, tb = (maxX - x0) / dx;
      if (ta > tb) { var s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
    if (Math.abs(dz) < 1e-9) { if (z0 < minZ || z0 > maxZ) return false; }
    else {
      var tc = (minZ - z0) / dz, td = (maxZ - z0) / dz;
      if (tc > td) { var s2 = tc; tc = td; td = s2; }
      t0 = Math.max(t0, tc); t1 = Math.min(t1, td);
      if (t0 > t1) return false;
    }
    return true;
  }
  function losBlocked(x0, z0, x1, z1, boxes) {
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.top) continue;
      if (b.h < 1.4) continue;
      if (segHitsBox(x0, z0, x1, z1, b)) return true;
    }
    return false;
  }

  /* ---------------- утилиты ---------------- */
  function dist(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function money(n) { return '$' + Math.round(n).toLocaleString('ru-RU'); }

  var api = {
    TICK: TICK, MAX_PLAYERS: MAX_PLAYERS, NET_HZ: NET_HZ, NPC_HZ: NPC_HZ,
    HOUSE: HOUSE, BANK: BANK, SHOP: SHOP, ROADS_Z: ROADS_Z, ROADS_X: ROADS_X, ROAD_W: ROAD_W,
    BEDS: BEDS, WARDROBES: WARDROBES, HOUSE_DOOR: HOUSE_DOOR, SHOP_DOOR: SHOP_DOOR, BANK_DOOR: BANK_DOOR,
    DOOR_SLABS: DOOR_SLABS, doorSlab: doorSlab,
    MONEY_PILES: MONEY_PILES, VAULT: VAULT, GUARD_PATROL: GUARD_PATROL, TELLER: TELLER,
    SHOPKEEPER: SHOPKEEPER, JOB_SITES: JOB_SITES,
    ITEMS: ITEMS, SHOP_CATALOG: SHOP_CATALOG, AMMO_KIND: AMMO_KIND,
    INV_SLOTS: INV_SLOTS, WARDROBE_SLOTS: WARDROBE_SLOTS, MAX_CARRY_BUNDLES: MAX_CARRY_BUNDLES,
    GRAB_TIME_HANDS: GRAB_TIME_HANDS, GRAB_TIME_BAG: GRAB_TIME_BAG,
    PLAYER: PLAYER, MAX_STARS: MAX_STARS, STAR_COOLDOWN: STAR_COOLDOWN, HEAT_MAX: HEAT_MAX,
    HEAT_DECAY_OPEN: HEAT_DECAY_OPEN, HEAT_DECAY_HIDDEN: HEAT_DECAY_HIDDEN, HEAT_PER_STAR: HEAT_PER_STAR,
    COP_SPEED: COP_SPEED, COP_DMG: COP_DMG, COP_RANGE: COP_RANGE, COP_FIRERATE: COP_FIRERATE,
    COP_ACC_NEAR: COP_ACC_NEAR, COP_ACC_FAR: COP_ACC_FAR, COP_HP: COP_HP,
    COP_SPAWN_MIN: COP_SPAWN_MIN, COP_SPAWN_MAX: COP_SPAWN_MAX, COP_VOLLEY: COP_VOLLEY,
    GUARD_DMG: GUARD_DMG, GUARD_RANGE: GUARD_RANGE, GUARD_SPEED: GUARD_SPEED,
    JOBS: JOBS, CIVILIAN_PHRASES: CIVILIAN_PHRASES, BAD_PHRASES: BAD_PHRASES,
    makeRng: makeRng, rectBoxes: rectBoxes, cityLots: cityLots, nearRoad: nearRoad,
    insideBuilding: insideBuilding, resolveCollision: resolveCollision, losBlocked: losBlocked,
    dist: dist, clamp: clamp, money: money
  };
  return api;
});
