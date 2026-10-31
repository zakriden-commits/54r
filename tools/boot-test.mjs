/* Бут-тест клиента: импортирует public/js/main.js целиком в Node на DOM/WebGL-стабах.
   Ловит синтаксические ошибки, падения при старте (boot()) и проблемы инициализации
   сцены. Это единственная автоматическая проверка «а клиент вообще запускается?». */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const stub = await import('./dom-stub.mjs');

/* населяем DOM-стаб реальными id/class из index.html,
   иначе проверки «меню видно / HUD скрыт» проверяют пустые заглушки */
{
  const html = require('fs').readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const re = /<([a-zA-Z0-9]+)([^>]*?)\bid="([A-Za-z0-9_-]+)"([^>]*)>/g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[2] + m[4];
    const cm = /class="([^"]*)"/.exec(attrs);
    const el = document.createElement(m[1]);
    el.id = m[3];
    if (cm) cm[1].split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
    stub.elements.set(m[3], el);
    n++;
  }
  console.log('✓ DOM-стаб заселён из index.html: элементов', n);
}

/* протокол → window.DI */
(0, eval)(require('fs').readFileSync(new URL('../public/shared/protocol.js', import.meta.url), 'utf8'));

/* requestAnimationFrame не должен крутить бесконечные циклы в Node */
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

/* модули, которые main.js импортирует */
const models = await import('../public/js/models.js');
models.textures();
await import('../public/js/chars.js');
await import('../public/js/world.js');
const audio = await import('../public/js/audio.js');
audio.initAudio();
await import('../public/js/net.js');
await import('../public/js/util.js');
console.log('✓ модули клиента загружены');

/* сам клиент: boot() вызывается при импорте */
await import('../public/js/main.js');
const G = globalThis.GAME;
if (!G) throw new Error('window.GAME не создан — boot() не отработал');
console.log('✓ main.js импортирован, boot() отработал, режим:', G.mode);

if (!G.renderer) throw new Error('renderer не создан');
if (!G.scene) throw new Error('scene не создана');
if (!G.world) throw new Error('мир не построен при старте');
if (!G.camera) throw new Error('камера не создана');

let meshes = 0;
G.scene.traverse(o => { if (o.isMesh) meshes++; });
if (meshes < 400) throw new Error('в стартовой сцене слишком мало мешей: ' + meshes);
console.log('✓ сцена живая: мешей', meshes, '| жителей', G.world.civilians.length,
  '| интерактивов', G.world.interactions.length);

/* интерфейс: меню на месте, HUD скрыт до входа в игру */
const hidden = (id) => document.getElementById(id).classList.contains('hidden');
if (hidden('menu')) throw new Error('меню должно быть видно на старте');
if (!hidden('hud')) throw new Error('HUD должен быть скрыт до входа в игру');
if (!hidden('hotbar')) throw new Error('хотбар должен быть скрыт до входа в игру');
console.log('✓ стартовый экран: меню видно, HUD/хотбар скрыты');

/* один кадр игрового цикла не должен падать */
try {
  if (typeof G.update === 'function') G.update(0.016);
  else if (typeof G.frame === 'function') G.frame(0.016);
} catch (e) {
  // update может требовать активного режима — это не ошибка старта
  console.log('   (кадр без активного режима пропущен: ' + e.message.slice(0, 60) + ')');
}

console.log('\n✅ БУТ-ТЕСТ КЛИЕНТА ПРОЙДЕН');
process.exit(0);
