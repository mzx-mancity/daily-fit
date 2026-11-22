const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/app.js', 'utf8');

function makeEl(id) {
  return {
    id: id, hidden: false, value: '', style: {}, dataset: {}, textContent: '', innerHTML: '', className: '',
    _listeners: {},
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    addEventListener: function(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    closest: function() { return null; },
    click: function() { const self = this; (this._listeners.click || []).forEach(function(fn) { fn({ target: self }); }); }
  };
}
const els = {};
function el(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }
[ 'date-title','back-today','prev-day','next-day','rest-tip','items-card','item-input','item-add',
  'item-list','streak-num','week-num','week-strip','ring-fg','ring-cups','ring-goal','ring-ml',
  'cup-plus','cup-minus','custom-ml','custom-add','set-cup','set-goal','set-note','water-bars','water-bar-x',
  'bmi-h','bmi-w','bmi-save','bmi-result','bmi-num','bmi-tag','bmi-pointer','wlist','quick-row',
  'diet-date','diet-today','diet-prev','diet-next','diet-total','diet-goal','diet-bar','diet-left',
  'diet-burn','set-kcal','diet-list','food-name','food-kcal','food-add','food-quick','diet-bars',
  'diet-bar-x','keep-text','keep-import','keep-note','meal-row',
  'keep-shot','keep-cam','keep-file','keep-file-cam','keep-progress','keep-bar','keep-pct','keep-preview','keep-img'
].forEach(el);

const chips = ['臀','腿','肩','胸','背','手臂','核心','跑步','跳绳','游泳','骑行','瑜伽'].map(function(n) {
  const c = makeEl('chip-' + n); c.dataset.name = n; return c;
});
const typeBtns = ['cardio','strength','rest'].map(function(t) { const b = makeEl('t-' + t); b.dataset.type = t; return b; });
const tabs = ['workout','water','diet','me'].map(function(p) { const t = makeEl('tab-' + p); t.dataset.page = p; return t; });
const pages = ['workout','water','diet','me'].map(function(p) { const pg = makeEl('page-' + p); return pg; });
const mealBtns = ['早餐','午餐','晚餐','加餐'].map(function(m) { const b = makeEl('meal-' + m); b.dataset.meal = m; return b; });

const store = {};
const localStorage = {
  getItem: function(k) { return k in store ? store[k] : null; },
  setItem: function(k, v) { store[k] = String(v); }
};
const location = { hash: '#workout' };
const history = { replaceState: function(s, ti, url) {
  if (url) location.hash = url.indexOf('#') >= 0 ? url.slice(url.indexOf('#')) : '';
} };
const document = {
  getElementById: function(id) { return el(id); },
  querySelectorAll: function(sel) {
    if (sel === '.type-btn') return typeBtns;
    if (sel === '.tab') return tabs;
    if (sel === '.page') return pages;
    if (sel === '#quick-row .chip') return chips;
    if (sel === '#meal-row .meal-btn') return mealBtns;
    return [];
  },
  createElement: function() { return makeEl('anon'); },
  head: { appendChild: function(){} },
  body: { appendChild: function(){} }
};
const sandbox = {
  document: document, localStorage: localStorage, location: location, history: history,
  window: { addEventListener: function(){} }, console: console,
  setTimeout: function(fn){ return 0; }, clearTimeout: function(){},
  confirm: function(){ return true; }, alert: function(){},
  Blob: function(p){ this.size = p ? p.length : 0; },
  URL: { createObjectURL: function(){ return 'blob:t'; }, revokeObjectURL: function(){} },
  FileReader: function(){}
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'app.js' });

