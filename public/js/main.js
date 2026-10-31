/* ============================================================
   DENI ISLAM — клиент игры
   3D от третьего лица, онлайн на двоих, мобильные контролы,
   инвентарь, магазин, банк, копы, звёзды, голосовой чат.
   ============================================================ */
import * as THREE from '../vendor/three/three.module.js';
import { buildWorld, updateWorld, nearestInteraction, civiliansPanic, hurtCivilian, killCivilian } from './world.js';
import { makeByKind, makeGentleman, makeGopnik, animateChar, makeLabel, updateLabel, poseWithWeapon } from './chars.js';
import { makeGun, makeBag, makeCrate, makeMoneyStack, makeAmmoBox, textures, stdMat, loadFileTextures } from './models.js';
import { initAudio, resumeAudio, play, playAt, setListener, startAmbience, setMuted, SFX,
         audioCtx as audioContext, startMusic, stopMusic, startAlarmLoop, stopAlarmLoop,
         startRadio, stopRadio, nextRadio, radioTrackName } from './audio.js';
import { Net } from './net.js';
import { createLocalGame } from './localroom.js';
import { $, $$, el, LS, token, toast, money, clamp, isTouch, isIOS, fmtTime, wsUrl } from './util.js';

const DI = window.DI;
const VM_LAYER = 1;

/* ================================================================== */
class Game {
  constructor() {
    this.mode = 'menu';            // menu | lobby | play
    this.local = null;             // офлайн-комната (если сервера нет)
    this.net = new Net(this);
    this.name = LS.get('name', 'Игрок');
    this.model = LS.get('model', 'gentleman');
    this.sens = LS.get('sens', 100) / 100;
    this.quality = LS.get('quality', 'med');
    this.aimAssist = LS.get('aimAssist', true);
    this.radioOn = LS.get('radioOn', true);
    this.slot = -1;
    this.inv = [{ id: 'fist', qty: 1 }];
    this.wardrobe = [[], []];
    this.wallet = 0;
    this.bagMoney = 0;
    this.sel = 0;
    this.weapon = 'fist';
    this.mag = 0;
    this.stars = 0;
    this.heat = 0;
    this.hp = 100; this.stamina = 100;
    this.dead = false;
    this.grab = null;
    this.carrying = null;
    this.piles = [];
    this.npcs = {};
    this.peer = null;
    this.job = null;
    this.jobLabel = '';
    this.interact = null;
    this.time = 0;
    this.fps = 0;
    this.frame = 0;
    this.reloadUntil = 0;
    this.fireCooldown = 0;
    this.meleeCooldown = 0;
    this.wantFire = false;
    this.aiming = false;
    this.sprinting = false;
    this.micAllowed = false;
    this.voiceWanted = LS.get('voice', true);
    this.lastZone = null;
    this.tracers = [];
    this.particles = [];
    this.flashes = [];
    this.sendAcc = 0;
    this.pingT = 0;
    this.panelOpen = null;
    this.ui = {};
  }

  /* ================= ИНИЦИАЛИЗАЦИЯ 3D ================= */
  initThree() {
    const canvas = $('#scene');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft удалён из three r187
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 420);
    this.camera.position.set(DI.HOUSE.x, 2, DI.HOUSE.z - 6);
    this.camera.lookAt(DI.HOUSE.x, 1.4, DI.HOUSE.z);

