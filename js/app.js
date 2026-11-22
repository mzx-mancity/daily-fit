'use strict';
/* 每日 Fit · 锻炼打卡 — 本地离线优先,数据存 localStorage */

/* ---------- 存储 ---------- */
const KEY = 'fitlog_v1';
function blank() {
  return {
    profile: { heightCm: null, weightKg: null, cupMl: 250, cupsGoal: 5, kcalGoal: 1800, weightLog: [] },
    foods: [],
    days: {}
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const d = JSON.parse(raw);
    if (!d.profile) d.profile = blank().profile;
    if (!d.days) d.days = {};
    if (!Array.isArray(d.foods)) d.foods = [];
    if (d.profile.kcalGoal == null) d.profile.kcalGoal = 1800;
    return d;
  } catch (e) { return blank(); }
}
let DB = load();
function save() { localStorage.setItem(KEY, JSON.stringify(DB)); }

/* ---------- 日期工具 ---------- */
function keyOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function fromKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function d2(offset) { const t = new Date(); t.setDate(t.getDate() + offset); return t; }
function fmtTitle(d) {
  const wd = ['日', '一', '二', '三', '四', '五', '六'];
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + wd[d.getDay()];
}
const TODAY = () => keyOf(new Date());

/* ---------- 视图状态 ---------- */
let viewDate = TODAY();
let page = 'workout';
let curMeal = '早餐';
const isWorkout = t => t === 'cardio' || t === 'strength';

/* ---------- 工具 ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shake(el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 350); }
function trimNum(n) { return String(n).replace(/\.?0+$/, ''); }

/* ---------- 内置食物库(每份估算) ---------- */
const FOOD_DB = [
  { name: '香蕉', kcal: 105, unit: '1 根' },
  { name: '苹果', kcal: 95, unit: '1 个' },
  { name: '米饭', kcal: 174, unit: '1 碗' },
  { name: '面条', kcal: 280, unit: '1 碗' },
  { name: '馒头', kcal: 220, unit: '1 个' },
  { name: '包子', kcal: 200, unit: '1 个' },
  { name: '鸡腿', kcal: 181, unit: '1 个' },
  { name: '鸡胸肉', kcal: 165, unit: '100g' },
  { name: '牛肉', kcal: 150, unit: '100g' },
  { name: '猪肉', kcal: 330, unit: '100g' },
  { name: '鱼', kcal: 120, unit: '100g' },
  { name: '鸡蛋', kcal: 78, unit: '1 个' },
  { name: '豆腐', kcal: 80, unit: '100g' },
  { name: '青菜', kcal: 25, unit: '100g' },
  { name: '牛奶', kcal: 155, unit: '250ml' },
  { name: '酸奶', kcal: 130, unit: '1 杯' },
  { name: '豆浆', kcal: 80, unit: '250ml' },
  { name: '燕麦', kcal: 150, unit: '40g' },
  { name: '全麦面包', kcal: 80, unit: '1 片' },
  { name: '玉米', kcal: 110, unit: '1 根' },
  { name: '红薯', kcal: 130, unit: '1 个' },
  { name: '坚果', kcal: 170, unit: '30g' },
  { name: '可乐', kcal: 140, unit: '330ml' },
  { name: '薯片', kcal: 270, unit: '50g' }
];

