'use strict';
/* 小橘爱运动 · 锻炼打卡 — 本地离线优先,数据存 localStorage */

/* ---------- 存储 ---------- */
const KEY = 'fitlog_v1';
const DEFAULT_FAVS = ['臀', '腿', '肩', '胸', '背', '手臂', '核心', '跑步', '跳绳', '游泳', '骑行', '瑜伽'];

function blank() {
  return {
    profile: { heightCm: null, weightKg: null, cupMl: 250, cupsGoal: 5, weightLog: [] },
    favs: DEFAULT_FAVS.slice(),
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
    if (!Array.isArray(d.profile.weightLog)) d.profile.weightLog = [];
    if (!Array.isArray(d.favs)) d.favs = DEFAULT_FAVS.slice();
    return d;
  } catch (e) { return blank(); }
}
let DB = load();
function save() { localStorage.setItem(KEY, JSON.stringify(DB)); }

/* ---------- 日期工具 ---------- */
const WD = ['日', '一', '二', '三', '四', '五', '六'];
function keyOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function fromKey(k) { const a = k.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
function d2(offset) { const t = new Date(); t.setDate(t.getDate() + offset); return t; }
function fmtFull(d) {
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + WD[d.getDay()];
}
const TODAY = () => keyOf(new Date());

/* ---------- 视图状态 ---------- */
let viewDate = TODAY();          /* 当前选中的日期 */
let calY = 0, calM = 0;          /* 日历显示的年 / 月(0-11) */
(function initCal() { const d = fromKey(viewDate); calY = d.getFullYear(); calM = d.getMonth(); })();

const isWorkout = t => t === 'cardio' || t === 'strength';
const typeName = t => t === 'cardio' ? '有氧' : t === 'strength' ? '无氧' : t === 'rest' ? '休息' : '未记录';

/* ---------- 工具 ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shake(el) { if (!el) return; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 350); }
function ensureDay(k) {
  return DB.days[k] || (DB.days[k] = { items: [], cups: 0, cupTimes: [] });
}
function dayHasLog(d) { return !!(d && (d.type || (d.items && d.items.length))); }

/* 任何改动都把"已确认"打回未确认,避免悄悄改掉已核对的数据 */
function touch(day) {
  if (!day) return;
  if (day.confirmed) { day.confirmed = false; day.dirty = true; }
  confirmKey = null;   /* 让确认勾选框回到未勾选,必须重新核对 */
}

/* ---------- 渲染: 日历 ---------- */
function renderCalendar() {
  $('cal-month').textContent = calY + '年' + (calM + 1) + '月';

  const first = new Date(calY, calM, 1);
  const lead = (first.getDay() + 6) % 7;               /* 周一作为一周开头 */
  const daysInMonth = new Date(calY, calM + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-day blank"></span>');

  for (let d = 1; d <= daysInMonth; d++) {
    const k = keyOf(new Date(calY, calM, d));
    const rec = DB.days[k] || {};
    const cls = ['cal-day'];
    if (rec.type) cls.push('t-' + rec.type);
    if (k === viewDate) cls.push('sel');
    if (k === TODAY()) cls.push('today');
    if (rec.confirmed) cls.push('ok');
    if (dayHasLog(rec)) cls.push('has');
    const mark = rec.confirmed ? '<i class="cal-ok">✓</i>' : '';
    cells.push('<button class="' + cls.join(' ') + '" data-k="' + k + '">' +
      '<span class="cal-num">' + d + '</span>' + mark + '</button>');
  }
  const tail = (7 - ((lead + daysInMonth) % 7)) % 7;
  for (let i = 0; i < tail; i++) cells.push('<span class="cal-day blank"></span>');
  $('cal-grid').innerHTML = cells.join('');

  /* 连续打卡(从今天往前,只算 有氧/无氧) */
  let streak = 0;
  const startedToday = isWorkout((DB.days[TODAY()] || {}).type);
  for (let i = (startedToday ? 0 : 1); i < 3650; i++) {
    const a = DB.days[keyOf(d2(-i))];
    if (a && isWorkout(a.type)) streak++; else break;
  }
  $('cal-streak').textContent = '连续 ' + streak + ' 天';

  /* 本月有记录天数 */
  let cnt = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (dayHasLog(DB.days[keyOf(new Date(calY, calM, d))])) cnt++;
  }
  $('cal-month-count').textContent = '本月 ' + cnt + ' 天';

  $('cal-today').hidden = (viewDate === TODAY() && calY === new Date().getFullYear() && calM === new Date().getMonth());
}

/* ---------- 渲染: 选中日详情 ---------- */
function renderDay() {
  const d = fromKey(viewDate);
  const rel = viewDate === TODAY() ? '今天' : (viewDate === keyOf(d2(1)) ? '明天' : (viewDate === keyOf(d2(-1)) ? '昨天' : ''));
  $('day-title').textContent = fmtFull(d) + (rel ? ' · ' + rel : '');

  const day = DB.days[viewDate] || {};
  const type = day.type || null;
  const tag = $('day-tag');
  let tagText = '未记录', tagCls = 'day-bar-tag';
  if (day.confirmed) { tagText = '已确认'; tagCls += ' ok'; }
  else if (dayHasLog(day)) { tagText = '待确认'; tagCls += ' pending'; }
  else if (viewDate > TODAY()) { tagText = '未来日期'; tagCls += ' future'; }
  if (type) tagText = typeName(type) + (day.confirmed ? ' · 已确认' : '');
  tag.textContent = tagText;
  tag.className = tagCls + (type ? ' t-' + type : '');

  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('on', b.dataset.type === type));
  $('rest-tip').hidden = type !== 'rest';
  $('items-card').style.display = type === 'rest' ? 'none' : '';

  const ul = $('item-list');
  const items = Array.isArray(day.items) ? day.items : [];
  if (!items.length) {
    ul.innerHTML = '<div class="empty-tip">这天还没有项目</div>';
  } else {
    const showSets = (type === 'strength');
    ul.innerHTML = items.map((it, i) => {
      const done = Number(it.sets) || 0;
      const goal = Number(it.goal) || 3;
      const isDone = it.done || (showSets && goal > 0 && done >= goal);
      return '<li class="' + (isDone ? 'done' : '') + '">' +
        '<div class="item-main">' +
        '<label class="item-chk"><input type="checkbox" class="item-done" data-i="' + i + '"' + (it.done ? ' checked' : '') + '><span class="item-dot"></span></label>' +
        '<span class="item-name">' + esc(it.name) + '</span>' +
        '</div>' +
        '<button class="item-del" data-i="' + i + '" aria-label="删除">✕</button>' +
        '<input class="item-detail" data-i="' + i + '" placeholder="备注,如:20kg × 12" value="' + esc(it.detail || '') + '" maxlength="40">' +
        (showSets
          ? '<div class="sets-row">' +
              '<span class="sets-lab">目标</span>' +
              '<button class="step-btn" data-act="goal-" data-i="' + i + '">−</button>' +
              '<span class="sets-val" data-i="' + i + '">' + goal + '</span>' +
              '<button class="step-btn" data-act="goal+" data-i="' + i + '">+</button>' +
              '<span class="sets-lab sep">已完成</span>' +
              '<button class="step-btn on" data-act="done-" data-i="' + i + '">−</button>' +
              '<span class="sets-val big' + (done >= goal ? ' full' : '') + '" data-i="' + i + '">' + done + '</span>' +
              '<button class="step-btn on" data-act="done+" data-i="' + i + '">+</button>' +
            '</div>'
          : '') +
        '</li>';
    }).join('');
  }

  /* 常用项目 chips:每个右上角有 ✕ 可删除(自定义项目名也能删) */
  const qr = $('quick-row');
  if (qr) {
    const favs = Array.isArray(DB.favs) ? DB.favs : DEFAULT_FAVS.slice();
    qr.innerHTML = favs.map(n =>
      '<span class="chip-wrap">' +
        '<button class="chip" data-name="' + esc(n) + '">' + esc(n) + '</button>' +
        '<button class="chip-del" data-del="' + esc(n) + '" aria-label="删除常用">✕</button>' +
      '</span>'
    ).join('') || '<div class="empty-tip" style="padding:6px 0">常用项目都删掉了,输入名称添加后会出现在这里</div>';
  }

  /* 沿用上次: 当前没项目,且之前某天有项目 */
  const last = prevDayWithItems(viewDate);
  const cp = $('copy-last');
  if (!items.length && last) {
    cp.hidden = false;
    cp.textContent = '沿用 ' + last.short + ' 的项目';
  } else {
    cp.hidden = true;
  }

  const clr = $('day-clear');
  if (clr) clr.hidden = !dayHasLog(day);

  renderConfirm(day, type);
}

