/* DENI ISLAM — сеть: WebSocket к игровому серверу + голосовой WebRTC-канал */
import { wsUrl, LS, toast } from './util.js';
import { audioCtx, voiceDestination, initAudio } from './audio.js';

export class Net {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.connected = false;
    this.slot = -1;
    this.id = null;
    this.handlers = {};
    this.queue = [];
    this.lastSend = 0;
    this.retry = 0;
    this.manualClose = false;
    this.ping = 0;
    this.pc = null;
    this.micStream = null;
    this.voiceOn = false;
    this.voicePeer = false;
    this.remoteAudio = null;
    this.onStatus = () => {};
  }

  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
  emit(type, data) {
    const hs = this.handlers[type] || [];
    for (const h of hs) { try { h(data); } catch (e) { console.error('[net handler]', type, e); } }
  }

  connect(name, model) {
    this.manualClose = false;
    const url = wsUrl();
    this.onStatus('connecting', url);
    try { this.ws = new WebSocket(url); } catch (e) { this.onStatus('error', 'Не удалось создать соединение'); return; }
    this.ws.onopen = () => {
      this.connected = true; this.retry = 0;
      this.send({ t: 'hello', token: LS.get('token', ''), name, model });
      this.onStatus('connecting', 'Сервер найден. Загружаемся…');
    };
    this.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'welcome') {
        this.slot = m.slot; this.id = m.id; this.seed = m.seed;
        this.onStatus('online', '');
      }
      if (m.t === 'full') { this.onStatus('full', ''); this.close(true); return; }
      this.emit(m.t, m);
      this.emit('*', m);
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.onStatus('offline', '');
      if (this.manualClose) return;
      this.retry++;
      const delay = Math.min(8000, 800 * this.retry);
      this.onStatus('reconnect', 'Переподключение через ' + Math.round(delay / 1000) + ' с… (попытка ' + this.retry + ')');
      setTimeout(() => { if (!this.manualClose) this.connect(name, model); }, delay);
    };
    this.ws.onerror = () => { this.onStatus('error', 'Ошибка соединения с сервером ' + url); };
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) { this.queue.push(obj); return false; }
    try { this.ws.send(JSON.stringify(obj)); } catch (e) { return false; }
    return true;
  }
  flush() {
    while (this.queue.length && this.ws && this.ws.readyState === 1) {
      const m = this.queue.shift();
      try { this.ws.send(JSON.stringify(m)); } catch (e) {}
    }
  }
  close(manual) {
    this.manualClose = manual !== false;
    this.teardownVoice();
    try { if (this.ws) this.ws.close(); } catch (e) {}
    this.connected = false;
  }
  retryJoin() { this.send({ t: 'hello', token: LS.get('token', ''), name: this.game.name, model: this.game.model }); }

  /* ---------------- голосовой чат (WebRTC через сервер-ретранслятор) ---------------- */
  async requestMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Микрофон не поддерживается этим браузером', 'bad');
      return false;
    }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
        video: false
      });
      return true;
    } catch (e) {
      toast('Разрешение на микрофон не получено — игра без голоса', 'bad');
      return false;
    }
  }
  setupVoice() {
    if (!this.micStream || this.pc) return;
    initAudio();
    const RTCPeer = window.RTCPeerConnection;
    if (!RTCPeer) { toast('Голосовой чат не поддерживается', 'bad'); return; }
    this.pc = new RTCPeer({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    });
    this.micStream.getAudioTracks().forEach(tr => this.pc.addTrack(tr, this.micStream));
    this.pc.ontrack = (ev) => {
      const a = new Audio();
      a.srcObject = ev.streams[0];
      a.autoplay = true;
      a.playsInline = true;
      a.volume = 1.0;
      const start = () => a.play().catch(() => {});
      start();
      document.addEventListener('pointerdown', start, { once: true });
      document.addEventListener('touchstart', start, { once: true });
      this.remoteAudio = a;
      this.voicePeer = true;
      // индикатор «напарник говорит»
      try {
        const ac = audioCtx();
        if (ac && ev.streams[0]) {
          this.peerAnalyser = ac.createAnalyser();
          this.peerAnalyser.fftSize = 512;
          ac.createMediaStreamSource(ev.streams[0]).connect(this.peerAnalyser);
          this.peerData = new Uint8Array(this.peerAnalyser.fftSize);
        }
      } catch (e) {}
      this.game.onVoicePeer(true);
    };
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) this.send({ t: 'voice', kind: 'cand', cand: ev.candidate });
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      this.game.onVoiceState(s);
      if (s === 'failed' || s === 'closed') { this.teardownVoice(); }
    };
    this.voiceOn = true;
    this.game.onVoiceState('new');
  }
  async voiceSignal(m) {
    if (!this.pc) return;
    try {
      if (m.kind === 'offer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
        const ans = await this.pc.createAnswer();
        await this.pc.setLocalDescription(ans);
        this.send({ t: 'voice', kind: 'answer', sdp: this.pc.localDescription });
      } else if (m.kind === 'answer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
      } else if (m.kind === 'cand' && m.cand) {
        await this.pc.addIceCandidate(new RTCIceCandidate(m.cand));
      }
    } catch (e) { console.warn('[voice]', e.message); }
  }
  async startOffer() {
    if (!this.pc) return;
    try {
      const off = await this.pc.createOffer({ offerToReceiveAudio: true });
      await this.pc.setLocalDescription(off);
      this.send({ t: 'voice', kind: 'offer', sdp: this.pc.localDescription });
    } catch (e) { console.warn('[voice offer]', e.message); }
  }
  teardownVoice() {
    try { if (this.pc) this.pc.close(); } catch (e) {}
    this.pc = null;
    this.voicePeer = false;
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); }
    this.micStream = null;
    if (this.remoteAudio) { try { this.remoteAudio.pause(); } catch (e) {} this.remoteAudio = null; }
    if (this.game) this.game.onVoicePeer(false);
  }
}
