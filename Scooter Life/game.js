'use strict';
/* =====================================================================
   SCOOTER LIFE — 2D трюковая игра на электросамокатах (HTML5 Canvas)
   Управление: → газ, ← тормоз/назад, ↑ наклон назад, ↓ наклон вперёд
   ===================================================================== */
(() => {

// ---------- Константы ----------
const C = 56;            // высота центра масс над осью колёс (px)
const GRAV = 1500;       // гравитация px/s²
const STEP = 8;          // шаг карты высот (px)
const PPM = 50;          // пикселей в метре
const FIXED = 1 / 240;   // фиксированный шаг физики
const VIEW_H = 720;      // высота видимого мира (юниты)
const CP_DIST = 2500;    // расстояние между чекпоинтами (px)
const MAX_LVL = 5;

// Самокаты. Меняй названия/цифры здесь — баланс настраивается легко.
const SCOOTERS = [
  // Внешний вид: rim — доля диска в колесе (меньше = толще покрышка), shocks — число пружинных амортизаторов,
  // twin — двойная стойка, pods — батарейные блоки на деке, glow — подсветка деки, fender — крыло,
  // stripe — гоночная полоса на деке, rack — задний багажник с кофром (флаги можно не указывать).
  // Модели идут в порядке цены; в гараже по 4 штуки на страницу.
  { id: 'spark',   name: 'Spark',   desc: 'Лёгкий и юркий городской самокат. Вилли даётся проще всего.',      price: 0,    color: '#2fa4ff', L: 92,  r: 17, power: 720,  maxSpeed: 620,  brake: 900,  lean: 19,   inertia: 0.85, rim: 0.64, shocks: 0, fender: true },
  { id: 'dash',    name: 'Dash',    desc: 'Компактный малыш на маленьких колёсах. Очень отзывчивый.',          price: 400,  color: '#ffe14a', L: 86,  r: 16, power: 640,  maxSpeed: 560,  brake: 850,  lean: 21,   inertia: 0.78, rim: 0.70, shocks: 0, fender: true,  stripe: true },
  { id: 'rover',   name: 'Rover',   desc: 'Золотая середина: разгон и управляемость, передняя пружина.',       price: 700,  color: '#ff9f1a', L: 100, r: 19, power: 950,  maxSpeed: 760,  brake: 1000, lean: 17,   inertia: 0.95, rim: 0.58, shocks: 1, fender: true },
  { id: 'comet',   name: 'Comet',   desc: 'Спортивный и быстрый, с подсветкой деки. Любит скорость.',          price: 1400, color: '#00d4c8', L: 104, r: 19, power: 1100, maxSpeed: 840,  brake: 1050, lean: 17.5, inertia: 1.0,  rim: 0.56, shocks: 1, glow: true,    stripe: true },
  { id: 'bison',   name: 'Bison',   desc: 'Тяжёлый вездеход на толстой резине. Любит большие прыжки.',         price: 2200, color: '#34d27b', L: 112, r: 21, power: 1300, maxSpeed: 920,  brake: 1100, lean: 15,   inertia: 1.15, rim: 0.50, shocks: 2, pods: true },
  { id: 'ranger',  name: 'Ranger',  desc: 'Внедорожник с багажником и мощными амортизаторами.',                price: 3200, color: '#d9a441', L: 116, r: 22, power: 1500, maxSpeed: 980,  brake: 1150, lean: 14.5, inertia: 1.25, rim: 0.48, shocks: 2, pods: true,  fender: true, rack: true },
  { id: 'titan',   name: 'Titan',   desc: 'Двойная стойка, огромная мощь и скорость. Нужна рука.',             price: 5000, color: '#ff3b5c', L: 120, r: 23, power: 1750, maxSpeed: 1120, brake: 1200, lean: 13.5, inertia: 1.35, rim: 0.46, shocks: 2, twin: true,  pods: true, glow: true },
  { id: 'phantom', name: 'Phantom', desc: 'Топовый гиперсамокат: двойная стойка, полоса и неон. Для мастеров.', price: 8000, color: '#a06bff', L: 126, r: 24, power: 2100, maxSpeed: 1250, brake: 1300, lean: 13,   inertia: 1.45, rim: 0.44, shocks: 2, twin: true,  pods: true, glow: true,  stripe: true },
];

// Трассы. wild — бесконечный склон с трамплинами, flat — идеально ровная площадка для вилли и стоппи.
const TRACKS = [
  { id: 'wild', name: 'Дикий склон',    desc: 'Холмы, кочки и трамплины. Бесконечная трасса, сложность растёт.' },
  { id: 'flat', name: 'Стант-площадка', desc: 'Идеально ровный асфальт. Тренируй вилли, стоппи и баланс.' },
];

// ---------- Сохранение ----------
const SAVE_KEY = 'scooter-life-save-v1';
const save = loadSave();
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.owned && s.owned.spark) {                 // старые сохранения с другими id сбрасываются
      s.power = s.power || {};
      s.bests = s.bests || { wild: s.best || 0, flat: 0 };
      s.track = TRACKS.some(t => t.id === s.track) ? s.track : 'wild';
      return s;
    }
  } catch (e) {}
  return { cash: 0, owned: { spark: true }, selected: 'spark', power: {}, bests: { wild: 0, flat: 0 }, track: 'wild' };
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const getBest = () => save.bests[save.track] || 0;
function updateBest(m) { if (m > getBest()) save.bests[save.track] = m; }

function curStats() {
  const base = SCOOTERS.find(s => s.id === save.selected) || SCOOTERS[0];
  const lvl = save.power[base.id] || 0;
  return Object.assign({}, base, { P: base.power * (1 + 0.12 * lvl), k: 320, cd: 30 });
}

// ---------- Canvas ----------
const cv = document.getElementById('game');
const mainCtx = cv.getContext('2d');
let ctx = mainCtx;          // на время рисования гаража временно подменяется
let S = 1, viewW = 1280;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.floor(innerWidth * dpr);
  cv.height = Math.floor(innerHeight * dpr);
  S = cv.height / VIEW_H;
  viewW = cv.width / S;
}
addEventListener('resize', resize);
resize();

// ---------- Ввод ----------
const keys = new Set();
const touch = { gas: false, back: false, up: false, down: false };
const input = { gas: false, back: false, up: false, down: false };
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