function prevDayWithItems(k) {
  const keys = Object.keys(DB.days).filter(x => x < k && Array.isArray(DB.days[x].items) && DB.days[x].items.length).sort();
  if (!keys.length) return null;
  const kk = keys[keys.length - 1];
  const d = fromKey(kk);
  return { key: kk, short: (d.getMonth() + 1) + '/' + d.getDate() };
}

/* ---------- 确认保存 ---------- */
let confirmKey = null;

function renderConfirm(day, type) {
  const chk = $('confirm-chk'), btn = $('confirm-save'), st = $('confirm-state');
  if (!chk || !btn || !st) return;
  const ok = !!day.confirmed;
  if (ok) chk.checked = true;
  else if (confirmKey !== viewDate) chk.checked = false;
  confirmKey = viewDate;
  btn.disabled = !ok && (!type || !chk.checked);
  btn.classList.toggle('ok', ok);
  btn.textContent = ok ? '已保存 ✓' : '确认保存';
  st.className = 'confirm-state' + (ok ? ' ok' : (day.dirty ? ' warn' : ''));
  if (ok) {
    const at = day.confirmedAt ? String(day.confirmedAt).slice(5, 16).replace('T', ' ') : '';
    st.textContent = '已确认保存' + (at ? ' · ' + at : '');
  } else if (day.dirty) {
    st.textContent = '数据有改动,请重新勾选并确认';
  } else if (!type) {
    st.textContent = '先选运动类型,再勾选确认';
  } else {
    st.textContent = '未确认:勾选上方方框后点「确认保存」';
  }
}

