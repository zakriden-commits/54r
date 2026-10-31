/* Проверка YAML в .github/workflows: GitHub отклоняет весь запуск,
   если в файле хотя бы одна синтаксическая ошибка (и делает это молча,
   за 0 секунд). Проверяем локально, до пуша. */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
// js-yaml — CommonJS, в ESM его подключаем через createRequire
const yaml = createRequire(import.meta.url)('js-yaml');

const dir = path.resolve('.github/workflows');
if (!fs.existsSync(dir)) {
  console.log('✓ .github/workflows нет — проверять нечего');
  process.exit(0);
}
const files = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f));
let bad = 0;
for (const f of files) {
  const p = path.join(dir, f);
  let doc;
  try {
    doc = yaml.load(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.log('✗ ' + f + ': ' + e.message.split('\n')[0]);
    bad++;
    continue;
  }
  if (!doc || !doc.jobs || !Object.keys(doc.jobs).length) {
    console.log('✗ ' + f + ': нет jobs');
    bad++;
    continue;
  }
  const hasOn = doc.on || doc[true];      // «on» в YAML 1.1 парсится как true
  if (!hasOn) { console.log('✗ ' + f + ': нет триггера on:'); bad++; continue; }
  for (const [name, job] of Object.entries(doc.jobs)) {
    if (!job['runs-on']) { console.log('✗ ' + f + ': job ' + name + ' без runs-on'); bad++; }
    if (!Array.isArray(job.steps) || !job.steps.length) { console.log('✗ ' + f + ': job ' + name + ' без steps'); bad++; }
    for (const s of job.steps) {
      if (!s.uses && !s.run) { console.log('✗ ' + f + ': шаг без uses/run: ' + JSON.stringify(s).slice(0, 80)); bad++; }
    }
  }
  const steps = Object.values(doc.jobs).reduce((a, j) => a + (j.steps ? j.steps.length : 0), 0);
  console.log('✓ ' + f + ': jobs ' + Object.keys(doc.jobs).join(', ') + ', шагов ' + steps);
}
if (bad) {
  console.log('\n❌ WORKFLOW-ЛИНТЕР: ошибок ' + bad);
  process.exit(1);
}
console.log('\n✅ WORKFLOW-ЛИНТЕР ПРОЙДЕН');
