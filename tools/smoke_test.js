const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/app.js', 'utf8');

function makeEl(id) {
  return {
    id: id, hidden: false, value: '', checked: false, disabled: false,
    style: {}, dataset: {}, textContent: '', innerHTML: '', className: '',
    _listeners: {},
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    addEventListener: function(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    closest: function() { return null; },
    click: function() { const self = this; (this._listeners.click || []).forEach(function(fn) { fn({ target: self }); }); }
  };
}
const els = {};
function el(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }
[ 'cal-prev','cal-next','cal-month','cal-grid','cal-streak','cal-month-count','cal-today','cal-card',
  'day-title','day-tag','rest-tip','items-card','item-input','item-add','quick-row','item-list','copy-last',
  'confirm-chk','confirm-save','confirm-state','confirm-card',
  'ring-fg','ring-cups','ring-goal','ring-ml','cup-plus','cup-minus','custom-ml','custom-add',
  'set-cup','set-goal','set-note','water-bars','water-bar-x','water-date',
  'cal-clear','cal-clear-text','cal-clear-ok','cal-clear-cancel',
  'bmi-h','bmi-w','bmi-save','bmi-result','bmi-num','bmi-tag','bmi-pointer','wlist','btn-export','btn-import'
].forEach(el);
el('cal-clear').hidden = true;      /* 初始隐藏(真实 DOM 里就是 hidden 属性) */

const typeBtns = ['cardio','strength','rest'].map(function(t) { const b = makeEl('t-' + t); b.dataset.type = t; return b; });
const chips = ['臀','腿','肩','胸','背','手臂','核心','跑步','跳绳','游泳','骑行','瑜伽'].map(function(n) {
  const c = makeEl('chip-' + n); c.dataset.name = n; return c;
});
const tabs = ['workout','water','me'].map(function(p) { const t = makeEl('tab-' + p); t.dataset.page = p; return t; });
const pages = ['workout','water','me'].map(function(p) { const g = makeEl('page-' + p); g.id = 'page-' + p; return g; });

const store = {};
const localStorage = {
  getItem: function(k) { return k in store ? store[k] : null; },
  setItem: function(k, v) { store[k] = String(v); }
};
const location = { hash: '#workout' };
const history = { replaceState: function(s, t, url) { if (url && url.indexOf('#') >= 0) location.hash = url.slice(url.indexOf('#')); } };
const document = {
  getElementById: function(id) { return el(id); },
  querySelectorAll: function(sel) {
    if (sel === '.type-btn') return typeBtns;
    if (sel === '.tab') return tabs;
    if (sel === '.page') return pages;
    if (sel === '#quick-row .chip') return chips;
    return [];
  },
  createElement: function() { return makeEl('anon'); }
};
let fakeNow = Date.now();
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { super(...a); } static now() { return fakeNow; } }
function advance(ms) { fakeNow += ms; }        /* 模拟"过了这么久" */

const sandbox = {
  Date: FakeDate,
  document: document, localStorage: localStorage, location: location, history: history,
  navigator: { serviceWorker: { register: function() { return { catch: function() {} }; } } },
  window: { addEventListener: function(){}, scrollTo: function(){} },
  console: console,
  setTimeout: function(){ return 0; }, clearTimeout: function(){},
  confirm: function(){ return true; }, alert: function(){},
  Blob: function(p){ this.size = p ? p.length : 0; },
  URL: { createObjectURL: function(){ return 'blob:t'; }, revokeObjectURL: function(){} },
  FileReader: function(){}
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'app.js' });

const fails = [];
let n = 0;
function ok(cond, name) { n++; if (cond) console.log('PASS', name); else { fails.push(name); console.log('FAIL', name); } }
function keyOf(d) { const p = function(x){ return String(x).padStart(2,'0'); };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()); }
const today = keyOf(new Date());
function DBd() { return JSON.parse(store['fitlog_v1']); }
function fire(e, t) { (e._listeners[t] || []).forEach(function(fn) { fn({ target: e }); }); }
function fireT(e, t, target) { (e._listeners[t] || []).forEach(function(fn) { fn({ target: target }); }); }
function calDayTarget(k) { return { closest: function() { return { dataset: { k: k } }; } }; }