function nowStamp() {
  const d = new Date();
  return keyOf(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function confirmSave() {
  const day = ensureDay(viewDate);
  if (!day.type) { shake($('confirm-card')); return; }
  if (!$('confirm-chk').checked) { shake($('confirm-card')); return; }
  day.confirmed = true;
  day.dirty = false;
  day.confirmedAt = nowStamp();
  save();
  renderAll();
}

/* ---------- 喝水建议(中国居民膳食指南 + 体重) ---------- */
/* 指南:成年男性每日饮水 1700ml,女性 1500ml;运动/天热可增加到 2000ml+。
   另一个常用经验:每公斤体重 30-40ml。这里以指南为下限,体重法作为个性化上限,取中间值。 */
function waterAdvice() {
  const w = Number(DB.profile.weightKg) || 0;
  const byGuide = 1500;                                  /* 女性基准,男性 1700 */
  const byWeight = w > 0 ? Math.round(w * 35 / 50) * 50 : 0;  /* 35ml/kg,取整到 50 */
  let ml = byWeight > 0 ? Math.max(1500, Math.min(byWeight, 3000)) : byGuide;
  let basis;
  if (w > 0) {
    basis = '按体重 ' + w + 'kg × 35ml/kg 估算 · 指南成人 1500-1700ml 为下限';
  } else {
    basis = '未填体重,采用指南成人基准值(填了体重会给更贴合的建议)';
  }
  return { ml: ml, basis: basis, hasWeight: w > 0 };
}

function renderAdvice() {
  const a = waterAdvice();
  if ($('advice-ml')) $('advice-ml').textContent = a.ml;
  if ($('advice-basis')) $('advice-basis').textContent = a.basis;
  const cup = Math.max(50, DB.profile.cupMl || 250);
  const cups = Math.max(1, Math.round(a.ml / cup));
  if ($('advice-apply')) $('advice-apply').textContent = '按建议调整目标(约 ' + cups + ' 杯 × ' + cup + 'ml)';
}

/* ---------- 渲染: 喝水页(永远针对今天) ---------- */
function renderWater() {
  renderAdvice();
  const p = DB.profile;
  const tk = TODAY();
  const day = DB.days[tk] || {};
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

  const td = new Date();
  $('water-date').textContent = '今天 · ' + (td.getMonth() + 1) + '月' + td.getDate() + '日 周' + WD[td.getDay()] + '(喝水记录只记今天)';

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

/* ---------- 渲染: 我的 ---------- */
function bmiLevel(b) {
  if (b < 18.5) return { name: '偏瘦', color: '#3b82f6', bg: '#eff6ff', min: 14, max: 18.5 };
  if (b < 24) return { name: '正常', color: '#16a34a', bg: '#f0fdf4', min: 18.5, max: 24 };
  if (b < 28) return { name: '超重', color: '#d97706', bg: '#fffbeb', min: 24, max: 28 };
  return { name: '肥胖', color: '#dc2626', bg: '#fef2f2', min: 28, max: 35 };
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

/* ---------- 渲染入口 ---------- */
function renderAll() {
  renderCalendar();
  renderDay();
  renderWater();
  renderMe();
}
const render = renderAll;

/* ---------- Tab 切换(hash 路由) ---------- */
const PAGES = ['workout', 'water', 'me'];
function goPage(p) {
  if (!PAGES.includes(p)) p = 'workout';
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.page === p));
  document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === 'page-' + p));
  if (location.hash !== '#' + p) history.replaceState(null, '', '#' + p);
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => goPage(t.dataset.page)));
window.addEventListener('hashchange', () => goPage(location.hash.slice(1)));
goPage(location.hash.slice(1) || 'workout');

