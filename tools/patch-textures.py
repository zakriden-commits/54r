import re

p = 'tools/generate-assets.js'
s = open(p, encoding='utf-8').read()

def rep(old, new):
    global s
    assert old in s, 'NOT FOUND:\n' + old[:200]
    assert s.count(old) == 1, 'AMBIGUOUS (%d):\n%s' % (s.count(old), old[:200])
    s = s.replace(old, new, 1)

rep("""function textures() {
  const S = 1024;
  let total = 0;""",
"""function textures() {
  // Самые заметные текстуры — 2048² (их видно под ногами и на фасадах),
  // остальные 1024². Размер можно переопределить переменной окружения TEX_SIZE.
  const BASE = parseInt(process.env.TEX_SIZE || '1024', 10);
  const HI = parseInt(process.env.TEX_SIZE_HI || '2048', 10);
  let total = 0;""")

# --- асфальт: 2048 + масштаб деталей ---
rep("""  total += writePNG(A('tex/asphalt.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(11);
    c.fill(56, 56, 62);
    c.noise(220000, 0.16, r);
    for (let i = 0; i < 900; i++) {
      const x = r() * s, y = r() * s, len = 10 + r() * 90, a = r() * 6.28;
      for (let t = 0; t < len; t++) {
        const px = (x + Math.cos(a) * t) | 0, py = (y + Math.sin(a) * t) | 0;
        c.set(px, py, 34, 34, 38); c.set(px + 1, py, 30, 30, 34);
      }
    }
    for (let i = 0; i < 240; i++) c.circle(r() * s, r() * s, 1 + r() * 5, 74, 74, 80);
  }));""",
"""  total += writePNG(A('tex/asphalt.png'), HI, HI, makeCanvasTex(HI, (c, s) => {
    const r = seeded(11), k = s / 1024;
    c.fill(56, 56, 62);
    c.noise(220000 * k * k, 0.16, r);
    for (let i = 0; i < 900 * k * k; i++) {
      const x = r() * s, y = r() * s, len = (10 + r() * 90) * k, a = r() * 6.28;
      const w = Math.max(1, Math.round(2 * k));
      for (let t = 0; t < len; t++) {
        const px = (x + Math.cos(a) * t) | 0, py = (y + Math.sin(a) * t) | 0;
        c.rect(px, py, w, w, 34, 34, 38);
        c.rect(px + w, py, w, w, 30, 30, 34);
      }
    }
    for (let i = 0; i < 240 * k * k; i++) c.circle(r() * s, r() * s, (1 + r() * 5) * k, 74, 74, 80);
  }));""")

# --- плитка ---
rep("""  total += writePNG(A('tex/paving.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(22);
    c.fill(120, 116, 108);
    const cell = s / 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 104 + r() * 46;
      c.rect(x * cell + 3, y * cell + 3, cell - 6, cell - 6, v, v - 3, v - 12);
    }
    c.noise(160000, 0.1, r);
  }));""",
"""  total += writePNG(A('tex/paving.png'), HI, HI, makeCanvasTex(HI, (c, s) => {
    const r = seeded(22), k = s / 1024;
    c.fill(120, 116, 108);
    const cell = s / 8, j = 3 * k;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 104 + r() * 46;
      c.rect(x * cell + j, y * cell + j, cell - j * 2, cell - j * 2, v, v - 3, v - 12);
      // фаска и царапины на каждой плитке
      c.rect(x * cell + j, y * cell + j, cell - j * 2, 2 * k, v + 22, v + 18, v + 8);
      for (let n = 0; n < 6 * k; n++) {
        c.rect(x * cell + r() * cell, y * cell + r() * cell, 2 * k, 2 * k, v - 26, v - 28, v - 34);
      }
    }
    c.noise(160000 * k * k, 0.1, r);
  }));""")