addEventListener('keydown', e => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyR' && state !== 'menu') startRun();
  if (e.code === 'Escape' && state !== 'menu') openMenu();
  if (e.code === 'KeyP') togglePause();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('is-touch');
document.querySelectorAll('#touch button').forEach(btn => {
  const k = btn.dataset.k;
  const on = e => { e.preventDefault(); touch[k] = true; };
  const off = e => { e.preventDefault(); touch[k] = false; };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
});

function readInput() {
  input.gas  = keys.has('ArrowRight') || keys.has('KeyD') || touch.gas;
  input.back = keys.has('ArrowLeft')  || keys.has('KeyA') || touch.back;
  input.up   = keys.has('ArrowUp')    || keys.has('KeyW') || touch.up;
  input.down = keys.has('ArrowDown')  || keys.has('KeyS') || touch.down;
}

// ---------- Трасса ----------
const terrain = { startX: -800, ys: [], endX: 0, coins: [] };
let trackId = save.track;                          // трасса текущего заезда
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = t => t * t * (3 - 2 * t);

function terrInit() {
  terrain.ys = [];
  terrain.coins = [];
  const n = Math.ceil(1600 / STEP);
  for (let i = 0; i <= n; i++) terrain.ys.push(0);
  terrain.endX = terrain.startX + n * STEP;
}
function addSeg(len, f) {
  const ys = terrain.ys;
  const y0 = ys[ys.length - 1];
  const n = Math.max(1, Math.round(len / STEP));
  for (let i = 1; i <= n; i++) ys.push(y0 + f(i / n));
  terrain.endX = terrain.startX + (ys.length - 1) * STEP;
}
function hAt(x) {
  const ys = terrain.ys;
  const f = (x - terrain.startX) / STEP;
  if (f <= 0) return ys[0];
  const i = Math.floor(f);
  if (i >= ys.length - 1) return ys[ys.length - 1];
  const t = f - i;
  return ys[i] * (1 - t) + ys[i + 1] * t;
}
function slopeAt(x) { return (hAt(x + 6) - hAt(x - 6)) / 12; }

function genChunk() {
  const x0 = terrain.endX;
  const lastY = terrain.ys[terrain.ys.length - 1];
  const d = Math.min(1, Math.max(0, x0) / 45000); // сложность 0..1

  if (trackId === 'flat') {                        // стант-площадка: только ровный асфальт
    addSeg(800, () => 0);
    placeCoins(x0, terrain.endX);
    return;
  }

  if (lastY > 220 || lastY < -220) {              // вернуть трассу к базовой высоте
    const dy = -lastY + rand(-30, 30);
    addSeg(Math.min(1600, Math.max(700, Math.abs(dy) * 3)), t => dy * smooth(t));
    placeCoins(x0, terrain.endX);
    return;
  }
  const r = Math.random();
  if (r < 0.18) {                                  // ровный участок
    addSeg(rand(300, 600), () => 0);
  } else if (r < 0.40) {                           // холм
    const amp = rand(40, 90 + 80 * d), len = rand(500, 900);
    addSeg(len, t => -amp * (1 - Math.cos(2 * Math.PI * t)) / 2);
  } else if (r < 0.60) {                           // кочки
    const n = 3 + Math.floor(rand(0, 4 + 3 * d)), h = rand(12, 20 + 10 * d);
    for (let i = 0; i < n; i++) addSeg(70, t => -h * (1 - Math.cos(2 * Math.PI * t)) / 2);
    addSeg(200, () => 0);
  } else if (r < 0.88) {                           // трамплин
    const rise = rand(40, 70 + 40 * d), rl = rand(170, 210);
    addSeg(300, () => 0);
    addSeg(rl, t => -rise * t * t);
    const drop = rise * rand(1.3, 2.3);
    addSeg(drop * 3.6, t => (rise + drop) * smooth(t) * 0.5 + (rise + drop) * t * 0.5);
    addSeg(250, () => 0);
  } else {                                         // большой холм
    const amp = rand(120, 200), len = rand(1100, 1600);
    addSeg(len, t => -amp * (1 - Math.cos(2 * Math.PI * t)) / 2);
  }
  placeCoins(x0, terrain.endX);
}
function placeCoins(x0, x1) {
  if (Math.random() > 0.65 || x0 < 600) return;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (i + 1) / (n + 1);
    terrain.coins.push({ x, y: hAt(x) - 75 - Math.sin(i / (n - 1) * Math.PI) * 35, taken: false });
  }
}
function terrEnsure(x) { while (terrain.endX < x) genChunk(); }

// ---------- Состояние игры ----------
let state = 'menu';      // menu | play | crash | pause
let prevState = 'play';
let started = false;
let cur = curStats();
let bike = null, rider = null;
let score = 0, cpX = 0, crashTimer = 0, runTime = 0;
let combo = null, comboGap = 0;
let msg = { text: '', t: 0, color: '#fff' };
const cam = { x: 0, y: 0 };
let hintT = 0;

const normAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const showMsg = (text, color = '#fff') => { msg = { text, t: 2.2, color }; };

function spawn(x) {
  const g = hAt(x);
  bike = {
    x, y: g - C - cur.r - 4, a: Math.atan(slopeAt(x)),
    vx: 0, vy: 0, w: 0,
    rearOn: true, frontOn: true, wr: 0,
    airRot: 0, airT: 0, lean: 0,
  };
  rider = null;
  combo = null;
}

function startRun() {
  cur = curStats();
  trackId = save.track;
  terrInit();
  terrEnsure(4000);
  score = 0; cpX = 0; runTime = 0; hintT = 9;
  spawn(0);
  state = 'play';
  cam.x = bike.x - viewW * 0.33; cam.y = bike.y - VIEW_H * 0.55;
  hideMenu();
  started = true;
}
function respawn() {
  spawn(cpX);
  state = 'play';
  showMsg('Поехали дальше!', '#8ef');
}
function togglePause() {
  if (state === 'play' || state === 'crash') { prevState = state; state = 'pause'; }
  else if (state === 'pause') state = prevState;
}

function crash(reason) {
  if (state !== 'play') return;
  state = 'crash';
  crashTimer = 1.6;
  combo = null;
  showMsg(reason, '#ff5252');
  const b = bike;
  rider = { x: b.x, y: b.y - 30, vx: b.vx * 0.9 + 80, vy: b.vy - 350, rot: b.a, vr: rand(-6, 6) };
  updateBest(Math.floor(Math.max(0, b.x) / PPM));
  persist();
}

function bank(pts, label) {
  score += pts;
  save.cash += Math.floor(pts / 8);
  showMsg(label + '  +' + pts, '#ffd54a');
}
function endCombo() {
  if (combo && combo.t >= 0.8) {
    const name = combo.type === 'wheelie' ? 'ВИЛЛИ' : 'СТОППИ';
    bank(Math.round(combo.t * 120), name + ' ' + combo.t.toFixed(1) + 'с');
  }
  combo = null;
}

// ---------- Физика ----------
function physics(dt, ctl) {
  const b = bike, sc = cur;
  const c = Math.cos(b.a), s = Math.sin(b.a);
  let ax = 0, ay = GRAV, al = 0;
  const I = sc.inertia * (sc.L * sc.L * 0.25 + C * C);
  const wheels = [{ lx: -sc.L / 2, rear: true }, { lx: sc.L / 2, rear: false }];

  for (const wh of wheels) {
    const lx = wh.lx, ly = C;
    const rx = lx * c - ly * s, ry = lx * s + ly * c;
    const wx = b.x + rx, wy = b.y + ry;
    const pen = wy + sc.r - hAt(wx);
    wh.on = false;
    if (pen > 0) {
      const sl = slopeAt(wx), len = Math.hypot(1, sl);
      const nx = sl / len, ny = -1 / len, tx = 1 / len, ty = sl / len;
      const vx = b.vx - b.w * ry, vy = b.vy + b.w * rx;
      const vn = vx * nx + vy * ny, vt = vx * tx + vy * ty;

      let Fn = sc.k * pen - sc.cd * vn;
      if (Fn < 0) Fn = 0;

      let Ft = -vt * 0.06;                                   // сопротивление качению
      if (ctl.gas && wh.rear) Ft += sc.P * Math.max(0, 1 - vt / sc.maxSpeed);
      if (ctl.back) {
        if (vt > 25) Ft -= sc.brake * (wh.rear ? 0.6 : 0.4) * Math.min(1, vt / 60);
        else if (wh.rear && vt > -160) Ft -= sc.P * 0.3;     // задний ход
      }

      const Fx = Fn * nx + Ft * tx, Fy = Fn * ny + Ft * ty;
      ax += Fx; ay += Fy;
      al += (rx * Fy - ry * Fx) / I;

      const maxPen = sc.r * 1.0;                             // жёсткий отбойник подвески
      if (pen > maxPen) {
        const k = pen - maxPen;
        b.x += nx * k; b.y += ny * k;
        if (vn < 0) { b.vx -= vn * nx; b.vy -= vn * ny; }
      }
      wh.on = true;
    }
  }

  const contacts = (wheels[0].on ? 1 : 0) + (wheels[1].on ? 1 : 0);
  const lean = (ctl.down ? 1 : 0) - (ctl.up ? 1 : 0);        // вверх = нос вверх (отрицательный угол)
  al += lean * sc.lean;
  al -= b.w * (contacts ? 1.5 : 0.35);
  ax -= b.vx * 0.03; ay -= b.vy * 0.01;

  b.vx += ax * dt; b.vy += ay * dt;
  b.w = Math.max(-14, Math.min(14, b.w + al * dt));
  b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;

  b.prevRear = b.rearOn; b.prevFront = b.frontOn;
  b.rearOn = wheels[0].on; b.frontOn = wheels[1].on;
  b.wr += (b.vx / sc.r) * dt;
  b.lean += (lean - b.lean) * Math.min(1, dt * 10);
}

