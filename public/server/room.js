/* ============================================================
   DENI ISLAM — игровая комната (общая логика)
   Используется и настоящим сервером (Node+ws), и локальным
   офлайн-режимом в браузере (бот-напарник).
   Комната авторитетна: урон, звёзды, копы, охрана, деньги,
   магазин, шкафы, подработки, сохранения.
   ============================================================ */
(function (root, factory) {
  var DI;
  if (typeof module === 'object' && module.exports) {
    // файл живёт в public/server/ — protocol.js рядом в public/shared/
    DI = root.DI || require('../shared/protocol.js');
    module.exports = factory(DI);
  } else {
    DI = root.DI;
    root.DIRoom = factory(DI);
  }
})(typeof self !== 'undefined' ? self : this, function (DI) {
  'use strict';

  function num(v, d) { const n = Number(v); return isFinite(n) ? n : d; }
  function int(v, d) { const n = parseInt(v, 10); return isFinite(n) ? n : d; }
  function str(v, d) { return typeof v === 'string' ? v : d; }

  function defaultSave() {
    return {
      name: 'Игрок', model: 'gentleman', wallet: 250,
      inv: [{ id: 'fist', qty: 1 }],
      wardrobe: [[], []],
      bagMoney: 0,
      stats: { robbed: 0, kills: 0, deaths: 0, jobs: 0, earned: 0 },
      v: 1
    };
  }
  function validSlot(s) {
    if (!s || typeof s !== 'object') return false;
    const it = DI.ITEMS[s.id];
    if (!it) return s.id === 'money' && Number(s.qty) > 0;
    if (it.kind === 'gun' || it.kind === 'bag') return true;
    const q = Number(s.qty);
    return q > 0 && q < 1e7;
  }
  function normalizeSave(d) {
    const s = defaultSave();
    if (!d || typeof d !== 'object') return s;
    s.name = String(d.name || s.name).slice(0, 18);
    s.model = d.model === 'gopnik' ? 'gopnik' : 'gentleman';
    s.wallet = Math.max(0, Math.min(1e9, Number(d.wallet) || 0));
    s.bagMoney = Math.max(0, Number(d.bagMoney) || 0);
    s.inv = Array.isArray(d.inv) ? d.inv.filter(validSlot).slice(0, DI.INV_SLOTS) : s.inv;
    if (!s.inv.some(i => i.id === 'fist')) s.inv.unshift({ id: 'fist', qty: 1 });
    s.wardrobe = [
      (Array.isArray(d.wardrobe) && Array.isArray(d.wardrobe[0]) ? d.wardrobe[0] : []).filter(validSlot).slice(0, DI.WARDROBE_SLOTS),
      (Array.isArray(d.wardrobe) && Array.isArray(d.wardrobe[1]) ? d.wardrobe[1] : []).filter(validSlot).slice(0, DI.WARDROBE_SLOTS)
    ];
    if (d.stats) s.stats = Object.assign(s.stats, d.stats);
    return s;
  }

  /* ================================================================ */
  function Room(opts) {
    opts = opts || {};
    this.store = opts.store || { load: () => null, save: () => {} };
    this.seed = opts.seed || ((Date.now() & 0x7fffffff) || 987654);
    this.rng = DI.makeRng(this.seed);
    this.log = opts.log || function () {};
    this.players = [null, null];
    this.npcs = {};
    this.npcId = 1;
    this.t = 0;
    this.doors = { house: true, bank: true, shop: true };
    this.alarm = false; this.alarmT = 0;
    this.job = null; this.jobTimer = 22;
    this.boxes = DI.rectBoxes();
    this.waiting = [];
    this.doorOpen = { house: true, bank: true, shop: true }; // по умолчанию всё открыто
    this._initPiles();
    this._initNpcs();
    this._last = Date.now();
    const self = this;
    this._timer = setInterval(function () { self.tick(); }, DI.TICK * 1000);
    this._npcTimer = setInterval(function () { self.pushNpcs(); }, 400);
  }

  Room.prototype.destroy = function () {
    clearInterval(this._timer); clearInterval(this._npcTimer);
  };

  Room.prototype._initPiles = function () {
    const rng = this.rng;
    this.piles = DI.MONEY_PILES.map(function (p) {
      const total = rng.i(2600, 7800);
      return { id: p.id, x: p.x, z: p.z, total: total, left: total };
    });
  };
  Room.prototype._initNpcs = function () {
    this.addNpc('guard', DI.GUARD_PATROL[0][0].x, DI.GUARD_PATROL[0][0].z, { patrol: 0, hp: 110, maxhp: 110, speed: DI.GUARD_SPEED, name: 'Охранник Виктор' });
    this.addNpc('guard', DI.GUARD_PATROL[1][0].x, DI.GUARD_PATROL[1][0].z, { patrol: 1, hp: 110, maxhp: 110, speed: DI.GUARD_SPEED, name: 'Охранник Борис' });
    this.addNpc('teller', DI.TELLER.x, DI.TELLER.z, { hp: 70, maxhp: 70, speed: 1.6, name: 'Кассирша Зина' });
    this.addNpc('shopkeeper', DI.SHOPKEEPER.x, DI.SHOPKEEPER.z, { hp: 90, maxhp: 90, speed: 1.4, name: 'Продавец Ашот' });
  };

  Room.prototype.addNpc = function (kind, x, z, extra) {
    const id = 'n' + (this.npcId++);
    const n = Object.assign({
      id, kind, x, z, yaw: 0, state: 'idle', hp: 100, maxhp: 100,
      speed: 2.2, t: 0, atk: 0, wp: 0, dead: 0, anim: 'idle', name: ''
    }, extra || {});
    this.npcs[id] = n;
    return n;
  };

  /* ---------- рассылка ---------- */
  Room.prototype.broadcast = function (obj, except) {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p || !p.send || p === except) continue;
      try { p.send(obj); } catch (e) {}
    }
  };
  Room.prototype.to = function (p, obj) { if (p && p.send) { try { p.send(obj); } catch (e) {} } };
  Room.prototype.toast = function (p, text, kind) { this.to(p, { t: 'toast', text, kind: kind || 'info' }); };
  Room.prototype.fxAll = function (type, data) { this.broadcast(Object.assign({ t: 'fx', type }, data)); };

  /* ---------- подключение ---------- */
  Room.prototype.roster = function () {
    return this.players.map(function (p) { return p ? { slot: p.slot, name: p.name, model: p.model, online: !!p.send } : null; });
  };
  Room.prototype.count = function () { return this.players.filter(Boolean).length; };

  Room.prototype.join = function (info) {
    const token = String(info.token || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || ('anon' + Math.random().toString(36).slice(2, 10));
    let save = this.store.load(token);
    save = normalizeSave(save || Object.assign(defaultSave(), info.save || {}));
    if (info.name) save.name = String(info.name).slice(0, 18);
    if (info.model) save.model = info.model === 'gopnik' ? 'gopnik' : 'gentleman';

    let slot = -1;
    for (let i = 0; i < this.players.length; i++) if (this.players[i] && this.players[i].token === token) { slot = i; break; }
    if (slot < 0) slot = this.players.findIndex(x => !x);
    if (slot < 0) return { full: true, players: this.count() };

    const self = this;
    let p;
    if (this.players[slot] && this.players[slot].token === token) {
      p = this.players[slot];
      p.send = info.send; p.save = save; p.name = save.name; p.model = save.model;
    } else {
      const bed = DI.BEDS[slot];
      p = {
        slot, token, send: info.send, save, id: 'p' + slot,
        name: save.name, model: save.model,
        x: bed.x, y: 0, z: bed.z + 0.5, yaw: Math.PI, pitch: 0,
        hp: DI.PLAYER.hp, stamina: DI.PLAYER.stamina,
        anim: 'sleep', weapon: 'fist', sel: 0, mag: 0,
        bag: false, bagMoney: save.bagMoney || 0, carrying: null,
        indoors: null, dead: false, respawnT: 0,
        stars: 0, heat: 0, lastCrime: -999, seenT: -999, hidden: false, seen: false,
        grabbing: null, jobId: null, lastShot: -9, lastMelee: -9, reloadT: 0,
        voice: false, isBot: !!info.isBot
      };
      this.players[slot] = p;
    }
    p.send = info.send;
    p.joinedAt = Date.now();

    const self2 = this;
    this.to(p, {
      t: 'welcome', slot: p.slot, id: p.id, seed: this.seed,
      name: p.name, model: p.model, wallet: p.save.wallet, inv: p.save.inv,
      wardrobe: p.save.wardrobe, bagMoney: p.bagMoney, stats: p.save.stats,
      x: p.x, z: p.z, hp: p.hp, stamina: p.stamina,
      piles: this.piles.map(x => ({ id: x.id, x: x.x, z: x.z, left: x.left })),
      doors: this.doors, alarm: this.alarm, job: this.job,
      players: this.roster(), npcs: this.npcList(),
      config: { tick: DI.TICK, maxStars: DI.MAX_STARS, maxPlayers: DI.MAX_PLAYERS }
    });
    this.broadcast({ t: 'roster', players: this.roster() });
    this.broadcast({ t: 'join', slot: p.slot, name: p.name, model: p.model }, p);
    this.players.forEach(function (q) {
      if (q && q !== p) {
        self2.to(p, { t: 'peerState', slot: q.slot, x: q.x, z: q.z, yaw: q.yaw, hp: q.hp, weapon: q.weapon, name: q.name, model: q.model, bagMoney: q.bagMoney, stars: q.stars });
        self2.to(q, { t: 'peerState', slot: p.slot, x: p.x, z: p.z, yaw: p.yaw, hp: p.hp, weapon: p.weapon, name: p.name, model: p.model, bagMoney: p.bagMoney, stars: p.stars });
      }
    });
    // сообщаем ожидающим, что место могло освободиться
    this.waiting.forEach(function (w) { try { w({ t: 'retryNow' }); } catch (e) {} });
    this.log('join slot=' + p.slot + ' name=' + p.name + ' (' + this.count() + '/2)');
    return { ok: true, slot: p.slot, player: p };
  };

  Room.prototype.leave = function (p, keepMs) {
    if (!p) return;
    this.persist(p);
    p.send = null;
    this.broadcast({ t: 'roster', players: this.roster() });
    this.broadcast({ t: 'leave', slot: p.slot });
    this.log('leave slot=' + p.slot);
    const self = this;
    setTimeout(function () {
      if (self.players[p.slot] === p && !p.send) {
        self.players[p.slot] = null;
        for (const id in self.npcs) if (self.npcs[id].kind === 'cop' && self.npcs[id].owner === p.slot) delete self.npcs[id];
        self.broadcast({ t: 'roster', players: self.roster() });
        self.log('slot ' + p.slot + ' free');
      }
    }, keepMs == null ? 60000 : keepMs);
  };

  Room.prototype.npcList = function () {
    const out = [];
    for (const id in this.npcs) {
      const n = this.npcs[id];
      out.push({
        id: n.id, kind: n.kind, name: n.name || '', x: +n.x.toFixed(2), z: +n.z.toFixed(2),
        yaw: +n.yaw.toFixed(2), hp: Math.max(0, Math.round(n.hp)), maxhp: n.maxhp,
        state: n.state, anim: n.anim, owner: n.owner == null ? -1 : n.owner
      });
    }
    return out;
  };
  Room.prototype.pushNpcs = function () { this.broadcast({ t: 'npcs', list: this.npcList() }); };

  Room.prototype.persist = function (p) {
    if (!p || !p.save || !p.token) return;
    p.save.model = p.model; p.save.name = p.name; p.save.bagMoney = Math.round(p.bagMoney);
    p.save.wallet = Math.round(p.save.wallet);
    try { this.store.save(p.token, p.save); } catch (e) {}
  };

  /* ================================================================ */
  /*  ПРЕСТУПЛЕНИЯ / ЗВЁЗДЫ                                           */
  /* ================================================================ */
  Room.prototype.addCrime = function (p, amount, label) {
    if (!p || p.dead) return;
    p.heat = Math.min(DI.HEAT_MAX, p.heat + amount);
    p.lastCrime = this.t;
    const stars = Math.min(DI.MAX_STARS, Math.ceil(p.heat / DI.HEAT_PER_STAR));
    if (stars > p.stars) {
      p.stars = stars;
      this.fxAll('siren', {});
      this.toast(p, 'Уровень розыска: ' + '★'.repeat(p.stars) + (label ? ' — ' + label : ''), 'bad');
    } else if (label) {
      this.toast(p, label, 'bad');
    }
    this.syncWanted(p);
    this.spawnCops(p);
  };
  Room.prototype.syncWanted = function (p) {
    this.broadcast({ t: 'wanted', slot: p.slot, stars: p.stars, heat: Math.round(p.heat) });
  };
  Room.prototype.spawnCops = function (p) {
    if (p.stars <= 0) return;
    const rng = this.rng;
    let mine = 0;
    for (const id in this.npcs) { const n = this.npcs[id]; if (n.kind === 'cop' && n.owner === p.slot) mine++; }
    const want = p.stars <= 0 ? 0 : (p.stars >= 4 ? 4 : p.stars);
    let need = want - mine, guard = 0;
    while (need > 0 && guard++ < 10) {
      let best = null, bd = 1e9;
      for (let k = 0; k < 30; k++) {
        const onX = rng.chance(0.5);
        const road = rng.pick(onX ? DI.ROADS_X : DI.ROADS_Z);
        const other = rng.f(-95, 95);
        const x = onX ? road : other, z = onX ? other : road;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d > DI.COP_SPAWN_MIN && d < DI.COP_SPAWN_MAX && d < bd) { bd = d; best = { x, z }; }
      }
      if (!best) {
        // не нашли далеко — берём хоть что-то за 30 м
        for (let k = 0; k < 20 && !best; k++) {
          const onX = rng.chance(0.5);
          const road = rng.pick(onX ? DI.ROADS_X : DI.ROADS_Z);
          const other = rng.f(-95, 95);
          const x = onX ? road : other, z = onX ? other : road;
          const d = Math.hypot(x - p.x, z - p.z);
          if (d > 30 && d < bd) { bd = d; best = { x, z }; }
        }
      }
      if (!best) break;
      const hp = DI.COP_HP + p.stars * 14;
      this.addNpc('cop', best.x, best.z, {
        hp: hp, maxhp: hp,
        speed: DI.COP_SPEED + p.stars * 0.14,
        owner: p.slot, state: 'chase', name: 'Полицейский',
        dmg: DI.COP_DMG + (p.stars - 1) * 1.0,
        spawnedAt: this.t
      });
      need--;
    }
  };
  Room.prototype.updateWanted = function (p, dt) {
    let seen = false;
    for (const id in this.npcs) {
      const n = this.npcs[id];
      if (n.kind !== 'cop' && n.kind !== 'guard') continue;
      if (n.state === 'dead' || n.state === 'gone') continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d > 44) continue;
      if (p.hidden && d > 11) continue;
      if (!this.los(n.x, n.z, p.x, p.z)) continue;
      seen = true;
      if (n.kind === 'cop' && p.stars > 0) { n.owner = p.slot; n.lastX = p.x; n.lastZ = p.z; }
      break;
    }
    // пока за нами едет наряд в пределах 75 м — розыск не остывает
    let hunted = false;
    for (const id2 in this.npcs) {
      const n2 = this.npcs[id2];
      if (n2.kind !== 'cop' || n2.owner !== p.slot || n2.state === 'dead') continue;
      if (Math.hypot(n2.x - p.x, n2.z - p.z) < 75) { hunted = true; break; }
    }
    p.seen = seen;
    p.hunted = hunted;
    if (seen) p.seenT = this.t;
    // спрятался = внутри здания с закрытой дверью и никто нас не видит
    p.hidden = !!p.indoors && this.doors[p.indoors] === false && !seen;

    const since = this.t - p.lastCrime;
    const notSeenFor = this.t - p.seenT;
    if (p.stars > 0 && since > DI.STAR_COOLDOWN && notSeenFor > 5 && !seen) {
      const rate = p.hidden ? DI.HEAT_DECAY_HIDDEN : DI.HEAT_DECAY_OPEN;
      p.heat = Math.max(0, p.heat - rate * dt);
      const stars = Math.min(p.stars, Math.ceil(p.heat / DI.HEAT_PER_STAR));
      if (stars < p.stars) {
        p.stars = stars;
        this.syncWanted(p);
        if (p.stars === 0) {
          this.toast(p, 'Вас больше не ищут. Сидим тихо.', 'good');
          for (const id in this.npcs) { const n = this.npcs[id]; if (n.kind === 'cop' && n.owner === p.slot && n.state !== 'dead') { n.state = 'search'; n.searchT = 6; } }
        } else {
          this.toast(p, 'Розыск снижается: ' + '★'.repeat(p.stars), 'good');
        }
      }
    }
  };

  /* ================================================================ */
  /*  NPC AI                                                          */
  /* ================================================================ */
  Room.prototype.isDoorOpen = function (key) {
    // doors[key] === true значит «дверь распахнута»
    return this.doors[key] === true;
  };
  Room.prototype.doorBlocked = function (key, x, z) {
    if (this.isDoorOpen(key)) return false;
    const d = DI.DOOR_SLABS[key];
    if (!d) return false;
    return Math.abs(x - d.x) < d.w / 2 + 0.5 && Math.abs(z - d.z) < d.d / 2 + 0.5;
  };
  Room.prototype.los = function (x0, z0, x1, z1) {
    if (DI.losBlocked(x0, z0, x1, z1, this.boxes)) return false;
    // закрытые двери тоже не прозрачные
    for (const key in DI.DOOR_SLABS) {
      if (this.isDoorOpen(key)) continue;
      if (DI.segHitsBoxPublic) continue;
      const d = DI.DOOR_SLABS[key];
      const slab = { x: d.x, z: d.z, w: d.w, d: d.d, h: d.h };
      if (this._segHits(x0, z0, x1, z1, slab)) return false;
    }
    return true;
  };
  Room.prototype._segHits = function (x0, z0, x1, z1, b) {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dz = z1 - z0;
    const minX = b.x - b.w / 2, maxX = b.x + b.w / 2;
    const minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
    if (Math.abs(dx) < 1e-9) { if (x0 < minX || x0 > maxX) return false; }
    else {
      let ta = (minX - x0) / dx, tb = (maxX - x0) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
    if (Math.abs(dz) < 1e-9) { if (z0 < minZ || z0 > maxZ) return false; }
    else {
      let tc = (minZ - z0) / dz, td = (maxZ - z0) / dz;
      if (tc > td) { const s = tc; tc = td; td = s; }
      t0 = Math.max(t0, tc); t1 = Math.min(t1, td);
      if (t0 > t1) return false;
    }
    return true;
  };
  Room.prototype.resolve = function (x, z, r, opts) {
    const noEject = opts && opts.noEject;
    const res = DI.resolveCollision(x, z, r, this.boxes);
    // закрытая дверь не пускает никого
    for (const key in DI.DOOR_SLABS) {
      if (this.isDoorOpen(key)) continue;
      const d = DI.DOOR_SLABS[key];
      const hx = d.w / 2, hz = d.d / 2;
      const cx = Math.max(d.x - hx, Math.min(res.x, d.x + hx));
      const cz = Math.max(d.z - hz, Math.min(res.z, d.z + hz));
      const ddx = res.x - cx, ddz = res.z - cz;
      const dd = Math.hypot(ddx, ddz);
      if (dd < r) {
        const k = dd > 0.0001 ? (r - dd) / dd : 1;
        if (dd > 0.0001) { res.x += ddx * k; res.z += ddz * k; }
        else { res.z += (res.z < d.z ? -1 : 1) * (r + hz); }
      }
      // страховка: если вытолкнуло ВНУТРЬ закрытого здания — выкидываем наружу
      const bld = noEject ? null : DI.insideBuilding(res.x, res.z);
      if (bld && DI[bld === 'house' ? 'HOUSE' : bld === 'bank' ? 'BANK' : 'SHOP']) {
        const B = DI[bld === 'house' ? 'HOUSE' : bld === 'bank' ? 'BANK' : 'SHOP'];
        const halfW = B.w / 2, halfD = B.d / 2;
        const dxN = Math.abs(res.x - B.x), dzN = Math.abs(res.z - B.z);
        if (dxN < halfW && dzN < halfD) {
          const penX = halfW + r - dxN, penZ = halfD + r - dzN;
          if (penX < penZ) res.x = B.x + (res.x < B.x ? -1 : 1) * (halfW + r);
          else res.z = B.z + (res.z < B.z ? -1 : 1) * (halfD + r);
        }
      }
    }
    return res;
  };
  Room.prototype.moveNpc = function (n, tx, tz, dt, speed) {
    const dx = tx - n.x, dz = tz - n.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) return true;
    const step = Math.min(d, (speed || n.speed) * dt);
    const nx = n.x + dx / d * step, nz = n.z + dz / d * step;
    const r = this.resolve(nx, nz, 0.42);
    if (Math.abs(r.x - nx) > 0.02 || Math.abs(r.z - nz) > 0.02) {
      const perp = (n.sidePref = n.sidePref || (this.rng.chance(0.5) ? 1 : -1));
      const sx = nx + (-dz / d) * 1.0 * perp, sz = nz + (dx / d) * 1.0 * perp;
      const r2 = this.resolve(sx, sz, 0.42);
      n.x = r2.x; n.z = r2.z;
    } else { n.x = r.x; n.z = r.z; n.sidePref = 0; }
    n.yaw = Math.atan2(dx, dz);
    return false;
  };
  Room.prototype.seePlayer = function (n, p, range) {
    if (!p || p.dead) return false;
    const d = Math.hypot(p.x - n.x, p.z - n.z);
    if (d > range) return false;
    if (p.hidden && d > 10) return false;
    return this.los(n.x, n.z, p.x, p.z);
  };
  Room.prototype.updateNpcs = function (dt) {
    for (const id in this.npcs) {
      const n = this.npcs[id];
      n.t += dt;
      if (n.state === 'dead') {
        n.dead += dt; n.anim = 'dead';
        if (n.kind === 'cop' && n.dead > 30) delete this.npcs[id];
        else if (n.kind !== 'cop' && n.dead > 40) this.respawnStaff(n);
        continue;
      }
      if (n.kind === 'guard') this.updateGuard(n, dt);
      else if (n.kind === 'cop') this.updateCop(n, dt, id);
      else if (n.kind === 'teller') this.updateTeller(n, dt);
      else if (n.kind === 'shopkeeper') this.updateShopkeeper(n, dt);
    }
  };
  Room.prototype.respawnStaff = function (n) {
    if (n.kind === 'guard') {
      const w = DI.GUARD_PATROL[n.patrol || 0][0];
      n.x = w.x; n.z = w.z; n.hp = n.maxhp; n.state = 'patrol'; n.dead = 0; n.wp = 0; n.anim = 'walk';
    } else if (n.kind === 'teller') {
      n.x = DI.TELLER.x; n.z = DI.TELLER.z; n.hp = n.maxhp; n.state = 'idle'; n.dead = 0;
    } else if (n.kind === 'shopkeeper') {
      n.x = DI.SHOPKEEPER.x; n.z = DI.SHOPKEEPER.z; n.hp = n.maxhp; n.state = 'idle'; n.dead = 0;
    }
  };
  Room.prototype.updateGuard = function (n, dt) {
    const patrol = DI.GUARD_PATROL[n.patrol || 0];
    let target = null;
    if (this.alarm) {
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p || p.dead || p.indoors !== 'bank') continue;
        if (p.weapon !== 'fist' || p.grabbing) { target = p; break; }
        if (!target) target = p;
      }
    }
    if (target && Math.hypot(target.x - n.x, target.z - n.z) < 46) {
      const d = Math.hypot(target.x - n.x, target.z - n.z);
      n.state = 'chase';
      if (d > DI.GUARD_RANGE) { this.moveNpc(n, target.x, target.z, dt, DI.GUARD_SPEED * 1.3); n.anim = 'run'; }
      else {
        n.yaw = Math.atan2(target.x - n.x, target.z - n.z);
        n.atk -= dt; n.anim = 'attack';
        if (n.atk <= 0) {
          n.atk = 0.95;
          this.damagePlayer(target, DI.GUARD_DMG, n, 'Охранник ударил дубинкой');
          this.fxAll('melee', { x: target.x, z: target.z, id: n.id });
        }
      }
      return;
    }
    const wp = patrol[n.wp % patrol.length];
    const arrived = this.moveNpc(n, wp.x, wp.z, dt, DI.GUARD_SPEED * 0.5);
    n.state = 'patrol';
    if (arrived) { n.wp = (n.wp + 1) % patrol.length; n.anim = 'idle'; }
    else n.anim = 'walk';
    n.yaw += Math.sin(n.t * 1.4) * 0.012; // вертит головой, осматривает зал
  };
  Room.prototype.updateTeller = function (n, dt) {
    if (this.alarm) {
      n.state = 'panic'; n.anim = 'panic';
      if (this.t - (n.said || -99) > 4.5) {
        n.said = this.t;
        const lines = ['ПОМОГИТЕ! ОГРАБЛЕНИЕ!', 'Я жму тревогу!!', 'Охрана! У них оружие!', 'Не стреляйте, я всё отдам!'];
        this.broadcast({ t: 'say', id: n.id, text: lines[this.rng.i(0, lines.length - 1)] });
      }
    } else {
      n.state = 'idle'; n.anim = 'idle';
      n.yaw = Math.PI + Math.sin(n.t * 0.6) * 0.3;
      // замечает оружие даже без общей тревоги
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p || p.dead || p.indoors !== 'bank') continue;
        const w = DI.ITEMS[p.weapon];
        if (!w || w.kind !== 'gun') continue;
        if (Math.hypot(p.x - n.x, p.z - n.z) < 24 && !DI.losBlocked(n.x, n.z, p.x, p.z, this.boxes)) {
          this.triggerAlarm(p, 'Кассирша увидела оружие');
          this.broadcast({ t: 'say', id: n.id, text: 'ОЙ! У НЕГО ПУШКА! ТРЕВОГА!!!' });
        }
      }
    }
  };
  Room.prototype.updateShopkeeper = function (n, dt) {
    n.state = 'idle'; n.anim = 'idle';
    n.yaw = Math.PI + Math.sin(n.t * 0.5) * 0.35;
    let near = null, nd = 1e9;
    for (const p of this.players) if (p && !p.dead) { const d = Math.hypot(p.x - n.x, p.z - n.z); if (d < nd) { nd = d; near = p; } }
    if (near && nd < 4.6 && this.t - (n.greet || -99) > 14) {
      n.greet = this.t;
      const lines = ['Заходи, выбирай! Патроны дёшево!', 'Есть стволы на любой кошелёк, дорогой.', 'Сумка нужна? Есть отличная сумка для денег!', 'Осторожно в банке, там охрана злая.'];
      this.broadcast({ t: 'say', id: n.id, text: lines[this.rng.i(0, lines.length - 1)] });
    }
  };
  Room.prototype.updateCop = function (n, dt, id) {
    const owner = this.players[n.owner] || null;
    if (!owner || owner.dead) { n.state = 'search'; }
    const wanted = owner && owner.stars > 0;
    const canSee = wanted ? this.seePlayer(n, owner, DI.COP_RANGE) : false;
    if (canSee) { n.lastX = owner.x; n.lastZ = owner.z; n.lostT = 0; n.state = 'chase'; n.searchT = 0; }
    else {
      n.lostT = (n.lostT || 0) + dt;
      if (n.lostT > 6) n.state = 'search';
    }

    if (!wanted) {
      // розыск снят: наряд уезжает
      n.state = 'gone';
      n.goneT = (n.goneT || 0) + dt;
      const far = Math.hypot(n.x - DI.HOUSE.x, n.z - DI.HOUSE.z);
      this.moveNpc(n, n.x + (n.x - DI.BANK.x), n.z + (n.z - DI.BANK.z), dt, n.speed * 1.1);
      n.anim = 'run';
      if (n.goneT > 12 || far > 150) delete this.npcs[id];
      return;
    }

    // цель: последняя известная позиция, иначе реальный игрок (наряд «ведёт» нас)
    let tx = n.lastX != null ? n.lastX : owner.x;
    let tz = n.lastZ != null ? n.lastZ : owner.z;
    if (owner.hidden && DI.insideBuilding(owner.x, owner.z) && !DI.insideBuilding(n.x, n.z)) {
      // мы за дверью — наряд топчется снаружи; если давно не видел, уезжает
      n.state = 'search';
      n.waitT = (n.waitT || 0) + dt;
      if (n.waitT > 22) { n.lastX = DI.BANK.x; n.lastZ = DI.BANK.z; }
      const B = DI.HOUSE;
      const ang = Math.atan2(n.z - B.z, n.x - B.x);
      tx = B.x + Math.cos(ang) * (B.d / 2 + 3.2);
      tz = B.z + Math.sin(ang) * (B.d / 2 + 3.2);
      n.lostT = (n.lostT || 0) + dt;
    } else { n.waitT = 0; }
    const d = Math.hypot(tx - n.x, tz - n.z);
    const speed = n.speed * (canSee ? 1.06 : (d > 25 ? 1.22 : 0.92));
    if (d > 3.2) { this.moveNpc(n, tx, tz, dt, speed); n.anim = d > 14 ? 'run' : 'walk'; }
    else {
      n.anim = 'idle';
      if (owner) n.yaw = Math.atan2(owner.x - n.x, owner.z - n.z);
      n.circleT = (n.circleT || 0) + dt;
      const a = n.circleT * 0.8;
      this.moveNpc(n, n.x + Math.cos(a) * 2, n.z + Math.sin(a) * 2, dt, 1.4);
    }

    if (canSee && owner && d < DI.COP_RANGE && this.t - (n.spawnedAt || 0) > 1.2) {
      // вся полиция стреляет общей очередью — иначе толпа стирает instantly
      const volley = DI.COP_VOLLEY[Math.min(DI.MAX_STARS, owner.stars)] || 1.2;
      if (this.t >= (this.copVolleyT || 0)) {
        this.copVolleyT = this.t + volley * this.rng.f(0.85, 1.2);
        const acc = (DI.COP_ACC_NEAR - (DI.COP_ACC_NEAR - DI.COP_ACC_FAR) * Math.min(1, d / DI.COP_RANGE))
          * (owner.hidden ? 0.12 : 1) * (owner.anim === 'run' ? 0.6 : 1) * (owner.anim === 'idle' ? 1.1 : 1);
        const hit = this.rng.chance(acc);
        this.broadcast({ t: 'npcShot', id: n.id, x: n.x, z: n.z, tx: owner.x, tz: owner.z, hit });
        if (hit) this.damagePlayer(owner, n.dmg || DI.COP_DMG, n, 'Вас подстрелила полиция');
      }
    }
    // если потеряли нас надолго и розыск вот-вот спадёт — кружат на месте
    if (n.state === 'search') {
      n.searchT = (n.searchT || 0) + dt;
      if (n.searchT > 45 && d < 30) { n.lastX = owner.x; n.lastZ = owner.z; n.searchT = 20; }
    }
  };

  /* ================================================================ */
  /*  УРОН / СМЕРТЬ                                                   */
  /* ================================================================ */
  Room.prototype.damagePlayer = function (p, dmg, src, reason) {
    if (!p || p.dead) return;
    p.hp -= dmg;
    if (p.grabbing) this.cancelGrab(p, 'Вас ударили — вы отпустили деньги');
    this.to(p, { t: 'hurt', dmg: Math.round(dmg), reason: reason || '' });
    this.broadcast({ t: 'pstate', slot: p.slot, hp: Math.max(0, Math.round(p.hp)), dead: false });
    if (p.hp <= 0) this.killPlayer(p, src);
  };
  Room.prototype.killPlayer = function (p, src) {
    p.hp = 0; p.dead = true; p.respawnT = DI.PLAYER.respawnTime;
    const lost = p.save.inv.filter(i => i.id !== 'fist');
    p.save.inv = [{ id: 'fist', qty: 1 }];
    p.sel = 0; p.weapon = 'fist'; p.mag = 0; p.bag = false; p.carrying = null;
    this.cancelGrab(p, null);
    p.save.stats.deaths = (p.save.stats.deaths || 0) + 1;
    this.broadcast({
      t: 'death', slot: p.slot, x: p.x, z: p.z,
      by: src ? (src.name || src.kind || 'неизвестно') : 'неизвестно',
      lost: lost.length
    });
    this.persist(p);
  };
  Room.prototype.respawnPlayer = function (p) {
    const bed = DI.BEDS[p.slot];
    p.dead = false; p.hp = DI.PLAYER.hp; p.stamina = DI.PLAYER.stamina;
    p.x = bed.x; p.z = bed.z + 0.5; p.y = 0; p.yaw = Math.PI; p.anim = 'idle';
    p.stars = 0; p.heat = 0; p.hidden = false; p.seenT = -999; p.grabbing = null;
    for (const id in this.npcs) if (this.npcs[id].kind === 'cop' && this.npcs[id].owner === p.slot) delete this.npcs[id];
    this.alarm = false;
    this.to(p, { t: 'respawn', x: p.x, z: p.z, hp: p.hp, inv: p.save.inv, wallet: p.save.wallet, wardrobe: p.save.wardrobe });
    this.syncWanted(p);
    this.persist(p);
  };
  Room.prototype.damageNpc = function (n, dmg, p) {
    if (!n || n.state === 'dead') return false;
    n.hp -= dmg;
    this.broadcast({ t: 'npcHit', id: n.id, hp: Math.max(0, Math.round(n.hp)), dmg: Math.round(dmg) });
    if (n.hp <= 0) {
      n.state = 'dead'; n.dead = 0; n.anim = 'dead'; n.hp = 0;
      let stars = 1;
      if (n.kind === 'teller' || n.kind === 'shopkeeper') stars = 2;
      this.addCrime(p, stars * DI.HEAT_PER_STAR, 'Убит: ' + (n.name || n.kind));
      if (p) p.save.stats.kills = (p.save.stats.kills || 0) + 1;
      this.fxAll('npcDead', { id: n.id });
      if (n.kind === 'teller' || n.kind === 'shopkeeper' || n.kind === 'guard') this.triggerAlarm(p, 'Убийство сотрудника');
      this.persist(p);
      return true;
    }
    if (n.kind === 'guard' || n.kind === 'teller') this.triggerAlarm(p, 'Нападение на сотрудника банка');
    return false;
  };
  Room.prototype.triggerAlarm = function (p, why) {
    if (this.alarm) return;
    this.alarm = true; this.alarmT = 45;
    this.broadcast({ t: 'alarm', on: true, why: why || '' });
    this.fxAll('siren', {});
    if (p) this.addCrime(p, DI.HEAT_PER_STAR, why || 'Сработала тревога');
  };

  /* ================================================================ */
  /*  ДЕНЬГИ                                                          */
  /* ================================================================ */
  Room.prototype.startGrab = function (p, pileId) {
    if (!p || p.dead) return;
    const pile = this.piles.find(x => x.id === pileId);
    if (!pile || pile.left <= 0) { this.toast(p, 'Здесь уже всё забрали', 'bad'); return; }
    if (Math.hypot(pile.x - p.x, pile.z - p.z) > 3.6) { this.toast(p, 'Подойдите ближе к деньгам', 'bad'); return; }
    const hasBag = p.weapon === 'bag';
    if (hasBag && p.bagMoney >= DI.ITEMS.bag.capacity) { this.toast(p, 'Сумка набита до отказа', 'bad'); return; }
    if (!hasBag && this.countBundles(p) >= DI.MAX_CARRY_BUNDLES) { this.toast(p, 'Больше 5 пачек в руки не взять', 'bad'); return; }
    p.grabbing = { pile: pileId, ends: this.t + (hasBag ? DI.GRAB_TIME_BAG : DI.GRAB_TIME_HANDS), bag: hasBag };
    this.broadcast({ t: 'grab', slot: p.slot, pile: pileId, time: hasBag ? DI.GRAB_TIME_BAG : DI.GRAB_TIME_HANDS, bag: hasBag });
    if (p.indoors === 'bank') this.addCrime(p, 5, 'Вы взялись за деньги банка');
  };
  Room.prototype.cancelGrab = function (p, why) {
    if (!p || !p.grabbing) return;
    p.grabbing = null;
    this.broadcast({ t: 'grabCancel', slot: p.slot });
    if (why) this.toast(p, why, 'bad');
  };
  Room.prototype.finishGrab = function (p) {
    if (!p || !p.grabbing) return;
    const g = p.grabbing; p.grabbing = null;
    const pile = this.piles.find(x => x.id === g.pile);
    if (!pile || pile.left <= 0) { this.toast(p, 'Деньги кончились', 'bad'); return; }
    const rng = this.rng;
    if (g.bag) {
      const take = Math.min(pile.left, DI.ITEMS.bag.capacity - p.bagMoney, rng.i(2400, 9000));
      pile.left -= take; p.bagMoney += take; p.save.bagMoney = p.bagMoney;
      p.save.stats.robbed = (p.save.stats.robbed || 0) + take;
      this.toast(p, 'Сумка набита: +' + DI.money(take) + ' (всего ' + DI.money(p.bagMoney) + ')', 'good');
      this.broadcast({ t: 'bagUpdate', slot: p.slot, money: Math.round(p.bagMoney) });
    } else {
      const val = Math.min(pile.left, rng.i(180, 1400));
      pile.left -= val;
      if (!this.addInv(p, { id: 'money', qty: 1, val: val })) { pile.left += val; return; }
      p.save.stats.robbed = (p.save.stats.robbed || 0) + val;
      this.toast(p, 'Пачка в руках: ' + DI.money(val) + '. Перечислите её в баланс из инвентаря.', 'good');
    }
    this.broadcast({ t: 'pileUpdate', id: pile.id, left: pile.left });
    this.fxAll('cash', { x: pile.x, z: pile.z, big: g.bag });
    this.addCrime(p, DI.HEAT_PER_STAR, 'Ограбление банка');
    this.broadcast({ t: 'inv', slot: p.slot, inv: p.save.inv, wallet: p.save.wallet });
    this.persist(p);
  };
  Room.prototype.countBundles = function (p) { return p.save.inv.filter(i => i.id === 'money').length; };

  /* ================================================================ */
  /*  ИНВЕНТАРЬ                                                       */
  /* ================================================================ */
  Room.prototype.addInv = function (p, slot) {
    const it = DI.ITEMS[slot.id];
    if (!it && slot.id !== 'money') return false;
    if (slot.id === 'ammo') {
      const ex = p.save.inv.find(i => i.id === 'ammo' && i.cls === slot.cls);
      if (ex) { ex.qty += slot.qty; return true; }
    }
    if (p.save.inv.length >= DI.INV_SLOTS) { this.toast(p, 'Инвентарь заполнен (10 ячеек)', 'bad'); return false; }
    p.save.inv.push(slot);
    return true;
  };

  /* ================================================================ */
  /*  ПОДРАБОТКА                                                      */
  /* ================================================================ */
  Room.prototype.updateJob = function (dt) {
    this.jobTimer -= dt;
    if (!this.job && this.jobTimer <= 0) {
      const site = this.rng.pick(DI.JOB_SITES);
      this.job = {
        id: 'job' + Math.floor(this.t), x: site.x, z: site.z,
        boxes: this.rng.i(3, 6), delivered: 0, owner: -1, life: DI.JOBS.lifetime,
        phrase: this.rng.pick(DI.JOBS.phrases)
      };
      this.jobTimer = this.rng.f(DI.JOBS.respawnMin, DI.JOBS.respawnMax);
      this.broadcast({ t: 'jobSpawn', job: this.job });
      this.broadcast({ t: 'say', id: 'job', text: this.job.phrase });
    }
    if (this.job) {
      this.job.life -= dt;
      if (this.job.life <= 0) { this.broadcast({ t: 'jobGone', id: this.job.id }); this.job = null; }
    }
  };
  Room.prototype.jobClaim = function (p) {
    const j = this.job;
    if (!j) return;
    if (j.owner >= 0 && j.owner !== p.slot) { this.toast(p, 'Эту работу уже взял напарник', 'bad'); return; }
    if (Math.hypot(j.x - p.x, j.z - p.z) > 11) { this.toast(p, 'Подойдите к грузовику', 'bad'); return; }
    j.owner = p.slot; p.jobId = j.id;
    this.toast(p, 'Работа принята: перенесите ' + j.boxes + ' ящик(а) в грузовик', 'good');
    this.broadcast({ t: 'jobUpdate', job: j });
  };
  Room.prototype.jobPick = function (p) {
    const j = this.job;
    if (!j || j.owner !== p.slot || p.carrying) return;
    if (j.delivered >= j.boxes) { this.toast(p, 'Все ящики уже перенесены', 'info'); return; }
    if (Math.hypot(j.x + 3.2 - p.x, j.z + 1.6 - p.z) > 6) { this.toast(p, 'Ящики лежат у грузовика', 'bad'); return; }
    p.carrying = 'box';
    this.broadcast({ t: 'carry', slot: p.slot, what: 'box' });
  };
  Room.prototype.jobDrop = function (p) {
    const j = this.job;
    if (!j || p.carrying !== 'box') return;
    if (Math.hypot(j.x - p.x, j.z - p.z) > 6) { this.toast(p, 'До грузовика далеко', 'bad'); return; }
    p.carrying = null; j.delivered++;
    const pay = this.rng.i(DI.JOBS.boxValueMin, DI.JOBS.boxValueMax);
    p.save.wallet += pay; p.save.stats.earned = (p.save.stats.earned || 0) + pay;
    this.broadcast({ t: 'carry', slot: p.slot, what: null });
    this.broadcast({ t: 'jobUpdate', job: j });
    this.toast(p, 'Ящик погружен: +' + DI.money(pay), 'good');
    this.to(p, { t: 'wallet', wallet: p.save.wallet });
    if (j.delivered >= j.boxes) {
      const bonus = this.rng.i(DI.JOBS.bonusMin, DI.JOBS.bonusMax);
      p.save.wallet += bonus;
      p.save.stats.jobs = (p.save.stats.jobs || 0) + 1;
      p.save.stats.earned = (p.save.stats.earned || 0) + bonus;
      this.toast(p, 'Работа выполнена! Бонус +' + DI.money(bonus) + '. Баланс: ' + DI.money(p.save.wallet), 'good');
      this.to(p, { t: 'wallet', wallet: p.save.wallet });
      this.broadcast({ t: 'jobDone', slot: p.slot, bonus: bonus });
      this.broadcast({ t: 'jobGone', id: j.id });
      this.job = null;
      this.jobTimer = this.rng.f(DI.JOBS.respawnMin, DI.JOBS.respawnMax);
      this.persist(p);
    }
  };

  /* ================================================================ */
  /*  МАГАЗИН                                                         */
  /* ================================================================ */
  Room.prototype.buy = function (p, id) {
    const it = DI.ITEMS[id];
    if (!it || id === 'ammo') return;
    if (Math.hypot(DI.SHOP.x - p.x, DI.SHOP.z + 1 - p.z) > 9) { this.toast(p, 'Вы не в магазине оружия', 'bad'); return; }
    if (p.save.wallet < it.price) { this.toast(p, 'Не хватает денег: нужно ' + DI.money(it.price), 'bad'); this.to(p, { t: 'sfx', name: 'error' }); return; }
    if (it.kind === 'gun' && p.save.inv.some(i => i.id === id)) { this.toast(p, 'Такой ствол у вас уже есть', 'bad'); return; }
    if (it.kind === 'bag' && p.save.inv.some(i => i.id === 'bag')) { this.toast(p, 'Сумка уже куплена', 'bad'); return; }
    if (!this.addInv(p, it.kind === 'gun' ? { id: id } : { id: id, qty: 1 })) return;
    p.save.wallet -= it.price;
    this.toast(p, 'Куплено: ' + it.name + ' за ' + DI.money(it.price), 'good');
    this.to(p, { t: 'sfx', name: 'buy' });
    this.broadcast({ t: 'buy', slot: p.slot, id: id });
    this.broadcast({ t: 'inv', slot: p.slot, inv: p.save.inv, wallet: p.save.wallet });
    this.persist(p);
  };
  Room.prototype.buyAmmo = function (p, gunId, rounds) {
    const gun = DI.ITEMS[gunId];
    if (!gun || gun.kind !== 'gun') return;
    if (Math.hypot(DI.SHOP.x - p.x, DI.SHOP.z + 1 - p.z) > 9) { this.toast(p, 'Вы не в магазине оружия', 'bad'); return; }
    rounds = Math.max(1, Math.min(900, int(rounds, 30)));
    if (p.save.wallet < gun.ammoPrice) { this.toast(p, 'Не хватает денег даже на один патрон', 'bad'); this.to(p, { t: 'sfx', name: 'error' }); return; }
    const afford = Math.floor(p.save.wallet / gun.ammoPrice);
    if (rounds > afford) rounds = afford;
    const cost = Math.ceil(rounds * gun.ammoPrice);
    p.save.wallet -= cost;
    this.addInv(p, { id: 'ammo', cls: gun.cls, qty: rounds });
    this.toast(p, 'Патроны ' + DI.AMMO_KIND[gun.cls] + ': ' + rounds + ' шт. за ' + DI.money(cost), 'good');
    this.to(p, { t: 'sfx', name: 'buy' });
    this.broadcast({ t: 'inv', slot: p.slot, inv: p.save.inv, wallet: p.save.wallet });
    this.persist(p);
  };

  /* ================================================================ */
  /*  ОРУЖИЕ                                                          */
  /* ================================================================ */
  Room.prototype.currentGun = function (p) {
    const it = DI.ITEMS[p.weapon];
    return it && it.kind === 'gun' ? it : null;
  };
  Room.prototype.shoot = function (p, dx, dy, dz) {
    if (!p || p.dead) return;
    if (p.grabbing) { this.cancelGrab(p, 'Нельзя одновременно грести и стрелять'); return; }
    const w = this.currentGun(p);
    if (!w) return;
    if (this.t - p.lastShot < w.rate * 0.72) return;
    if (p.reloadT > this.t) return;
    if (p.mag <= 0) { this.to(p, { t: 'dryFire' }); return; }
    p.lastShot = this.t; p.mag--;

    const rng = this.rng;
    const pellets = w.pellets || 1;
    const hits = [];
    const ox = p.x, oy = p.y + 1.55, oz = p.z;
    for (let s = 0; s < pellets; s++) {
      let vx = dx + (rng.raw() - 0.5) * w.spread * 6;
      let vy = dy + (rng.raw() - 0.5) * w.spread * 6;
      let vz = dz + (rng.raw() - 0.5) * w.spread * 6;
      const len = Math.hypot(vx, vy, vz) || 1;
      vx /= len; vy /= len; vz /= len;
      let best = null, bestT = w.range;
      for (const id in this.npcs) {
        const n = this.npcs[id];
        if (n.state === 'dead' || n.state === 'gone') continue;
        const ex = n.x - ox, ez = n.z - oz;
        const t = ex * vx + ez * vz;
        if (t < 0.2 || t > bestT) continue;
        const px = ox + vx * t, pz = oz + vz * t, py = oy + vy * t;
        const perp = Math.hypot(px - n.x, pz - n.z);
        if (perp < 0.6 && py > 0.0 && py < 2.05) { best = n; bestT = t; }
      }
      // напарник: пуля проходит мимо (дружественного огня нет)
      for (const q of this.players) {
        if (!q || q === p || q.dead) continue;
        const ex = q.x - ox, ez = q.z - oz;
        const t = ex * vx + ez * vz;
        if (t < 0.2 || t > bestT) continue;
        const px = ox + vx * t, pz = oz + vz * t, py = oy + vy * t;
        if (Math.hypot(px - q.x, pz - q.z) < 0.6 && py > 0 && py < 1.95) {
          best = null; bestT = t; hits.push({ ff: true });
        }
      }
      if (best) {
        const hitY = oy + vy * bestT;
        const hs = hitY > 1.5;
        const dmg = w.dmg * (hs ? 1.75 : 1) * (pellets > 1 ? 1 : 1);
        this.damageNpc(best, dmg, p);
        hits.push({ id: best.id, dmg: Math.round(dmg), hs: hs, t: +bestT.toFixed(1) });
      }
    }
    this.broadcast({ t: 'shotFx', slot: p.slot, x: p.x, y: p.y + 1.35, z: p.z, wx: p.weapon });
    this.broadcast({ t: 'gunshot', x: p.x, z: p.z, indoor: !!p.indoors });
    this.to(p, { t: 'shotResult', mag: p.mag, hits: hits });
    if (p.indoors === 'bank') this.triggerAlarm(p, 'Выстрел в банке');
    else {
      for (const id in this.npcs) {
        const n = this.npcs[id];
        if (n.kind === 'guard' && Math.hypot(n.x - p.x, n.z - p.z) < 70) this.triggerAlarm(p, 'Охрана услышала выстрелы');
      }
    }
    if (hits.some(h => h.ff)) this.toast(p, 'Это ваш напарник! Урон по своим не проходит.', 'bad');
    if (p.mag === 0) this.toast(p, 'Магазин пуст — нужна перезарядка (R)', 'bad');
  };
  Room.prototype.melee = function (p) {
    if (!p || p.dead) return;
    const w = DI.ITEMS[p.weapon];
    if (!w || (w.kind !== 'melee' && p.weapon !== 'fist')) return;
    if (this.t - p.lastMelee < w.rate) return;
    p.lastMelee = this.t;
    this.broadcast({ t: 'meleeFx', slot: p.slot, x: p.x, z: p.z });
    for (const id in this.npcs) {
      const n = this.npcs[id];
      if (n.state === 'dead') continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d > w.range) continue;
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const da = Math.abs(((ang - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < 1.2) {
        this.damageNpc(n, w.dmg, p);
        this.addCrime(p, 3, 'Драка');
        break;
      }
    }
  };
  Room.prototype.reload = function (p) {
    if (!p || p.dead) return;
    const w = this.currentGun(p);
    if (!w) return;
    if (p.mag >= w.mag) { this.toast(p, 'Магазин уже полный', 'info'); return; }
    const slot = p.save.inv.find(i => i.id === 'ammo' && i.cls === w.cls);
    const have = slot ? slot.qty : 0;
    if (have <= 0) {
      this.to(p, { t: 'reloadFail', reason: 'Нет патронов ' + DI.AMMO_KIND[w.cls] + '! Купите их в магазине оружия — они дешёвые.' });
      this.to(p, { t: 'sfx', name: 'error' });
      return;
    }
    const take = Math.min(w.mag - p.mag, have);
    slot.qty -= take;
    if (slot.qty <= 0) p.save.inv = p.save.inv.filter(i => i !== slot);
    p.mag += take;
    p.reloadT = this.t + w.reload;
    this.broadcast({ t: 'reloadFx', slot: p.slot, time: w.reload });
    this.to(p, { t: 'mag', mag: p.mag });
    this.broadcast({ t: 'inv', slot: p.slot, inv: p.save.inv, wallet: p.save.wallet });
    this.persist(p);
  };

  /* ================================================================ */
  /*  ОБРАБОТКА СООБЩЕНИЙ                                             */
  /* ================================================================ */
  Room.prototype.handle = function (p, m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'state': {
        const nx = num(m.x, p.x), nz = num(m.z, p.z);
        p.yaw = num(m.yaw, p.yaw); p.pitch = num(m.pitch, p.pitch);
        p.anim = str(m.anim, 'idle');
        p.stamina = num(m.stamina, p.stamina);
        p.sel = Math.max(0, Math.min(DI.INV_SLOTS - 1, int(m.sel, p.sel)));
        p.carrying = m.carrying === 'box' ? 'box' : null;
        if (!p.dead) {
          const dx = nx - p.x, dz = nz - p.z, d = Math.hypot(dx, dz);
          const maxStep = (p.anim === 'run' ? DI.PLAYER.sprint : DI.PLAYER.speed) * 0.4 + 0.4;
          let tx2 = p.x, tz2 = p.z;
          if (d > maxStep) { const k = maxStep / d; tx2 = p.x + dx * k; tz2 = p.z + dz * k; }
          else { tx2 = nx; tz2 = nz; }
          // игрока не «выкидывает» из дома при закрытии двери, но полотно его двигает
          const rr = this.resolve(tx2, tz2, DI.PLAYER.radius, { noEject: true });
          p.x = rr.x; p.z = rr.z;
          if (Math.hypot(tx2 - p.x, tz2 - p.z) > 0.06 && !p.doorWarn) {
            p.doorWarn = this.t;
            for (const key in DI.DOOR_SLABS) {
              if (!this.isDoorOpen(key) && this.doorBlocked(key, tx2, tz2)) {
                const nm = key === 'house' ? 'дома' : (key === 'bank' ? 'банка' : 'магазина');
                this.toast(p, 'Дверь ' + nm + ' закрыта — сначала откройте её (E)', 'bad');
                break;
              }
            }
          }
          if (this.t - (p.doorWarn || -99) > 3) p.doorWarn = 0;
        }
        const prevIndoors = p.indoors;
        p.indoors = DI.insideBuilding(p.x, p.z);
        if (prevIndoors !== p.indoors) this.broadcast({ t: 'zone', slot: p.slot, zone: p.indoors });
        if (p.grabbing) {
          const pile = this.piles.find(x => x.id === p.grabbing.pile);
          if (!pile || Math.hypot(pile.x - p.x, pile.z - p.z) > 4.6) this.cancelGrab(p, 'Вы отошли от денег');
        }
        const sel = p.save.inv[p.sel];
        const wid = sel ? sel.id : 'fist';
        if (wid !== p.weapon) {
          p.weapon = wid;
          p.bag = wid === 'bag';
          if (DI.ITEMS[wid] && DI.ITEMS[wid].kind !== 'gun') p.mag = 0;
          this.broadcast({ t: 'weapon', slot: p.slot, weapon: p.weapon });
        }
        this.broadcast({
          t: 'pmove', slot: p.slot, x: +p.x.toFixed(2), z: +p.z.toFixed(2),
          yaw: +p.yaw.toFixed(2), pitch: +p.pitch.toFixed(2), anim: p.anim,
          weapon: p.weapon, carry: p.carrying, hp: Math.round(p.hp)
        });
        break;
      }
      case 'grabStart': this.startGrab(p, int(m.pile, -1)); break;
      case 'grabDone':
        if (p.grabbing && this.t >= p.grabbing.ends - 0.5) this.finishGrab(p);
        else this.cancelGrab(p, 'Вы отпустили слишком рано');
        break;
      case 'grabCancel': this.cancelGrab(p, null); break;
      case 'shoot': this.shoot(p, num(m.dx, 0), num(m.dy, 0), num(m.dz, 1)); break;
      case 'melee': this.melee(p); break;
      case 'reload': this.reload(p); break;
      case 'buy': this.buy(p, str(m.id, '')); break;
      case 'buyAmmo': this.buyAmmo(p, str(m.id, ''), int(m.rounds, 30)); break;
      case 'wardrobe': {
        const w = Math.max(0, Math.min(1, int(m.w, 0)));
        const idx = int(m.index, -1);
        if (Math.hypot(DI.HOUSE.x - p.x, DI.HOUSE.z - p.z) > 10) { this.toast(p, 'Шкафы стоят дома', 'bad'); break; }
        if (m.act === 'put') {
          const s = p.save.inv[idx];
          if (!s || s.id === 'fist') { this.toast(p, 'Кулаки в шкаф не положить', 'bad'); break; }
          if (p.save.wardrobe[w].length >= DI.WARDROBE_SLOTS) { this.toast(p, 'Шкаф заполнен (15 ячеек)', 'bad'); break; }
          p.save.inv.splice(idx, 1);
          p.save.wardrobe[w].push(s);
          this.toast(p, 'Положено в шкаф: ' + this.slotName(s), 'good');
        } else if (m.act === 'take') {
          const s = p.save.wardrobe[w][idx];
          if (!s) break;
          if (p.save.inv.length >= DI.INV_SLOTS) { this.toast(p, 'Инвентарь заполнен (10 ячеек)', 'bad'); break; }
          p.save.wardrobe[w].splice(idx, 1);
          p.save.inv.push(s);
          this.toast(p, 'Достали из шкафа: ' + this.slotName(s), 'good');
        }
        if (p.sel >= p.save.inv.length) p.sel = 0;
        p.weapon = p.save.inv[p.sel] ? p.save.inv[p.sel].id : 'fist';
        this.to(p, { t: 'wardrobe', w: p.save.wardrobe });
        this.broadcast({ t: 'inv', slot: p.slot, inv: p.save.inv, wallet: p.save.wallet });
        this.persist(p);
        break;
      }
      case 'deposit': {
        const idx = int(m.index, -1);
        const s = p.save.inv[idx];
        if (!s || s.id !== 'money') break;
        const val = Math.max(1, Math.round(s.val || this.rng.i(60, 900)));
        p.save.inv.splice(idx, 1);
        p.save.wallet += val;
        p.save.stats.earned = (p.save.stats.earned || 0) + val;
        if (p.sel >= p.save.inv.length) p.sel = 0;
        p.weapon = p.save.inv[p.sel] ? p.save.inv[p.sel].id : 'fist';
        this.toast(p, 'Перечислено на баланс: ' + DI.money(val), 'good');
        this.to(p, { t: 'sfx', name: 'cash' });
        this.broadcast({ t: 'inv', slot: p.slot, inv: p.save.inv, wallet: p.save.wallet });
        this.persist(p);
        break;
      }
      case 'bagWithdraw': {
        const amount = m.all ? p.bagMoney : Math.min(p.bagMoney, Math.max(0, int(m.amount, 0)));
        if (amount <= 0) { this.toast(p, 'В сумке пусто', 'bad'); break; }
        p.bagMoney -= amount; p.save.bagMoney = p.bagMoney;
        p.save.wallet += amount;
        p.save.stats.earned = (p.save.stats.earned || 0) + amount;
        this.toast(p, 'Из сумки на баланс: ' + DI.money(amount), 'good');
        this.to(p, { t: 'sfx', name: 'cash' });
        this.broadcast({ t: 'bagUpdate', slot: p.slot, money: Math.round(p.bagMoney) });
        this.broadcast({ t: 'inv', slot: p.slot, inv: p.save.inv, wallet: p.save.wallet });
        this.persist(p);
        break;
      }
      case 'useMedkit': {
        const idx = p.save.inv.findIndex(i => i.id === 'medkit');
        if (idx < 0) { this.toast(p, 'Аптечки нет в инвентаре', 'bad'); break; }
        if (p.hp >= DI.PLAYER.hp) { this.toast(p, 'Здоровье уже полное', 'info'); break; }
        p.save.inv.splice(idx, 1);
        p.hp = Math.min(DI.PLAYER.hp, p.hp + DI.ITEMS.medkit.heal);
        this.toast(p, 'Аптечка: +' + DI.ITEMS.medkit.heal + ' HP', 'good');
        this.broadcast({ t: 'pstate', slot: p.slot, hp: Math.round(p.hp), dead: false });
        this.broadcast({ t: 'inv', slot: p.slot, inv: p.save.inv, wallet: p.save.wallet });
        this.persist(p);
        break;
      }
      case 'door': {
        const k = str(m.door, '');
        if (!(k in this.doors)) break;
        const dd = k === 'house' ? DI.HOUSE_DOOR : (k === 'bank' ? DI.BANK_DOOR : DI.SHOP_DOOR);
        if (Math.hypot(dd.x - p.x, dd.z - p.z) > 5) { this.toast(p, 'Далеко до двери', 'bad'); break; }
        this.doors[k] = !this.doors[k];
        this.broadcast({ t: 'door', door: k, open: this.doors[k] });
        this.fxAll('door', { door: k });
        if (k === 'house' && !this.doors[k] && p.indoors === 'house' && p.stars > 0) {
          this.toast(p, 'Дверь закрыта. Сидим тихо — розыск остывает быстрее.', 'good');
        }
        break;
      }
      case 'jobClaim': this.jobClaim(p); break;
      case 'jobPick': this.jobPick(p); break;
      case 'jobDrop': this.jobDrop(p); break;
      case 'sleep': {
        const bed = DI.BEDS[p.slot];
        if (Math.hypot(bed.x - p.x, bed.z - p.z) < 3.4) {
          p.hp = DI.PLAYER.hp; p.stamina = DI.PLAYER.stamina;
          this.broadcast({ t: 'pstate', slot: p.slot, hp: p.hp, dead: false });
          this.toast(p, 'Вы отдохнули: HP и стамина восстановлены', 'good');
        }
        break;
      }
      case 'say':
        this.broadcast({ t: 'say', id: 'p' + p.slot, slot: p.slot, text: String(m.text || '').slice(0, 90) }, p);
        break;
      case 'voice': {
        const other = this.players[1 - p.slot];
        if (other) this.to(other, { t: 'voice', from: p.slot, kind: m.kind, sdp: m.sdp, cand: m.cand });
        break;
      }
      case 'mic': {
        p.voice = !!m.on;
        this.broadcast({ t: 'mic', slot: p.slot, on: p.voice });
        break;
      }
      case 'ping': this.to(p, { t: 'pong', e: m.e }); break;
      case 'setName': {
        p.name = String(m.name || 'Игрок').slice(0, 18) || 'Игрок';
        p.save.name = p.name;
        this.broadcast({ t: 'roster', players: this.roster() });
        this.persist(p);
        break;
      }
      case 'setModel': {
        p.model = m.model === 'gopnik' ? 'gopnik' : 'gentleman';
        p.save.model = p.model;
        this.broadcast({ t: 'model', slot: p.slot, model: p.model });
        this.persist(p);
        break;
      }
      default: break;
    }
  };
  Room.prototype.slotName = function (s) {
    if (!s) return '';
    if (s.id === 'money') return 'Пачка денег ' + DI.money(s.val || 0);
    if (s.id === 'ammo') return 'Патроны ' + (DI.AMMO_KIND[s.cls] || '') + ' x' + s.qty;
    const it = DI.ITEMS[s.id];
    return it ? it.name + (s.qty > 1 ? ' x' + s.qty : '') : s.id;
  };

  /* ================================================================ */
  /*  ТИК                                                             */
  /* ================================================================ */
  Room.prototype.tick = function (forceDt) {
    const now = Date.now();
    const dt = forceDt == null ? Math.min(0.25, (now - this._last) / 1000) : forceDt;
    this._last = now;
    this.t += dt;
    if (typeof this.botTick === 'function') { try { this.botTick(dt); } catch (e) {} }

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p) continue;
      if (p.dead) {
        p.respawnT -= dt;
        if (p.respawnT <= 0 && p.send) this.respawnPlayer(p);
        continue;
      }
      this.updateWanted(p, dt);
      if (p.grabbing && this.t >= p.grabbing.ends) this.finishGrab(p);
    }
    this.updateNpcs(dt);
    this.updateJob(dt);
    if (this.alarm) {
      this.alarmT -= dt;
      let threat = false;
      for (const p of this.players) if (p && !p.dead && p.indoors === 'bank' && p.weapon !== 'fist') threat = true;
      if (this.alarmT <= 0 && !threat) { this.alarm = false; this.broadcast({ t: 'alarm', on: false }); }
    }
  };

  return { Room: Room, defaultSave: defaultSave, normalizeSave: normalizeSave };
});