/* ---------- 渲染: 锻炼页 ---------- */
function renderWorkout() {
  const d = fromKey(viewDate);
  $('date-title').textContent = fmtTitle(d);
  $('back-today').hidden = (viewDate === TODAY());

  const day = DB.days[viewDate] || {};
  const type = day.type || null;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('on', b.dataset.type === type));
  $('rest-tip').hidden = type !== 'rest';
  $('items-card').style.display = type === 'rest' ? 'none' : '';

  const ul = $('item-list');
  const items = day.items || [];
  if (!items.length) {
    ul.innerHTML = '<div class="empty-tip">还没有项目,从上面添加吧 ✏️</div>';
  } else {
    ul.innerHTML = items.map((it, i) =>
      '<li data-i="' + i + '"><span class="item-dot"></span><span class="item-name">' + esc(it.name) + '</span>' +
      '<input class="item-detail" data-i="' + i + '" placeholder="详情,如:深蹲 4×12" value="' + esc(it.detail || '') + '" maxlength="40">' +
      '<button class="item-del" data-i="' + i + '" aria-label="删除">✕</button></li>'
    ).join('');
  }

  let streak = 0;
  for (let i = 0; ; i++) {
    const a = DB.days[keyOf(d2(-i))];
    if (a && isWorkout(a.type)) streak++; else break;
    if (i > 3650) break;
  }
  $('streak-num').textContent = streak;

  let wk = 0;
  const strip = [];
  for (let i = 6; i >= 0; i--) {
    const k = keyOf(d2(-i));
    const a = DB.days[k];
    const t = a && a.type;
    if (isWorkout(t)) wk++;
    const lab = i === 0 ? '今天' : '周' + ['日', '一', '二', '三', '四', '五', '六'][d2(-i).getDay()];
    const chip = !t ? '空' : (t === 'cardio' ? '有' : t === 'strength' ? '无' : '休');
    const cls = 'wday' + (t ? ' hit-' + t : '') + (i === 0 && !t ? ' today-out' : '');
    strip.push('<div class="' + cls + '"><div class="w-lab">' + lab + '</div><div class="w-chip">' + chip + '</div></div>');
  }
  $('week-num').textContent = wk;
  $('week-strip').innerHTML = strip.join('');
}

/* ---------- 渲染: 喝水页 ---------- */
function renderWater() {
  const p = DB.profile;
  const day = DB.days[viewDate] || {};
  const cups = day.cups || 0;
  const g = Math.max(1, p.cupsGoal || 5);

  const pct = Math.min(cups / g, 1) * 100;
  const C = 326.73;
  const fg = $('ring-fg');
  fg.style.strokeDashoffset = String(C * (1 - pct / 100));
  fg.style.stroke = pct >= 100 ? '#22c55e' : '#0ea5e9';
  $('ring-cups').textContent = cups;
  $('ring-goal').textContent = g;
  $('ring-ml').textContent = Math.round(cups * (p.cupMl || 250)) + ' ml';

  $('set-cup').value = p.cupMl || 250;
  $('set-goal').value = g;
  $('set-note').textContent = '目标总量:' + (g * (p.cupMl || 250)) + ' ml';

  const bars = [], xs = [];
  for (let i = 6; i >= 0; i--) {
    const k = keyOf(d2(-i));
    const v = (DB.days[k] || {}).cups || 0;
    const h = Math.min(v / g * 100, 100);
    bars.push('<div class="bar-col"><div class="bar" style="height:' + h + '%"></div></div>');
    xs.push('<span>' + (i === 0 ? '今天' : (d2(-i).getMonth() + 1) + '/' + d2(-i).getDate()) + '</span>');
  }
  $('water-bars').innerHTML = bars.join('');
  $('water-bar-x').innerHTML = xs.join('');
}