/* ---- 日历骨架 ---- */
const now = new Date();
ok(el('cal-month').textContent === now.getFullYear() + '年' + (now.getMonth()+1) + '月', 'C1 月标题=当前年月');
const gridHtml = el('cal-grid').innerHTML;
const cells = (gridHtml.match(/data-k="/g) || []).length;
const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
ok(cells === daysInMonth, 'C2 日历格子数=本月天数(' + cells + '/' + daysInMonth + ')');
ok(gridHtml.indexOf('data-k="' + today + '"') !== -1, 'C3 今天那格存在');
ok(/class="cal-day[^"]*today/.test(gridHtml), 'C4 今天有 today 标记');
ok(/class="cal-day[^"]*sel/.test(gridHtml), 'C5 默认选中今天');

/* ---- 切月(含跨年) ---- */
const m0 = el('cal-month').textContent;
for (let i = 0; i < 13; i++) fire(el('cal-prev'), 'click');
const m1 = el('cal-month').textContent;
const d13 = new Date(now.getFullYear(), now.getMonth() - 13, 1);
ok(m1 === d13.getFullYear() + '年' + (d13.getMonth()+1) + '月', 'C6 连点 13 次上月跨年正确(' + m0 + ' -> ' + m1 + ')');
for (let i = 0; i < 13; i++) fire(el('cal-next'), 'click');
ok(el('cal-month').textContent === m0, 'C7 再点 13 次下月回到原月');

/* ---- 点日历选日 ---- */
const other = keyOf(new Date(now.getFullYear(), now.getMonth(), 15)) === today
  ? keyOf(new Date(now.getFullYear(), now.getMonth(), 16))
  : keyOf(new Date(now.getFullYear(), now.getMonth(), 15));
fireT(el('cal-grid'), 'click', calDayTarget(other));
ok(el('day-title').textContent.indexOf('月' + Number(other.slice(8)) + '日') !== -1, 'C8 点日历切到该日(' + el('day-title').textContent + ')');

/* ---- 类型 ---- */
fire(typeBtns[1], 'click');
ok(DBd().days[other] && DBd().days[other].type === 'strength', 'C9 选无氧入库');
ok(el('day-tag').textContent.indexOf('无氧') !== -1, 'C10 日期条标签显示无氧(' + el('day-tag').textContent + ')');
fire(typeBtns[1], 'click');
ok(!DBd().days[other].type, 'C11 再点同一类型=取消');
fire(typeBtns[1], 'click');

/* ---- 项目 ---- */
el('item-input').value = '深蹲';
fire(el('item-add'), 'click');
ok(DBd().days[other].items.length === 1 && DBd().days[other].items[0].name === '深蹲', 'C12 添加项目');
fire(chips[0], 'click');
fire(chips[0], 'click');
ok(DBd().days[other].items.filter(function(x){ return x.name === '臀'; }).length === 1, 'C13 chip 去重');
ok(DBd().days[other].items.length === 2, 'C14 项目数=2');

fireT(el('item-list'), 'change', { closest: function(sel) {
  return sel === '.item-done' ? { dataset: { i: '0' }, checked: true } : null; } });
ok(DBd().days[other].items[0].done === true, 'C15 勾选完成');

fireT(el('item-list'), 'change', { closest: function(sel) {
  return sel === '.item-detail' ? { dataset: { i: '0' }, value: '4×12' } : null; } });
ok(DBd().days[other].items[0].detail === '4×12', 'C16 保存详情');

fireT(el('item-list'), 'click', { closest: function(sel) {
  return sel === '.item-del' ? { dataset: { i: '1' } } : null; } });
ok(DBd().days[other].items.length === 1, 'C17 删除项目');

/* ---- 沿用上次 ---- */
const later = keyOf(new Date(now.getFullYear(), now.getMonth(), 20));
fireT(el('cal-grid'), 'click', calDayTarget(later));
ok(el('copy-last').hidden === false && el('copy-last').textContent.indexOf('沿用') !== -1, 'C18 无项目日出现「沿用上次」');
fire(el('copy-last'), 'click');
ok(DBd().days[later].items.length === 1 && DBd().days[later].items[0].name === '深蹲', 'C19 沿用上次复制项目与类型');
ok(DBd().days[later].type === 'strength', 'C20 沿用上次也复制类型');