function gameLogic(dt) {
  const b = bike, sc = cur;
  runTime += dt;

  // Голова коснулась земли → авария
  const cs = Math.cos(b.a), sn = Math.sin(b.a);
  const hx = b.x + 4 * cs + 60 * sn, hy = b.y + 4 * sn - 60 * cs;
  if (hy + 8 > hAt(hx)) { crash('АВАРИЯ'); return; }

  const wasAir = !(b.prevRear || b.prevFront);
  const onGround = b.rearOn || b.frontOn;
  const ga = Math.atan(slopeAt(b.x));
  const rel = normAngle(b.a - ga);

  if (!onGround) {
    b.airRot += b.w * dt;
    b.airT += dt;
  } else if (wasAir) {                                       // приземление
    if (Math.abs(rel) > 1.2) { crash('НЕУДАЧНОЕ ПРИЗЕМЛЕНИЕ'); return; }
    const flips = Math.floor(Math.abs(b.airRot) / (2 * Math.PI) + 0.2);
    if (flips >= 1) {
      const back = b.airRot < 0;
      const name = (flips > 1 ? flips + 'x ' : '') + (back ? 'БЭКФЛИП' : 'ФРОНТФЛИП');
      bank(500 * flips * flips, name);
    } else if (b.airT > 1.0) {
      bank(Math.round(b.airT * 80), 'ПРЫЖОК ' + b.airT.toFixed(1) + 'с');
    }
    b.airRot = 0; b.airT = 0;
  }

  // Вилли / стоппи
  let type = null;
  if (b.rearOn && !b.frontOn && rel < -0.3 && rel > -1.65) type = 'wheelie';
  else if (b.frontOn && !b.rearOn && rel > 0.3 && rel < 1.5) type = 'stoppie';
  if (type) {
    comboGap = 0;
    if (combo && combo.type === type) combo.t += dt;
    else { endCombo(); combo = { type, t: dt }; }
  } else if (combo) {
    comboGap += dt;
    if (comboGap > 0.15) endCombo();
  }

  // Монеты
  for (const co of terrain.coins) {
    if (co.taken || Math.abs(co.x - b.x) > 60) continue;
    if (Math.hypot(co.x - b.x, co.y - b.y) < 50) { co.taken = true; save.cash += 10; score += 10; }
  }

  // Чекпоинты и рекорд
  if (b.x > cpX + CP_DIST) {
    cpX = Math.floor(b.x / CP_DIST) * CP_DIST;
    showMsg('ЧЕКПОИНТ  ' + Math.floor(cpX / PPM) + ' м', '#8ef');
    persist();
  }
  updateBest(Math.floor(Math.max(0, b.x) / PPM));
}

function simStep(dt) {
  terrEnsure(bike.x + 2500);
  if (state === 'play') {
    physics(dt, input);
    if (state === 'play') gameLogic(dt);
  } else if (state === 'crash') {
    physics(dt, { gas: false, back: false, up: false, down: false });
    if (rider) {
      rider.vy += GRAV * dt; rider.x += rider.vx * dt; rider.y += rider.vy * dt; rider.rot += rider.vr * dt;
      const g = hAt(rider.x);
      if (rider.y + 12 > g) { rider.y = g - 12; rider.vy *= -0.25; rider.vx *= 0.9; rider.vr *= 0.9; }
    }
    crashTimer -= dt;
    if (crashTimer <= 0) respawn();
  }
}

// ---------- Отрисовка ----------
function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function line(pts, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

function drawWheel(x, y, r, rot, rim = 0.58) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = '#15171c'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  if (rim < 0.55) {                                       // протектор на толстых покрышках
    ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
    }
  }
  ctx.fillStyle = '#9aa3b5'; ctx.beginPath(); ctx.arc(0, 0, r * rim, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a2e38'; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2a2e38'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath(); ctx.moveTo(-r * 0.55, 0); ctx.lineTo(r * 0.55, 0); ctx.stroke();
  }
  ctx.restore();
}

