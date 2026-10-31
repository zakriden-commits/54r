/* DENI ISLAM — офлайн-режим: та же игровая комната, но внутри браузера,
   плюс бот-напарник «Саня», чтобы игра была играбельна даже без сервера. */
export function createLocalGame(opts) {
  const DI = window.DI;
  const DIRoom = window.DIRoom;
  if (!DI || !DIRoom) {
    console.error('protocol.js / room.js не загружены');
    return null;
  }
  const store = {
    load(token) {
      try { const v = localStorage.getItem('di_localsave_' + token); return v ? JSON.parse(v) : null; } catch (e) { return null; }
    },
    save(token, data) {
      try { localStorage.setItem('di_localsave_' + token, JSON.stringify(data)); } catch (e) {}
    }
  };

  const room = new DIRoom.Room({ store, seed: opts.seed || 777001, log: () => {} });

  /* ---------- локальный игрок ---------- */
  let human = null;
  const humanSend = (m) => { if (opts.onMessage) opts.onMessage(m); };
  const res = room.join({
    token: opts.token || ('local' + Math.random().toString(36).slice(2, 10)),
    name: opts.name, model: opts.model, send: humanSend
  });
  if (!res.ok) return null;
  human = res.player;

  /* ---------- бот-напарник ---------- */
  const botSend = () => {}; // сообщения боту не нужны
  const bres = room.join({ token: 'bot_sanya', name: 'Саня (бот)', model: 'gopnik', send: botSend, isBot: true });
  const bot = bres.ok ? bres.player : null;

  if (bot) {
    const rng = DI.makeRng(31337);
    bot.mode = 'follow';
    bot.modeT = 6;
    bot.tx = bot.x; bot.tz = bot.z;
    bot.quipT = 12;
    bot.weapon = 'fist';

    room.botTick = function (dt) {
      if (!bot || bot.dead) return;
      bot.modeT -= dt;
      const hp = human;
      const jb = room.job;

      if (bot.modeT <= 0) {
        const r = rng.raw();
        if (jb && jb.owner < 0 && r < 0.45) { bot.mode = 'job'; bot.modeT = 45; }
        else if (hp && r < 0.8) { bot.mode = 'follow'; bot.modeT = rng.f(14, 30); }
        else if (r < 0.9) { bot.mode = 'bank'; bot.modeT = rng.f(18, 34); }
        else { bot.mode = 'wander'; bot.modeT = rng.f(10, 22); }
        if (bot.mode === 'wander') {
          bot.tx = rng.f(-90, 90); bot.tz = rng.f(-90, 90);
        }
      }

      let tx = bot.tx, tz = bot.tz;
      if (bot.mode === 'follow' && hp) {
        const d = Math.hypot(hp.x - bot.x, hp.z - bot.z);
        if (d > 4.5) { tx = hp.x; tz = hp.z; }
        else { bot.anim = 'idle'; tx = bot.x; tz = bot.z; }
      } else if (bot.mode === 'job' && jb) {
        if (jb.owner < 0) { tx = jb.x; tz = jb.z; }
        else if (jb.owner === bot.slot) {
          if (bot.carrying) { tx = jb.x; tz = jb.z; }
          else { tx = jb.x + 3.2; tz = jb.z + 1.6; }
          if (Math.hypot(tx - bot.x, tz - bot.z) < 3.2) {
            if (jb.owner !== bot.slot) room.handle(bot, { t: 'jobClaim' });
            else if (!bot.carrying && jb.delivered < jb.boxes) room.handle(bot, { t: 'jobPick' });
            else if (bot.carrying) {
              tx = jb.x; tz = jb.z;
              if (Math.hypot(jb.x - bot.x, jb.z - bot.z) < 3.4) room.handle(bot, { t: 'jobDrop' });
            }
          }
        } else { bot.mode = 'follow'; bot.modeT = 8; }
      } else if (bot.mode === 'bank') {
        tx = DI.BANK.x - 4; tz = DI.BANK.z - 12;
        if (Math.hypot(tx - bot.x, tz - bot.z) < 5) { bot.mode = 'follow'; bot.modeT = 10; }
      }

      // движение
      const dx = tx - bot.x, dz = tz - bot.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        const run = d > 16 || bot.mode === 'job';
        const sp = run ? DI.PLAYER.sprint * 0.86 : DI.PLAYER.speed * 0.82;
        const step = Math.min(d, sp * dt);
        let nx = bot.x + dx / d * step, nz = bot.z + dz / d * step;
        const r = DI.resolveCollision(nx, nz, 0.45, room.boxes);
        if (Math.abs(r.x - nx) > 0.02 || Math.abs(r.z - nz) > 0.02) {
          const side = bot.sidePref || 1;
          bot.sideT = (bot.sideT || 0) + dt;
          if (bot.sideT > 1.2) { bot.sideT = 0; bot.sidePref = -side; }
          const sx = nx + (-dz / d) * 1.1 * side, sz = nz + (dx / d) * 1.1 * side;
          const r2 = DI.resolveCollision(sx, sz, 0.45, room.boxes);
          bot.x = r2.x; bot.z = r2.z;
        } else { bot.x = r.x; bot.z = r.z; bot.sideT = 0; }
        bot.yaw = Math.atan2(dx, dz);
        bot.anim = run ? 'run' : 'walk';
      } else {
        bot.anim = bot.mode === 'follow' ? 'idle' : bot.anim;
      }
      bot.indoors = DI.insideBuilding(bot.x, bot.z);

      // реплики
      bot.quipT -= dt;
      if (bot.quipT <= 0) {
        bot.quipT = rng.f(20, 45);
        const lines = [
          'Слышь, братан, погнали в банк?', 'Патроны бы купить, они дешёвые.',
          'Ящик-два перенесём — и по пиву.', 'Если копы — бежим домой и закрываем дверь.',
          'Красиво живёшь, джентльмен.', 'Сумка нужна, руками много не утащишь.',
          'Я за тебя горой, урон по своим не проходит.'
        ];
        room.broadcast({ t: 'say', id: 'p' + bot.slot, slot: bot.slot, text: lines[rng.i(0, lines.length - 1)] });
      }
    };

    // встраиваем бота в тик комнаты
    const origTick = room.tick.bind(room);
    room.tick = function (forceDt) {
      // важно: _last обновляет сам origTick, поэтому считаем dt ДО него
      const dt = forceDt == null ? Math.min(0.25, (Date.now() - room._last) / 1000) : forceDt;
      try { room.botTick(dt); } catch (e) { /* бот не должен ронять тик */ }
      origTick(forceDt);
      // состояние бота рассылаем как от обычного игрока
      room.broadcast({
        t: 'pmove', slot: bot.slot, x: +bot.x.toFixed(2), z: +bot.z.toFixed(2),
        yaw: +bot.yaw.toFixed(2), pitch: 0, anim: bot.anim, weapon: bot.weapon,
        carry: bot.carrying, hp: Math.round(bot.hp)
      });
    };
  }

  return {
    room,
    player: human,
    bot,
    handle: (m) => room.handle(human, m),
    close: () => { room.persist(human); room.destroy(); },
    isLocal: true
  };
}