const fails = [];
function ok(cond, name) { if (cond) console.log('PASS', name); else { fails.push(name); console.log('FAIL', name); } }
function keyOf(d) { const p = function(n){ return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
const today = keyOf(new Date());
function DBd() { return JSON.parse(store['fitlog_v1']); }
function fire(elm, type) { (elm._listeners[type] || []).forEach(function(fn) { fn({ target: elm }); }); }
function fireT(elm, type, target) { (elm._listeners[type] || []).forEach(function(fn) { fn({ target: target }); }); }

// ---- 锻炼 ----
fire(typeBtns[0], 'click');
ok(DBd().days[today].type === 'cardio', 'T1 类型=cardio');
el('item-input').value = '深蹲';
fire(el('item-add'), 'click');
ok(DBd().days[today].items[0].name === '深蹲', 'T2 手动添加项目');
fire(chips[0], 'click'); fire(chips[0], 'click');
const names = DBd().days[today].items.map(function(i){ return i.name; });
ok(names.filter(function(n){ return n === '臀'; }).length === 1, 'T3 chip去重');

// ---- 喝水 ----
for (let i = 0; i < 5; i++) fire(el('cup-plus'), 'click');
ok(DBd().days[today].cups === 5, 'T4 记5杯');
fire(el('cup-minus'), 'click');
ok(DBd().days[today].cups === 4, 'T5 撤销1杯');
el('custom-ml').value = '125'; fire(el('custom-add'), 'click');
ok(Math.abs(DBd().days[today].cups - 4.5) < 0.001, 'T6 自定义125ml=+0.5杯');
el('set-cup').value = '300'; fire(el('set-cup'), 'change');
el('set-goal').value = '6'; fire(el('set-goal'), 'change');
ok(DBd().profile.cupMl === 300 && DBd().profile.cupsGoal === 6, 'T7 设置容量/目标');

// ---- 连续天数 ----
fire(el('prev-day'), 'click'); fire(typeBtns[1], 'click'); fire(el('back-today'), 'click');
ok(String(el('streak-num').textContent) === '2', 'T8 连续打卡=2');

// ---- BMI ----
el('bmi-h').value = '170'; el('bmi-w').value = '65'; fire(el('bmi-save'), 'click');
ok(DBd().profile.heightCm === 170, 'T9a 身高已存');
ok(/22\.5/.test(el('bmi-num').textContent), 'T9b BMI=22.5');
ok(el('bmi-tag').textContent.indexOf('正常') !== -1, 'T9c 分级=正常');
ok(DBd().profile.weightLog.length === 1, 'T9d 体重历史1条');

// ---- tab 路由 ----
fire(tabs[2], 'click');
ok(location.hash === '#diet', 'T10 tab路由=#diet');

// ---- 饮食 ----
el('food-name').value = '香蕉'; el('food-kcal').value = '105'; fire(el('food-add'), 'click');
ok(DBd().days[today].foods.length === 1 && DBd().days[today].foods[0].meal === '早餐', 'D1 添加香蕉(早餐)');
ok(String(el('diet-total').textContent) === '105', 'D2 今日摄入=105');

fireT(el('food-quick'), 'click', { closest: function() {
  return { dataset: { name: '米饭', kcal: '174' } }; } });
ok(String(el('diet-total').textContent) === '279', 'D3 快捷chip加米饭→279');

fireT(el('diet-list'), 'click', { closest: function() {
  return { dataset: { act: 'plus', i: '1' } }; } });
ok(Math.abs(DBd().days[today].foods[1].qty - 1.5) < 0.001, 'D4 份数+0.5');
ok(String(el('diet-total').textContent) === '366', 'D5 米饭1.5碗→366');

fireT(el('diet-list'), 'click', { closest: function() {
  return { dataset: { act: 'del', i: '0' } }; } });
ok(String(el('diet-total').textContent) === '261', 'D6 删除香蕉→261');

// 自定义食物入库
el('food-name').value = '麦片杯'; el('food-kcal').value = '210'; fire(el('food-add'), 'click');
ok(DBd().foods.some(function(f){ return f.name === '麦片杯'; }), 'D7 自定义食物进库');
ok(el('food-quick').innerHTML.indexOf('麦片杯') !== -1, 'D8 自定义食物出现在快捷区');

// 目标
el('set-kcal').value = '2000'; fire(el('set-kcal'), 'change');
ok(DBd().profile.kcalGoal === 2000 && String(el('diet-goal').textContent) === '2000', 'D9 目标=2000');

// 超出提示
el('food-name').value = '大餐'; el('food-kcal').value = '3000'; fire(el('food-add'), 'click');
ok(String(el('diet-left').textContent).indexOf('超出') !== -1, 'D10 超标提示(' + el('diet-left').textContent + ')');

// ---- Keep 导入 ----
el('keep-text').value = '2026年11月20日 跑步 5.00 公里 用时 00:32:15 消耗 320 千卡';
fire(el('keep-import'), 'click');
const kd = '2026-11-20';
ok(DBd().days[kd] && DBd().days[kd].type === 'cardio', 'K1 Keep 生成有氧记录');
ok(DBd().days[kd].kcalBurn === 320, 'K2 消耗=320(' + (DBd().days[kd] && DBd().days[kd].kcalBurn) + ')');
ok(DBd().days[kd].items[0].name === '跑步 5km', 'K3 项目名=跑步 5km(' + DBd().days[kd].items[0].name + ')');
ok(DBd().days[kd].items[0].detail.indexOf('32 分钟') !== -1, 'K4 详情含时长');

// 无 kcal 时按 MET 估算
el('keep-text').value = '骑行 40 分钟';
fire(el('keep-import'), 'click');
const tb = DBd().days[today].kcalBurn;
ok(tb > 250 && tb < 400, 'K5 无消耗时按体重估算(' + tb + ' kcal)');

// 无法识别时不写数据
const before = JSON.stringify(DBd());
el('keep-text').value = '今天天气不错';
fire(el('keep-import'), 'click');
ok(JSON.stringify(DBd()) === before, 'K6 无法识别不改数据');
ok(el('keep-note').textContent.indexOf('没认出') !== -1, 'K7 提示未识别');

// ---- Keep 截图 OCR 文本解析 ----
const ocrA = '2026年11月20日 AA\n跑步\n\nD.00 和\n运动时长\n00:32:15\n\n消耗\n\n320 干卡\n平均配速 06\'27" / 公里';
const pA = sandbox.parseKeepText(ocrA);
ok(pA.length === 1 && pA[0].date === '2026-11-20', 'K8 OCR 文本按日期切块(' + pA.length + ')');
ok(pA[0] && pA[0].name === '跑步', 'K9 OCR 识别运动名称(' + (pA[0] && pA[0].name) + ')');
ok(pA[0] && pA[0].km === 5, 'K10 数字混淆 D.00→5.00(' + (pA[0] && pA[0].km) + ')');
ok(pA[0] && pA[0].kcal === 320, 'K11 干卡→千卡 320(' + (pA[0] && pA[0].kcal) + ')');
ok(pA[0] && pA[0].mins === 32, 'K12 时长 32 分钟(' + (pA[0] && pA[0].mins) + ')');

const ocrC = '2026年11月21日 周六\n跑步\n8.06\n运动时长\n00:48:20\n消耗\n512 于飞';
const pC = sandbox.parseKeepText(ocrC);
ok(pC.length === 1 && pC[0].kcal === 512, 'K13 消耗兜底取数 512(' + (pC[0] && pC[0].kcal) + ')');
ok(pC[0] && pC[0].km === 8.06, 'K14 距离 8.06(' + (pC[0] && pC[0].km) + ')');

const ocrList = '2026年11月20日 周五\n跑步\n5.00公里\n00:32:15\n320千卡\n2026年11月19日 周四\n骑行\n12.50公里\n00:45:00\n280千卡';
const pL = sandbox.parseKeepText(ocrList);
ok(pL.length === 2, 'K15 一张图两条记录(' + pL.length + ')');
ok(pL[1] && pL[1].name === '骑行' && pL[1].kcal === 280, 'K16 第二条 骑行 280');

el('keep-text').value = ocrList;
sandbox.doKeepImport();
ok(DBd().days['2026-11-19'] && DBd().days['2026-11-19'].items.length === 1, 'K17 重复导入不重复加项目');
ok(String(el('keep-note').textContent).indexOf('跳过') !== -1, 'K18 重复提示(' + el('keep-note').textContent + ')');

ok(sandbox.fixOcr('05：30 干卡').indexOf('05:30 千卡') !== -1, 'K19 全角冒号+干卡纠错');

// ---- 真实 OCR 输出回放(设 OCR_TEXT=文件 时) ----
if (process.env.OCR_TEXT) {
  const txt = fs.readFileSync(process.env.OCR_TEXT, 'utf8');
  console.log('OCR-REAL ' + process.env.OCR_TEXT.split(/[\\/]/).pop() + ' => ' + JSON.stringify(sandbox.parseKeepText(txt)));
}

if (fails.length) { console.log('SMOKE FAILED:', fails.join('; ')); process.exit(1); }
console.log('SMOKE ALL PASS (' + (28 + 12) + ' checks)');