// Рисует самокат без райдера. Начало координат — центр масс, ось колёс на высоте C.
// Возвращает высоту деки (нужна для позы райдера).
function drawScooter(sc, wr) {
  const L = sc.L, r = sc.r;

  // подсветка деки (у самых мощных моделей)
  if (sc.glow) {
    ctx.save(); ctx.shadowColor = sc.color; ctx.shadowBlur = 14;
    ctx.fillStyle = sc.color; ctx.fillRect(-L / 2 + 6, C - 3, L - 34, 2);
    ctx.restore();
  }

  drawWheel(-L / 2, C, r, wr, sc.rim);
  drawWheel(L / 2, C, r, wr, sc.rim);

  // крыло
  if (sc.fender) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-L / 2, C, r + 3, Math.PI * 1.05, Math.PI * 1.85); ctx.stroke();
    if (sc.shocks === 1) { ctx.beginPath(); ctx.arc(L / 2, C, r + 3, Math.PI * 1.2, Math.PI * 1.9); ctx.stroke(); }
  }

  // дека
  const deckH = sc.pods ? 13 : 9;
  ctx.fillStyle = sc.color; rr(-L / 2 - 6, C - 4 - deckH, L - 16, deckH, 4); ctx.fill();
  ctx.fillStyle = '#111'; rr(-L / 2 + 6, C - 6 - deckH, L - 44, 3, 1); ctx.fill();      // грип-лента
  if (sc.pods) {                                                                       // батарейные блоки
    ctx.fillStyle = '#20242e'; rr(-L / 2 + 10, C - 3, L - 44, 6, 3); ctx.fill();
  }
  if (sc.stripe) {                                                                     // гоночная полоса
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillRect(-L / 2 - 2, C - 4 - deckH / 2 - 1, L - 28, 2);
  }
  if (sc.rack) {                                                                       // багажник с кофром
    line([[-L / 2 - 4, C - 4 - deckH], [-L / 2 - 4, C - 36]], '#2a2e38', 3);
    line([[-L / 2 + 16, C - 4 - deckH], [-L / 2 + 16, C - 36]], '#2a2e38', 3);
    ctx.fillStyle = '#2a2e38'; rr(-L / 2 - 12, C - 39, 36, 4, 2); ctx.fill();
    ctx.fillStyle = sc.color; rr(-L / 2 - 10, C - 57, 30, 18, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-L / 2 - 10, C - 49, 30, 2);
  }
  // задний фонарь
  ctx.fillStyle = '#ff2a2a'; ctx.fillRect(-L / 2 - 8, C - 10, 3, 4);

  // стойка(и) и руль
  const stemCol = '#2a2e38';
  const sx0 = L / 2 - 6, sx1 = L / 2 - 16, sy0 = C - 4 - deckH, sy1 = C - 96;
  line([[sx0, sy0], [sx1, sy1]], stemCol, sc.twin ? 4 : 6);
  if (sc.twin) {
    line([[sx0 + 7, sy0 + 2], [sx1 + 5, sy1 + 4]], stemCol, 4);               // вторая стойка
    line([[sx0 + 1, sy0 - 28], [sx0 + 8, sy0 - 26]], sc.color, 3);          // перемычка
  }
  // вилка и амортизаторы
  line([[L / 2 - 4, C - 6], [L / 2 + 1, C]], stemCol, 5);
  if (sc.shocks >= 1) {
    ctx.strokeStyle = sc.color; ctx.lineWidth = 3;
    for (let k = 0; k < sc.shocks; k++) {
      const ox = -k * 6;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const px = L / 2 - 4 + ox - t * 8 + (i % 2 ? 3 : -3) * (i === 0 || i === 6 ? 0 : 1);
        const py = C - 8 - t * 34;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  // руль
  line([[sx1, sy1], [L / 2 - 8, C - 98]], '#111', 6);
  ctx.fillStyle = sc.color; ctx.beginPath(); ctx.arc(L / 2 - 16, C - 100, 4, 0, 7); ctx.fill();
  // фара
  ctx.fillStyle = '#fff6c9'; ctx.beginPath(); ctx.arc(L / 2 - 2, C - 84, sc.twin ? 4.5 : 3.5, 0, 7); ctx.fill();
  return deckH;
}

function drawBike() {
  const b = bike, sc = cur, L = sc.L;
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
  const deckH = drawScooter(sc, b.wr);

  // райдер
  if (state !== 'crash') {
    const ln = b.lean;
    const hip = [-4 - ln * 3, -6];
    const sh = [4 + ln * 9, -46];
    const hand = [L / 2 - 14, C - 98];
    const elb = [(sh[0] + hand[0]) / 2, (sh[1] + hand[1]) / 2 + 9];
    line([[-14, C - deckH - 6], [-2 - ln * 2, 20], hip], '#2b3350', 8);
    line([[14, C - deckH - 6], [14 + ln * 3, 18], hip], '#363f63', 8);
    line([hip, sh], '#e8e8ee', 11);
    line([sh, elb, hand], '#e8e8ee', 6);
    const hd = [sh[0] + 4, sh[1] - 15];
    ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(hd[0], hd[1], 9, 0, 7); ctx.fill();
    ctx.fillStyle = sc.color; ctx.beginPath(); ctx.arc(hd[0], hd[1] - 1, 10, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(hd[0] + 3, hd[1] - 3, 8, 3);
  }
  ctx.restore();
}

function drawRider() {
  if (!rider) return;
  ctx.save(); ctx.translate(rider.x, rider.y); ctx.rotate(rider.rot);
  line([[0, -4], [0, 16]], '#e8e8ee', 11);
  line([[0, 16], [-8, 30]], '#2b3350', 8);
  line([[0, 16], [9, 28]], '#363f63', 8);
  line([[0, -2], [-12, 8]], '#e8e8ee', 6);
  line([[0, -2], [12, 6]], '#e8e8ee', 6);
  ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(0, -16, 9, 0, 7); ctx.fill();
  ctx.fillStyle = cur.color; ctx.beginPath(); ctx.arc(0, -17, 10, Math.PI, 0); ctx.fill();
  ctx.restore();
}

const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function drawBackground() {
  const t = performance.now() / 1000;
  ctx.setTransform(S, 0, 0, S, 0, 0);

  // небо — закат
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#1b1846'); g.addColorStop(0.32, '#5b2a7a'); g.addColorStop(0.58, '#d94f6a');
  g.addColorStop(0.80, '#ff9650'); g.addColorStop(1, '#ffd47c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, viewW, VIEW_H);

  // звёзды в верхней части неба
  for (let i = 0; i < 45; i++) {
    const sx = hash(i) * viewW, sy = hash(i + 99) * VIEW_H * 0.38;
    ctx.fillStyle = 'rgba(255,240,255,' + (0.25 + 0.35 * Math.abs(Math.sin(t * 1.3 + i))) + ')';
    ctx.fillRect(sx, sy, 2, 2);
  }

  // солнце и свечение
  const sunX = viewW * 0.72, sunY = 455 - cam.y * 0.03;
  const glow = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 420);
  glow.addColorStop(0, 'rgba(255,200,120,.65)'); glow.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, viewW, VIEW_H);
  const disc = ctx.createLinearGradient(0, sunY - 70, 0, sunY + 70);
  disc.addColorStop(0, '#fff3c4'); disc.addColorStop(1, '#ff9d5c');
  ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(sunX, sunY, 70, 0, 7); ctx.fill();

  // вытянутые облака
  for (let k = 0; k < 6; k++) {
    const span = viewW + 500;
    const cx = (((k * 330 - cam.x * 0.05 - t * 6) % span) + span) % span - 250;
    const cy = 90 + k * 52;
    ctx.fillStyle = 'rgba(255,175,160,' + (0.22 + 0.04 * (k % 3)) + ')';
    ctx.beginPath(); ctx.ellipse(cx, cy, 170 - k * 8, 13, 0, 0, 7); ctx.fill();
  }

  // слои гор и (на стант-площадке) силуэт города
  const flat = trackId === 'flat';
  const layers = [
    { p: 0.10, base: 470, amp: 90, f: 0.0035, col: '#6b2f6e' },
    { p: 0.22, base: 545, amp: 70, f: 0.0055, col: '#4a2360' },
    { p: 0.40, base: 615, amp: 50, f: 0.0085, col: '#2f1a4a' },
  ];
  layers.forEach((l, k) => {
    if (flat && k === 1) { drawSkyline(l.p, '#3d1f58'); return; }
    ctx.fillStyle = l.col; ctx.beginPath(); ctx.moveTo(0, VIEW_H + 20);
    for (let sx = 0; sx <= viewW + 20; sx += 20) {
      const wx = sx + cam.x * l.p;
      const y = l.base + Math.sin(wx * l.f + k * 2) * l.amp + Math.sin(wx * l.f * 2.7) * l.amp * 0.3 - cam.y * l.p * 0.25;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(viewW + 20, VIEW_H + 20); ctx.fill();
  });
}

function drawSkyline(p, col) {
  const cw = 70, off = cam.x * p, base = Math.round(600 - cam.y * p * 0.25);
  const first = Math.floor(off / cw);
  for (let i = first; i * cw - off < viewW + cw; i++) {
    const h = Math.round(90 + hash(i) * 190), w = Math.round(cw - 6 + hash(i + 7) * 20);
    const x = Math.round(i * cw - off);                              // целые координаты — без дрожания окон
    ctx.fillStyle = col; ctx.fillRect(x, base - h, w, h + 200);
    ctx.fillStyle = 'rgba(255,205,120,.55)';                         // светящиеся окна
    // какие окна горят, зависит только от номера здания, этажа и колонки —
    // не от экранных координат, поэтому при движении камеры ничего не мигает
    for (let row = 0, wy = base - h + 12; wy < base - 8; wy += 22, row++)
      for (let col2 = 0, wx = x + 8; wx < x + w - 10; wx += 16, col2++)
        if (hash(i * 101 + row * 7 + col2 * 13) > 0.62) ctx.fillRect(Math.round(wx), Math.round(wy), 6, 9);
  }
}

function drawTerrain() {
  const x0 = Math.floor((cam.x - 40) / STEP) * STEP, x1 = cam.x + viewW + 40;
  const bottom = cam.y + VIEW_H + 200;
  const flat = trackId === 'flat';
  const pal = flat
    ? { top: '#4a3a5c', deep: '#352a45', edge: '#b9a5d6', hi: 'rgba(255,200,150,.45)' }      // асфальт
    : { top: '#6a3b3a', deep: '#4b2a31', edge: '#9bb04a', hi: 'rgba(255,210,140,.55)' };    // земля и трава

  ctx.beginPath(); ctx.moveTo(x0, hAt(x0));
  for (let x = x0; x <= x1; x += STEP) ctx.lineTo(x, hAt(x));
  ctx.lineTo(x1, bottom); ctx.lineTo(x0, bottom); ctx.closePath();
  ctx.fillStyle = pal.top; ctx.fill();

  ctx.beginPath(); ctx.moveTo(x0, hAt(x0) + 26);
  for (let x = x0; x <= x1; x += STEP) ctx.lineTo(x, hAt(x) + 26);
  ctx.lineTo(x1, bottom); ctx.lineTo(x0, bottom); ctx.closePath();
  ctx.fillStyle = pal.deep; ctx.fill();

  ctx.beginPath(); ctx.moveTo(x0, hAt(x0));
  for (let x = x0; x <= x1; x += STEP) ctx.lineTo(x, hAt(x));
  ctx.strokeStyle = pal.edge; ctx.lineWidth = flat ? 6 : 9; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, hAt(x0) - 3);                      // тёплый блик заката на кромке
  for (let x = x0; x <= x1; x += STEP) ctx.lineTo(x, hAt(x) - 3);
  ctx.strokeStyle = pal.hi; ctx.lineWidth = 2; ctx.stroke();

  if (flat) {                                                        // разметка на асфальте
    ctx.save();
    ctx.setLineDash([46, 34]);
    ctx.strokeStyle = 'rgba(255,214,90,.8)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x0, hAt(x0) + 18); ctx.lineTo(x1, hAt(x1) + 18); ctx.stroke();
    ctx.restore();
  }

  // чекпоинты
  for (let cx = Math.max(0, Math.ceil((cam.x - 100) / CP_DIST)) * CP_DIST; cx < x1; cx += CP_DIST) {
    const gy = hAt(cx);
    line([[cx, gy], [cx, gy - 110]], '#ddd', 4);
    ctx.fillStyle = cx <= cpX ? '#34d27b' : '#ff9f1a';
    ctx.beginPath(); ctx.moveTo(cx, gy - 110); ctx.lineTo(cx + 46, gy - 96); ctx.lineTo(cx, gy - 82); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 16px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(Math.floor(cx / PPM) + ' м', cx, gy - 120);
  }
}

function drawCoins() {
  const t = performance.now() / 1000;
  for (const co of terrain.coins) {
    if (co.taken || co.x < cam.x - 50 || co.x > cam.x + viewW + 50) continue;
    const w = Math.abs(Math.cos(t * 3 + co.x * 0.01));
    ctx.fillStyle = '#ffcf33'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(co.x, co.y, 4 + 9 * w, 13, 0, 0, 7); ctx.fill(); ctx.stroke();
  }
}

function text(str, x, y, size, color, align = 'left', weight = 800) {
  ctx.font = weight + ' ' + size + 'px system-ui, sans-serif';
  ctx.textAlign = align; ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function drawHUD(dt) {
  const b = bike;
  const kmh = Math.round(Math.hypot(b.vx, b.vy) / PPM * 3.6);
  text(kmh + ' км/ч', 24, 52, 40, '#fff');
  text(Math.floor(Math.max(0, b.x) / PPM) + ' м', 24, 86, 22, '#dfe9ff', 'left', 700);
  text(cur.name, 24, 114, 18, cur.color, 'left', 800);

  text('ОЧКИ ' + score, viewW - 24, 44, 28, '#fff', 'right');
  text('💰 ' + save.cash, viewW - 24, 76, 22, '#ffd54a', 'right', 700);
  text('рекорд ' + (save.bests[trackId] || 0) + ' м', viewW - 24, 102, 18, '#ffe2c0', 'right', 700);

  if (combo && combo.t > 0.3) {
    const name = combo.type === 'wheelie' ? 'ВИЛЛИ' : 'СТОППИ';
    text(name + ' ' + combo.t.toFixed(1) + 'с  (+' + Math.round(combo.t * 120) + ')', viewW / 2, 150, 34, '#ffd54a', 'center');
  }
  if (msg.t > 0) {
    msg.t -= dt;
    ctx.globalAlpha = Math.min(1, msg.t * 2);
    text(msg.text, viewW / 2, 100, 36, msg.color, 'center');
    ctx.globalAlpha = 1;
  }
  if (hintT > 0 && state === 'play') {
    hintT -= dt;
    ctx.globalAlpha = Math.min(1, hintT);
    text('→ газ   ← тормоз   ↑ вилли (наклон назад)   ↓ наклон вперёд   R рестарт   Esc гараж', viewW / 2, VIEW_H - 30, 20, '#fff', 'center', 700);
    ctx.globalAlpha = 1;
  }
  if (state === 'pause') {
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, viewW, VIEW_H);
    text('ПАУЗА', viewW / 2, VIEW_H / 2, 64, '#fff', 'center');
    text('нажми P чтобы продолжить', viewW / 2, VIEW_H / 2 + 40, 22, '#cfd8ee', 'center', 600);
  }
}

function draw(dt) {
  if (!bike) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1017'; ctx.fillRect(0, 0, cv.width, cv.height);
    return;
  }
  drawBackground();
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawTerrain();
  drawCoins();
  drawBike();
  drawRider();
  ctx.restore();
  drawHUD(dt);
}