/* ---------- 日历事件 ---------- */
function shiftMonth(delta) {
  let y = calY, m = calM + delta;
  if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
  calY = y; calM = m;
  /* 切到别的月份时,选中日也跟着进入该月:本月→今天,其它月→1 号,避免"日历是 10 月、下面却在编辑 11 月" */
  const nowD = new Date();
  const inThisMonth = (y === nowD.getFullYear() && m === nowD.getMonth());
  viewDate = inThisMonth ? TODAY() : keyOf(new Date(y, m, 1));
  renderAll();
}

let swallowNextTap = false;   /* 刚滑动翻月:吃掉紧随其后的那一次点击(只吃一次) */

/* ---------- 点日期:立刻选中,不做重建(响应要快) ---------- */
/* 只切换选中格子的 class,不重排整月;切换月份才重建网格 */
function markSelection() {
  const grid = $('cal-grid');
  if (!grid || typeof grid.querySelectorAll !== 'function') { renderCalendar(); return; }
  const cells = grid.querySelectorAll('.cal-day[data-k]');
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const on = c.dataset.k === viewDate;
    if (c.classList.contains('sel') !== on) c.classList.toggle('sel', on);
  }
}

function pickDate(k) {
  const d = fromKey(k);
  const monthChanged = (d.getFullYear() !== calY || d.getMonth() !== calM);
  viewDate = k;
  calY = d.getFullYear(); calM = d.getMonth();
  if (monthChanged) renderCalendar(); else markSelection();
  renderDay();
}
function goToday() { pickDate(TODAY()); }