/* ---------- 渲染: 饮食页 ---------- */
function dayKcal(day) {
  const foods = (day && Array.isArray(day.foods)) ? day.foods : [];
  let t = 0;
  foods.forEach(f => { t += (Number(f.kcal) || 0) * (Number(f.qty) || 1); });
  return Math.round(t);
}
function renderDiet() {
  $('diet-date').textContent = fmtTitle(fromKey(viewDate));
  $('diet-today').hidden = (viewDate === TODAY());

  const day = DB.days[viewDate] || {};
  const foods = Array.isArray(day.foods) ? day.foods : [];
  const goal = Math.max(800, DB.profile.kcalGoal || 1800);
  const total = dayKcal(day);

  $('diet-total').textContent = total;
  $('diet-goal').textContent = goal;
  const pct = Math.min(total / goal, 1) * 100;
  const bar = $('diet-bar');
  bar.style.width = pct.toFixed(1) + '%';
  bar.style.background = total > goal ? 'var(--orange)' : 'var(--green)';

  const left = goal - total;
  const lf = $('diet-left');
  lf.textContent = left >= 0 ? '还可摄入 ' + left + ' kcal' : '已超出 ' + (-left) + ' kcal';
  lf.className = 'diet-left' + (left < 0 ? ' over' : '');
  $('set-kcal').value = goal;

  const burn = Math.round(Number(day.kcalBurn) || 0);
  const burnEl = $('diet-burn');
  if (burn > 0) {
    burnEl.hidden = false;
    burnEl.textContent = '运动消耗 -' + burn + ' kcal · 净摄入 ' + (total - burn) + ' kcal';
  } else {
    burnEl.hidden = true;
  }

  const ul = $('diet-list');
  if (!foods.length) {
    ul.innerHTML = '<div class="empty-tip">今天还没记录,从下面添加吧 🍚</div>';
  } else {
    ul.innerHTML = foods.map((f, i) => {
      const q = Number(f.qty) || 1;
      const k = Math.round((Number(f.kcal) || 0) * q);
      return '<li><span class="meal-tag">' + esc(f.meal || '') + '</span>' +
        '<span class="fd-name">' + esc(f.name) + '</span>' +
        '<button class="qty-btn" data-act="minus" data-i="' + i + '" aria-label="减少">−</button>' +
        '<span class="fd-qty">×' + trimNum(q) + '</span>' +
        '<button class="qty-btn" data-act="plus" data-i="' + i + '" aria-label="增加">+</button>' +
        '<span class="fd-kcal">' + k + ' kcal</span>' +
        '<button class="item-del" data-act="del" data-i="' + i + '" aria-label="删除">✕</button></li>';
    }).join('');
  }

  const custom = (DB.foods || []).filter(c => !FOOD_DB.some(b => b.name === c.name));
  const chips = FOOD_DB.concat(custom);
  $('food-quick').innerHTML = chips.map(f =>
    '<button class="chip" data-name="' + esc(f.name) + '" data-kcal="' + (Number(f.kcal) || 0) + '">' +
    esc(f.name) + ' ' + (Number(f.kcal) || 0) + '</button>'
  ).join('');

  const bars = [], xs = [];
  let maxK = goal;
  for (let i = 6; i >= 0; i--) maxK = Math.max(maxK, dayKcal(DB.days[keyOf(d2(-i))]));
  for (let i = 6; i >= 0; i--) {
    const v = dayKcal(DB.days[keyOf(d2(-i))]);
    const h = maxK ? Math.min(v / maxK * 100, 100) : 0;
    bars.push('<div class="bar-col"><div class="bar kcal" style="height:' + h + '%"></div></div>');
    xs.push('<span>' + (i === 0 ? '今天' : (d2(-i).getMonth() + 1) + '/' + d2(-i).getDate()) + '</span>');
  }
  $('diet-bars').innerHTML = bars.join('');
  $('diet-bar-x').innerHTML = xs.join('');
}

/* ---------- 渲染: 我的页 ---------- */
function bmiLevel(b) {
  if (b < 18.5) return { n: 1, name: '偏瘦', color: '#3b82f6', bg: '#eff6ff', min: 14, max: 18.5 };
  if (b < 24) return { n: 2, name: '正常', color: '#16a34a', bg: '#f0fdf4', min: 18.5, max: 24 };
  if (b < 28) return { n: 3, name: '超重', color: '#d97706', bg: '#fffbeb', min: 24, max: 28 };
  return { n: 4, name: '肥胖', color: '#dc2626', bg: '#fef2f2', min: 28, max: 35 };
}
function renderMe() {
  const p = DB.profile;
  if (p.heightCm) $('bmi-h').value = p.heightCm;
  if (p.weightKg) $('bmi-w').value = p.weightKg;
  if (p.heightCm && p.weightKg) showBmi(p.heightCm, p.weightKg, false);

  const logs = p.weightLog || [];
  $('wlist').innerHTML = logs.length
    ? logs.map(l => '<li><span class="wdate">' + esc(l.date) + '</span><span class="wkg">' + esc(l.kg) + ' kg</span></li>').join('')
    : '<div class="empty-tip">暂无记录,保存身体数据后自动记录</div>';
}
function showBmi(hCm, wKg, record) {
  const h = hCm / 100;
  const bmi = wKg / (h * h);
  if (!isFinite(bmi)) return;
  const lv = bmiLevel(bmi);
  $('bmi-result').hidden = false;
  $('bmi-num').textContent = bmi.toFixed(1);
  const tag = $('bmi-tag');
  tag.textContent = lv.name;
  tag.style.background = lv.bg;
  tag.style.color = lv.color;
  const clamped = Math.min(Math.max(bmi, lv.min), lv.max);
  const ptr = $('bmi-pointer');
  ptr.hidden = false;
  ptr.style.left = ((clamped - 14) / (35 - 14) * 100) + '%';
  if (record) {
    const date = TODAY();
    const logs = DB.profile.weightLog || (DB.profile.weightLog = []);
    const i = logs.findIndex(l => l.date === date);
    if (i >= 0) logs[i] = { date: date, kg: wKg }; else logs.push({ date: date, kg: wKg });
    logs.sort((a, b) => a.date < b.date ? -1 : 1);
  }
}