# --- кирпич ---
rep("""  total += writePNG(A('tex/brick.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(33);
    c.fill(96, 56, 46);
    const bh = s / 20, bw = s / 8;
    for (let y = 0; y < 20; y++) {
      const off = (y % 2) * bw / 2;
      for (let x = -1; x < 9; x++) {
        const v = r();
        const base = v > 0.72 ? [132, 74, 58] : (v > 0.4 ? [104, 58, 46] : [118, 66, 52]);
        c.rect(x * bw + off + 3, y * bh + 3, bw - 6, bh - 6, base[0], base[1], base[2]);
      }
    }
    c.noise(200000, 0.13, r);
  }));""",
"""  total += writePNG(A('tex/brick.png'), HI, HI, makeCanvasTex(HI, (c, s) => {
    const r = seeded(33), k = s / 1024;
    c.fill(96, 56, 46);
    const bh = s / 20, bw = s / 8, j = 3 * k;
    for (let y = 0; y < 20; y++) {
      const off = (y % 2) * bw / 2;
      for (let x = -1; x < 9; x++) {
        const v = r();
        const base = v > 0.72 ? [132, 74, 58] : (v > 0.4 ? [104, 58, 46] : [118, 66, 52]);
        c.rect(x * bw + off + j, y * bh + j, bw - j * 2, bh - j * 2, base[0], base[1], base[2]);
        // потёртости и сколы на кирпиче
        for (let n = 0; n < 5 * k; n++) {
          const d = (r() - 0.5) * 34;
          c.circle(x * bw + off + r() * bw, y * bh + r() * bh, (1 + r() * 5) * k,
            Math.max(0, base[0] + d), Math.max(0, base[1] + d), Math.max(0, base[2] + d));
        }
      }
    }
    c.noise(200000 * k * k, 0.13, r);
  }));""")

# --- фасад ---
rep("""  total += writePNG(A('tex/facade.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(55);
    c.fill(142, 134, 120);
    c.noise(180000, 0.09, r);
    const cell = s / 4;
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      const x = fx * cell + cell * 0.18, y = fy * cell + cell * 0.2;
      const w = cell * 0.64, h = cell * 0.62;
      c.rect(x - 8, y - 8, w + 16, h + 16, 58, 56, 52);
      const lit = r() < 0.24;
      const glass = lit ? [255, 214, 138] : [34, 48, 60];
      c.rect(x, y, w, h, glass[0], glass[1], glass[2]);
      // блик
      for (let t = 0; t < w; t++) {
        const yy = y + h - t * (h / w);
        for (let k = 0; k < 8; k++) c.set((x + t) | 0, (yy + k) | 0,
          Math.min(255, glass[0] + 40), Math.min(255, glass[1] + 40), Math.min(255, glass[2] + 40));
      }
      c.rect(x + w / 2 - 3, y, 6, h, 88, 86, 80);
      c.rect(x, y + h / 2 - 3, w, 6, 88, 86, 80);
      c.rect(x - 12, y + h, w + 24, 10, 110, 106, 98);
    }
  }));""",
"""  total += writePNG(A('tex/facade.png'), HI, HI, makeCanvasTex(HI, (c, s) => {
    const r = seeded(55), k = s / 1024;
    c.fill(142, 134, 120);
    c.noise(180000 * k * k, 0.09, r);
    const cell = s / 4;
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      const x = fx * cell + cell * 0.18, y = fy * cell + cell * 0.2;
      const w = cell * 0.64, h = cell * 0.62;
      c.rect(x - 8 * k, y - 8 * k, w + 16 * k, h + 16 * k, 58, 56, 52);
      const lit = r() < 0.24;
      const glass = lit ? [255, 214, 138] : [34, 48, 60];
      c.rect(x, y, w, h, glass[0], glass[1], glass[2]);
      // блик
      const bw = Math.max(1, 8 * k);
      for (let t = 0; t < w; t++) {
        const yy = y + h - t * (h / w);
        for (let q = 0; q < bw; q++) c.rect((x + t) | 0, (yy + q) | 0, 1, 1,
          Math.min(255, glass[0] + 40), Math.min(255, glass[1] + 40), Math.min(255, glass[2] + 40));
      }
      c.rect(x + w / 2 - 3 * k, y, 6 * k, h, 88, 86, 80);
      c.rect(x, y + h / 2 - 3 * k, w, 6 * k, 88, 86, 80);
      c.rect(x - 12 * k, y + h, w + 24 * k, 10 * k, 110, 106, 98);
      // подтёки и грязь под окном
      for (let n = 0; n < 10 * k; n++) {
        const sx = x + r() * w;
        for (let t = 0; t < 40 * k; t++) c.rect(sx | 0, (y + h + t) | 0, Math.max(1, 2 * k), 1, 118, 110, 98);
      }
    }
  }));""")

