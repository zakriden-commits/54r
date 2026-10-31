/* DENI ISLAM — утилиты клиента: DOM, тосты, хранилище, адрес сервера */
'use strict';

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
export function $(sel) { return document.querySelector(sel); }
export function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

/* -------- хранилище -------- */
const memory = new Map();
export const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem('di_' + k);
      return v == null ? d : JSON.parse(v);
    } catch (e) { return memory.has(k) ? memory.get(k) : d; }
  },
  set(k, v) {
    memory.set(k, v);
    try { localStorage.setItem('di_' + k, JSON.stringify(v)); } catch (e) {}
  },
  del(k) {
    memory.delete(k);
    try { localStorage.removeItem('di_' + k); } catch (e) {}
  }
};

export function token() {
  let t = LS.get('token', null);
  if (!t) {
    t = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    LS.set('token', t);
  }
  return t;
}

/* -------- адрес сервера -------- */
export function wsUrl() {
  const forced = LS.get('server', '');
  if (forced) {
    let u = String(forced).trim();
    if (!/^wss?:\/\//.test(u)) u = (u.indexOf('https') === 0 ? 'wss://' : 'ws://') + u.replace(/^https?:\/\//, '');
    return u.replace(/\/$/, '');
  }
  const loc = window.location;
  if (!loc || loc.protocol === 'file:' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
    const port = (loc && loc.port) ? loc.port : '8080';
    const host = (loc && loc.hostname) ? loc.hostname : 'localhost';
    return 'ws://' + host + ':' + port;
  }
  return (loc.protocol === 'https:' ? 'wss://' : 'ws://') + loc.host;
}
export function httpUrl() { return wsUrl().replace(/^ws/, 'http'); }

/* -------- тосты -------- */
let toastBox = null;
export function toast(text, kind) {
  if (!toastBox) toastBox = document.getElementById('toasts');
  if (!toastBox) return;
  const t = el('div', 'toast ' + (kind || 'info'), String(text));
  toastBox.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, kind === 'bad' ? 3800 : 2900);
  while (toastBox.children.length > 4) toastBox.children[0].remove();
}

/* -------- форматы -------- */
export function money(n) { return '$' + Math.round(n || 0).toLocaleString('ru-RU'); }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function angLerp(a, b, t) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
export function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* -------- платформа -------- */
const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
export const isTouch = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/i.test(ua);
export const isStandalone = (typeof window !== 'undefined' && window.matchMedia)
  ? (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)
  : false;

if (typeof window !== 'undefined') {
  window.UTIL = { el, $, $$, LS, token, wsUrl, httpUrl, toast, money, clamp, lerp, angLerp, fmtTime, isTouch, isIOS, isAndroid, isStandalone };
}