/* ---------- 渲染总入口 ---------- */
function render() {
  renderWorkout();
  renderWater();
  renderDiet();
  renderMe();
}

/* ---------- Tab 切换(带 hash 路由,支持浏览器返回键) ---------- */
const PAGES = ['workout', 'water', 'diet', 'me'];
function goPage(p) {
  if (!PAGES.includes(p)) p = 'workout';
  page = p;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.page === p));
  document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === 'page-' + p));
  if (location.hash !== '#' + p) history.replaceState(null, '', '#' + p);
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => goPage(t.dataset.page)));
window.addEventListener('hashchange', () => goPage(location.hash.slice(1)));
goPage(location.hash.slice(1) || 'workout');

/* ---------- Keep 文本解析(粘贴文字 / 截图 OCR 均可) ---------- */
const KEEP_ACT = [
  { re: /跑步|慢跑|晨跑|夜跑|户外跑|越野跑/, name: '跑步', met: 9.8 },
  { re: /骑行|单车|公路车|动感单车/, name: '骑行', met: 7.5 },
  { re: /游泳|自由泳|蛙泳/, name: '游泳', met: 8.0 },
  { re: /跳绳/, name: '跳绳', met: 12.3 },
  { re: /健走|快走|散步|走路|徒步/, name: '快走', met: 4.5 },
  { re: /椭圆/, name: '椭圆机', met: 5.0 },
  { re: /划船/, name: '划船机', met: 7.0 },
  { re: /爬楼|登山|爬坡/, name: '爬楼登山', met: 7.0 },
  { re: /跳操|健身操|有氧操|HIIT|hiit|Tabata|tabata/, name: '跳操', met: 7.0 },
  { re: /瑜伽|拉伸|普拉提/, name: '瑜伽', met: 3.0 },
  { re: /力量|器械|哑铃|深蹲|卧推|训练/, name: '力量训练', met: 5.0 }
];

function pad2(n) { const s = String(n); return s.length < 2 ? '0' + s : s; }

/* OCR 纠错:全角转半角、"干卡/于卡"→千卡、数字里的 O/o→0、I/l→1、S/D→5 */
function fixOcr(t) {
  let s = String(t == null ? '' : t);
  s = s.replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  s = s.replace(/\u3000/g, ' ');
  s = s.replace(/干卡|于卡|午卡/g, '千卡');
  s = s.replace(/[0-9OoIlSsDd|]{1,}\s*[.,:]\s*[0-9OoIlSsDd|]{1,3}/g, function (n) {
    return n.replace(/O/g, '0').replace(/o/g, '0').replace(/[Il|]/g, '1').replace(/[SD]/g, '5').replace(/d/g, '5');
  });
  s = s.replace(/[ \t]+/g, ' ');
  return s;
}

const KEEP_DATE_RE = /(\d{4})\s*[-\/年.]\s*(\d{1,2})\s*[-\/月.]\s*(\d{1,2})|(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g;

function keepDate(m) {
  if (m[1]) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), dd = parseInt(m[3], 10);
    if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
    return y + '-' + pad2(mo) + '-' + pad2(dd);
  }
  const mo = parseInt(m[4], 10), dd = parseInt(m[5], 10);
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
  const now = new Date();
  let y = now.getFullYear();
  const cand = new Date(y, mo - 1, dd);
  if (cand.getTime() - now.getTime() > 40 * 86400000) y = y - 1;
  return y + '-' + pad2(mo) + '-' + pad2(dd);
}