# --- бетон, дерево, мрамор, металл, паркет, крыша: масштаб деталей ---
rep("""  total += writePNG(A('tex/concrete.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(44);
    c.fill(154, 148, 138);
    c.noise(280000, 0.14, r);
    for (let i = 0; i < 260; i++) c.circle(r() * s, r() * s, 4 + r() * 40, 122, 116, 108);
    for (let i = 0; i < 90; i++) {
      const x = r() * s, y = r() * s;
      for (let t = 0; t < 60; t++) c.set((x + t * (r() - 0.5) * 3) | 0, (y + t) | 0, 108, 102, 94);
    }
  }));""",
"""  total += writePNG(A('tex/concrete.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(44), k = s / 1024;
    c.fill(154, 148, 138);
    c.noise(280000 * k * k, 0.14, r);
    for (let i = 0; i < 260 * k * k; i++) c.circle(r() * s, r() * s, (4 + r() * 40) * k, 122, 116, 108);
    for (let i = 0; i < 90 * k * k; i++) {
      const x = r() * s, y = r() * s;
      for (let t = 0; t < 60 * k; t++) c.rect((x + t * (r() - 0.5) * 3) | 0, (y + t) | 0, Math.max(1, k), 1, 108, 102, 94);
    }
  }));""")

rep("""  total += writePNG(A('tex/wood.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(66);
    c.fill(138, 95, 56);
    for (let i = 0; i < 500; i++) {
      const y = r() * s;
      const v = 60 + r() * 90;
      for (let x = 0; x < s; x++) {
        const yy = (y + Math.sin(x * 0.02 + i) * 6) | 0;
        c.set(x, yy, v, v * 0.68, v * 0.4);
        c.set(x, yy + 1, v * 0.9, v * 0.6, v * 0.35);
      }
    }
    c.noise(120000, 0.08, r);
  }));""",
"""  total += writePNG(A('tex/wood.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(66), k = s / 1024;
    c.fill(138, 95, 56);
    for (let i = 0; i < 500 * k; i++) {
      const y = r() * s;
      const v = 60 + r() * 90;
      for (let x = 0; x < s; x++) {
        const yy = (y + Math.sin(x * 0.02 + i) * 6 * k) | 0;
        c.rect(x, yy, 1, Math.max(1, k), v, v * 0.68, v * 0.4);
        c.rect(x, yy + Math.max(1, k), 1, Math.max(1, k), v * 0.9, v * 0.6, v * 0.35);
      }
    }
    c.noise(120000 * k * k, 0.08, r);
  }));""")

rep("""  total += writePNG(A('tex/marble.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(77);
    c.fill(230, 226, 216);
    for (let i = 0; i < 120; i++) {
      let x = r() * s, y = 0;
      const g = 130 + r() * 60;
      while (y < s) {
        for (let k = -1; k <= 1; k++) c.set((x + k) | 0, y | 0, g, g - 4, g - 12);
        x += (r() - 0.5) * 12; y += 2 + r() * 4;
      }
    }
    c.noise(90000, 0.05, r);
  }));""",
"""  total += writePNG(A('tex/marble.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(77), k = s / 1024;
    c.fill(230, 226, 216);
    for (let i = 0; i < 120 * k; i++) {
      let x = r() * s, y = 0;
      const g = 130 + r() * 60;
      while (y < s) {
        for (let q = -1; q <= 1; q++) c.rect((x + q * k) | 0, y | 0, Math.max(1, k), Math.max(1, k), g, g - 4, g - 12);
        x += (r() - 0.5) * 12 * k; y += (2 + r() * 4) * k;
      }
    }
    c.noise(90000 * k * k, 0.05, r);
  }));""")