/* ---- 确认保存 ---- */
el('confirm-chk').checked = false;
fire(el('confirm-chk'), 'change');
ok(el('confirm-save').disabled === true, 'C21 未勾选时按钮禁用');
el('confirm-chk').checked = true;
fire(el('confirm-chk'), 'change');
ok(el('confirm-save').disabled === false, 'C22 勾选后可点');
fire(el('confirm-save'), 'click');
ok(DBd().days[later].confirmed === true && !!DBd().days[later].confirmedAt, 'C23 确认保存写入 confirmed/时间');
ok(el('confirm-save').textContent.indexOf('已保存') !== -1, 'C24 按钮变已保存');

fire(chips[1], 'click');
ok(DBd().days[later].confirmed === false && DBd().days[later].dirty === true, 'C25 改动后打回待确认');
ok(el('confirm-state').textContent.indexOf('改动') !== -1, 'C26 提示需重新确认');

/* ---- 休息日 ---- */
fire(typeBtns[2], 'click');
ok(DBd().days[later].type === 'rest', 'C27 休息日入库');
ok(el('rest-tip').hidden === false, 'C28 休息日显示提示');
ok(el('items-card').style.display === 'none', 'C29 休息日隐藏项目卡');

/* ---- 喝水(永远今天) ---- */
fireT(el('cal-grid'), 'click', calDayTarget(other));   /* 故意把选中日切走 */
const before = ((DBd().days[today] || {}).cups) || 0;
fire(el('cup-plus'), 'click');
ok(((DBd().days[today] || {}).cups) === before + 1, 'C30 记一杯记到今天(与选中日无关)');
fire(el('cup-minus'), 'click');
ok(((DBd().days[today] || {}).cups) === before, 'C31 撤销一杯');
el('custom-ml').value = '125';
fire(el('custom-add'), 'click');
ok(Math.abs(DBd().days[today].cups - (before + 0.5)) < 0.001, 'C32 自定义 125ml = +0.5 杯');
el('set-cup').value = '300'; fire(el('set-cup'), 'change');
el('set-goal').value = '6'; fire(el('set-goal'), 'change');
ok(DBd().profile.cupMl === 300 && DBd().profile.cupsGoal === 6, 'C33 水杯设置生效');
ok(el('set-note').textContent.indexOf('1800') !== -1, 'C34 目标总量文案=6×300');

/* ---- BMI ---- */
el('bmi-h').value = '170'; el('bmi-w').value = '65';
fire(el('bmi-save'), 'click');
ok(DBd().profile.heightCm === 170 && DBd().profile.weightKg === 65, 'C35 身高体重入库');
ok(/22\.5/.test(el('bmi-num').textContent), 'C36 BMI=22.5');
ok(el('bmi-tag').textContent === '正常', 'C37 分级=正常');
ok(DBd().profile.weightLog.length === 1, 'C38 体重历史 1 条');

/* ---- 路由 ---- */
fire(tabs[1], 'click');
ok(location.hash === '#water', 'C39 切到喝水 hash');
fire(tabs[2], 'click');
ok(location.hash === '#me', 'C40 切到我的 hash');

/* ---- 数据完整性 ---- */
const dump = DBd();
ok(!!dump.days[today] && !!dump.days[other] && !!dump.days[later], 'C41 多天数据并存');
ok(Object.keys(dump.days).length >= 3, 'C42 天数≥3');

/* ---- 未来日期 ---- */
const future = keyOf(new Date(now.getFullYear(), now.getMonth(), Math.min(28, now.getDate() + 3)));
if (future > today) {
  fireT(el('cal-grid'), 'click', calDayTarget(future));
  ok(el('day-tag').textContent === '未来日期', 'C43 未来日期有提示(' + el('day-tag').textContent + ')');
} else {
  ok(true, 'C43 未来日期(本月已到月底,跳过)');
}