function updateCamera(dt) {
  if (!bike) return;
  const k = 1 - Math.exp(-dt * 5);
  const tx = bike.x - viewW * 0.33 + Math.max(-50, Math.min(250, bike.vx * 0.15));
  const ty = bike.y - VIEW_H * 0.55;
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}

// ---------- Меню / гараж ----------
const menuEl = document.getElementById('menu');
const garageCv = document.getElementById('garage');
const gctx = garageCv.getContext('2d');
const infoEl = document.getElementById('info');
const tracksEl = document.getElementById('tracks');
const cashEl = document.getElementById('cash');
const bestEl = document.getElementById('best');
const bestTrackEl = document.getElementById('bestTrack');

const GW = 1000, GH = 420;          // логические размеры гаража
const FLOOR_Y = 322;                // линия пола
const GSCALE = 1.15;                // масштаб самокатов в гараже
const slotX = i => 135 + i * 243;   // центры стоянок на странице
const PAGE = 4;                     // самокатов на странице гаража
const PAGES = Math.ceil(SCOOTERS.length / PAGE);
const ARROW_Y = 252, ARROW_X = [58, 942];
garageCv.width = GW * 2; garageCv.height = GH * 2;

let focusId = save.selected;        // самокат, показанный в панели
let page = pageOf(focusId);         // текущая страница гаража
let hoverIdx = -1;                  // индекс самоката под курсором (глобальный)
let hoverArrow = 0;                 // -1 / +1 — стрелка под курсором