rep("""  total += writePNG(A('tex/metal.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(88);
    c.fill(96, 102, 110);
    for (let y = 0; y < s; y += 10) {
      const v = 84 + r() * 34;
      c.rect(0, y, s, 3, v, v + 4, v + 8);
    }
    for (let i = 0; i < 700; i++) c.circle(r() * s, r() * s, 1 + r() * 3, 70, 76, 84);
    c.noise(160000, 0.1, r);
  }));""",
"""  total += writePNG(A('tex/metal.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(88), k = s / 1024;
    c.fill(96, 102, 110);
    for (let y = 0; y < s; y += 10 * k) {
      const v = 84 + r() * 34;
      c.rect(0, y, s, 3 * k, v, v + 4, v + 8);
    }
    for (let i = 0; i < 700 * k * k; i++) c.circle(r() * s, r() * s, (1 + r() * 3) * k, 70, 76, 84);
    // заклёпки по углам листов
    for (let y = 12 * k; y < s; y += 40 * k) for (let x = 12 * k; x < s; x += 40 * k) {
      c.circle(x, y, 2 * k, 128, 134, 142);
    }
    c.noise(160000 * k * k, 0.1, r);
  }));""")

rep("""  total += writePNG(A('tex/parquet.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(99);
    c.fill(122, 83, 48);
    const cell = s / 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 108 + r() * 60;
      c.rect(x * cell + 2, y * cell + 2, cell - 4, cell - 4, v, v * 0.66, v * 0.38);
      for (let k = 0; k < 12; k++) {
        const yy = y * cell + 4 + r() * (cell - 8);
        c.rect(x * cell + 4, yy, cell - 8, 1, v * 0.85, v * 0.55, v * 0.3);
      }
    }
    c.noise(90000, 0.06, r);
  }));""",
"""  total += writePNG(A('tex/parquet.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(99), k = s / 1024;
    c.fill(122, 83, 48);
    const cell = s / 8, j = 2 * k;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 108 + r() * 60;
      c.rect(x * cell + j, y * cell + j, cell - j * 2, cell - j * 2, v, v * 0.66, v * 0.38);
      for (let q = 0; q < 12 * k; q++) {
        const yy = y * cell + 4 * k + r() * (cell - 8 * k);
        c.rect(x * cell + 4 * k, yy, cell - 8 * k, Math.max(1, k), v * 0.85, v * 0.55, v * 0.3);
      }
    }
    c.noise(90000 * k * k, 0.06, r);
  }));""")

rep("""  total += writePNG(A('tex/roof.png'), S, S, makeCanvasTex(S, (c, s) => {
    const r = seeded(111);
    c.fill(74, 78, 85);
    for (let x = 0; x < s; x += 32) c.rect(x, 0, 4, s, 52, 55, 60);
    for (let y = 0; y < s; y += 96) c.rect(0, y, s, 3, 62, 66, 72);
    c.noise(140000, 0.1, r);
    for (let i = 0; i < 240; i++) c.circle(r() * s, r() * s, 2 + r() * 8, 96, 82, 66);
  }));""",
"""  total += writePNG(A('tex/roof.png'), BASE, BASE, makeCanvasTex(BASE, (c, s) => {
    const r = seeded(111), k = s / 1024;
    c.fill(74, 78, 85);
    for (let x = 0; x < s; x += 32 * k) c.rect(x, 0, 4 * k, s, 52, 55, 60);
    for (let y = 0; y < s; y += 96 * k) c.rect(0, y, s, 3 * k, 62, 66, 72);
    c.noise(140000 * k * k, 0.1, r);
    for (let i = 0; i < 240 * k * k; i++) c.circle(r() * s, r() * s, (2 + r() * 8) * k, 96, 82, 66);
  }));""")

open(p, 'w', encoding='utf-8').write(s)
print('textures patched: 4 x 2048, 6 x 1024, carpet 512')