function parseKeepBlock(date, text) {
  const act = KEEP_ACT.find(function (a) { return a.re.test(text); });
  if (!act) return null;
  let km = null, secs = 0, kcal = null, m;
  m = text.match(/(\d+(?:\.\d+)?)\s*(?:公里|千米|km|KM|Km)/);
  if (m) km = parseFloat(m[1]);
  if (!km) {
    /* 单位字被 OCR 认错(如「公里」→「和」)时,按「距离型运动 + 带小数点的数字」兜底 */
    const distActs = { '跑步': 1, '骑行': 1, '游泳': 1, '跳绳': 1, '快走': 1, '椭圆机': 1, '划船机': 1, '爬楼登山': 1 };
    if (distActs[act.name]) {
      const dm = text.match(/(?:^|[^\d.])(\d{1,3}\.\d{1,2})(?![\d])/);
      if (dm) {
        const v = parseFloat(dm[1]);
        if (v > 0 && v < 100) km = v;
      }
    }
  }
  m = text.match(/(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})/);
  if (m) secs = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  if (!secs) {
    m = text.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (m) secs = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }
  if (!secs) {
    m = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分|min)/i);
    if (m) secs = Math.round(parseFloat(m[1]) * 60);
  }
  if (!secs) {
    m = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|h)/i);
    if (m) secs = Math.round(parseFloat(m[1]) * 3600);
  }
  m = text.match(/(\d{2,4})\s*(?:千卡|大卡|kcal|卡路里)/i);
  if (m) kcal = parseInt(m[1], 10);
  if (!kcal) {
    m = text.match(/消耗[^\d]{0,8}(\d{2,4})/);
    if (m) kcal = parseInt(m[1], 10);
  }
  if (!kcal) {
    m = text.match(/(\d{2,4})\s*(?:千卡|大卡|kcal|卡路里)/i);
    if (m) kcal = parseInt(m[1], 10);
  }
  if (kcal != null && (kcal < 1 || kcal > 5000)) kcal = null;
  if (!km && !secs && !kcal) return null;
  if (!kcal) {
    const w = Number(DB.profile.weightKg) || 60;
    kcal = Math.round(act.met * w * (secs / 3600));
  }
  const mins = Math.round(secs / 60);
  const parts = [];
  if (km) parts.push(trimNum(km.toFixed(2)) + ' 公里');
  if (mins) parts.push(mins + ' 分钟');
  parts.push(kcal + ' kcal');
  return { date: date, name: act.name, km: km, mins: mins, kcal: kcal, detail: parts.join(' · ') };
}

/* 一整段文字(可能是多张截图的 OCR 结果)→ 记录数组;按日期切块 */
function parseKeepText(text) {
  const raw = fixOcr(text);
  if (!raw.trim()) return [];
  const marks = [];
  let m;
  KEEP_DATE_RE.lastIndex = 0;
  while ((m = KEEP_DATE_RE.exec(raw)) !== null) {
    const d = keepDate(m);
    if (d) marks.push({ date: d, start: m.index, end: KEEP_DATE_RE.lastIndex });
  }
  const out = [];
  if (!marks.length) {
    const one = parseKeepBlock(TODAY(), raw);
    if (one) out.push(one);
    return out;
  }
  marks.forEach(function (mk, i) {
    const to = i + 1 < marks.length ? marks[i + 1].start : raw.length;
    const r = parseKeepBlock(mk.date, raw.slice(mk.end, to));
    if (r) out.push(r);
  });
  return out;
}

function doKeepImport() {
  const ta = $('keep-text');
  const note = $('keep-note');
  const recs = parseKeepText(ta.value);
  if (!recs.length) {
    shake(ta);
    note.textContent = '没认出记录:需要运动名称(跑步/骑行…)和 距离/时长/消耗 中的至少一项。';
    return 0;
  }
  let added = 0, dup = 0;
  recs.forEach(function (r) {
    const d = DB.days[r.date] || (DB.days[r.date] = { items: [], cups: 0, cupTimes: [] });
    if (!Array.isArray(d.items)) d.items = [];
    if (!d.type) d.type = 'cardio';
    const nm = r.name + (r.km ? ' ' + trimNum(r.km.toFixed(2)) + 'km' : '');
    if (d.items.some(function (it) { return it.name === nm; })) { dup++; return; }
    d.items.push({ name: nm, detail: r.detail });
    d.kcalBurn = Math.round((Number(d.kcalBurn) || 0) + r.kcal);
    added++;
  });
  save();
  render();
  const list = recs.map(function (r) { return r.date.slice(5) + ' ' + r.name + ' ' + r.kcal + 'kcal'; }).join('、');
  note.textContent = '已导入 ' + added + ' 条' + (dup ? '(跳过 ' + dup + ' 条重复)' : '') + ':' + list;
  return added;
}