$('cal-prev').addEventListener('click', () => shiftMonth(-1));
$('cal-next').addEventListener('click', () => shiftMonth(1));
$('cal-today').addEventListener('click', goToday);
$('cal-grid').addEventListener('click', e => {
  if (swallowNextTap) { swallowNextTap = false; return; }   /* 滑动翻月后不要顺手选中某天 */
  const b = e.target.closest('.cal-day');
  if (!b || !b.dataset.k) return;
  pickDate(b.dataset.k);
  openDayModal(b.dataset.k);      /* 点日期:弹出当天练了什么 */
});

$('day-close').addEventListener('click', closeDayModal);
$('day-ok').addEventListener('click', closeDayModal);
$('day-mask').addEventListener('click', closeDayModal);
$('day-modal-edit').addEventListener('click', () => {
  closeDayModal();
  const card = $('items-card');
  if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- 清空某天 ---------- */
function clearDay(k) {
  const day = DB.days[k];
  if (!dayHasLog(day)) return false;
  delete day.type;
  delete day.items;
  delete day.confirmed;
  delete day.confirmedAt;
  delete day.dirty;
  /* 喝水是独立数据,清空打卡时保留;整天都没内容了才把这条记录删掉 */
  const left = Object.keys(day).filter(x => x !== 'cups' && x !== 'cupTimes');
  if (!left.length && !day.cups) delete DB.days[k];
  save();
  renderCalendar();
  renderDay();
  return true;
}

$('day-clear').addEventListener('click', () => clearDay(viewDate));

/* 左右滑动切换月份 */
(function bindSwipe() {
  let sx = 0, sy = 0, tracking = false;
  const box = $('cal-card');
  box.addEventListener('touchstart', e => {
    if (!e.touches || !e.touches.length) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  box.addEventListener('touchend', e => {
    if (!tracking || !e.changedTouches || !e.changedTouches.length) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swallowNextTap = true;
      shiftMonth(dx > 0 ? -1 : 1);
    }
  }, { passive: true });
})();

/* ---------- 类型 / 项目 ---------- */
document.querySelectorAll('.type-btn').forEach(b => b.addEventListener('click', () => {
  const day = ensureDay(viewDate);
  day.type = (day.type === b.dataset.type) ? null : b.dataset.type;
  touch(day);
  save(); renderAll();
}));

function addItemByName(name) {
  const day = ensureDay(viewDate);
  if (!Array.isArray(day.items)) day.items = [];
  if (day.items.some(it => it.name === name)) return false;
  day.items.push({ name: name, detail: '' });
  /* 新名字自动加入常用项目(下次点一下就行) */
  if (!Array.isArray(DB.favs)) DB.favs = DEFAULT_FAVS.slice();
  if (DB.favs.indexOf(name) === -1 && DB.favs.length < 24) DB.favs.push(name);
  touch(day);
  save(); renderAll();
  return true;
}
$('item-add').addEventListener('click', () => {
  const inp = $('item-input');
  const name = inp.value.trim();
  if (!name) { shake(inp); return; }
  if (addItemByName(name)) inp.value = '';
});
$('item-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('item-add').click(); });
$('quick-row').addEventListener('click', (e) => {
  const del = e.target.closest('.chip-del');
  if (del) {
    if (e.stopPropagation) e.stopPropagation();
    const name = del.dataset.del;
    DB.favs = (Array.isArray(DB.favs) ? DB.favs : DEFAULT_FAVS.slice()).filter(x => x !== name);
    save(); renderDay();
    return;
  }
  const chip = e.target.closest('.chip');
  if (chip) addItemByName(chip.dataset.name);
});

$('item-list').addEventListener('click', e => {
  const step = e.target.closest('.step-btn');
  if (step) {
    const day = DB.days[viewDate];
    const it = day && day.items && day.items[Number(step.dataset.i)];
    if (!it) return;
    const act = step.dataset.act;
    if (act === 'goal+') it.goal = Math.min((Number(it.goal) || 3) + 1, 30);
    else if (act === 'goal-') it.goal = Math.max((Number(it.goal) || 3) - 1, 1);
    else if (act === 'done+') {
      it.sets = Math.min((Number(it.sets) || 0) + 1, 99);
      const g = Number(it.goal) || 3;
      if (it.sets >= g) it.done = true;          /* 做满目标自动打勾 */
    } else if (act === 'done-') {
      it.sets = Math.max((Number(it.sets) || 0) - 1, 0);
      if (it.sets < (Number(it.goal) || 3)) it.done = false;
    }
    touch(day); save(); renderDay(); renderCalendar();
    return;
  }
  const btn = e.target.closest('.item-del');
  if (!btn) return;
  const day = DB.days[viewDate];
  if (day && Array.isArray(day.items)) {
    day.items.splice(Number(btn.dataset.i), 1);
    touch(day); save(); renderAll();
  }
});
$('item-list').addEventListener('change', e => {
  const box = e.target.closest('.item-done');
  if (box) {
    const day = DB.days[viewDate];
    const it = day && day.items && day.items[Number(box.dataset.i)];
    if (!it) return;
    it.done = !!box.checked;
    touch(day); save(); renderAll();
    return;
  }
  const inp = e.target.closest('.item-detail');
  if (inp) {
    const day = DB.days[viewDate];
    const it = day && day.items && day.items[Number(inp.dataset.i)];
    if (!it) return;
    it.detail = inp.value.trim();
    touch(day); save(); renderDay();
  }
});

$('copy-last').addEventListener('click', () => {
  const last = prevDayWithItems(viewDate);
  if (!last) return;
  const src = DB.days[last.key];
  const day = ensureDay(viewDate);
  if (!Array.isArray(day.items)) day.items = [];
  src.items.forEach(it => {
    if (!day.items.some(x => x.name === it.name)) {
      day.items.push({ name: it.name, detail: it.detail || '' });
    }
  });
  if (!day.type && src.type) day.type = src.type;
  touch(day);
  save(); renderAll();
});

$('confirm-chk').addEventListener('change', () => {
  const day = DB.days[viewDate] || {};
  renderConfirm(day, day.type || null);
});
$('confirm-save').addEventListener('click', confirmSave);

/* ---------- 喝水 ---------- */
function addCup(delta) {
  const day = ensureDay(TODAY());
  if (delta > 0) {
    day.cups = (day.cups || 0) + 1;
    (day.cupTimes = day.cupTimes || []).push(new Date().toTimeString().slice(0, 5));
  } else {
    day.cups = Math.max((day.cups || 0) - 1, 0);
    if (Array.isArray(day.cupTimes) && day.cupTimes.length) day.cupTimes.pop();
  }
  save(); renderAll();
}
$('cup-plus').addEventListener('click', () => addCup(1));
$('cup-minus').addEventListener('click', () => addCup(-1));
$('custom-add').addEventListener('click', () => {
  const inp = $('custom-ml');
  const ml = parseInt(inp.value, 10);
  if (!ml || ml <= 0) { shake(inp); return; }
  const day = ensureDay(TODAY());
  const extra = Math.round(ml / Math.max(1, DB.profile.cupMl || 250) * 10) / 10;
  day.cups = Math.round(((day.cups || 0) + extra) * 10) / 10;
  inp.value = '';
  save(); renderAll();
});
function bindSetting(id, fn) {
  $(id).addEventListener('change', e => { fn(e.target.value); save(); renderAll(); });
}
bindSetting('set-cup', v => { const n = parseInt(v, 10); if (n >= 50) DB.profile.cupMl = n; });
bindSetting('set-goal', v => { const n = parseInt(v, 10); if (n >= 1) DB.profile.cupsGoal = n; });
$('advice-apply').addEventListener('click', () => {
  const a = waterAdvice();
  const cup = Math.max(50, DB.profile.cupMl || 250);
  DB.profile.cupsGoal = Math.max(1, Math.round(a.ml / cup));
  save(); renderAll();
});

/* ---------- 我的 ---------- */
$('bmi-save').addEventListener('click', () => {
  const h = parseFloat($('bmi-h').value), w = parseFloat($('bmi-w').value);
  if (!h || !w || h < 80 || h > 250 || w < 25 || w > 250) {
    shake($('bmi-h')); shake($('bmi-w'));
    return;
  }
  DB.profile.heightCm = h; DB.profile.weightKg = w;
  showBmi(h, w, true); save(); renderMe();
});
/* ---------- 点日历:弹出当天练了什么 ---------- */
function openDayModal(k) {
  const d = fromKey(k);
  const rel = k === TODAY() ? ' · 今天' : (k === keyOf(d2(1)) ? ' · 明天' : (k === keyOf(d2(-1)) ? ' · 昨天' : ''));
  $('day-modal-title').textContent = fmtFull(d) + rel;

  const day = DB.days[k] || {};
  const items = Array.isArray(day.items) ? day.items : [];
  const rows = [];
  const tName = typeName(day.type);
  const badge = day.confirmed ? '已确认' : (dayHasLog(day) ? '待确认' : '无记录');
  rows.push('<div class="dm-row"><span class="dm-k">运动类型</span><span class="dm-v">' +
    (day.type ? tName : '未选择') + '</span></div>');
  rows.push('<div class="dm-row"><span class="dm-k">状态</span><span class="dm-v">' + badge + '</span></div>');
  if (day.type === 'rest') {
    rows.push('<div class="dm-note">这天是休息日,好好恢复 🌙</div>');
  } else if (!items.length) {
    rows.push('<div class="dm-note">这天还没有记录锻炼项目</div>');
  } else {
    rows.push('<div class="dm-sep">锻炼项目</div>');
    items.forEach(function (it) {
      const goal = Number(it.goal) || 3;
      const sets = Number(it.sets) || 0;
      let sub = it.name;
      if (day.type === 'strength') sub += ' · ' + sets + '/' + goal + ' 组';
      if (it.detail) sub += ' · ' + it.detail;
      rows.push('<div class="dm-item' + (it.done || (day.type === 'strength' && sets >= goal) ? ' done' : '') + '">' +
        '<span class="dm-dot"></span>' + esc(sub) + '</div>');
    });
  }
  const cups = Number(day.cups) || 0;
  if (cups > 0) {
    rows.push('<div class="dm-row"><span class="dm-k">喝水</span><span class="dm-v">' + cups + ' 杯</span></div>');
  }
  if (day.confirmedAt) {
    rows.push('<div class="dm-note">确认时间:' + String(day.confirmedAt).slice(5) + '</div>');
  }
  $('day-modal-body').innerHTML = rows.join('');
  $('day-modal').hidden = false;
}
function closeDayModal() { $('day-modal').hidden = true; }

/* ---------- 应用内使用说明弹层(不跳转页面,避免 WebView 卡死) ---------- */
function openHelp() {
  const m = $('help-modal');
  if (!m) return;
  m.hidden = false;
  const body = $('help-body');
  if (body) body.scrollTop = 0;
}
function closeHelp() {
  const m = $('help-modal');
  if (m) m.hidden = true;
}
if ($('btn-help')) $('btn-help').addEventListener('click', openHelp);
if ($('help-close')) $('help-close').addEventListener('click', closeHelp);
if ($('help-mask')) $('help-mask').addEventListener('click', closeHelp);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHelp(); });

renderAll();

/* 供自测脚本读取当前内存数据(浏览器里无副作用) */
if (typeof window !== 'undefined') window.__fitlog = { get DB() { return DB; }, save: save, setDB: function (d) { DB = d; if (!Array.isArray(DB.favs)) DB.favs = DEFAULT_FAVS.slice(); } };

// Service Worker:仅网页版注册(PWA 离线);WebView 容器里由 window.__NO_SW 关闭
if ('serviceWorker' in navigator && !window.__NO_SW) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}