function pageOf(id) { return Math.max(0, Math.floor(SCOOTERS.findIndex(s => s.id === id) / PAGE)); }

function garagePos(e) {
  const r = garageCv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * GW, y: (e.clientY - r.top) / r.height * GH };
}
function arrowAt(p) {                // стрелки листания страниц
  if (PAGES < 2) return 0;
  if (Math.hypot(p.x - ARROW_X[0], p.y - ARROW_Y) < 30) return -1;
  if (Math.hypot(p.x - ARROW_X[1], p.y - ARROW_Y) < 30) return 1;
  return 0;
}
function slotAt(p) {                 // глобальный индекс самоката под точкой или -1
  for (let s = 0; s < PAGE; s++) {
    const i = page * PAGE + s;
    if (i >= SCOOTERS.length) break;
    if (Math.abs(p.x - slotX(s)) < 115 && p.y > 40 && p.y < FLOOR_Y + 40) return i;
  }
  return -1;
}
garageCv.addEventListener('mousemove', e => {
  const p = garagePos(e);
  hoverArrow = arrowAt(p);
  hoverIdx = hoverArrow ? -1 : slotAt(p);
  garageCv.style.cursor = (hoverArrow || hoverIdx >= 0) ? 'pointer' : 'default';
});
garageCv.addEventListener('mouseleave', () => { hoverIdx = -1; hoverArrow = 0; });
garageCv.addEventListener('click', e => {
  const p = garagePos(e);
  const a = arrowAt(p);
  if (a) { flipPage(a); return; }
  const i = slotAt(p);
  if (i >= 0) focusAt(i);
});
function flipPage(dir) {             // листаем страницу, показываем первый самокат на ней (без смены выбранного)
  page = (page + dir + PAGES) % PAGES;
  focusId = SCOOTERS[page * PAGE].id;
  renderMenu();
}
function focusAt(i) {
  const sc = SCOOTERS[i];
  focusId = sc.id;
  page = Math.floor(i / PAGE);
  if (save.owned[sc.id]) { save.selected = sc.id; persist(); }
  renderMenu();
}
addEventListener('keydown', e => {
  if (state !== 'menu' || menuEl.classList.contains('hidden')) return;
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    const i = SCOOTERS.findIndex(s => s.id === focusId);
    focusAt((i + (e.code === 'ArrowRight' ? 1 : SCOOTERS.length - 1)) % SCOOTERS.length);
  } else if (e.code === 'Space') startRun();
});