/* ---------- Keep 截图识别(本机 OCR,图片不上传) ---------- */
const OCR_S = { lib: null, worker: null, loading: null };

function ocrBar(pct, label) {
  const box = $('keep-progress'), bar = $('keep-bar'), txt = $('keep-pct');
  if (box) box.hidden = false;
  if (bar) bar.style.width = Math.max(2, Math.min(100, pct)) + '%';
  if (txt) txt.textContent = label || (pct + '%');
}

function loadOcrLib() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (OCR_S.lib) return OCR_S.lib;
  OCR_S.lib = new Promise(function (res, rej) {
    const s = document.createElement('script');
    s.src = 'vendor/tesseract/tesseract.min.js';
    s.async = true;
    s.onload = function () {
      if (window.Tesseract) res(window.Tesseract); else rej(new Error('识别引擎未就绪'));
    };
    s.onerror = function () { OCR_S.lib = null; rej(new Error('无法加载识别引擎')); };
    (document.head || document.body).appendChild(s);
  });
  return OCR_S.lib;
}

/* worker 用 blob 方式启动,路径必须是绝对 URL */
function vendorBase() {
  const href = (typeof location !== 'undefined' && location.href) ? location.href : 'http://localhost/';
  return new URL('vendor/tesseract/', href).href.replace(/\/$/, '');
}

function getOcrWorker() {
  if (OCR_S.worker) return Promise.resolve(OCR_S.worker);
  if (OCR_S.loading) return OCR_S.loading;
  OCR_S.loading = loadOcrLib().then(function (T) {
    const base = vendorBase();
    return T.createWorker('chi_sim+eng', 1, {
      workerPath: base + '/worker.min.js',
      corePath: base,
      langPath: base + '/lang',
      gzip: true,
      logger: function (msg) {
        if (msg && msg.status === 'recognizing text') ocrBar(Math.round((msg.progress || 0) * 100), '识别中 ' + Math.round((msg.progress || 0) * 100) + '%');
      }
    });
  }).then(function (w) { OCR_S.worker = w; return w; });
  return OCR_S.loading;
}

/* 超大图先缩到 2000px 内,手机上更快 */
function prepareImage(file) {
  return new Promise(function (res) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    const done = function (obj) { res(obj); };
    im.onload = function () {
      const max = 2000;
      if (im.width <= max && im.height <= max) { done({ url: url, blob: null, w: im.width, h: im.height }); return; }
      const sc = max / Math.max(im.width, im.height);
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.width * sc);
      cv.height = Math.round(im.height * sc);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      if (cv.toBlob) cv.toBlob(function (b) { done({ url: url, blob: b, w: cv.width, h: cv.height }); }, 'image/jpeg', 0.92);
      else done({ url: url, blob: null, w: im.width, h: im.height });
    };
    im.onerror = function () { done({ url: url, blob: null, w: 0, h: 0 }); };
    im.src = url;
  });
}

function ocrFile(file) {
  if (!file) return Promise.resolve();
  const note = $('keep-note');
  const pv = $('keep-preview'), pimg = $('keep-img');
  ocrBar(3, '准备中…');
  note.textContent = '正在本机识别截图,首次使用要加载约 11MB 识别组件(之后走缓存)。';
  return prepareImage(file).then(function (prep) {
    if (pv && pimg) {
      pimg.src = prep.url;
      pimg.style.maxWidth = '96px';
      pv.hidden = false;
    }
    return getOcrWorker().then(function (w) {
      ocrBar(10, '识别中…');
      return w.recognize(prep.blob || file);
    });
  }).then(function (res) {
    const text = String((res && res.data && res.data.text) || '').replace(/\r/g, '').trim();
    if (!text) {
      note.textContent = '这张图没识别出文字,换一张更清晰的截图,或直接粘贴 Keep 分享的文字。';
      return;
    }
    const ta = $('keep-text');
    ta.value = (ta.value ? ta.value.replace(/\s+$/, '') + '\n' : '') + text;
    ocrBar(100, '识别完成');
    const n = doKeepImport();
    if (!n) note.textContent = '识别出文字但没匹配到运动记录,可手动修改上面的文字再点「解析并导入」。';
    setTimeout(function () { const box = $('keep-progress'); if (box) box.hidden = true; }, 1500);
  }).catch(function (err) {
    note.textContent = '识别失败:' + (err && err.message ? err.message : '未知错误') + '。也可以直接把 Keep 分享文字粘到框里。';
    const box = $('keep-progress');
    if (box) box.hidden = true;
  });
}