/* ---- 静态回归 ---- */
const css = fs.readFileSync('css/style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
ok(css.indexOf('overflow-x:hidden') !== -1 && css.indexOf('min-width:0') !== -1, 'C44 横向溢出防护仍在');
ok(css.indexOf('left:0;right:0') !== -1, 'C45 tabbar 用 left/right 定位');
ok(html.indexOf('page-diet') === -1 && html.indexOf('饮食') === -1, 'C46 饮食页已删除');
ok(html.indexOf('Keep') === -1 && html.indexOf('keep-') === -1, 'C47 Keep 相关已删除');
ok(html.indexOf('cal-grid') !== -1 && html.indexOf('data-page="water"') !== -1, 'C48 三 Tab + 日历结构');
ok(/dailyfit-v10/.test(sw), 'C49 SW 缓存版本 v10');
ok(html.indexOf('v1.4.3') !== -1, 'C50 版本号 v1.4.3');
ok(html.indexOf('小橘爱运动') !== -1, 'C73 网页标题/底部已改名');
const mf = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
ok(mf.name === '小橘爱运动' && mf.short_name === '小橘爱运动', 'C74 PWA 名称=小橘爱运动');
ok(fs.readFileSync('android/res/values/strings.xml', 'utf8').indexOf('<string name="app_name">小橘爱运动</string>') !== -1, 'C75 安卓桌面名=小橘爱运动');


/* ---- 新增行为:切月选中 / 连续天数 / 改动重置勾选 / 滑动抑制 / 喝水文案 ---- */
/* 切到上个月:选中日应变成该月 1 号 */
fire(el('cal-prev'), 'click');
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const expectSel = (prevMonth.getMonth() + 1) + '月1日';
ok(el('day-title').textContent.indexOf(expectSel) === 0, 'C51 切月后自动选中该月 1 号(' + el('day-title').textContent + ')');

/* 切回本月:选中日回到今天 */
fire(el('cal-today'), 'click');
ok(el('day-title').textContent.indexOf((now.getMonth() + 1) + '月' + now.getDate() + '日') === 0, 'C52 回到今天');

/* 连续天数:昨天也练了 → 今天+昨天 = 2 */
const yDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
const yk = keyOf(yDate);
fireT(el('cal-grid'), 'click', calDayTarget(yk));
fire(typeBtns[0], 'click');
fire(el('cal-today'), 'click');
ok(el('cal-streak').textContent === '连续 1 天', 'C53 今天还没记时连续天数从昨天算(' + el('cal-streak').textContent + ')');

/* 改动后确认勾选被重置 */
fireT(el('cal-grid'), 'click', calDayTarget(today));
fire(typeBtns[0], 'click');               /* 记今天有氧 */
el('confirm-chk').checked = true;
fire(el('confirm-chk'), 'change');
fire(el('confirm-save'), 'click');
ok(DBd().days[today].confirmed === true, 'C54 今天可确认');
fire(chips[2], 'click');                  /* 加个项目 → 打回未确认 */
ok(el('confirm-chk').checked === false, 'C55 改动后勾选框被重置');
ok(el('confirm-save').disabled === true, 'C56 改动后必须重新勾选');

/* 滑动翻月:触发 touch 事件,且紧随的点击被吃掉 */
const monthBefore = el('cal-month').textContent;
const beforeSel = el('day-title').textContent;
function touchEv(x, y, key) {
  const ev = { touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] };
  (el('cal-card')._listeners[key] || []).forEach(function(fn) { fn(ev); });
}
touchEv(300, 200, 'touchstart');
touchEv(120, 205, 'touchend');            /* 向左滑 → 下个月 */
ok(el('cal-month').textContent !== monthBefore, 'C57 左滑切到下个月');
fireT(el('cal-grid'), 'click', calDayTarget(keyOf(new Date(now.getFullYear(), now.getMonth() + 1, 5))));
ok(el('day-title').textContent === beforeSel || el('day-title').textContent.indexOf('月1日') > 0, 'C58 滑动后紧接的点击被忽略');

/* 喝水文案 */
ok(el('water-date').textContent.indexOf('今天') === 0, 'C59 喝水页标注「今天」(' + el('water-date').textContent + ')');

/* 导出结构自检 */
const dump2 = DBd();
ok(typeof dump2.days === 'object' && typeof dump2.profile === 'object' && Array.isArray(dump2.profile.weightLog), 'C60 数据结构完整');


/* ---- 一键清空 + 撤销 ---- */
const ck = keyOf(new Date(now.getFullYear(), now.getMonth(), Math.min(28, now.getDate() + 1)));