// --- рисование гаража ---
function drawGarage(t) {
  ctx = gctx;
  const g = ctx;
  g.setTransform(garageCv.width / GW, 0, 0, garageCv.height / GH, 0, 0);
  g.clearRect(0, 0, GW, GH);

  // стена
  let grd = g.createLinearGradient(0, 0, 0, FLOOR_Y);
  grd.addColorStop(0, '#201830'); grd.addColorStop(1, '#3a2a40');
  g.fillStyle = grd; g.fillRect(0, 0, GW, FLOOR_Y);
  g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 2;
  for (let x = 0; x <= GW; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, FLOOR_Y); g.stroke(); }

  // проём ворот с закатом
  const ox = 110, oy = 36, ow = 780, oh = FLOOR_Y - oy;
  g.save(); g.beginPath(); g.rect(ox, oy, ow, oh); g.clip();
  grd = g.createLinearGradient(0, oy, 0, FLOOR_Y);
  grd.addColorStop(0, '#2a1d5e'); grd.addColorStop(0.35, '#8a3a86'); grd.addColorStop(0.62, '#e8556a');
  grd.addColorStop(0.85, '#ff9650'); grd.addColorStop(1, '#ffd47c');
  g.fillStyle = grd; g.fillRect(ox, oy, ow, oh);
  const sx = 650 + Math.sin(t * 0.2) * 4, sy = 232;
  const rg = g.createRadialGradient(sx, sy, 10, sx, sy, 260);
  rg.addColorStop(0, 'rgba(255,210,130,.8)'); rg.addColorStop(1, 'rgba(255,150,90,0)');
  g.fillStyle = rg; g.fillRect(ox, oy, ow, oh);
  g.fillStyle = '#fff1bf'; g.beginPath(); g.arc(sx, sy, 44, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,170,160,.3)';
  for (let k = 0; k < 4; k++) {
    const cx = ox + ((k * 260 + t * 7) % (ow + 300)) - 150;
    g.beginPath(); g.ellipse(cx, 100 + k * 28, 120, 9, 0, 0, 7); g.fill();
  }
  g.fillStyle = '#5a2a68'; g.beginPath(); g.moveTo(ox, FLOOR_Y);
  for (let x = ox; x <= ox + ow; x += 10) g.lineTo(x, 262 + Math.sin(x * 0.011) * 16 + Math.sin(x * 0.027) * 7);
  g.lineTo(ox + ow, FLOOR_Y); g.fill();
  for (let i = 0; i < 26; i++) {                                   // силуэт города с окнами
    const bx = ox + 12 + i * 30, bh = 24 + hash(i + 3) * 58, bw = 22 + hash(i) * 8, by = FLOOR_Y - 20 - bh;
    g.fillStyle = '#34184a'; g.fillRect(bx, by, bw, bh + 20);
    g.fillStyle = 'rgba(255,205,120,.7)';
    for (let wy = by + 6; wy < FLOOR_Y - 26; wy += 11)
      for (let wx = bx + 4; wx < bx + bw - 5; wx += 8)
        if (hash(i * 17 + wx + wy * 0.3) > 0.7) g.fillRect(wx, wy, 3, 5);
  }
  g.fillStyle = '#24113a'; g.beginPath(); g.moveTo(ox, FLOOR_Y);
  for (let x = ox; x <= ox + ow; x += 10) g.lineTo(x, 304 + Math.sin(x * 0.02 + 1) * 8);
  g.lineTo(ox + ow, FLOOR_Y); g.fill();
  g.restore();

  // роллета, тень и рама проёма
  g.fillStyle = '#4a4258'; g.fillRect(ox - 6, oy - 6, ow + 12, 46);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
  for (let y = oy; y < oy + 40; y += 8) { g.beginPath(); g.moveTo(ox - 6, y); g.lineTo(ox + ow + 6, y); g.stroke(); }
  grd = g.createLinearGradient(0, oy + 40, 0, oy + 78);
  grd.addColorStop(0, 'rgba(0,0,0,.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(ox, oy + 40, ow, 38);
  g.strokeStyle = '#120d1c'; g.lineWidth = 10; g.strokeRect(ox - 5, oy - 5, ow + 10, oh + 5);

  // неоновая вывеска
  g.save();
  g.shadowColor = '#ff4fa3'; g.shadowBlur = 16;
  g.font = '800 20px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillStyle = 'rgba(255,130,196,' + (0.8 + 0.2 * Math.sin(t * 3)) + ')';
  g.fillText('SCOOTER  GARAGE', 500, 24);
  g.restore();

  // левая стена: полки, коробки, стопка покрышек
  g.fillStyle = '#5a4636'; g.fillRect(14, 120, 84, 8); g.fillRect(14, 200, 84, 8);
  g.fillStyle = '#8a6a4a'; g.fillRect(20, 92, 28, 28);
  g.fillStyle = '#6a8a9a'; g.fillRect(54, 100, 32, 20);
  g.fillStyle = '#c2503a'; g.fillRect(24, 168, 14, 32);
  g.fillStyle = '#3a7ac2'; g.fillRect(44, 176, 16, 24);
  g.fillStyle = '#8a6a4a'; g.fillRect(66, 172, 26, 28);
  for (let k = 0; k < 3; k++) {
    g.fillStyle = '#17141c'; rr(18, FLOOR_Y - 14 - k * 14, 78, 14, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(28, FLOOR_Y - 12 - k * 14, 58, 2);
  }

  // правая стена: перфорированная панель с инструментами
  g.fillStyle = '#2a2036'; g.fillRect(906, 60, 84, 240);
  g.fillStyle = 'rgba(255,255,255,.07)';
  for (let y = 70; y < 296; y += 14) for (let x = 914; x < 986; x += 14) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
  line([[930, 90], [930, 150]], '#aab4c4', 5);
  g.fillStyle = '#aab4c4'; g.beginPath(); g.arc(930, 88, 9, 0, 7); g.fill();
  g.fillStyle = '#2a2036'; g.beginPath(); g.arc(930, 88, 4, 0, 7); g.fill();
  line([[962, 100], [962, 158]], '#8a5a3a', 6);
  g.fillStyle = '#aab4c4'; g.fillRect(950, 92, 26, 10);
  line([[942, 184], [942, 238]], '#d9304f', 6);
  line([[942, 238], [942, 252]], '#aab4c4', 3);
  g.fillStyle = '#d9304f'; g.beginPath(); g.arc(956, 276, 20, Math.PI, 0); g.fill();
  g.fillStyle = '#1a1424'; g.fillRect(938, 274, 38, 6);

  // пол
  grd = g.createLinearGradient(0, FLOOR_Y, 0, GH);
  grd.addColorStop(0, '#2b2233'); grd.addColorStop(1, '#14101c');
  g.fillStyle = grd; g.fillRect(0, FLOOR_Y, GW, GH - FLOOR_Y);
  g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2;
  for (let x = -500; x <= 1500; x += 120) {
    g.beginPath(); g.moveTo(500 + (x - 500) * 0.55, FLOOR_Y); g.lineTo(x, GH); g.stroke();
  }
  for (const y of [FLOOR_Y + 22, FLOOR_Y + 52, FLOOR_Y + 90]) { g.beginPath(); g.moveTo(0, y); g.lineTo(GW, y); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(330, FLOOR_Y + 58, 60, 9, 0, 0, 7); g.fill();   // пятно масла
  g.save();                                                                                                    // свет из ворот
  g.translate(500, FLOOR_Y + 22); g.scale(1, 0.14);
  const lp = g.createRadialGradient(0, 0, 0, 0, 0, 470);
  lp.addColorStop(0, 'rgba(255,170,100,.42)'); lp.addColorStop(1, 'rgba(255,170,100,0)');
  g.fillStyle = lp; g.fillRect(-480, -480, 960, 960);
  g.restore();

  // лампы и конусы света
  for (const ph of [260, 740]) {
    const lx = ph + Math.sin(t * 0.9 + ph) * 3;
    g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.moveTo(ph, 0); g.lineTo(lx, 16); g.stroke();
    const cone = g.createLinearGradient(0, 32, 0, FLOOR_Y + 20);
    cone.addColorStop(0, 'rgba(255,225,160,.16)'); cone.addColorStop(1, 'rgba(255,225,160,0)');
    g.fillStyle = cone; g.beginPath();
    g.moveTo(lx - 8, 32); g.lineTo(lx + 8, 32); g.lineTo(lx + 180, FLOOR_Y + 20); g.lineTo(lx - 180, FLOOR_Y + 20); g.fill();
    g.fillStyle = '#2e2a3a'; g.beginPath(); g.moveTo(lx - 18, 30); g.lineTo(lx - 7, 14); g.lineTo(lx + 7, 14); g.lineTo(lx + 18, 30); g.fill();
    g.fillStyle = '#fff0b8'; g.beginPath(); g.ellipse(lx, 31, 9, 3, 0, 0, 7); g.fill();
  }

  // самокаты
  SCOOTERS.slice(page * PAGE, page * PAGE + PAGE).forEach((sc, s) => {
    const i = page * PAGE + s;                                       // глобальный индекс
    const cx = slotX(s);
    const owned = !!save.owned[sc.id], isSel = save.selected === sc.id;
    const isFocus = focusId === sc.id, isHover = hoverIdx === i;

    if (isFocus) {                                                   // прожектор на выбранной модели
      const sp = g.createLinearGradient(0, 36, 0, FLOOR_Y);
      sp.addColorStop(0, 'rgba(255,255,255,.20)'); sp.addColorStop(1, sc.color + '33');
      g.fillStyle = sp; g.beginPath();
      g.moveTo(cx - 14, 36); g.lineTo(cx + 14, 36); g.lineTo(cx + 125, FLOOR_Y + 6); g.lineTo(cx - 125, FLOOR_Y + 6); g.fill();
      g.save(); g.translate(cx, FLOOR_Y + 6); g.scale(1, 0.16);
      const fg = g.createRadialGradient(0, 0, 0, 0, 0, 150);
      fg.addColorStop(0, sc.color + 'aa'); fg.addColorStop(1, sc.color + '00');
      g.fillStyle = fg; g.fillRect(-160, -160, 320, 320);
      g.restore();
    }

    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.ellipse(cx, FLOOR_Y + 4, sc.L * 0.75 * GSCALE, 8, 0, 0, 7); g.fill();

    g.save();
    g.translate(cx, FLOOR_Y - (C + sc.r) * GSCALE - (isHover ? 3 : 0));
    g.scale(GSCALE, GSCALE);
    if (!owned) g.globalAlpha = 0.5;
    line([[-sc.L / 2 + 22, C - 6], [-sc.L / 2 + 12, C + sc.r]], '#2a2e38', 4);   // подножка
    drawScooter(sc, i * 0.9);
    g.restore();

    if (!owned) {                                                    // замок над закрытой моделью
      const ly = FLOOR_Y - 150;
      g.strokeStyle = '#ffd54a'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, ly - 6, 8, Math.PI, 0); g.stroke();
      g.fillStyle = '#ffd54a'; rr(cx - 11, ly - 6, 22, 16, 3); g.fill();
    }

    text(sc.name, cx, FLOOR_Y + 40, isFocus ? 26 : 22, isFocus ? '#fff' : '#cfc3e0', 'center', 800);
    const status = isSel ? '✓ ВЫБРАН' : owned ? 'в гараже' : '🔒 ' + sc.price;
    text(status, cx, FLOOR_Y + 62, 16, isSel ? '#7dffb0' : owned ? '#c9bde0' : '#ffd54a', 'center', 700);
    if (isFocus) { g.fillStyle = sc.color; g.fillRect(cx - 40, FLOOR_Y + 72, 80, 3); }
  });

  // стрелки страниц и точки-индикатор
  if (PAGES > 1) {
    [-1, 1].forEach((dir, k) => {
      const ax = ARROW_X[k], hot = hoverArrow === dir;
      g.fillStyle = hot ? 'rgba(255,200,120,.35)' : 'rgba(20,12,34,.72)';
      g.beginPath(); g.arc(ax, ARROW_Y, 24, 0, 7); g.fill();
      g.strokeStyle = hot ? '#fff' : '#ffd47c'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.arc(ax, ARROW_Y, 24, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(ax - dir * 5, ARROW_Y - 10); g.lineTo(ax + dir * 5, ARROW_Y); g.lineTo(ax - dir * 5, ARROW_Y + 10); g.stroke();
    });
    for (let q = 0; q < PAGES; q++) {
      g.fillStyle = q === page ? '#ffd47c' : 'rgba(255,255,255,.3)';
      g.beginPath(); g.arc(500 + (q - (PAGES - 1) / 2) * 16, 411, 4, 0, 7); g.fill();
    }
  }

  // пылинки в свете
  for (let k = 0; k < 18; k++) {
    const dx = hash(k) * GW + Math.sin(t * 0.3 + k) * 10;
    const dy = 60 + ((hash(k + 40) * 260 + t * 5 * (0.5 + hash(k + 80))) % 260);
    g.fillStyle = 'rgba(255,225,170,.28)'; g.beginPath(); g.arc(dx, dy, 1.4, 0, 7); g.fill();
  }

  // виньетка
  const vg = g.createRadialGradient(GW / 2, GH / 2, 220, GW / 2, GH / 2, 620);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = vg; g.fillRect(0, 0, GW, GH);

  ctx = mainCtx;
}

// --- превью трасс ---
function drawTrackPreview(c, id) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2a1d5e'); sky.addColorStop(0.5, '#d94f6a'); sky.addColorStop(1, '#ffd47c');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff0c0'; g.beginPath(); g.arc(w * 0.74, h * 0.58, 13, 0, 7); g.fill();
  if (id === 'flat') {
    for (let i = 0; i < 12; i++) {
      const bh = 14 + hash(i + 5) * 34;
      g.fillStyle = '#3d1f58'; g.fillRect(i * 22, h * 0.72 - bh, 18, bh + 4);
    }
    g.fillStyle = '#4a3a5c'; g.fillRect(0, h * 0.72, w, h);
    g.fillStyle = '#b9a5d6'; g.fillRect(0, h * 0.72, w, 3);
    g.fillStyle = '#ffd65a';
    for (let x = 6; x < w; x += 34) g.fillRect(x, h * 0.72 + 14, 20, 3);
  } else {
    g.fillStyle = '#5a2a68'; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) g.lineTo(x, h * 0.55 + Math.sin(x * 0.05) * 10);
    g.lineTo(w, h); g.fill();
    const gy = x => h * 0.74 - Math.sin(x * 0.045) * 9 - (x > w * 0.5 && x < w * 0.66 ? (x - w * 0.5) * 0.9 : 0)
      + (x >= w * 0.66 ? Math.min(14, (x - w * 0.66) * 1.2) : 0);
    g.fillStyle = '#6a3b3a'; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, gy(x));
    g.lineTo(w, h); g.fill();
    g.strokeStyle = '#9bb04a'; g.lineWidth = 3; g.beginPath();
    for (let x = 0; x <= w; x += 4) { if (x === 0) g.moveTo(x, gy(x)); else g.lineTo(x, gy(x)); }
    g.stroke();
  }
}