$('keep-import').addEventListener('click', doKeepImport);
$('keep-shot').addEventListener('click', function () { $('keep-file').click(); });
$('keep-cam').addEventListener('click', function () { $('keep-file-cam').click(); });
$('keep-file').addEventListener('change', function (e) { const f = e.target.files && e.target.files[0]; e.target.value = ''; ocrFile(f); });
$('keep-file-cam').addEventListener('change', function (e) { const f = e.target.files && e.target.files[0]; e.target.value = ''; ocrFile(f); });
window.addEventListener('pagehide', function () {
  if (OCR_S.worker) { try { OCR_S.worker.terminate(); } catch (err) {} OCR_S.worker = null; }
});
/* ---------- 锻炼页事件 ---------- */
$('prev-day').addEventListener('click', () => { viewDate = keyOf(d2(-1)); render(); });
$('next-day').addEventListener('click', () => { viewDate = keyOf(d2(1)); render(); });
$('back-today').addEventListener('click', () => { viewDate = TODAY(); render(); });

document.querySelectorAll('.type-btn').forEach(b => b.addEventListener('click', () => {
  const day = DB.days[viewDate] || (DB.days[viewDate] = { items: [], cups: 0, cupTimes: [] });
  day.type = b.dataset.type;
  save(); render();
}));

$('item-add').addEventListener('click', addItem);
$('item-input').addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });
function addItem() {
  const inp = $('item-input');
  const name = inp.value.trim();
  if (!name) { shake(inp); return; }
  const day = DB.days[viewDate] || (DB.days[viewDate] = { items: [], cups: 0, cupTimes: [] });
  if (!Array.isArray(day.items)) day.items = [];
  day.items.push({ name: name, detail: '' });
  inp.value = '';
  save(); render();
}
document.querySelectorAll('#quick-row .chip').forEach(c => c.addEventListener('click', () => {
  const name = c.dataset.name;
  const day = DB.days[viewDate] || (DB.days[viewDate] = { items: [], cups: 0, cupTimes: [] });
  if (!Array.isArray(day.items)) day.items = [];
  if (day.items.some(it => it.name === name)) return;
  day.items.push({ name: name, detail: '' });
  save(); render();
}));
$('item-list').addEventListener('click', e => {
  const btn = e.target.closest('.item-del');
  if (!btn) return;
  const day = DB.days[viewDate];
  if (day && day.items) { day.items.splice(Number(btn.dataset.i), 1); save(); render(); }
});
$('item-list').addEventListener('change', e => {
  const inp = e.target.closest('.item-detail');
  if (!inp) return;
  const day = DB.days[viewDate];
  if (day && day.items && day.items[inp.dataset.i]) { day.items[inp.dataset.i].detail = inp.value.trim(); save(); }
});

/* ---------- 喝水页事件 ---------- */
$('cup-plus').addEventListener('click', () => addCup(1));
$('cup-minus').addEventListener('click', () => addCup(-1));
function addCup(delta) {
  const day = DB.days[viewDate] || (DB.days[viewDate] = { items: [], cups: 0, cupTimes: [] });
  if (delta > 0) {
    day.cups = (day.cups || 0) + 1;
    (day.cupTimes = day.cupTimes || []).push(new Date().toTimeString().slice(0, 5));
  } else {
    day.cups = Math.max((day.cups || 0) - 1, 0);
    if (Array.isArray(day.cupTimes) && day.cupTimes.length) day.cupTimes.pop();
  }
  save(); render();
}
$('custom-add').addEventListener('click', () => {
  const inp = $('custom-ml');
  const ml = parseInt(inp.value, 10);
  if (!ml || ml <= 0) { shake(inp); return; }
  const day = DB.days[viewDate] || (DB.days[viewDate] = { items: [], cups: 0, cupTimes: [] });
  const extra = Math.round(ml / Math.max(1, DB.profile.cupMl || 250) * 10) / 10;
  day.cups = Math.round(((day.cups || 0) + extra) * 10) / 10;
  inp.value = '';
  save(); render();
});
function bindSetting(id, fn) {
  $(id).addEventListener('change', e => { fn(e.target.value); save(); render(); });
}
bindSetting('set-cup', v => { const n = parseInt(v, 10); if (n >= 50) DB.profile.cupMl = n; });
bindSetting('set-goal', v => { const n = parseInt(v, 10); if (n >= 1) DB.profile.cupsGoal = n; });
bindSetting('set-kcal', v => { const n = parseInt(v, 10); if (n >= 800 && n <= 6000) DB.profile.kcalGoal = n; });

