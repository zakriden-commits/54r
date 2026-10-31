#!/usr/bin/env node
/* Кладёт three.module.js + three.core.js в public/vendor/three/.
   1) берёт из node_modules (если three установлен как devDependency)
   2) иначе пробует скачать с registry.npmjs.org
   3) иначе оставляет то, что уже лежит в репозитории (вендоринг) */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEST = path.join(__dirname, '..', 'public', 'vendor', 'three');
const FILES = ['three.module.js', 'three.core.js'];
const VERSION = '0.187.0';

function haveAll() {
  return FILES.every(f => fs.existsSync(path.join(DEST, f)) && fs.statSync(path.join(DEST, f)).size > 10000);
}
function copyFromNodeModules() {
  const base = path.join(__dirname, '..', 'node_modules', 'three', 'build');
  if (!fs.existsSync(base)) return false;
  try {
    fs.mkdirSync(DEST, { recursive: true });
    for (const f of FILES) {
      const src = path.join(base, f);
      if (!fs.existsSync(src)) return false;
      fs.copyFileSync(src, path.join(DEST, f));
    }
    return true;
  } catch (e) { return false; }
}
function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}
async function download() {
  const tar = await fetch('https://registry.npmjs.org/three/-/three-' + VERSION + '.tgz');
  const tmp = path.join(require('os').tmpdir(), 'three-' + Date.now() + '.tgz');
  fs.writeFileSync(tmp, tar);
  const { execSync } = require('child_process');
  const dir = path.join(require('os').tmpdir(), 'three-extract-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  execSync('tar -xzf "' + tmp + '" -C "' + dir + '"');
  fs.mkdirSync(DEST, { recursive: true });
  for (const f of FILES) {
    const src = path.join(dir, 'package', 'build', f);
    if (!fs.existsSync(src)) throw new Error('в архиве нет ' + f);
    fs.copyFileSync(src, path.join(DEST, f));
  }
  fs.rmSync(tmp, { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}
(async function main() {
  if (haveAll()) { console.log('[three] уже в public/vendor/three — пропускаю'); return; }
  if (copyFromNodeModules()) { console.log('[three] скопирован из node_modules'); return; }
  try {
    await download();
    console.log('[three] скачан ' + VERSION + ' из npm');
  } catch (e) {
    if (haveAll()) { console.log('[three] оставлен вендоренный вариант'); return; }
    console.warn('[three] не удалось подготовить библиотеку: ' + e.message);
    console.warn('[three] положите вручную three.module.js и three.core.js в public/vendor/three/');
    process.exitCode = 0; // не роняем установку
  }
})();