// --- DOM-панели ---
function bar(label, v, max) {
  return `<div class="bar"><span>${label}</span><i><b style="width:${Math.min(100, v / max * 100)}%"></b></i></div>`;
}

function renderInfo() {
  const sc = SCOOTERS.find(s => s.id === focusId) || SCOOTERS[0];
  const owned = !!save.owned[sc.id];
  const sel = save.selected === sc.id;
  const lvl = save.power[sc.id] || 0;
  infoEl.style.setProperty('--c', sc.color);
  infoEl.innerHTML =
    `<div class="info-main"><h3>${sc.name}</h3><p>${sc.desc}</p></div>` +
    `<div class="info-bars">` +
      bar('Скорость', sc.maxSpeed, 1300) + bar('Мощность', sc.power * (1 + 0.12 * lvl), 3400) +
      bar('Управление', sc.lean, 22) + bar('Тяжесть', sc.inertia, 1.5) +
    `</div><div class="info-actions"></div>`;
  const actions = infoEl.querySelector('.info-actions');

  if (!owned) {
    const b = document.createElement('button');
    b.className = 'main';
    b.textContent = `Купить — 💰 ${sc.price}`;
    b.disabled = save.cash < sc.price;
    b.onclick = () => { save.cash -= sc.price; save.owned[sc.id] = true; save.selected = sc.id; persist(); renderMenu(); };
    actions.appendChild(b);
    if (save.cash < sc.price) {
      const hint = document.createElement('small');
      hint.textContent = `Не хватает 💰 ${sc.price - save.cash}`;
      actions.appendChild(hint);
    }
  } else {
    const b = document.createElement('button');
    b.textContent = sel ? '✓ Выбран' : 'Выбрать';
    b.className = sel ? '' : 'main';
    b.disabled = sel;
    b.onclick = () => { save.selected = sc.id; persist(); renderMenu(); };
    actions.appendChild(b);

    const up = document.createElement('button');
    const cost = 300 * (lvl + 1);
    up.textContent = lvl >= MAX_LVL ? `Мотор MAX (${lvl}/${MAX_LVL})` : `Мотор +12% (${lvl}/${MAX_LVL}) — 💰 ${cost}`;
    up.disabled = lvl >= MAX_LVL || save.cash < cost;
    up.onclick = () => { save.cash -= cost; save.power[sc.id] = lvl + 1; persist(); renderMenu(); };
    actions.appendChild(up);
  }
}

function renderTracks() {
  tracksEl.innerHTML = '';
  TRACKS.forEach(t => {
    const card = document.createElement('button');
    card.className = 'track' + (save.track === t.id ? ' selected' : '');
    const c = document.createElement('canvas');
    c.width = 240; c.height = 110;
    drawTrackPreview(c, t.id);
    card.appendChild(c);
    const d = document.createElement('div');
    d.innerHTML = `<b>${t.name}</b><span>${t.desc}</span><em>рекорд: ${save.bests[t.id] || 0} м</em>`;
    card.appendChild(d);
    card.onclick = () => { save.track = t.id; persist(); renderMenu(); };
    tracksEl.appendChild(card);
  });
}

function renderMenu() {
  const tr = TRACKS.find(t => t.id === save.track) || TRACKS[0];
  cashEl.textContent = save.cash;
  bestTrackEl.textContent = tr.name;
  bestEl.textContent = getBest();
  renderInfo();
  renderTracks();
}

function openMenu() {
  if (state === 'play' || state === 'crash' || state === 'pause') persist();
  state = 'menu';
  focusId = save.selected;
  page = pageOf(focusId);
  renderMenu();
  menuEl.classList.remove('hidden');
}
function hideMenu() { menuEl.classList.add('hidden'); }

document.getElementById('start').addEventListener('click', startRun);

// ---------- Главный цикл ----------
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'menu') {                       // в меню рисуем только гараж
    drawGarage(now / 1000);
    requestAnimationFrame(frame);
    return;
  }
  readInput();
  if (bike && (state === 'play' || state === 'crash')) {
    acc += dt;
    while (acc >= FIXED) { simStep(FIXED); acc -= FIXED; }
  }
  updateCamera(dt);
  draw(dt);
  requestAnimationFrame(frame);
}

addEventListener('beforeunload', persist);
terrInit();
terrEnsure(4000);
renderMenu();
requestAnimationFrame(frame);

})();