/* ---------- 饮食页事件 ---------- */
$('diet-prev').addEventListener('click', () => { viewDate = keyOf(d2(-1)); render(); });
$('diet-next').addEventListener('click', () => { viewDate = keyOf(d2(1)); render(); });
$('diet-today').addEventListener('click', () => { viewDate = TODAY(); render(); });

document.querySelectorAll('#meal-row .meal-btn').forEach(b => b.addEventListener('click', () => {
  curMeal = b.dataset.meal;
  document.querySelectorAll('#meal-row .meal-btn').forEach(x => x.classList.toggle('on', x === b));
}));

function addFood(name, kcal, qty) {
  const day = DB.days[viewDate] || (DB.days[viewDate] = { items: [], cups: 0, cupTimes: [] });
  if (!Array.isArray(day.foods)) day.foods = [];
  day.foods.push({ meal: curMeal, name: name, kcal: kcal, qty: qty || 1 });
  save(); render();
}
$('food-add').addEventListener('click', () => {
  const ni = $('food-name'), ki = $('food-kcal');
  const name = ni.value.trim();
  const kcal = parseInt(ki.value, 10);
  if (!name) { shake(ni); return; }
  if (!kcal || kcal <= 0 || kcal > 5000) { shake(ki); return; }
  const known = FOOD_DB.some(f => f.name === name) || (DB.foods || []).some(f => f.name === name);
  if (!known) (DB.foods = DB.foods || []).push({ name: name, kcal: kcal });
  addFood(name, kcal, 1);
  ni.value = ''; ki.value = '';
});
$('food-quick').addEventListener('click', e => {
  const c = e.target.closest('.chip');
  if (!c) return;
  const kcal = parseInt(c.dataset.kcal, 10);
  if (!kcal) return;
  addFood(c.dataset.name, kcal, 1);
});
$('diet-list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const day = DB.days[viewDate];
  if (!day || !Array.isArray(day.foods)) return;
  const i = Number(btn.dataset.i);
  const f = day.foods[i];
  if (!f) return;
  const act = btn.dataset.act;
  if (act === 'del') {
    day.foods.splice(i, 1);
  } else if (act === 'plus') {
    f.qty = Math.min((Number(f.qty) || 1) + 0.5, 20);
  } else if (act === 'minus') {
    const q = (Number(f.qty) || 1) - 0.5;
    if (q <= 0) day.foods.splice(i, 1); else f.qty = q;
  }
  save(); render();
});

/* ---------- 我的页事件 ---------- */
$('bmi-save').addEventListener('click', () => {
  const h = parseFloat($('bmi-h').value), w = parseFloat($('bmi-w').value);
  if (!h || !w || h < 80 || h > 250 || w < 25 || w > 250) {
    $('bmi-h').classList.add('shake'); $('bmi-w').classList.add('shake');
    setTimeout(() => { $('bmi-h').classList.remove('shake'); $('bmi-w').classList.remove('shake'); }, 350);
    return;
  }
  DB.profile.heightCm = h; DB.profile.weightKg = w;
  showBmi(h, w, true); save(); renderMe();
});
$('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'daily-fit-backup-' + TODAY() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
});
$('btn-import').addEventListener('click', () => {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || typeof d !== 'object' || !d.days) throw 0;
        if (!confirm('导入将覆盖当前全部数据,确定吗?')) return;
        DB = d;
        if (!DB.profile) DB.profile = blank().profile;
        if (!Array.isArray(DB.foods)) DB.foods = [];
        if (DB.profile.kcalGoal == null) DB.profile.kcalGoal = 1800;
        save(); render();
      } catch (e) { alert('文件格式不对,导入失败'); }
    };
    r.readAsText(f);
  };
  inp.click();
});

render();

// Service Worker:仅网页版注册(PWA 离线);WebView 容器里由 window.__NO_SW 关闭
if ('serviceWorker' in navigator && !window.__NO_SW) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