advance(2000);
fireT(el('cal-grid'), 'click', calDayTarget(ck));
fire(typeBtns[0], 'click');
fire(chips[0], 'click');
el('confirm-chk').checked = true; fire(el('confirm-chk'), 'change');
fire(el('confirm-save'), 'click');
ok(!!(DBd().days[ck] && DBd().days[ck].type === 'cardio' && DBd().days[ck].confirmed === true), 'C61 准备一条已确认记录');
sandbox.renderAll();
ok(el('cal-grid').innerHTML.indexOf('t-cardio') !== -1, 'C62 日历格子已有色');
ok(el('day-clear').hidden === false, 'C63 有记录时「清空」按钮出现');

/* 切到没记录的一天:按钮自动隐藏 */
advance(2000);
fireT(el('cal-grid'), 'click', calDayTarget(keyOf(new Date(now.getFullYear(), now.getMonth(), 26))));
ok(el('day-clear').hidden === true, 'C64 切到无记录日按钮隐藏');

/* 回到有记录的这天,清空 */
advance(2000);
fireT(el('cal-grid'), 'click', calDayTarget(ck));
fire(el('day-clear'), 'click');
const after = DBd().days[ck] || {};
ok(!after.type && !after.items && !after.confirmed, 'C65 一键清空:类型/项目/确认都移除');
const cellOf = (k) => {
  const m = el('cal-grid').innerHTML.match(new RegExp('<button class="([^"]*)" data-k="' + k + '"'));
  return m ? m[1] : '(missing)';
};
ok(cellOf(ck).indexOf('t-cardio') === -1 && cellOf(ck).indexOf('cal-ok') === -1, 'C66 该日颜色与✓都消失(' + cellOf(ck) + ')');
ok(el('snack').hidden === false && el('snack-text').textContent.indexOf('已清空') === 0, 'C67 出现撤销提示(' + el('snack-text').textContent + ')');

/* 撤销:整条记录回来 */
fire(el('snack-undo'), 'click');
ok(!!(DBd().days[ck] && DBd().days[ck].type === 'cardio' && DBd().days[ck].confirmed === true), 'C68 撤销后记录恢复');
ok(DBd().days[ck].items.length === 1, 'C69 撤销后项目也恢复');
ok(el('snack-text').textContent === '已撤销', 'C70 提示已撤销');

/* 清空保留喝水 */
advance(2000);
fireT(el('cal-grid'), 'click', calDayTarget(today));
const cupsBefore = ((DBd().days[today] || {}).cups) || 0;
fire(el('cup-plus'), 'click'); fire(el('cup-plus'), 'click');
if (!(DBd().days[today] || {}).type) fire(typeBtns[1], 'click');
fireT(el('cal-grid'), 'click', calDayTarget(today));
fire(el('day-clear'), 'click');
ok(Math.abs(((DBd().days[today] || {}).cups) - (cupsBefore + 2)) < 1e-6, 'C71 清空不影响喝水(' + ((DBd().days[today] || {}).cups) + ' 杯)');
ok(!(DBd().days[today] || {}).type, 'C72 清空后类型已移除');

/* 切换日期只看不重建整月:实测主流程不依赖整月重建(stub 无 querySelectorAll 时回退重建仍正确) */
advance(2000);
fireT(el('cal-grid'), 'click', calDayTarget(ck));
ok(el('day-title').textContent.indexOf((fromKeyCK(ck).getMonth() + 1) + '月' + fromKeyCK(ck).getDate() + '日') === 0, 'C73 点日期立刻切换标题(' + el('day-title').textContent + ')');

function fromKeyCK(k) { const a = k.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }

/* 结构 */
const swTxt = fs.readFileSync('sw.js', 'utf8');
ok(swTxt.indexOf('dailyfit-v10') !== -1, 'C74 SW 缓存版本 v10');
ok(fs.readFileSync('index.html', 'utf8').indexOf('cal-clear') === -1, 'C75 旧的日历内确认条已移除');
ok(fs.readFileSync('css/style.css', 'utf8').indexOf('touch-action:manipulation') !== -1, 'C77 已加 touch-action 消除点击延迟');
/* 提示文案 */
ok(fs.readFileSync('index.html', 'utf8').indexOf('点日期看当天记录') !== -1, 'C76 页面上有新提示文案');

if (fails.length) { console.log('SMOKE FAILED:', fails.join('; ')); process.exit(1); }
console.log('SMOKE ALL PASS (' + n + ' checks)');