    // сцена оружия от первого лица
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 12);
    this.vmCamera.layers.enable(VM_LAYER);
    this.vmRoot = new THREE.Group();
    this.vmRoot.layers.enable(VM_LAYER);
    this.vmScene.add(this.vmRoot);
    const vmLight = new THREE.DirectionalLight(0xffffff, 2.1);
    vmLight.position.set(0.6, 1.2, 1.4); vmLight.layers.enable(VM_LAYER);
    this.vmScene.add(vmLight);
    const vmAmb = new THREE.AmbientLight(0xffffff, 0.85); vmAmb.layers.enable(VM_LAYER);
    this.vmScene.add(vmAmb);
    const vmFill = new THREE.DirectionalLight(0xffd9a0, 0.7);
    vmFill.position.set(-1, 0.4, -0.8); vmFill.layers.enable(VM_LAYER);
    this.vmScene.add(vmFill);

    this.raycaster = new THREE.Raycaster();
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }
  onResize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
  }

  /* ================= МИР И АКТОРЫ ================= */
  buildScene(seed) {
    if (this.world) {
      this.scene.remove(this.world.root);
      this.world.root.traverse(o => {
        if (o.geometry) o.geometry.dispose && o.geometry.dispose();
      });
    }
    textures();
    this.world = buildWorld(this.scene, seed || 4242);
    this.actors = new THREE.Group();
    this.scene.add(this.actors);
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);

    // своя модель
    this.selfModel = this.model === 'gopnik' ? makeGopnik() : makeGentleman();
    this.selfModel.position.set(DI.BEDS[0].x, 0, DI.BEDS[0].z);
    this.selfLabel = makeLabel(this.name, '#ffd23b');
    this.selfModel.add(this.selfLabel);
    this.actors.add(this.selfModel);

    // held-предмет в руке своей модели (видно напарнику)
    this.selfHeld = new THREE.Group();
    this.selfModel.userData.p.armR.add(this.selfHeld);
    this.selfHeld.position.set(0, -0.72, 0.08);

    this.yaw = Math.PI; this.pitch = -0.05;
    this.px = DI.BEDS[0].x; this.py = 0; this.pz = DI.BEDS[0].z + 0.5;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.camDist = 4.4;
    this.buildViewModel();
  }

  buildViewModel() {
    while (this.vmRoot.children.length) this.vmRoot.remove(this.vmRoot.children[0]);
    const w = this.weapon;
    const it = DI.ITEMS[w];
    const hand = new THREE.Group();
    const skin = this.model === 'gopnik' ? stdMat(0xc68e62, 0.9) : stdMat(0xf0ece0, 0.9);
    const sleeve = this.model === 'gopnik' ? stdMat(0x1f4d8f, 0.9) : stdMat(0x1d2129, 0.85);
    // правая рука
    const arm = new THREE.Group();
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.3), sleeve);
    s1.position.set(0, -0.02, -0.12); arm.add(s1);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.13), skin);
    fist.position.set(0, -0.01, 0.05); arm.add(fist);
    arm.position.set(0.16, -0.16, -0.34);
    arm.rotation.set(0.08, -0.12, 0);
    hand.add(arm);
    this.vmArmL = null;

    if (it && it.kind === 'gun') {
      const gun = makeGun(w);
      const twoHanded = it.cls === 'rifle' || it.cls === 'smg' || it.cls === 'shotgun';
      gun.scale.setScalar(twoHanded ? 1.55 : 1.75);
      gun.position.set(twoHanded ? 0.03 : 0.06, twoHanded ? -0.06 : -0.1, twoHanded ? 0.02 : -0.06);
      gun.rotation.y = twoHanded ? 0 : 0.06;
      arm.add(gun);
      this.vmGun = gun;
      if (twoHanded) {
        const arm2 = new THREE.Group();
        const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.32), sleeve);
        s2.position.set(0, 0, -0.14); arm2.add(s2);
        const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.13), skin);
        f2.position.set(0, 0, 0.04); arm2.add(f2);
        arm2.position.set(-0.3, -0.17, -0.3);
        arm2.rotation.set(0.05, 0.42, 0.25);
        hand.add(arm2);
        this.vmArmL = arm2;
      }
      // мушка-ориентир
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xff4d3d }));
      dot.position.set(gun.position.x, gun.position.y + 0.1, gun.position.z + 0.4);
      hand.add(dot);
      this.vmSight = dot;
    } else if (w === 'bag') {
      const bag = makeBag();
      bag.scale.setScalar(0.85);
      bag.position.set(0.02, -0.16, -0.06);
      arm.add(bag);
      this.vmGun = bag;
    } else if (w === 'money') {
      const m = makeMoneyStack(0.4, 0.14, 0.24);
      m.scale.setScalar(0.9);
      m.position.set(0.02, -0.1, -0.02);
      m.rotation.set(0.2, 0.3, 0.1);
      arm.add(m);
      this.vmGun = m;
    } else if (w === 'medkit') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.1), stdMat(0xe8e8e4, 0.8));
      b.position.set(0.02, -0.12, -0.02); arm.add(b);
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.012), stdMat(0xd02020));
      cross1.position.set(0.02, -0.12, 0.035); arm.add(cross1);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.012), stdMat(0xd02020));
      cross2.position.set(0.02, -0.12, 0.035); arm.add(cross2);
      this.vmGun = b;
    } else if (w === 'ammo') {
      const cls = (this.inv[this.sel] || {}).cls || 'pistol';
      const ab = makeAmmoBox(cls);
      ab.scale.setScalar(0.6); ab.position.set(0.02, -0.14, -0.02);
      arm.add(ab); this.vmGun = ab;
    } else {
      // кулаки: две руки
      const arm2 = new THREE.Group();
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.28), sleeve);
      s2.position.set(0, 0, -0.12); arm2.add(s2);
      const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.13), this.model === 'gopnik' ? stdMat(0xc68e62, 0.9) : stdMat(0xf0ece0, 0.9));
      f2.position.set(0, 0, 0.04); arm2.add(f2);
      arm2.position.set(-0.2, -0.18, -0.32);
      arm2.rotation.set(0.1, 0.1, 0.1);
      hand.add(arm2);
      this.vmArmL = arm2;
      arm.position.set(0.2, -0.18, -0.32);
      arm.rotation.set(0.1, -0.1, -0.1);
      this.vmGun = null;
    }
    hand.traverse(o => { if (o.isMesh) { o.layers.enable(VM_LAYER); o.castShadow = false; } });
    this.vmRoot.add(hand);
    this.vmHand = hand;
    this.vmBob = 0; this.vmRecoil = 0;
  }

  /* ================= СЕТЕВЫЕ СООБЩЕНИЯ ================= */
  bindNet() {
    const n = this.net;
    n.on('*', () => {});
    n.on('welcome', m => this.onWelcome(m));
    n.on('roster', m => this.onRoster(m));
    n.on('join', m => { toast(m.name + ' подключился к игре (слот ' + (m.slot + 1) + ')', 'good'); play('levelup', { gain: .5 }); });
    n.on('leave', m => { toast('Напарник отключился (слот ' + (m.slot + 1) + ')', 'bad'); });
    n.on('peerState', m => this.onPeerState(m));
    n.on('pmove', m => this.onPeerMove(m));
    n.on('weapon', m => { if (this.peer && m.slot === this.peer.slot) this.setPeerWeapon(m.weapon); });
    n.on('carry', m => this.onCarry(m));
    n.on('pstate', m => this.onPeerHp(m));
    n.on('npcs', m => this.syncNpcs(m.list));
    n.on('npcHit', m => this.onNpcHit(m));
    n.on('npcShot', m => this.onNpcShot(m));
    n.on('shotFx', m => this.onShotFx(m));
    n.on('meleeFx', m => this.spawnImpact(m.x, 1.2, m.z, 0xffffff, 4));
    n.on('shotResult', m => this.onShotResult(m));
    n.on('gunshot', m => {
      civiliansPanic(this.world, m.x, m.z, m.indoor ? 30 : 55);
      if (m.slot !== this.slot) playAt(m.indoor ? 'shotRifle' : 'shotFar', m.x, 1.4, m.z, 0.75);
    });
    n.on('dryFire', () => { play('dry', { gain: .6 }); });
    n.on('reloadFail', m => { toast('⚠ ' + m.reason, 'bad'); });
    n.on('reloadFx', m => this.startReloadFx(m.time));
    n.on('mag', m => { this.mag = m.mag; this.updateHud(); });
    n.on('inv', m => this.onInv(m));
    n.on('wallet', m => { this.wallet = m.wallet; this.updateHud(); this.refreshShop(); });
    n.on('bagUpdate', m => {
      if (m.slot === this.slot) { this.bagMoney = m.money; }
      else if (this.peer) this.peer.bagMoney = m.money;
      this.updateHud();
    });
    n.on('wardrobe', m => { this.wardrobe = m.w; this.renderWardrobe(); });
    n.on('pileUpdate', m => {
      const p = this.piles.find(x => x.id === m.id);
      if (p) p.left = m.left;
      const mesh = this.world.pileMeshes[m.id];
      if (mesh) mesh.visible = m.left > 0;
    });
    n.on('grab', m => this.onGrab(m));
    n.on('grabCancel', m => { if (m.slot === this.slot) this.stopGrab(true); });
    n.on('alarm', m => this.onAlarm(m));
    n.on('wanted', m => this.onWanted(m));
    n.on('death', m => this.onDeath(m));
    n.on('respawn', m => this.onRespawn(m));
    n.on('hurt', m => this.onHurt(m));
    n.on('jobSpawn', m => this.onJobSpawn(m));
    n.on('jobUpdate', m => this.onJobUpdate(m));
    n.on('jobGone', m => this.onJobGone(m));
    n.on('jobDone', m => { if (m.slot !== this.slot) toast('Напарник выполнил работу: +' + money(m.bonus), 'info'); });
    n.on('door', m => { this.world.doors[m.door] = m.open; });
    n.on('say', m => this.onSay(m));
    n.on('toast', m => toast(m.text, m.kind));
    n.on('sfx', m => play(m.name, { gain: .8 }));
    n.on('fx', m => this.onFx(m));
    n.on('buy', m => { if (m.slot !== this.slot) toast('Напарник купил: ' + (DI.ITEMS[m.id] ? DI.ITEMS[m.id].name : m.id), 'info'); });
    n.on('model', m => { if (this.peer && m.slot === this.peer.slot) this.rebuildPeer(m.model); });
    n.on('mic', m => { if (this.peer && m.slot === this.peer.slot) this.setPeerMic(m.on); });
    n.on('voice', m => this.net.voiceSignal(m));
    n.on('pong', m => { this.ping = Math.max(0, Math.round(performance.now() - m.e)); });
    n.on('zone', () => {});
    n.on('retryNow', () => { if (this.mode === 'menu') this.net.retryJoin(); });

    n.onStatus = (state, text) => this.onNetStatus(state, text);
  }

  onWelcome(m) {
    this.slot = m.slot;
    this.seed = m.seed;
    this.wallet = m.wallet;
    this.inv = m.inv && m.inv.length ? m.inv : [{ id: 'fist', qty: 1 }];
    this.wardrobe = m.wardrobe || [[], []];
    this.bagMoney = m.bagMoney || 0;
    this.piles = m.piles || [];
    if (this.world) this.world.piles = this.piles;
    this.hp = m.hp || 100;
    this.stamina = m.stamina || 100;
    this.stats = m.stats || {};
    this.name = m.name || this.name;
    this.model = m.model || this.model;
    this.sel = 0;
    this.weapon = this.inv[0] ? this.inv[0].id : 'fist';
    this.mag = 0;
    if (m.doors) this.world && Object.assign(this.world.doors, m.doors);
    if (m.job) this.onJobSpawn({ job: m.job });
    if (m.npcs) this.syncNpcs(m.npcs);
    this.buildScene(m.seed);
    this.px = m.x; this.pz = m.z;
    this.selfModel.position.set(this.px, 0, this.pz);
    this.applyPiles();
    if (m.job) this.onJobUpdate({ job: m.job });
    if (m.players) this.onRoster({ players: m.players });
    this.updateHud();
    this.buildHotbar();
    this.buildViewModel();
    this.setLobby(m.players);
    this.mode = 'lobby';
    $('#loading').classList.add('hidden');
  }

  applyPiles() {
    this.piles.forEach(p => {
      const mesh = this.world.pileMeshes[p.id];
      if (mesh) {
        mesh.visible = p.left > 0;
        const scale = clamp(0.45 + (p.left / 8000) * 0.8, 0.4, 1.25);
        mesh.scale.setScalar(scale);
      }
    });
  }

  onRoster(m) {
    this.roster = m.players;
    for (let i = 0; i < 2; i++) {
      const box = $('#slot' + i);
      if (!box) continue;
      const p = m.players[i];
      box.classList.toggle('on', !!p);
      box.classList.toggle('you', !!p && p.slot === this.slot);
      box.querySelector('span').textContent = p ? (p.name + (p.slot === this.slot ? ' (вы)' : '')) : 'свободно';
    }
    const cnt = m.players.filter(Boolean).length;
    const lt = $('#lobbyTitle');
    if (lt) lt.textContent = cnt >= 2 ? 'ОБА В ДОМЕ — МОЖНО ГРАБИТЬ' : 'ВЫ В ДОМЕ ОДИН (' + cnt + '/2)';
    const ltext = $('#lobbyText');
    if (ltext) {
      ltext.textContent = cnt >= 2
        ? 'Напарник на месте. Голосовой чат включится, если оба разрешили микрофон. Жмите «ВОЙТИ В ДОМ».'
        : 'Сервер один, мест два. Как только друг зайдёт по этой же ссылке — он появится на второй кровати. Можно играть и одному.';
    }
    // напарник
    const other = m.players.find(p => p && p.slot !== this.slot);
    if (other && (!this.peer || this.peer.slot !== other.slot)) this.createPeer(other);
    else if (!other && this.peer) { this.removePeer(); }
    else if (other && this.peer) {
      this.peer.name = other.name;
      if (this.peer.model !== other.model) this.rebuildPeer(other.model);
      if (this.peer.label) updateLabel(this.peer.label, other.name, '#8fd3ff');
    }
  }

  createPeer(info) {
    this.removePeer();
    const mesh = info.model === 'gopnik' ? makeGopnik() : makeGentleman();
    mesh.position.set(info.x == null ? DI.BEDS[info.slot].x : info.x, 0, info.z == null ? DI.BEDS[info.slot].z : info.z);
    const label = makeLabel(info.name || 'Игрок 2', '#8fd3ff');
    mesh.add(label);
    const held = new THREE.Group();
    mesh.userData.p.armR.add(held);
    held.position.set(0, -0.72, 0.08);
    this.actors.add(mesh);
    this.peer = {
      slot: info.slot, name: info.name, model: info.model, mesh, label, held,
      x: mesh.position.x, z: mesh.position.z, yaw: 0, anim: 'idle', weapon: info.weapon || 'fist',
      hp: info.hp == null ? 100 : info.hp, mic: false, t: Math.random() * 10, carry: null
    };
    this.setPeerWeapon(this.peer.weapon);
    toast('Напарник: ' + (info.name || 'Игрок 2') + ' — спавн на второй кровати', 'good');
  }
  removePeer() {
    if (!this.peer) return;
    this.actors.remove(this.peer.mesh);
    this.peer = null;
  }
  rebuildPeer(model) {
    if (!this.peer) return;
    const info = { slot: this.peer.slot, name: this.peer.name, model, x: this.peer.x, z: this.peer.z, weapon: this.peer.weapon, hp: this.peer.hp };
    this.createPeer(info);
  }
  onPeerState(m) {
    if (m.slot === this.slot) return;
    if (!this.peer || this.peer.slot !== m.slot) this.createPeer({ slot: m.slot, name: m.name, model: m.model, x: m.x, z: m.z, weapon: m.weapon, hp: m.hp });
    else {
      this.peer.x = m.x; this.peer.z = m.z; this.peer.hp = m.hp;
      this.peer.mesh.position.set(m.x, 0, m.z);
      if (m.name) { this.peer.name = m.name; updateLabel(this.peer.label, m.name, '#8fd3ff'); }
      if (m.model && m.model !== this.peer.model) this.rebuildPeer(m.model);
    }
    this.updateHud();
  }
  onPeerMove(m) {
    if (m.slot === this.slot) return;
    if (!this.peer) this.createPeer({ slot: m.slot, name: 'Игрок 2', model: 'gentleman', x: m.x, z: m.z });
    if (!this.peer || this.peer.slot !== m.slot) return;
    this.peer.tx = m.x; this.peer.tz = m.z; this.peer.tyaw = m.yaw;
    this.peer.anim = m.anim || 'idle';
    this.peer.hp = m.hp == null ? this.peer.hp : m.hp;
    if (m.carry !== this.peer.carry) { this.peer.carry = m.carry; this.updatePeerHeld(); }
    if (m.weapon !== this.peer.weapon) { this.peer.weapon = m.weapon; this.setPeerWeapon(m.weapon); }
    this.updateHud();
  }
  setPeerWeapon(w) {
    if (!this.peer) return;
    this.peer.weapon = w;
    this.updatePeerHeld();
  }
  updatePeerHeld() {
    if (!this.peer) return;
    const h = this.peer.held;
    while (h.children.length) h.remove(h.children[0]);
    const w = this.peer.carry === 'box' ? 'crate' : this.peer.weapon;
    if (w === 'crate') {
      const c = makeCrate(); c.scale.setScalar(0.72); c.position.set(0, 0.02, 0.16); h.add(c);
    } else if (DI.ITEMS[w] && DI.ITEMS[w].kind === 'gun') {
      const g = makeGun(w); g.scale.setScalar(1.5); g.rotation.x = -0.25; g.position.set(0, -0.02, 0.1); h.add(g);
    } else if (w === 'bag') {
      const b = makeBag(); b.scale.setScalar(0.72); b.position.set(0, -0.05, 0.08); h.add(b);
    } else if (w === 'money') {
      const m = makeMoneyStack(); m.scale.setScalar(0.8); m.position.set(0, -0.02, 0.08); h.add(m);
    }
  }
  onCarry(m) {
    if (m.slot === this.slot) { this.carrying = m.what; this.updateHud(); return; }
    if (this.peer) { this.peer.carry = m.what; this.updatePeerHeld(); }
  }
  onPeerHp(m) {
    if (m.slot === this.slot) return;
    if (this.peer) { this.peer.hp = m.hp; this.updateHud(); }
  }
  onInv(m) {
    if (m.slot !== this.slot) return;
    this.inv = m.inv; this.wallet = m.wallet;
    if (this.sel >= this.inv.length) this.sel = 0;
    this.buildHotbar();
    this.updateHud();
    if (this.panelOpen === 'invPanel') this.renderInventory();
    if (this.panelOpen === 'wardPanel') this.renderWardrobe();
  }

  /* ---------------- NPC ---------------- */
  syncNpcs(list) {
    const seen = {};
    for (const n of list) {
      seen[n.id] = true;
      let e = this.npcs[n.id];
      if (!e) {
        const mesh = makeByKind(n.kind, n.id.charCodeAt(1) % 3);
        mesh.position.set(n.x, 0, n.z);
        this.actors.add(mesh);
        const label = n.kind === 'guard' || n.kind === 'teller' || n.kind === 'shopkeeper'
          ? makeLabel(n.name || n.kind, n.kind === 'guard' ? '#ff9c8f' : '#cfe6ff') : null;
        if (label) { label.scale.set(1.4, 0.36, 1); mesh.add(label); }
        const hpBar = this.makeHpBar();
        hpBar.visible = false;
        mesh.add(hpBar);
        e = this.npcs[n.id] = { id: n.id, kind: n.kind, name: n.name, mesh, label, hpBar, x: n.x, z: n.z, yaw: n.yaw, hp: n.hp, maxhp: n.maxhp, state: n.state, anim: n.anim || 'idle', t: Math.random() * 10, owner: n.owner };
        if (n.kind === 'cop') play('siren', { gain: .18 });
      }
      e.tx = n.x; e.tz = n.z; e.tyaw = n.yaw;
      e.hp = n.hp; e.maxhp = n.maxhp; e.state = n.state; e.owner = n.owner;
      e.anim = n.state === 'dead' ? 'dead' : (n.state === 'panic' ? 'panic' : (n.anim || (n.state === 'chase' ? 'run' : 'idle')));
      if (n.name) e.name = n.name;
      e.hpBar.visible = e.hp < e.maxhp && e.state !== 'dead';
      e.hpBar.querySelector ? null : null;
      this.setHpBar(e.hpBar, e.hp / Math.max(1, e.maxhp));
    }
    for (const id in this.npcs) {
      if (!seen[id]) {
        this.actors.remove(this.npcs[id].mesh);
        delete this.npcs[id];
      }
    }
  }
  makeHpBar() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.11), new THREE.MeshBasicMaterial({ color: 0x1a0d0d, depthTest: false, transparent: true, opacity: .8 }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.07), new THREE.MeshBasicMaterial({ color: 0xff4d3d, depthTest: false }));
    fg.position.z = 0.001;
    g.add(bg); g.add(fg);
    g.position.y = 2.08;
    g.renderOrder = 998;
    g.userData.fg = fg;
    return g;
  }
  setHpBar(bar, frac) {
    if (!bar || !bar.userData.fg) return;
    const f = clamp(frac, 0, 1);
    bar.userData.fg.scale.x = Math.max(0.001, f);
    bar.userData.fg.position.x = -(0.86 * (1 - f)) / 2;
    bar.userData.fg.material.color.setHex(f > 0.5 ? 0x62d17a : (f > 0.22 ? 0xffc23b : 0xff4d3d));
  }
  onNpcHit(m) {
    const e = this.npcs[m.id];
    if (e) {
      e.hp = m.hp;
      this.setHpBar(e.hpBar, e.hp / Math.max(1, e.maxhp));
      e.hpBar.visible = true;
      this.spawnImpact(e.mesh.position.x, 1.25, e.mesh.position.z, 0xb01818, 8);
      playAt('hitBody', e.mesh.position.x, 1.2, e.mesh.position.z, 0.6);
    } else if (m.id && m.id[0] === 'c') {
      hurtCivilian(this.world, m.id, m.dmg);
    }
  }
  onNpcShot(m) {
    const e = this.npcs[m.id];
    const from = e ? { x: e.mesh.position.x, z: e.mesh.position.z } : { x: m.x, z: m.z };
    this.spawnTracer(from.x, 1.45, from.z, m.tx, 1.15, m.tz, 0xffd07a);
    playAt('shotPistol', from.x, 1.4, from.z, 0.9);
    this.spawnMuzzle(from.x, 1.45, from.z);
    if (m.hit && m.slot !== this.slot) { /* урон уже пришёл в hurt */ }
  }
  onShotFx(m) {
    if (m.slot === this.slot) return;
    const who = m.slot === (this.peer && this.peer.slot) ? this.peer : null;
    const x = who ? who.mesh.position.x : m.x, z = who ? who.mesh.position.z : m.z;
    const it = DI.ITEMS[m.wx];
    this.spawnMuzzle(x, 1.45, z);
    SFX.shot(it ? it.cls : 'pistol', { x, y: 1.4, z });
  }
  onShotResult(m) {
    this.mag = m.mag;
    this.updateHud();
    let hitAny = false;
    for (const h of (m.hits || [])) {
      if (h.ff) continue;
      hitAny = true;
      if (h.id) {
        const e = this.npcs[h.id];
        if (e) this.spawnDamageNumber(e.mesh.position.x, 1.9, e.mesh.position.z, h.dmg, h.hs);
        else this.spawnDamageNumber(m.x || this.px, 1.6, m.z || this.pz, h.dmg, h.hs);
      }
    }
    if (hitAny) {
      const hm = $('#hitmark');
      hm.classList.remove('show'); void hm.offsetWidth; hm.classList.add('show');
      play('hit', { gain: .55 });
    }
  }
  onWanted(m) {
    if (m.slot === this.slot) {
      this.stars = m.stars; this.heat = m.heat;
    } else if (this.peer) this.peer.stars = m.stars;
    this.updateHud();
    if (m.slot === this.slot && m.stars > 0) play('levelup', { gain: .35 });
  }
  onAlarm(m) {
    this.world.alarm = m.on;
    if (m.on) {
      play('alarm', { gain: .5 });
      startAlarmLoop();
      toast('🚨 ТРЕВОГА В БАНКЕ! ' + (m.why || ''), 'bad');
      civiliansPanic(this.world, DI.BANK.x, DI.BANK.z, 40);
      this.scene.fog.color.setHex(0x9aa7b2);
    } else {
      stopAlarmLoop();
      toast('Тревога в банке прекратилась', 'info');
    }
  }
  onDeath(m) {
    if (m.slot === this.slot) {
      this.dead = true;
      this.hp = 0;
      $('#deathBy').textContent = 'Вас убил: ' + m.by;
      $('#deathScreen').classList.remove('hidden');
      this.respawnT = DI.PLAYER.respawnTime;
      play('death', { gain: .9 });
      this.stopGrab(true);
      this.closePanel();
      this.buildHotbar();
      this.updateHud();
    } else {
      toast('Напарника убили. Он возродится дома на кровати.', 'bad');
      if (this.peer) { this.peer.dead = true; this.peer.anim = 'dead'; }
    }
  }
  onRespawn(m) {
    this.dead = false;
    this.hp = m.hp; this.px = m.x; this.pz = m.z; this.py = 0;
    this.inv = m.inv || this.inv;
    this.wallet = m.wallet == null ? this.wallet : m.wallet;
    this.wardrobe = m.wardrobe || this.wardrobe;
    this.sel = 0; this.weapon = this.inv[0] ? this.inv[0].id : 'fist'; this.mag = 0;
    this.stars = 0; this.heat = 0;
    $('#deathScreen').classList.add('hidden');
    this.selfModel.position.set(this.px, 0, this.pz);
    this.buildViewModel();
    this.buildHotbar();
    this.updateHud();
    toast('Вы возродились на своей кровати', 'good');
    play('toast', { gain: .5 });
  }
  onHurt(m) {
    this.hp = Math.max(0, this.hp - m.dmg);
    const v = $('#dmgVignette');
    v.style.opacity = '0.85';
    setTimeout(() => v.style.opacity = this.hp < 35 ? '0.35' : '0', 220);
    play('hurt', { gain: .8 });
    if (m.reason) toast('−' + m.dmg + ' HP: ' + m.reason, 'bad');
    this.updateHud();
    if (this.grab) this.stopGrab(true);
  }
  onGrab(m) {
    if (m.slot === this.slot) {
      this.grab = { pile: m.pile, total: m.time, start: performance.now(), bag: m.bag };
      $('#grabWrap').classList.remove('hidden');
      $('#grabText').textContent = m.bag ? 'Набиваем сумку… 30 сек' : 'Гребём руками… 15 сек';
      play('cash', { gain: .5 });
    } else if (this.peer) {
      this.peer.anim = 'grab';
    }
  }
  stopGrab(silent) {
    if (!this.grab) return;
    this.grab = null;
    $('#grabWrap').classList.add('hidden');
    const fg = $('#grabRing .fg');
    if (fg) fg.style.strokeDashoffset = 327;
    if (!silent) this.send({ t: 'grabCancel' });
  }
  onJobSpawn(m) {
    this.job = m.job;
    this.world.truck.position.set(m.job.x, 0, m.job.z);
    this.world.truck.rotation.y = Math.random() * 6.28;
    this.world.truck.visible = true;
    this.world.crateStack.visible = true;
    this.world.truckDriver.visible = true;
    this.jobLabel = 'Работа: ' + m.job.boxes + ' ящиков';
    this.world.jobLabel = 'Грузовик: ' + m.job.phrase;
    toast('🚚 Появилась подработка: ' + m.job.phrase, 'good');
    if (m.job.x != null) {
      const bubble = this.makeBubble(m.job.phrase, m.job.x, 3.6, m.job.z);
      setTimeout(() => this.removeBubble(bubble), 7000);
    }
  }
  onJobUpdate(m) {
    this.job = m.job;
    if (m.job.owner === this.slot) {
      this.jobLabel = m.job.delivered >= m.job.boxes ? 'Работа сдана' : 'Ящики: ' + m.job.delivered + '/' + m.job.boxes;
    } else {
      this.jobLabel = 'Работа занята напарником (' + m.job.delivered + '/' + m.job.boxes + ')';
    }
    this.world.jobLabel = 'Грузовик: ' + this.jobLabel + (m.job.owner === this.slot ? (this.carrying ? ' — несите в кузов (E)' : ' — возьмите ящик (E)') : ' — нажмите E');
    // сколько ящиков осталось в стопке
    const left = Math.max(0, m.job.boxes - m.job.delivered);
    this.world.crateStack.children.forEach((c, i) => { c.visible = i < left; });
  }
  onJobGone() {
    this.job = null;
    this.world.truck.visible = false;
    this.carrying = null;
    this.updateHud();
  }
  onSay(m) {
    let x = 0, z = 0, ok = false;
    if (m.slot != null && m.slot !== this.slot && this.peer) { x = this.peer.mesh.position.x; z = this.peer.mesh.position.z; ok = true; }
    else if (m.id && this.npcs[m.id]) { x = this.npcs[m.id].mesh.position.x; z = this.npcs[m.id].mesh.position.z; ok = true; }
    else if (m.id === 'job' && this.job) { x = this.job.x; z = this.job.z; ok = true; }
    else if (m.id && m.id[0] === 'c') {
      const c = this.world.civilians.find(v => v.id === m.id);
      if (c) { x = c.x; z = c.z; ok = true; }
    }
    if (!ok) { x = this.px; z = this.pz - 2; }
    const b = this.makeBubble(m.text, x, 2.5, z);
    setTimeout(() => this.removeBubble(b), 5200);
  }
  makeBubble(text, x, y, z) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.strokeStyle = '#14161a'; g.lineWidth = 6;
    const r = 22;
    g.beginPath();
    g.moveTo(r + 20, 12); g.lineTo(492 - r, 12); g.quadraticCurveTo(492, 12, 492, 12 + r);
    g.lineTo(492, 92 - r); g.quadraticCurveTo(492, 92, 492 - r, 92);
    g.lineTo(280, 92); g.lineTo(256, 118); g.lineTo(232, 92);
    g.lineTo(20 + r, 92); g.quadraticCurveTo(20, 92, 20, 92 - r);
    g.lineTo(20, 12 + r); g.quadraticCurveTo(20, 12, 20 + r, 12);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#14161a';
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = String(text).split(' ');
    let line = '', lines = [];
    for (const w of words) {
      if ((line + w).length > 24) { lines.push(line.trim()); line = w + ' '; } else line += w + ' ';
    }
    lines.push(line.trim());
    lines = lines.slice(0, 2);
    lines.forEach((l, i) => g.fillText(l, 256, 40 + i * 38));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    sp.scale.set(3.4, 0.85, 1);
    sp.position.set(x, y, z);
    sp.renderOrder = 1000;
    this.fxGroup.add(sp);
    return sp;
  }
  removeBubble(b) { if (b && b.parent) b.parent.remove(b); }

  onFx(m) {
    if (m.type === 'siren') {
      play('siren', { gain: .45 });
    } else if (m.type === 'cash') {
      this.spawnCashFx(m.x, m.z);
      playAt('cash', m.x, 1, m.z, .8);
    } else if (m.type === 'npcDead') {
      const e = this.npcs[m.id];
      if (e) { e.state = 'dead'; e.anim = 'dead'; }
      this.spawnImpact(m.x || 0, 1, m.z || 0, 0x8a1010, 16);
    } else if (m.type === 'door') {
      play('door', { gain: .6 });
    } else if (m.type === 'melee') {
      this.spawnImpact(m.x, 1.2, m.z, 0xffffff, 5);
      playAt('melee', m.x, 1.2, m.z, .6);
    }
  }

  /* ================= ЭФФЕКТЫ ================= */
  spawnTracer(x0, y0, z0, x1, y1, z1, color) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)]);
    const m = new THREE.LineBasicMaterial({ color: color || 0xffe08a, transparent: true, opacity: .95 });
    const line = new THREE.Line(g, m);
    this.fxGroup.add(line);
    this.tracers.push({ line, life: 0.09 });
  }
  spawnMuzzle(x, y, z) {
    const l = new THREE.PointLight(0xffcc66, 6, 9);
    l.position.set(x, y, z);
    this.fxGroup.add(l);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: .95 }));
    s.position.set(x, y, z);
    this.fxGroup.add(s);
    this.flashes.push({ light: l, sprite: s, life: 0.07 });
  }
  spawnImpact(x, y, z, color, count) {
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    for (let i = 0; i < (count || 6); i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, y, z);
      this.fxGroup.add(m);
      this.particles.push({
        mesh: m, life: 0.6 + Math.random() * 0.3,
        vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 1, vz: (Math.random() - 0.5) * 5
      });
    }
  }
  spawnCashFx(x, z) {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.13), new THREE.MeshBasicMaterial({ color: 0x66bb6a }));
      m.position.set(x, 1.0, z);
      this.fxGroup.add(m);
      this.particles.push({
        mesh: m, life: 1.2, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 3,
        spin: true
      });
    }
  }
  spawnDamageNumber(x, y, z, dmg, hs) {
    const c = document.createElement('canvas'); c.width = 160; c.height = 80;
    const g = c.getContext('2d');
    g.font = 'bold 58px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.85)';
    const txt = (hs ? '✦' : '') + dmg;
    g.strokeText(txt, 80, 42); g.fillStyle = hs ? '#ffd23b' : '#ffffff'; g.fillText(txt, 80, 42);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    sp.scale.set(1.0, 0.5, 1);
    sp.position.set(x, y, z);
    sp.renderOrder = 1001;
    this.fxGroup.add(sp);
    this.particles.push({ mesh: sp, life: 0.85, vx: 0, vy: 1.5, vz: 0, fade: true });
  }
  updateFx(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09);
      if (t.life <= 0) { this.fxGroup.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.fxGroup.remove(f.light); this.fxGroup.remove(f.sprite);
        f.sprite.geometry.dispose(); f.sprite.material.dispose();
        this.flashes.splice(i, 1);
      } else { f.light.intensity = 6 * (f.life / 0.07); }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (!p.fade) p.vy -= 12 * dt;
      if (p.spin) { p.mesh.rotation.x += dt * 6; p.mesh.rotation.z += dt * 4; }
      if (p.mesh.material) {
        p.mesh.material.transparent = true;
        p.mesh.material.opacity = clamp(p.life * 1.6, 0, 1);
      }
      if (p.life <= 0 || p.mesh.position.y < -1) {
        this.fxGroup.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.mesh.material) p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  /* ================= ВВОД ================= */
  initInput() {
    this.keys = {};
    this.mouse = { dx: 0, dy: 0, locked: false };
    this.stick = { active: false, id: -1, x: 0, y: 0 };
    this.look = { active: false, id: -1, x: 0, y: 0 };

    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.code;
      this.keys[k] = true;
      if (this.mode !== 'play') return;
      if (k === 'KeyR') this.doReload();
      if (k === 'KeyE') this.pressInteract();
      if (k === 'Tab' || k === 'KeyI') { e.preventDefault(); this.togglePanel('invPanel'); }
      if (k === 'KeyQ') this.togglePanel('bagPanel');
      if (k === 'KeyF') this.depositSelected();
      if (k === 'KeyM') { setMuted(!this.muted); this.muted = !this.muted; toast(this.muted ? 'Звук выключен' : 'Звук включен', 'info'); }
      if (k === 'KeyV') this.toggleMic();
      if (k === 'Escape') { if (this.panelOpen) this.closePanel(); else this.togglePanel('pausePanel'); }
      if (k.startsWith('Digit')) {
        const n = parseInt(k.slice(5), 10);
        this.selectSlot(n === 0 ? 9 : n - 1);
      }
      if (k === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
      if (e.code === 'KeyE') this.releaseInteract();
    });
    const canvas = $('#scene');
    canvas.addEventListener('mousedown', e => {
      if (this.mode !== 'play') return;
      resumeAudio();
      if (!this.mouse.locked && !isTouch) { canvas.requestPointerLock && canvas.requestPointerLock(); }
      if (e.button === 0) this.wantFire = true;
      if (e.button === 2) this.aiming = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.wantFire = false;
      if (e.button === 2) this.aiming = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement === canvas;
      if (!this.mouse.locked && this.mode === 'play' && !this.panelOpen && !isTouch) {
        // курсор освободился — показываем паузу
      }
    });
    window.addEventListener('mousemove', e => {
      if (this.mouse.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    // колесо — зум камеры
    window.addEventListener('wheel', e => {
      if (this.mode !== 'play') return;
      this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.35, 1.2, 8);
      LS.set('camDist', this.camDist);
    }, { passive: true });
    this.camDist = LS.get('camDist', isTouch ? 5.0 : 4.4);

    /* ---- тач ---- */
    this.initTouch();
  }

  initTouch() {
    const left = $('#touchLeft'), right = $('#touchRight');
    const base = $('#stickBase'), knob = $('#stickKnob');
    const self = this;
    let stickCx = 0, stickCy = 0;

    function placeStick(x, y) {
      const r = base.getBoundingClientRect();
      base.style.left = (x - r.width / 2) + 'px';
      base.style.bottom = 'auto';
      base.style.top = (y - r.height / 2) + 'px';
      stickCx = x; stickCy = y;
      knob.style.left = '50%'; knob.style.top = '50%';
    }
    left.addEventListener('touchstart', e => {
      resumeAudio();
      const t = e.changedTouches[0];
      if (self.stick.active) return;
      self.stick.active = true; self.stick.id = t.identifier;
      placeStick(t.clientX, t.clientY);
      base.style.opacity = '1';
      e.preventDefault();
    }, { passive: false });
    left.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== self.stick.id) continue;
        const R = 56;
        let dx = t.clientX - stickCx, dy = t.clientY - stickCy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        self.stick.x = dx / R; self.stick.y = dy / R;
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      }
      e.preventDefault();
    }, { passive: false });
    const endStick = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== self.stick.id) continue;
        self.stick.active = false; self.stick.id = -1; self.stick.x = 0; self.stick.y = 0;
        knob.style.transform = 'translate(0,0)';
        base.style.opacity = '.55';
      }
    };
    left.addEventListener('touchend', endStick);
    left.addEventListener('touchcancel', endStick);

    // правая зона — осмотр (палец по экрану), но не по кнопкам
    const app = $('#app');
    app.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (el && el.closest && (el.closest('.tbtn') || el.closest('#hotbar') || el.closest('.panel') || el.closest('#menu') || el.closest('#touchLeft'))) continue;
        if (t.clientX < window.innerWidth * 0.42) continue;
        if (self.look.active) continue;
        self.look.active = true; self.look.id = t.identifier;
        self.look.x = t.clientX; self.look.y = t.clientY;
      }
    }, { passive: true });
    app.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== self.look.id) continue;
        const dx = t.clientX - self.look.x, dy = t.clientY - self.look.y;
        self.look.dx = (self.look.dx || 0) + dx;
        self.look.dy = (self.look.dy || 0) + dy;
        self.look.x = t.clientX; self.look.y = t.clientY;
      }
    }, { passive: true });
    const endLook = e => {
      for (const t of e.changedTouches) if (t.identifier === self.look.id) { self.look.active = false; self.look.id = -1; }
    };
    app.addEventListener('touchend', endLook);
    app.addEventListener('touchcancel', endLook);

    // кнопки
    const hold = (id, on, off) => {
      const b = $(id);
      if (!b) return;
      const start = e => { e.preventDefault(); resumeAudio(); b.classList.add('on'); on && on(); };
      const stop = e => { e.preventDefault(); b.classList.remove('on'); off && off(); };
      b.addEventListener('touchstart', start, { passive: false });
      b.addEventListener('touchend', stop, { passive: false });
      b.addEventListener('touchcancel', stop, { passive: false });
      b.addEventListener('mousedown', start);
      b.addEventListener('mouseup', stop);
      b.addEventListener('mouseleave', stop);
    };
    hold('#btnFire', () => { this.wantFire = true; }, () => { this.wantFire = false; });
    hold('#btnRun', () => { this.touchRun = true; }, () => { this.touchRun = false; });
    hold('#btnInteract', () => { this.pressInteract(); }, () => { this.releaseInteract(); });
    const tap = (id, fn) => {
      const b = $(id); if (!b) return;
      b.addEventListener('click', e => { e.preventDefault(); resumeAudio(); fn(); });
    };
    tap('#btnReload', () => this.doReload());
    tap('#btnBag', () => this.togglePanel('bagPanel'));
    tap('#btnInv', () => this.togglePanel('invPanel'));
    tap('#btnJump', () => this.doJump());
  }

  /* ================= УПРАВЛЕНИЕ ИГРОЙ ================= */
  send(m) {
    if (this.local) { this.local.handle(m); return; }
    this.net.send(m);
  }
  selectSlot(i) {
    if (i < 0 || i >= this.inv.length) return;
    this.sel = i;
    const it = this.inv[i];
    this.weapon = it ? it.id : 'fist';
    if (DI.ITEMS[this.weapon] && DI.ITEMS[this.weapon].kind !== 'gun') this.mag = 0;
    this.buildHotbar();
    this.buildViewModel();
    this.updateSelfHeld();
    this.updateHud();
    this.send({ t: 'state', x: this.px, z: this.pz, yaw: this.yaw, pitch: this.pitch, anim: this.animState(), sel: this.sel, stamina: this.stamina, carrying: this.carrying });
    play('click', { gain: .35 });
    if (it && it.id === 'money') this.showMoneyHint(it);
    if (it && it.id === 'bag') this.updateHud();
  }
  showMoneyHint(it) {
    toast('Пачка наличных: ' + money(it.val || 0) + '. Нажмите F (или «Использовать» в инвентаре), чтобы перечислить на баланс.', 'info');
  }
  updateSelfHeld() {
    const h = this.selfHeld;
    while (h.children.length) h.remove(h.children[0]);
    const w = this.carrying === 'box' ? 'crate' : this.weapon;
    if (w === 'crate') { const c = makeCrate(); c.scale.setScalar(0.7); c.position.set(0, 0.02, 0.16); h.add(c); }
    else if (DI.ITEMS[w] && DI.ITEMS[w].kind === 'gun') { const g = makeGun(w); g.scale.setScalar(1.45); g.rotation.x = -0.25; g.position.set(0, -0.02, 0.1); h.add(g); }
    else if (w === 'bag') { const b = makeBag(); b.scale.setScalar(0.7); b.position.set(0, -0.05, 0.08); h.add(b); }
    else if (w === 'money') { const m = makeMoneyStack(); m.scale.setScalar(0.78); m.position.set(0, -0.02, 0.08); h.add(m); }
  }

  doReload() {
    if (this.dead || this.mode !== 'play') return;
    const it = DI.ITEMS[this.weapon];
    if (!it || it.kind !== 'gun') { toast('Сначала возьмите оружие в руки', 'info'); return; }
    const ammo = this.inv.find(i => i.id === 'ammo' && i.cls === it.cls);
    if (this.mag >= it.mag) { toast('Магазин полный (' + this.mag + '/' + it.mag + ')', 'info'); return; }
    if (!ammo || ammo.qty <= 0) {
      toast('⚠ Нет патронов ' + DI.AMMO_KIND[it.cls] + '! Купите патроны в магазине оружия — они дешёвые.', 'bad');
      play('error', { gain: .8 });
      return;
    }
    this.send({ t: 'reload' });
  }
  startReloadFx(time) {
    this.reloadUntil = performance.now() + time * 1000;
    $('#reloadWrap').classList.remove('hidden');
    play('reloadOut', { gain: .6 });
    setTimeout(() => play('reloadIn', { gain: .7 }), time * 620);
    this.animReload = time;
  }
  doJump() {
    if (this.dead || this.py > 0.02 || this.stamina < 8) return;
    this.vy = 6.4; this.stamina -= 6;
  }
  pressInteract() {
    if (this.dead || this.mode !== 'play') return;
    resumeAudio();
    this.interactHeld = true;
    this.interactT = 0;
    const it = this.interact;
    if (!it) return;
    if (it.type === 'money') {
      if (this.grab) return;
      this.send({ t: 'grabStart', pile: it.pile });
      return;
    }
    this.doInteract(it);
  }
  releaseInteract() {
    this.interactHeld = false;
    if (this.grab) {
      const done = this.grab && (performance.now() - this.grab.start) >= this.grab.total * 1000 - 450;
      if (done) this.send({ t: 'grabDone' });
      else this.stopGrab(false);
    }
  }
  doInteract(it) {
    if (it.type === 'door') { this.send({ t: 'door', door: it.key }); play('click', { gain: .4 }); }
    else if (it.type === 'bed') { this.send({ t: 'sleep' }); }
    else if (it.type === 'wardrobe') { this.openWardrobe(it.slot); }
    else if (it.type === 'shop') { this.openShop(); }
    else if (it.type === 'job') { this.jobInteract(); }
    else if (it.type === 'money') { this.send({ t: 'grabStart', pile: it.pile }); }
  }
  jobInteract() {
    const j = this.job;
    if (!j) return;
    if (this.carrying) { this.send({ t: 'jobDrop' }); return; }
    if (j.owner !== this.slot) { this.send({ t: 'jobClaim' }); return; }
    this.send({ t: 'jobPick' });
  }

  tryFire() {
    if (this.dead || this.mode !== 'play') return;
    if (this.grab) return;
    const now = performance.now();
    const it = DI.ITEMS[this.weapon];
    if (!it) return;
    if (it.kind === 'gun') {
      if (now < this.fireCooldown) return;
      if (now < this.reloadUntil) return;
      this.fireCooldown = now + it.rate * 1000;
      const dir = this.aimDir();
      this.send({ t: 'shoot', dx: dir.x, dy: dir.y, dz: dir.z });
      this.vmRecoil = 1;
      this.recoilPitch = (this.recoilPitch || 0) + (it.cls === 'shotgun' ? 0.055 : 0.022);
      const m = new THREE.Vector3(this.px, this.py + 1.4, this.pz);
      SFX.shot(it.cls, null);
      this.spawnMuzzle(m.x + dir.x * 0.7, m.y + 0.1, m.z + dir.z * 0.7);
      // трассер до точки попадания
      const hit = this.aimHitPoint(dir, it.range);
      this.spawnTracer(m.x + dir.x * 0.8, m.y, m.z + dir.z * 0.8, hit.x, hit.y, hit.z, 0xffe08a);
      // локальная паника жителей от своего выстрела
      civiliansPanic(this.world, this.px, this.pz, 50);
      if (!it.auto) this.wantFire = false;
    } else if (it.kind === 'melee' || this.weapon === 'fist') {
      if (now < this.meleeCooldown) return;
      this.meleeCooldown = now + it.rate * 1000;
      this.send({ t: 'melee' });
      play('melee', { gain: .5 });
      this.vmRecoil = 0.7;
    }
  }
  aimDir() {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    // автоприцел
    const target = this.aimAssist ? this.findAimTarget(d) : null;
    if (target) {
      const tp = new THREE.Vector3(target.x, 1.25, target.z);
      const from = new THREE.Vector3(this.px, this.py + 1.55, this.pz);
      d.copy(tp.sub(from)).normalize();
      this.aimTarget = target;
    } else this.aimTarget = null;
    return d;
  }
  findAimTarget(camDir) {
    let best = null, bestScore = 0.22; // косинус ~12°
    const from = new THREE.Vector3(this.px, this.py + 1.35, this.pz);
    const consider = (x, z, obj) => {
      const dx = x - from.x, dz = z - from.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6 || d > 70) return;
      const to = new THREE.Vector3(dx, (1.25 - from.y), dz).normalize();
      const dot = to.dot(camDir);
      if (dot > bestScore) { bestScore = dot; best = obj || { x, z }; }
    };
    for (const id in this.npcs) {
      const n = this.npcs[id];
      if (n.state === 'dead') continue;
      consider(n.mesh.position.x, n.mesh.position.z, { x: n.mesh.position.x, z: n.mesh.position.z, id, npc: n });
    }
    for (const c of this.world.civilians) {
      if (c.state === 'dead') continue;
      consider(c.x, c.z, { x: c.x, z: c.z, id: c.id, civ: c });
    }
    return best;
  }
  aimHitPoint(dir, range) {
    const from = new THREE.Vector3(this.px, this.py + 1.55, this.pz);
    let t = range || 60;
    // стена
    for (const b of this.world.boxes) {
      if (b.top) continue;
      const hitT = this.rayBox(from, dir, b);
      if (hitT != null && hitT < t) t = hitT;
    }
    // земля
    if (dir.y < -0.001) {
      const tg = (0.05 - from.y) / dir.y;
      if (tg > 0 && tg < t) t = tg;
    }
    return from.clone().add(dir.clone().multiplyScalar(Math.max(1.5, t)));
  }
  rayBox(o, d, b) {
    const hx = b.w / 2, hz = b.d / 2;
    let t0 = 0, t1 = 1e9;
    const axes = [[o.x, d.x, b.x - hx, b.x + hx], [o.y, d.y, 0, b.h], [o.z, d.z, b.z - hz, b.z + hz]];
    for (const a of axes) {
      if (Math.abs(a[1]) < 1e-8) { if (a[0] < a[2] || a[0] > a[3]) return null; continue; }
      let ta = (a[2] - a[0]) / a[1], tb = (a[3] - a[0]) / a[1];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return t0 > 0.05 ? t0 : null;
  }

  /* ================= ЦИКЛ ================= */
  start() {
    // свой таймер вместо THREE.Clock (Clock помечен deprecated в three r187)
    let last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const loop = () => {
      requestAnimationFrame(loop);
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      this.time += dt;
      this.frame++;
      if (this.frame % 30 === 0) this.fps = Math.round(1 / Math.max(dt, 0.0001));
      if (this.mode === 'play') {
        this.updatePlayer(dt);
        this.updateCamera(dt);
        this.updateActors(dt);
        this.updateViewModel(dt);
        this.updateHudDynamic(dt);
        this.netTick(dt);
      } else if (this.mode === 'lobby' || this.mode === 'menu') {
        this.updateMenuCam(dt);
        this.updateActors(dt);
      }
      updateWorld(this.world, dt, this.time, { x: this.px, z: this.pz }, {
        wanted: this.stars,
        civSay: (c, arr) => {
          if (Math.hypot(c.x - this.px, c.z - this.pz) > 26) return;
          const b = this.makeBubble(arr[Math.floor(Math.random() * arr.length)], c.x, 2.4, c.z);
          setTimeout(() => this.removeBubble(b), 4200);
        },
        badAttack: (c) => {
          const dmg = c.kind === 'bad' ? 8 : 5;
          this.hp -= dmg;
          play('hurt', { gain: .6 });
          this.spawnImpact(this.px, 1.3, this.pz, 0xb01818, 6);
          $('#dmgVignette').style.opacity = '.6';
          setTimeout(() => $('#dmgVignette').style.opacity = this.hp < 35 ? '.3' : '0', 200);
          this.updateHud();
          if (this.hp <= 0 && !this.dead) {
            this.dead = true; this.hp = 0;
            $('#deathBy').textContent = 'Вас забила шпана на улице';
            $('#deathScreen').classList.remove('hidden');
            this.respawnT = 5;
            this.localRespawnPending = true;
          }
        }
      });
      this.updateFx(dt);
      this.render();
    };
    loop();
  }
  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.mode === 'play' && this.vmRoot.children.length) {
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
    setListener(this.camera);
  }
  updateMenuCam(dt) {
    // медленный облёт дома в меню
    const t = this.time * 0.12;
    const cx = DI.HOUSE.x + Math.sin(t) * 15;
    const cz = DI.HOUSE.z - 12 + Math.cos(t) * 15;
    this.camera.position.lerp(new THREE.Vector3(cx, 5.2, cz), 0.03);
    this.camera.lookAt(DI.HOUSE.x, 1.6, DI.HOUSE.z);
    if (this.selfModel) {
      this.selfModel.position.set(DI.BEDS[0].x, 0.05, DI.BEDS[0].z);
      animateChar(this.selfModel, 'sleep', this.time);
    }
  }

  updatePlayer(dt) {
    if (this.introT > 0) {
      this.introT -= dt;
      animateChar(this.selfModel, 'sleep', this.time);
      this.selfModel.position.set(DI.BEDS[this.slot < 0 ? 0 : this.slot].x, 0.06, DI.BEDS[this.slot < 0 ? 0 : this.slot].z);
      const bed = DI.BEDS[this.slot < 0 ? 0 : this.slot];
      const k = clamp(1 - this.introT / 3.4, 0, 1);
      this.camera.position.lerp(new THREE.Vector3(bed.x + 1.9 * k, 1.5 + 0.5 * k, bed.z - 2.4 - 1.1 * k), 0.05);
      this.camera.lookAt(bed.x, 0.9, bed.z);
      if (this.introT <= 0) {
        this.px = bed.x; this.pz = bed.z + 0.7;
        toast('Доброе утро. Вы и напарник только что проснулись на своих кроватях.', 'good');
        setTimeout(() => toast('Найдите работу у грузовика или сразу идите в банк. Дверь дома — на южной стене.', 'info'), 3600);
      }
      return;
    }
    if (this.dead) {
      this.respawnT -= dt;
      const rt = $('#respawnT');
      if (rt) rt.textContent = Math.max(0, Math.ceil(this.respawnT));
      if (this.localRespawnPending && this.respawnT <= 0) {
        this.localRespawnPending = false;
        this.dead = false; this.hp = 100; this.stamina = 100;
        const bed = DI.BEDS[this.slot < 0 ? 0 : this.slot];
        this.px = bed.x; this.pz = bed.z + 0.5; this.py = 0;
        $('#deathScreen').classList.add('hidden');
      }
      animateChar(this.selfModel, 'dead', this.time);
      return;
    }

    /* --- ввод движения --- */
    let ix = 0, iz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) iz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) iz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) ix -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;
    if (this.stick.active) { ix += this.stick.x; iz += this.stick.y; }
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }

    /* --- камера/взгляд --- */
    const lookScale = this.sens * (this.aiming ? 0.55 : 1) * 0.0026;
    if (this.mouse.locked) {
      this.yaw -= this.mouse.dx * lookScale;
      this.pitch -= this.mouse.dy * lookScale;
      this.mouse.dx = 0; this.mouse.dy = 0;
    }
    if (this.look.dx || this.look.dy) {
      this.yaw -= (this.look.dx || 0) * lookScale * 1.5;
      this.pitch -= (this.look.dy || 0) * lookScale * 1.5;
      this.look.dx = 0; this.look.dy = 0;
    }
    this.pitch = clamp(this.pitch, -1.15, 0.85);
    this.recoilPitch = (this.recoilPitch || 0) * Math.pow(0.001, dt);
    this.yaw += ((Math.random() - 0.5) * 0.0);

    /* --- спринт / стамина --- */
    const wantRun = (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchRun) && mag > 0.1 && this.stamina > 1;
    this.sprinting = wantRun;
    if (wantRun) this.stamina = Math.max(0, this.stamina - DI.PLAYER.sprintDrain * dt);
    else this.stamina = Math.min(DI.PLAYER.stamina, this.stamina + (mag > 0.1 ? DI.PLAYER.sprintRegen * 0.55 : DI.PLAYER.idleRegen) * dt);

    /* --- скорость --- */
    let speed = DI.PLAYER.speed;
    if (wantRun) speed = DI.PLAYER.sprint;
    if (this.aiming) speed *= 0.55;
    if (this.grab) speed *= 0.0;
    if (this.carrying) speed *= 0.72;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rightV = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3()
      .addScaledVector(forward, -iz)
      .addScaledVector(rightV, ix);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);

    const nx = this.px + move.x * dt;
    const nz = this.pz + move.z * dt;
    const res = DI.resolveCollision(nx, nz, DI.PLAYER.radius, this.world.boxes);
    this.px = res.x; this.pz = res.z;

    // прыжок / гравитация
    if (this.keys['Space']) this.doJump();
    this.vy -= 21 * dt;
    this.py += this.vy * dt;
    if (this.py <= 0) { this.py = 0; this.vy = 0; }

    // шаги
    if (move.lengthSq() > 0.2 && this.py <= 0.01) {
      this.stepT = (this.stepT || 0) + dt * (wantRun ? 1.7 : 1);
      if (this.stepT > 0.42) { this.stepT = 0; play('footstep', { gain: 0.16, rate: 0.9 + Math.random() * 0.25 }); }
    }

    // оружие: огонь
    const it = DI.ITEMS[this.weapon];
    const isAuto = it && it.kind === 'gun' && it.cls !== 'shotgun' && it.id !== 'deagle';
    if (this.wantFire && (isAuto || !this.firedOnce)) {
      this.tryFire();
      this.firedOnce = !isAuto;
    }
    if (!this.wantFire) this.firedOnce = false;

    // удержание E на деньгах
    if (this.interactHeld && this.interact && this.interact.type === 'money' && !this.grab) {
      this.interactT = (this.interactT || 0) + dt;
      if (this.interactT > 0.35) this.send({ t: 'grabStart', pile: this.interact.pile });
    }

    // анимация
    this.anim = this.animState();
    animateChar(this.selfModel, this.anim, this.time, wantRun ? 1.25 : 1);
    if (it && it.kind === 'gun' && !this.grab) poseWithWeapon(this.selfModel, this.weapon, it.cls !== 'pistol');

    this.selfModel.position.set(this.px, this.py, this.pz);
    this.selfModel.rotation.y = this.yaw + Math.PI;
    // свою модель прячем при сильном приближении камеры
    this.selfModel.visible = !this.aiming && this.camDist > 1.5;
    if (this.selfModel.userData.p && this.selfModel.userData.p.head) {
      this.selfModel.userData.p.head.visible = !this.aiming;
    }

    // низкое HP — сердцебиение
    if (this.hp < 32) {
      this.heartT = (this.heartT || 0) + dt;
      if (this.heartT > 0.85) { this.heartT = 0; play('heart', { gain: .4 }); }
      $('#dmgVignette').style.opacity = String(0.22 + (1 - this.hp / 32) * 0.25);
    }

    // зона
    const zone = DI.insideBuilding(this.px, this.pz);
    if (zone !== this.lastZone) {
      this.lastZone = zone;
      const names = { house: '🏠 НАШ ДОМ', bank: '🏦 DENI ISLAM BANK', shop: '🔫 МАГАЗИН ОРУЖИЯ' };
      const zt = $('#zoneTag');
      if (zone) { zt.textContent = names[zone]; zt.classList.add('show'); setTimeout(() => zt.classList.remove('show'), 2600); }
    }
  }
  animState() {
    if (this.dead) return 'dead';
    if (this.grab) return 'grab';
    if (performance.now() < this.reloadUntil) return 'reload';
    if (this.carrying) return 'carry';
    const it = DI.ITEMS[this.weapon];
    if (this.aiming && it && it.kind === 'gun') return 'aim';
    if (this.stick.active || this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD'] ||
        this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight']) {
      return this.sprinting ? 'run' : 'walk';
    }
    return 'idle';
  }

  updateCamera(dt) {
    const target = new THREE.Vector3(this.px, this.py + 1.5, this.pz);
    const dist = this.aiming ? 1.05 : this.camDist;
    const height = this.aiming ? 0.35 : 0.85;
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    let camPos = target.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, height, 0));
    if (this.aiming) {
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      camPos.addScaledVector(right, 0.42);
    }
    // не даём камере проходить сквозь стены
    const from = target.clone().add(new THREE.Vector3(0, height * 0.4, 0));
    const toCam = camPos.clone().sub(from);
    const len = toCam.length();
    if (len > 0.2) {
      const d = toCam.clone().normalize();
      let maxT = len;
      for (const b of this.world.boxes) {
        if (b.top) continue;
        const t = this.rayBox(from, d, b);
        if (t != null && t < maxT) maxT = t;
      }
      camPos = from.clone().addScaledVector(d, Math.max(0.45, maxT - 0.18));
    }
    camPos.y = Math.max(0.45, camPos.y);
    this.camera.position.lerp(camPos, 1 - Math.pow(0.0015, dt));
    const look = target.clone();
    look.y = this.py + (this.aiming ? 1.5 : 1.42);
    const aim = this.aimTarget;
    if (aim && this.aiming) {
      look.set(aim.x, 1.25, aim.z);
    }
    this.camera.lookAt(look);
    this.camera.rotation.z += (this.recoilPitch || 0) * 0.0;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.aiming ? 52 : (this.sprinting ? 78 : 70), dt * 8);
    this.camera.updateProjectionMatrix();
    // прицел: враг в центре?
    const ch = $('#crosshair');
    if (aim) ch.classList.add('enemy'); else ch.classList.remove('enemy');
  }

  updateActors(dt) {
    // напарник: интерполяция
    if (this.peer) {
      const p = this.peer;
      if (p.tx != null) {
        p.x = THREE.MathUtils.lerp(p.x, p.tx, 1 - Math.pow(0.0008, dt));
        p.z = THREE.MathUtils.lerp(p.z, p.tz, 1 - Math.pow(0.0008, dt));
        p.yaw = THREE.MathUtils.lerp(p.yaw, p.tyaw == null ? p.yaw : p.tyaw, 1 - Math.pow(0.002, dt));
      }
      p.t += dt;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.yaw + Math.PI;
      let a = p.anim || 'idle';
      if (p.dead) a = 'dead';
      const it = DI.ITEMS[p.weapon];
      animateChar(p.mesh, a, p.t, a === 'run' ? 1.2 : 1);
      if (it && it.kind === 'gun') poseWithWeapon(p.mesh, p.weapon, it.cls !== 'pistol');
      if (p.label) {
        const sub = p.hp < 100 ? (p.hp + ' HP') : '';
        if (p._lastSub !== sub) { p._lastSub = sub; updateLabel(p.label, p.name || 'Напарник', '#8fd3ff', sub); }
      }
    }
    // серверные NPC
    for (const id in this.npcs) {
      const n = this.npcs[id];
      n.t += dt;
      if (n.tx != null) {
        n.mesh.position.x = THREE.MathUtils.lerp(n.mesh.position.x, n.tx, 1 - Math.pow(0.002, dt));
        n.mesh.position.z = THREE.MathUtils.lerp(n.mesh.position.z, n.tz, 1 - Math.pow(0.002, dt));
      }
      if (n.tyaw != null) {
        let cur = n.mesh.rotation.y;
        const want = n.tyaw + Math.PI;
        n.mesh.rotation.y = THREE.MathUtils.lerp(cur, want, 1 - Math.pow(0.004, dt));
      }
      const speed = n.anim === 'run' ? 1.25 : 1;
      animateChar(n.mesh, n.anim || 'idle', n.t, speed);
      if (n.kind === 'cop' || n.kind === 'guard') {
        const gun = n.mesh.userData.weapon;
        if (gun) poseWithWeapon(n.mesh, n.kind === 'cop' ? 'glock' : 'fist', false);
      }
      if (n.hpBar) n.hpBar.lookAt(this.camera.position);
    }
    // водитель грузовика
    if (this.world.truckDriver && this.world.truck.visible) {
      animateChar(this.world.truckDriver, this.job && this.job.owner === this.slot ? 'idle' : 'idle', this.time);
    }
  }

  updateViewModel(dt) {
    if (!this.vmHand) return;
    const moving = this.anim === 'walk' || this.anim === 'run';
    const spd = this.anim === 'run' ? 1.7 : 1;
    this.vmBob += dt * (moving ? 9 * spd : 2.2);
    const bobX = moving ? Math.sin(this.vmBob) * 0.018 : Math.sin(this.vmBob) * 0.004;
    const bobY = moving ? Math.abs(Math.cos(this.vmBob)) * 0.016 : Math.sin(this.vmBob * 0.8) * 0.004;
    this.vmRecoil = Math.max(0, this.vmRecoil - dt * 7);
    const rec = this.vmRecoil;
    const reload = performance.now() < this.reloadUntil;
    let baseX = 0.055, baseY = -0.045, baseZ = -0.05;
    if (this.aiming) { baseX = 0.0; baseY = -0.012; baseZ = -0.14; }
    if (reload) {
      const k = 1 - (this.reloadUntil - performance.now()) / (this.animReload * 1000 || 1);
      baseY -= Math.sin(k * Math.PI) * 0.16;
      baseX += Math.sin(k * Math.PI) * 0.05;
      this.vmHand.rotation.z = Math.sin(k * Math.PI) * 0.5;
      this.vmHand.rotation.x = Math.sin(k * Math.PI) * 0.35;
    } else {
      this.vmHand.rotation.z = THREE.MathUtils.lerp(this.vmHand.rotation.z, 0, dt * 8);
      this.vmHand.rotation.x = THREE.MathUtils.lerp(this.vmHand.rotation.x, rec * 0.28, dt * 12);
    }
    this.vmHand.position.x = THREE.MathUtils.lerp(this.vmHand.position.x, baseX + bobX + rec * 0.02, dt * 14);
    this.vmHand.position.y = THREE.MathUtils.lerp(this.vmHand.position.y, baseY + bobY - rec * 0.035, dt * 14);
    this.vmHand.position.z = THREE.MathUtils.lerp(this.vmHand.position.z, baseZ + rec * 0.075, dt * 14);
    // индикатор перезарядки
    if (reload) {
      const k = 1 - (this.reloadUntil - performance.now()) / (this.animReload * 1000 || 1);
      $('#reloadBar i').style.width = Math.round(k * 100) + '%';
      $('#reloadWrap').classList.remove('hidden');
    } else {
      $('#reloadWrap').classList.add('hidden');
    }
    // прогресс гребли денег
    if (this.grab) {
      const k = clamp((performance.now() - this.grab.start) / (this.grab.total * 1000), 0, 1);
      $('#grabRing .fg').style.strokeDashoffset = String(327 * (1 - k));
      if (k >= 1) {
        this.send({ t: 'grabDone' });
        this.grab = null;
        $('#grabWrap').classList.add('hidden');
      }
    }
  }

  updateHudDynamic(dt) {
    // интерактив
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const it = nearestInteraction(this.world, this.px, this.pz, { x: camDir.x, z: camDir.z });
    this.interact = it;
    const pr = $('#interactPrompt');
    if (it && !this.dead) {
      let label = it.label;
      if (it.type === 'money') {
        const pile = this.piles.find(p => p.id === it.pile);
        const left = pile ? pile.left : 0;
        label = left > 0 ? ('💰 Деньги банка: ' + money(left) + ' — ЗАЖМИТЕ, чтобы грести') : 'Деньги уже забрали';
      }
      if (it.type === 'door') label = (this.world.doors[it.key] ? '🚪 Закрыть дверь' : '🚪 Открыть дверь') + ' — ' + (it.key === 'house' ? 'дом' : it.key === 'bank' ? 'банк' : 'магазин');
      if (it.type === 'job') {
        label = this.carrying ? '📦 Положить ящик в грузовик' : (this.job && this.job.owner === this.slot ? '📦 Взять ящик' : '🚚 Взяться за работу');
      }
      $('#interactText').textContent = label;
      pr.classList.remove('hidden');
      const bit = $('#btnInteractText');
      if (bit) bit.textContent = it.type === 'money' ? 'ГРЕСТИ' : (it.type === 'job' ? 'ЯЩИК' : 'ВЗЯТЬ');
    } else pr.classList.add('hidden');

    // хотбар: подсветка
    this.syncHotbarSelection();
    // пинг
    this.pingT -= dt;
    if (this.pingT <= 0) { this.pingT = 2; this.send({ t: 'ping', e: performance.now() }); }
    const fv = $('#fpsVal'); if (fv) fv.textContent = this.fps + ' fps';
    const pv = $('#pingVal'); if (pv) pv.textContent = this.local ? 'офлайн' : ((this.ping || 0) + ' ms');
    // индикатор микрофона
    const mi = $('#micIcon');
    if (this.micAnalyser && this.micData) {
      this.micAnalyser.getByteTimeDomainData(this.micData);
      let peak = 0;
      for (let i = 0; i < this.micData.length; i += 16) peak = Math.max(peak, Math.abs(this.micData[i] - 128));
      mi.classList.toggle('live', peak > 5 && !this.micMuted);
    }
    mi.classList.toggle('off', !this.micAllowed || !!this.micMuted);
    // стамина/хп плавно
    $('#hpFill').style.transform = 'scaleX(' + clamp(this.hp / 100, 0, 1) + ')';
    $('#stFill').style.transform = 'scaleX(' + clamp(this.stamina / 100, 0, 1) + ')';
    $('#hpText').textContent = Math.max(0, Math.round(this.hp));
    $('#stText').textContent = Math.round(this.stamina);
  }

  netTick(dt) {
    this.sendAcc += dt;
    if (this.sendAcc < 1 / DI.NET_HZ) return;
    this.sendAcc = 0;
    this.send({
      t: 'state',
      x: +this.px.toFixed(2), z: +this.pz.toFixed(2),
      yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3),
      anim: this.anim || 'idle', sel: this.sel, stamina: Math.round(this.stamina),
      carrying: this.carrying
    });
  }

  /* ================= HUD / UI ================= */
  updateHud() {
    $('#wallet').textContent = money(this.wallet);
    const bm = $('#bagMoney');
    const hasBag = this.inv.some(i => i.id === 'bag');
    if (hasBag || this.bagMoney > 0) {
      bm.classList.remove('hidden');
      bm.textContent = '👜 ' + money(this.bagMoney);
    } else bm.classList.add('hidden');
    $('#carryTag').classList.toggle('hidden', !this.carrying);
    const st = $('#stars');
    if (st) {
      const spans = st.querySelectorAll('span');
      spans.forEach((s, i) => {
        s.classList.toggle('on', i < this.stars);
        s.classList.toggle('pulse', i < this.stars);
      });
    }
    // оружие/патроны
    const it = DI.ITEMS[this.weapon];
    const ab = $('#ammoBox');
    if (it && it.kind === 'gun') {
      ab.classList.remove('hidden');
      const ammo = this.inv.find(i => i.id === 'ammo' && i.cls === it.cls);
      $('#ammoMag').textContent = this.mag;
      $('#ammoRes').textContent = '/' + (ammo ? ammo.qty : 0);
      $('#ammoName').textContent = it.name + ' · ' + DI.AMMO_KIND[it.cls];
      $('#ammoBox').style.opacity = (ammo && ammo.qty > 0) ? '1' : '.55';
    } else ab.classList.add('hidden');
    // напарник
    const pn = $('#ptName');
    if (this.peer) {
      pn.textContent = '👥 ' + this.peer.name + (this.peer.mic ? ' 🎙' : '');
      $('#ptHp').style.transform = 'scaleX(' + clamp((this.peer.hp || 100) / 100, 0, 1) + ')';
    } else {
      pn.textContent = '👥 Напарник: никого (1/2)';
      $('#ptHp').style.transform = 'scaleX(0)';
    }
    $('#hpFill').style.transform = 'scaleX(' + clamp(this.hp / 100, 0, 1) + ')';
    $('#stFill').style.transform = 'scaleX(' + clamp(this.stamina / 100, 0, 1) + ')';
    if (this.panelOpen === 'shopPanel') this.refreshShop();
    if (this.panelOpen === 'bagPanel') {
      $('#bagTotal').textContent = money(this.bagMoney);
      $('#bagWallet').textContent = money(this.wallet);
    }
  }

  buildHotbar() {
    const hb = $('#hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < DI.INV_SLOTS; i++) {
      const s = this.inv[i];
      const d = el('div', 'hslot' + (i === this.sel ? ' sel' : '') + (!s ? ' empty' : ''));
      d.innerHTML = '<span class="k">' + ((i + 1) % 10) + '</span>';
      if (s) {
        const c = document.createElement('canvas');
        c.width = 96; c.height = 96;
        d.appendChild(c);
        this.renderIcon(s, c, 96);
        if (s.qty > 1) d.innerHTML += '<span class="q">' + s.qty + '</span>';
      }
      d.addEventListener('click', () => { if (s) this.selectSlot(i); });
      hb.appendChild(d);
    }
    this.syncHotbarSelection();
  }
  syncHotbarSelection() {
    const hb = $('#hotbar');
    if (!hb) return;
    for (let i = 0; i < hb.children.length; i++) {
      hb.children[i].classList.toggle('sel', i === this.sel);
    }
  }

  /* --- иконки и превью: рендер мини-сцены в canvas --- */
  iconRenderer() {
    if (this._iconR) return this._iconR;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(256, 256, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, 1, 0.05, 60);
    sc.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(2, 3, 4); sc.add(dl);
    const dl2 = new THREE.DirectionalLight(0x88aaff, 0.7); dl2.position.set(-3, 1, -2); sc.add(dl2);
    this._iconR = { renderer: r, scene: sc, cam, canvas: c };
    return this._iconR;
  }
  modelForSlot(s) {
    const g = new THREE.Group();
    if (!s) return g;
    if (s.id === 'fist') {
      const skin = stdMat(0xe8b48c, 0.9);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.5), skin);
      g.add(f);
      const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.5), skin);
      f2.position.set(0.55, 0, -0.1); g.add(f2);
    } else if (s.id === 'money') {
      const m = makeMoneyStack(0.6, 0.2, 0.34);
      m.scale.setScalar(1.5); g.add(m);
      const m2 = makeMoneyStack(0.6, 0.2, 0.34);
      m2.scale.setScalar(1.5); m2.position.set(0.1, 0.32, 0.05); m2.rotation.y = 0.4; g.add(m2);
    } else if (s.id === 'ammo') {
      const ab = makeAmmoBox(s.cls); ab.scale.setScalar(2.1); g.add(ab);
    } else if (s.id === 'bag') {
      const b = makeBag(); b.scale.setScalar(1.7); g.add(b);
    } else if (s.id === 'medkit') {
      const bx1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.4), stdMat(0xeceae4, 0.8));
      g.add(bx1);
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.05), stdMat(0xd02020));
      c1.position.z = 0.21; g.add(c1);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.05), stdMat(0xd02020));
      c2.position.z = 0.21; g.add(c2);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI), stdMat(0x33383d));
      h.position.y = 0.32; g.add(h);
    } else if (DI.ITEMS[s.id] && DI.ITEMS[s.id].kind === 'gun') {
      const gun = makeGun(s.id); gun.scale.setScalar(2.6); g.add(gun);
    }
    return g;
  }
  renderIcon(s, canvas, size) {
    const R = this.iconRenderer();
    const model = this.modelForSlot(s);
    while (R.scene.children.length > 3) R.scene.remove(R.scene.children[R.scene.children.length - 1]);
    R.scene.add(model);
    // рамка по размеру
    const bb = new THREE.Box3().setFromObject(model);
    const sz = bb.getSize(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
    const dist = (maxDim / 2) / Math.tan((R.cam.fov * Math.PI / 180) / 2) * 1.5;
    R.cam.position.set(dist * 0.55, dist * 0.42, dist * 0.8);
    R.cam.lookAt(bb.getCenter(new THREE.Vector3()));
    R.cam.updateProjectionMatrix();
    R.renderer.setSize(size, size, false);
    R.cam.aspect = 1; R.cam.updateProjectionMatrix();
    R.renderer.clear();
    R.renderer.render(R.scene, R.cam);
    const ctx = canvas.getContext('2d');
    canvas.width = size; canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(R.canvas, 0, 0, size, size);
    R.scene.remove(model);
  }

  /* ================= ПАНЕЛИ ================= */
  togglePanel(id) {
    if (this.panelOpen === id) { this.closePanel(); return; }
    this.closePanel();
    const p = $('#' + id);
    if (!p) return;
    p.classList.remove('hidden');
    this.panelOpen = id;
    play('open', { gain: .5 });
    if (document.pointerLockElement) document.exitPointerLock();
    if (id === 'invPanel') this.renderInventory();
    if (id === 'shopPanel') { this.renderShop(); this.refreshShop(); }
    if (id === 'bagPanel') { $('#bagTotal').textContent = money(this.bagMoney); $('#bagWallet').textContent = money(this.wallet); }
    if (id === 'pausePanel') {
      const s = this.stats || {};
      $('#pauseStats').innerHTML = 'Баланс: <b>' + money(this.wallet) + '</b> · Ограблено: ' + money(s.robbed || 0) +
        ' · Заработано: ' + money(s.earned || 0) + '<br>Убийств: ' + (s.kills || 0) + ' · Смертей: ' + (s.deaths || 0) +
        ' · Работ выполнено: ' + (s.jobs || 0);
    }
    if (id === 'settingsPanel') this.loadSettings();
  }
  closePanel() {
    if (!this.panelOpen) return;
    const p = $('#' + this.panelOpen);
    if (p) p.classList.add('hidden');
    this.panelOpen = null;
    this.shopSpin = null;
  }

  /* ---- инвентарь ---- */
  renderInventory() {
    const g = $('#invGrid');
    g.innerHTML = '';
    for (let i = 0; i < DI.INV_SLOTS; i++) {
      const s = this.inv[i];
      const d = el('div', 'islot' + (i === this.sel ? ' sel' : '') + (!s ? ' empty' : ''));
      if (s) {
        const c = document.createElement('canvas');
        d.appendChild(c);
        this.renderIcon(s, c, 110);
        if (s.qty > 1) d.appendChild(el('span', 'qty', String(s.qty)));
        d.appendChild(el('span', 'nm', this.slotTitle(s)));
      }
      d.addEventListener('click', () => {
        if (!s) return;
        this.sel = i; this.weapon = s.id;
        if (DI.ITEMS[s.id] && DI.ITEMS[s.id].kind !== 'gun') this.mag = 0;
        this.buildViewModel(); this.updateSelfHeld(); this.buildHotbar();
        this.renderInventory(); this.updateHud();
        this.send({ t: 'state', x: this.px, z: this.pz, yaw: this.yaw, pitch: this.pitch, anim: this.animState(), sel: this.sel, stamina: this.stamina });
        play('click', { gain: .35 });
      });
      g.appendChild(d);
    }
    const s = this.inv[this.sel];
    const info = $('#invInfo');
    if (!s) { info.innerHTML = '<h4>Пусто</h4><p>В этой ячейке ничего нет.</p>'; return; }
    const it = DI.ITEMS[s.id];
    let html = '<h4>' + this.slotTitle(s) + '</h4>';
    if (s.id === 'money') {
      html += '<p>Пачка наличных из банка. Её нужно <b>перечислить на баланс</b> — сумма зачисляется случайно.</p>';
    } else if (s.id === 'bag') {
      html += '<p>' + (it ? it.desc : '') + '<br>Сейчас в сумке: <b>' + money(this.bagMoney) + '</b> из ' + money(it.capacity) + '.</p>';
    } else if (s.id === 'ammo') {
      html += '<p>Калибр ' + DI.AMMO_KIND[s.cls] + '. Патроны сами уйдут на перезарядку подходящего оружия.</p>';
    } else if (it) {
      html += '<p>' + it.desc + '</p>';
      if (it.kind === 'gun') html += '<p class="stats">Урон ' + it.dmg + (it.pellets ? ' ×' + it.pellets : '') + ' · Магазин ' + it.mag + ' · Перезарядка ' + it.reload + 'с · Патрон ' + DI.AMMO_KIND[it.cls] + ' (' + it.ammoPrice + '$/шт)</p>';
      if (it.kind === 'heal') html += '<p class="stats">Восстановит ' + it.heal + ' HP</p>';
    }
    info.innerHTML = html;
    $('#invUse').textContent = s.id === 'money' ? 'ПЕРЕЧИСЛИТЬ В БАЛАНС' : (s.id === 'bag' ? 'ОТКРЫТЬ СУМКУ' : (s.id === 'medkit' ? 'ВЫПИТЬ АПТЕЧКУ' : 'ВЗЯТЬ В РУКИ'));
    $('#invUse').style.display = (s.id === 'fist') ? 'none' : '';
  }
  slotTitle(s) {
    if (!s) return '';
    if (s.id === 'money') return 'Пачка ' + money(s.val || 0);
    if (s.id === 'ammo') return 'Патроны ' + DI.AMMO_KIND[s.cls];
    const it = DI.ITEMS[s.id];
    return it ? it.name : s.id;
  }
  depositSelected() {
    const s = this.inv[this.sel];
    if (!s) return;
    if (s.id === 'money') { this.send({ t: 'deposit', index: this.sel }); return; }
    if (s.id === 'bag') { this.togglePanel('bagPanel'); return; }
    if (s.id === 'medkit') { this.send({ t: 'useMedkit' }); return; }
    toast('Сначала выберите пачку денег или аптечку', 'info');
  }

  /* ---- магазин ---- */
  renderShop() {
    const g = $('#shopGrid');
    if (g.children.length) return;
    DI.SHOP_CATALOG.forEach(id => {
      const it = DI.ITEMS[id];
      const card = el('div', 'shopCard');
      const cv = document.createElement('canvas');
      card.appendChild(cv);
      card.appendChild(el('h4', null, it.name));
      card.appendChild(el('div', 'price', money(it.price)));
      card.appendChild(el('div', 'desc', it.desc));
      if (it.kind === 'gun') {
        card.appendChild(el('div', 'stats', 'Урон ' + it.dmg + (it.pellets ? '×' + it.pellets : '') + ' · Маг. ' + it.mag + ' · Перезар. ' + it.reload + 'с'));
        card.appendChild(el('div', 'stats', 'Патроны: ' + DI.AMMO_KIND[it.cls] + ' — ' + it.ammoPrice + '$/шт'));
      }
      if (it.kind === 'bag') card.appendChild(el('div', 'stats', 'Вместимость: ' + money(it.capacity)));
      const btn = el('button', 'btn small', 'КУПИТЬ');
      btn.addEventListener('click', () => { this.send({ t: 'buy', id }); play('click', { gain: .4 }); });
      card.appendChild(btn);
      card.dataset.id = id;
      g.appendChild(card);
      this.renderIcon({ id }, cv, 220);
      // вращение модели в превью
      card.addEventListener('mouseenter', () => { this.shopSpin = id; });
    });
    const ag = $('#ammoGrid');
    if (!ag.children.length) {
      ['glock', 'mp5', 'ak', 'shotgun'].forEach(gid => {
        const gun = DI.ITEMS[gid];
        const card = el('div', 'ammoCard');
        card.appendChild(el('b', null, DI.AMMO_KIND[gun.cls] + ' · ' + gun.name));
        card.appendChild(el('div', 'p', gun.ammoPrice + '$ за патрон'));
        const btns = el('div', 'ammoBtns');
        [30, 60, 120].forEach(n => {
          const b = el('button', 'btn small', n + ' шт · ' + money(n * gun.ammoPrice));
          b.addEventListener('click', () => { this.send({ t: 'buyAmmo', id: gid, rounds: n }); play('click', { gain: .4 }); });
          btns.appendChild(b);
        });
        card.appendChild(btns);
        ag.appendChild(card);
      });
    }
  }
  refreshShop() {
    const w = $('#shopWallet');
    if (w) w.textContent = money(this.wallet);
    $$('#shopGrid .shopCard').forEach(card => {
      const it = DI.ITEMS[card.dataset.id];
      const btn = card.querySelector('button');
      const owned = this.inv.some(i => i.id === card.dataset.id);
      btn.disabled = this.wallet < it.price || owned;
      btn.textContent = owned ? 'УЖЕ ЕСТЬ' : 'КУПИТЬ';
    });
  }

  /* ---- шкаф ---- */
  openWardrobe(slot) {
    this.wardSlot = slot;
    $('#wardTitle').textContent = 'ШКАФ ' + (slot + 1) + ' (дома, слева/справа)';
    this.togglePanel('wardPanel');
  }
  renderWardrobe() {
    const inv = $('#wardInv'), st = $('#wardStore');
    if (!inv || !st) return;
    inv.innerHTML = ''; st.innerHTML = '';
    const w = this.wardSlot || 0;
    this.inv.forEach((s, i) => {
      const d = el('div', 'islot');
      const c = document.createElement('canvas'); d.appendChild(c);
      this.renderIcon(s, c, 90);
      if (s.qty > 1) d.appendChild(el('span', 'qty', String(s.qty)));
      d.appendChild(el('span', 'nm', this.slotTitle(s)));
      d.title = 'Положить в шкаф';
      d.addEventListener('click', () => {
        if (s.id === 'fist') { toast('Кулаки в шкаф не положить', 'bad'); return; }
        this.send({ t: 'wardrobe', act: 'put', w, index: i });
      });
      inv.appendChild(d);
    });
    (this.wardrobe[w] || []).forEach((s, i) => {
      const d = el('div', 'islot');
      const c = document.createElement('canvas'); d.appendChild(c);
      this.renderIcon(s, c, 90);
      if (s.qty > 1) d.appendChild(el('span', 'qty', String(s.qty)));
      d.appendChild(el('span', 'nm', this.slotTitle(s)));
      d.title = 'Забрать в инвентарь';
      d.addEventListener('click', () => this.send({ t: 'wardrobe', act: 'take', w, index: i }));
      st.appendChild(d);
    });
    for (let i = (this.wardrobe[w] || []).length; i < DI.WARDROBE_SLOTS; i++) st.appendChild(el('div', 'islot empty'));
    for (let i = this.inv.length; i < DI.INV_SLOTS; i++) inv.appendChild(el('div', 'islot empty'));
  }

  /* ================= ГОЛОС ================= */
  async enableVoice() {
    const ok = await this.net.requestMic();
    if (!ok) { $('#micStatus').textContent = 'Микрофон недоступен — играем без голоса.'; $('#micIcon').classList.add('off'); return false; }
    this.micAllowed = true;
    $('#micStatus').textContent = 'Микрофон разрешён. Голос будет работать всю игру (отключается только выходом из игры или клавишей V).';
    $('#micIcon').classList.remove('off');
    LS.set('voice', true);
    this.setupVoiceChannel();
    return true;
  }
  setupVoiceChannel() {
    if (this.local) { toast('Офлайн-режим: напарник — бот, голосовой канал не нужен', 'info'); return; }
    this.net.setupVoice();
    this.send({ t: 'mic', on: true });
    // анализатор своего микрофона (индикатор «вы говорите»)
    try {
      const ac = audioContext();
      if (ac && this.net.micStream) {
        this.micAnalyser = ac.createAnalyser();
        this.micAnalyser.fftSize = 512;
        ac.createMediaStreamSource(this.net.micStream).connect(this.micAnalyser);
        this.micData = new Uint8Array(this.micAnalyser.fftSize);
      }
    } catch (e) { console.warn('[mic analyser]', e.message); }
    // кто первым в комнате — тот и шлёт offer
    if (this.peer) this.net.startOffer();
    else this.net.isOfferer = true;
  }
  toggleMic() {
    if (!this.micAllowed) { this.enableVoice(); return; }
    if (this.net.micStream) {
      const tr = this.net.micStream.getAudioTracks()[0];
      if (tr) { tr.enabled = !tr.enabled; this.micMuted = !tr.enabled; }
    }
    $('#micIcon').classList.toggle('off', this.micMuted);
    toast(this.micMuted ? 'Микрофон выключен (V — включить)' : 'Микрофон включён', 'info');
  }
  onVoicePeer(connected) {
    this.voicePeer = connected;
    if (connected) toast('🎙 Голосовой канал с напарником установлен', 'good');
  }
  onVoiceState(s) {
    if (s === 'connected') $('#micIcon').classList.add('on');
  }

  /* ================= СТАТУС СЕТИ / МЕНЮ ================= */
  onNetStatus(state, text) {
    const el2 = $('#serverStatus');
    const lt = $('#lobbyTitle');
    if (state === 'connecting') { if (el2) { el2.textContent = 'подключение: ' + (text || ''); el2.className = ''; } if (lt) lt.textContent = 'ПОДКЛЮЧЕНИЕ…'; }
    else if (state === 'online') { if (el2) { el2.textContent = 'сервер: онлайн'; el2.className = 'ok'; } }
    else if (state === 'offline' || state === 'error') {
      if (el2) { el2.textContent = 'сервер недоступен — можно играть офлайн с ботом'; el2.className = 'bad'; }
      if (this.mode !== 'play') this.offerOffline(text);
    } else if (state === 'reconnect') { if (lt) lt.textContent = 'СВЯЗЬ ПРОПАЛА…'; if (el2) { el2.textContent = text; el2.className = 'bad'; } }
    else if (state === 'full') {
      if (lt) lt.textContent = 'СЕРВЕР ЗАНЯТ (2/2)';
      $('#lobbyText').textContent = 'На сервере уже два игрока. Дождитесь, пока один выйдет, или запустите свой сервер (см. README).';
      this.mode = 'lobby';
      this.showMenuBlock('menuLobby');
    }
  }
  offerOffline(reason) {
    if (this.offeredOffline) return;
    this.offeredOffline = true;
    toast('Не удалось соединиться с сервером (' + (reason || 'нет связи') + '). Предлагаю офлайн-режим с ботом-напарником.', 'bad');
    $('#lobbyTitle').textContent = 'СЕРВЕР НЕДОСТУПЕН';
    $('#lobbyText').innerHTML = 'Игра полностью рабочая и в одиночном режиме: тот же город, банк, магазин и копы, а вторым игроком будет бот «Саня».<br>Чтобы играть вдвоём с другом — поднимите сервер (<code>npm start</code>) и укажите его адрес в Настройках.';
    $('#btnEnter').textContent = 'ИГРАТЬ ОФЛАЙН (С БОТОМ)';
    this.showMenuBlock('menuLobby');
    this.mode = 'lobby';
    this.offlineMode = true;
  }
  startOffline() {
    $('#loading').classList.remove('hidden');
    $('#loadText').textContent = 'Поднимаем локальную комнату…';
    setTimeout(() => {
      // подгружаем room.js как скрипт (UMD) и создаём локальную комнату
      const s = document.createElement('script');
      s.src = 'server/room.js';
      s.onload = () => {
        this.local = createLocalGame({
          name: this.name, model: this.model, token: token(),
          onMessage: m => this.handleLocalMessage(m)
        });
        if (!this.local) { toast('Не удалось создать офлайн-игру', 'bad'); $('#loading').classList.add('hidden'); return; }
        this.net.local = true;
        this.mode = 'lobby';
        this.setLobby([{ slot: 0, name: this.name, model: this.model }, { slot: 1, name: 'Саня (бот)', model: 'gopnik' }]);
        $('#loading').classList.add('hidden');
        toast('Офлайн-режим: напарник-бот «Саня» уже в доме', 'good');
      };
      s.onerror = () => { toast('room.js не загрузился', 'bad'); $('#loading').classList.add('hidden'); };
      document.body.appendChild(s);
    }, 30);
  }
  handleLocalMessage(m) {
    // локальная комната шлёт те же сообщения, что и сервер
    this.net.emit(m.t, m);
    this.net.emit('*', m);
  }
  setLobby(players) {
    this.showMenuBlock('menuLobby');
    this.onRoster({ players: players || [] });
    const sv = this.local ? null : LS.get('saveMirror', null);
    $('#lobbySave').innerHTML = 'Баланс: <b>' + money(this.wallet) + '</b> · Вещей в инвентаре: ' + this.inv.length +
      ' · В шкафах: ' + ((this.wardrobe[0] || []).length + (this.wardrobe[1] || []).length) +
      '<br>Всё сохраняется на сервере и переживает выход из игры.';
  }
  showMenuBlock(id) {
    ['menuMain', 'menuProfile', 'menuLobby'].forEach(b => $('#' + b).classList.toggle('hidden', b !== id));
  }

  enterGame() {
    this.mode = 'play';
    this.introT = 3.4;
    stopMusic();
    if (this.radioOn) startRadio();
    if (this.world && this.world.alarm) startAlarmLoop();
    $('#menu').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    $('#hotbar').classList.remove('hidden');
    $('#crosshair').classList.remove('hidden');
    if (isTouch) { $('#touchLeft').classList.remove('hidden'); $('#touchRight').classList.remove('hidden'); }
    resumeAudio();
    startAmbience();
    this.buildHotbar();
    this.updateHud();
    this.updateSelfHeld();
    // голос: если разрешили и напарник есть — начинаем сигнал
    if (this.micAllowed && this.peer && !this.local) this.net.startOffer();
    if (!isTouch) {
      const c = $('#scene');
      setTimeout(() => { c.requestPointerLock && c.requestPointerLock(); }, 200);
    }
    toast('Вы дома. Дверь на улицу — на южной стене. Банк и оружейный магазин в городе.', 'good');
    // стартовая анимация: лежим на кровати и встаём
    this.introT = 2.6;
  }
  exitToMenu() {
    this.mode = 'menu';
    stopAlarmLoop();
    stopRadio();
    startMusic();
    $('#menu').classList.remove('hidden');
    $('#hud').classList.add('hidden');
    $('#hotbar').classList.add('hidden');
    $('#crosshair').classList.add('hidden');
    $('#touchLeft').classList.add('hidden');
    $('#touchRight').classList.add('hidden');
    this.closePanel();
    this.showMenuBlock('menuMain');
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

/* ================================================================== */
/*  ЗАПУСК                                                             */
/* ================================================================== */
const G = new Game();
window.GAME = G;

function bindUI() {
  // кнопки меню
  $('#btnPlay').addEventListener('click', () => {
    resumeAudio(); play('click', { gain: .6 });
    $('#inpName').value = G.name;
    $('#pickGent').classList.toggle('active', G.model === 'gentleman');
    $('#pickGop').classList.toggle('active', G.model === 'gopnik');
    G.showMenuBlock('menuProfile');
  });
  $('#btnAbout').addEventListener('click', () => { play('click', { gain: .5 }); G.togglePanel('aboutPanel'); });
  $('#btnSettings').addEventListener('click', () => { play('click', { gain: .5 }); G.togglePanel('settingsPanel'); });
  $('#btnBackProfile').addEventListener('click', () => G.showMenuBlock('menuMain'));
  $('#pickGent').addEventListener('click', () => { G.model = 'gentleman'; LS.set('model', G.model); $('#pickGent').classList.add('active'); $('#pickGop').classList.remove('active'); play('click'); });
  $('#pickGop').addEventListener('click', () => { G.model = 'gopnik'; LS.set('model', G.model); $('#pickGop').classList.add('active'); $('#pickGent').classList.remove('active'); play('click'); });
  $('#inpName').addEventListener('input', e => { G.name = e.target.value.slice(0, 18) || 'Игрок'; LS.set('name', G.name); });
  $('#btnMicAsk').addEventListener('click', async () => {
    resumeAudio();
    $('#micStatus').textContent = 'Запрашиваем разрешение…';
    const ok = await G.enableVoice();
    if (ok) play('buy', { gain: .6 });
  });
  $('#btnConnect').addEventListener('click', () => {
    resumeAudio(); play('click', { gain: .7 });
    G.name = ($('#inpName').value || 'Игрок').slice(0, 18);
    LS.set('name', G.name); LS.set('model', G.model);
    $('#loading').classList.remove('hidden');
    $('#loadText').textContent = 'Подключение к серверу…';
    G.offeredOffline = false;
    G.net.connect(G.name, G.model);
    // если за 6 секунд сервер не ответил — предлагаем офлайн
    setTimeout(() => {
      if (!G.net.connected && G.mode !== 'play' && G.mode !== 'lobby') {
        $('#loading').classList.add('hidden');
        G.onNetStatus('offline', 'таймаут подключения');
      } else $('#loading').classList.add('hidden');
    }, 6000);
  });
  $('#btnEnter').addEventListener('click', () => {
    play('click', { gain: .7 });
    if (G.offlineMode && !G.local) { G.startOffline(); return; }
    if (!G.local && !G.net.connected) { G.offerOffline('нет связи'); return; }
    G.enterGame();
  });
  $('#btnLeave').addEventListener('click', () => {
    play('click');
    if (G.local) { G.local.close(); G.local = null; }
    else G.net.close(true);
    G.exitToMenu();
    G.offeredOffline = false; G.offlineMode = false;
  });

  // панели
  $$('.close').forEach(b => b.addEventListener('click', () => G.closePanel()));
  $('#invUse').addEventListener('click', () => G.depositSelected());
  $('#invDrop').addEventListener('click', () => {
    const s = G.inv[G.sel];
    if (!s || s.id === 'fist') { toast('Кулаки не выбросить', 'bad'); return; }
    if (s.id === 'money') { G.send({ t: 'deposit', index: G.sel }); return; }
    toast('Выбрасывать предметы пока нельзя — положите в шкаф дома', 'info');
  });
  $('#bagTake').addEventListener('click', () => {
    const v = parseInt($('#bagAmount').value, 10) || 0;
    if (v <= 0) { toast('Введите сумму', 'bad'); return; }
    G.send({ t: 'bagWithdraw', amount: v });
  });
  $('#bagAll').addEventListener('click', () => G.send({ t: 'bagWithdraw', all: true }));
  $('#pResume').addEventListener('click', () => G.closePanel());
  $('#pAbout').addEventListener('click', () => G.togglePanel('aboutPanel'));
  $('#pSettings').addEventListener('click', () => G.togglePanel('settingsPanel'));
  $('#pInv').addEventListener('click', () => G.togglePanel('invPanel'));
  $('#pExit').addEventListener('click', () => { G.closePanel(); G.exitToMenu(); });
  $('#setSave').addEventListener('click', () => {
    const srv = $('#setServer').value.trim();
    LS.set('server', srv);
    LS.set('sens', parseInt($('#setSens').value, 10) || 100);
    LS.set('quality', $('#setQuality').value);
    LS.set('aimAssist', $('#setAim').checked);
    LS.set('radioOn', $('#setRadio').checked);
    G.sens = (parseInt($('#setSens').value, 10) || 100) / 100;
    G.quality = $('#setQuality').value;
    G.aimAssist = $('#setAim').checked;
    G.radioOn = $('#setRadio').checked;
    if (G.radioOn && G.mode === 'play') startRadio(); else stopRadio();
    $('#saveInfo').textContent = 'Сохранено. Адрес сервера: ' + (srv || '(сервер этого сайта)') + '. Переподключение после «ВЫЙТИ В МЕНЮ» → «ИГРАТЬ».';
    toast('Настройки сохранены', 'good');
  });
  $('#btnRadioNext').addEventListener('click', () => {
    if (!G.radioOn) { toast('Сначала включите радио', 'bad'); return; }
    const name = nextRadio();
    if (name) toast('Станция: ' + (radioTrackName() || name), 'good');
    else toast('Треки радио ещё догружаются…', 'info');
    const rn = $('#radioName');
    if (rn) rn.textContent = 'Сейчас играет: ' + (radioTrackName() || '—');
  });
  $('#setReset').addEventListener('click', () => {
    if (!confirm('Точно сбросить весь прогресс (баланс, инвентарь, шкафы)?')) return;
    ['saveMirror', 'localsave_' + token()].forEach(k => LS.del(k));
    try { localStorage.removeItem('di_localsave_' + token()); } catch (e) {}
    fetch(wsUrl().replace(/^ws/, 'http') + '/api/wipe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token() })
    }).catch(() => {});
    toast('Локальный прогресс сброшен. Серверное сохранение очистится при следующей игре.', 'info');
  });

  // статус сервера в меню
  pingServer();
  setInterval(pingServer, 15000);
  function pingServer() {
    if (G.local) return;
    const base = wsUrl().replace(/^ws/, 'http');
    fetch(base + '/api/health').then(r => r.json()).then(d => {
      const e = $('#serverStatus');
      if (!e) return;
      e.textContent = 'сервер: онлайн · в комнате ' + d.players + '/' + d.max;
      e.className = 'ok';
    }).catch(() => {
      const e = $('#serverStatus');
      if (!e) return;
      e.textContent = 'сервер недоступен — доступен офлайн-режим с ботом';
      e.className = 'bad';
    });
  }
}

function drawModelPreviews() {
  // превью джентльмена и гопника в меню
  const specs = [['#cvGent', makeGentleman, 'idle'], ['#cvGop', makeGopnik, 'idle']];
  specs.forEach(([sel, fn, anim]) => {
    const canvas = $(sel);
    if (!canvas) return;
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) { return; }
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.setSize(canvas.width, canvas.height, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 40);
    cam.position.set(0, 1.55, 4.2); cam.lookAt(0, 1.05, 0);
    sc.add(new THREE.AmbientLight(0xffffff, 1.35));
    const dl = new THREE.DirectionalLight(0xfff0d0, 2.0); dl.position.set(2.5, 4, 3); sc.add(dl);
    const dl2 = new THREE.DirectionalLight(0x9fc4ff, 0.8); dl2.position.set(-3, 2, -2); sc.add(dl2);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshLambertMaterial({ color: 0x2a2f36 }));
    floor.rotation.x = -Math.PI / 2; sc.add(floor);
    const m = fn();
    sc.add(m);
    let t = 0;
    function tick() {
      requestAnimationFrame(tick);
      if (G.mode === 'play') return;
      t += 0.016;
      m.rotation.y = Math.sin(t * 0.6) * 0.5;
      animateChar(m, 'idle', t);
      r.clear(); r.render(sc, cam);
    }
    tick();
  });
}

function boot() {
  G.initThree();
  G.buildScene(4242);
  G.initInput();
  G.bindNet();
  bindUI();
  drawModelPreviews();
  G.start();
  // PWA
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // первичная инициализация звука по любому тапу
  const unlock = () => {
    initAudio(); resumeAudio(); startMusic();
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('touchstart', unlock);
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('touchstart', unlock, { passive: true });
  initAudio();
  // файловые текстуры 1024² подтягиваются поверх процедурных
  loadFileTextures((done, total) => {
    const lt = $('#loadText');
    if (lt && done < total) lt.textContent = 'Текстуры города: ' + done + '/' + total;
  });
  // iOS: подсказка «Добавить на главный экран»
  if (isIOS && !window.matchMedia('(display-mode: standalone)').matches && !LS.get('iosHint')) {
    LS.set('iosHint', 1);
    setTimeout(() => toast('📱 iPhone: нажмите «Поделиться» → «На экран Домой», чтобы игра запускалась как приложение', 'good'), 2500);
  }
}
boot();
