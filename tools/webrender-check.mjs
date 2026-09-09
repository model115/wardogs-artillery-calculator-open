
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const webDir = process.argv[2] ?? join(import.meta.dirname, '..', 'web');

const FILES = ['core/ballistics.js', 'core/terrain.js', 'core/reach.js', 'store.js', 'app.js'];
const source = FILES.map((f) => readFileSync(join(webDir, f), 'utf8')).join('\n;\n');

const calls = [];
function makeCtx() {
  return new Proxy({}, {
    get(_t, key) {
      if (key === 'measureText') return () => ({ width: 12 });
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (..._args) => { calls.push(String(key)); };
    },
    set() { return true; },
  });
}

const elements = new Map();
function el(id) {
  if (elements.has(id)) return elements.get(id);
  const node = {
    id,
    textContent: '', innerHTML: '', value: '', hidden: false, checked: true,
    style: {}, dataset: {},
    listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },

    click() { for (const fn of this.listeners.click || []) fn({ target: this }); },
    querySelectorAll: () => [],
    appendChild() {},
    files: [],
  };
  elements.set(id, node);
  return node;
}

const ctx = makeCtx();
const canvas = {
  clientWidth: 1600, clientHeight: 900, width: 1600, height: 900,
  style: {}, addEventListener() {}, getContext: () => ctx,
};

class FakeImage {
  constructor() { this.width = 4096; this.height = 4096; this.naturalWidth = 4096; this.naturalHeight = 4096; }

  set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
  get src() { return this._src; }
}

const MAP = {
  id: 'bakurani', name: 'Bakurani',
  bounds: { minX: 23.35, maxX: 133.6, minY: 19.34, maxY: 129.65 },
  tileBounds: { minX: -0.03, maxX: 163.81, minY: -0.01, maxY: 163.83 },
  tileSize: 256, minZoom: 0, maxZoom: 7, extension: 'webp',
  markers: [
    { icon: 'tower', x: 8364, y: 7285, label: 'Tower 4', minZoom: 0.4 },
    { icon: 'valkyra', x: 11875, y: 7093, label: 'Valkyra', minZoom: 10 },
    { icon: 'manticore', x: 4009, y: 7752, label: 'Manticore', minZoom: 10 },
    { icon: 'lonestar', x: 8746, y: 3250, label: 'Lonestar', minZoom: 10 },
    { icon: 'weapons_vendor', x: 11830, y: 7073, label: 'Weapons Vendor', minZoom: 10 },
  ],
  polygons: [
    { label: 'VALKYRA Spawn', color: '#d86666', fillOpacity: 0.12, dashed: true,
      points: [{ x: 11750, y: 7376 }, { x: 12122, y: 7071 }, { x: 11818, y: 6699 }, { x: 11445, y: 7004 }] },
  ],
  zones: [],
};

const SNAP = {
  gun: { x: 81.6, y: 81.6, known: true },
  target: { x: 94.0, y: 88.0 },
  targets: [{ x: 90, y: 90 }, { x: 94.0, y: 88.0 }],
  zones: [{ x: 85.5, y: 78.2, radiusMeters: 180, label: '占领圈 1', color: '#ffd24d' }],
  impact: { x: 94.9, y: 88.9 },
  weapon: 'spg',
  mapId: 'bakurani', updatedAt: new Date().toISOString(), lastMessage: '目标 → (94.00, 88.00)',
};

const RING = {
  kind: 'gun', centerX: 81.6, centerY: 81.6,
  minRangeMeters: 1181, maxRangeMeters: 2629,
  minEffectiveMeters: 1181, maxEffectiveMeters: 2629,
  heightDeltaMeters: 0, minTerrainMeters: -985, maxTerrainMeters: -207, terrainUsed: true,
  samples: Array.from({ length: 36 }, (_, i) => ({
    azimuthDeg: i * 10, minRangeMeters: 1181 + i * 4, maxRangeMeters: 2629 - i * 4, reachable: true,
  })),
};

function json(obj) {
  return Promise.resolve({ ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });
}

const sandbox = {
  console,
  Math, Date, JSON, Number, String, Array, Object, Map, Set, Promise, Error,
  isNaN, parseFloat, parseInt, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  requestAnimationFrame: (cb) => { cb(); return 1; },
  TextDecoder, DataView, Uint8Array, Int16Array, ArrayBuffer, URLSearchParams,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  fetch: async (url) => {
    const u = String(url);
    if (u.includes('/api/health')) return json({ ok: true, version: 'test', maps: 1, weapons: ['spg/low'] });
    if (u.includes('/api/maps')) return json([MAP]);
    if (u.includes('/api/state')) return json(SNAP);
    if (u.includes('/api/solution')) return json({ inRange: true, rangeMeters: 1395.42, heightDeltaMeters: 293.41,
      deltaX: 12.4, deltaY: 6.4, baseMil: 62.33, sightCorrectionMil: 147.38, elevationMil: 209.71,
      flightTimeSeconds: 4.18, bearingDegrees: 62.7, converged: false, weapon: 'spg', arc: 'low',
      flatBaseMil: 62.33, flatElevationMil: 62.33, tableMinRangeMeters: 780, tableMaxRangeMeters: 2629,
      pitchDegrees: 13.97, rollDegrees: -16.53, tiltCorrectionMil: -248.35,
      correctedElevationMil: -40.3, correctedBearingDegrees: 59.3, bearingCorrectionDegrees: -3.4 });
    if (u.includes('/api/range-ring')) return json(RING);
    if (u.includes('/api/logs')) return json(['03:00 测试日志']);
    if (u.includes('/api/impact')) return json({ rangeErrorMeters: 121.7, bearingErrorDegrees: -1.46,
      rangeMetersPerMil: 4.938, rangePerMilFromTable: true, milCorrection: -24.7, bearingCorrectionMil: 26,
      next: { mil: -65.0, bearingDegrees: 60.8, bearingMil: 1080.2 }, fired: { mil: -40.3, bearingDegrees: 59.3 } });
    if (u.includes('/api/terrain-info')) return json({ mapId: 'bakurani', minHeightMeters: -1007, maxHeightMeters: 184 });
    return json({});
  },
  EventSource: class { constructor() { this.onmessage = null; this.onerror = null; } },
  Image: FakeImage,
  navigator: { clipboard: { writeText: async () => {} } },
  Blob: class { constructor() {} },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  document: {
    getElementById: el,
    querySelectorAll: () => [],
    createElement: (tag) => (tag === 'canvas' ? canvas : el('created-' + tag)),
    addEventListener() {},
    body: { appendChild() {} },
    activeElement: null,
  },
  window: { devicePixelRatio: 1, addEventListener() {} },
};
sandbox.globalThis = sandbox;
sandbox.document.getElementById = (id) => (id === 'map' ? canvas : el(id));

const script = new vm.Script(
  source + '\n;globalThis.__probe = { render, state, renderRings, refreshRings, setActiveRing, pushLog,' +
           ' gameToScreen, screenToGame, drawRing, ringPolygon, renderImpact, showTutorial, hideTutorial,' +
           ' renderStatus, setLang, applyLang, syncCoordInputs, renderTutorial, hitMarker, renderSolution };',
  { filename: 'app.js' });

try {
  vm.createContext(sandbox);
  script.runInContext(sandbox);
} catch (err) {
  console.error('app.js 初始化失败：', err);
  process.exit(1);
}

const probe = sandbox.__probe;

probe.state.map = MAP;
probe.state.maps = [MAP];
probe.state.snap = SNAP;
probe.state.ringGun = RING;
probe.state.activeRing = 'gun';
probe.state.view = { cx: 81.6, cy: 81.6, scale: 10 };
probe.pushLog('渲染自检开始', 'info');

const checks = [];
function check(name, fn) {
  calls.length = 0;
  try {
    fn();
    checks.push({ name, ok: true, draws: calls.length });
  } catch (err) {
    checks.push({ name, ok: false, error: String(err && err.stack || err), draws: calls.length });
  }
}

check('render() 全链路', () => probe.render());
check('目标圈切换后 render()', () => {
  probe.state.activeRing = 'target';
  probe.state.ringTarget = { ...RING, kind: 'target' };
  probe.render();
});
check('无地形（samples 为空）回退正圆', () => {
  probe.state.activeRing = 'gun';
  probe.state.ringGun = { ...RING, terrainUsed: false, samples: [] };
  probe.render();
});
check('无地图 / 无状态不崩', () => {
  probe.state.map = null;
  probe.state.snap = null;
  probe.render();
  probe.state.map = MAP;
  probe.state.snap = SNAP;
});
check('占领圈预览（放置模式）', () => {
  probe.state.zoneMode = true;
  probe.state.cursor = { x: 90, y: 90 };
  probe.render();
  probe.state.zoneMode = false;
});
check('量距两点绘制', () => {
  probe.state.ruler = [{ x: 80, y: 80 }, { x: 90, y: 90 }];
  probe.render();
  probe.state.ruler = [];
});

check('环带填充含内外两条边界', () => {
  probe.state.activeRing = 'gun';
  probe.state.ringGun = RING;
  calls.length = 0;
  probe.drawRing(RING, '#4ea3ff', 'rgba(78,163,255,.1)');
  const i0 = calls.indexOf('beginPath');
  const iFill = calls.indexOf('fill', i0);
  if (i0 < 0 || iFill < 0) throw new Error(`没画出填充：${calls.join(',')}`);
  const closes = calls.slice(i0, iFill).filter((c) => c === 'closePath').length;
  if (closes < 2) throw new Error(`填充路径只包含 ${closes} 条边界（应为 2：外圈 + 内圈）`);

  const outer = probe.ringPolygon(RING, 'max');
  if (!outer || outer.length < 3) throw new Error('外圈多边形为空');
});

check('renderRings() 侧栏文本', () => {
  probe.state.ringGun = RING;
  probe.state.activeRing = 'gun';
  probe.renderRings();
});
check('高度热力图图层', () => {
  probe.state.showTerrain = true;
  probe.render();
  probe.state.showTerrain = false;
});
check('射程圈按钮 + 锁定', () => {
  probe.setActiveRing('target', true);
  if (probe.state.activeRing !== 'target') throw new Error('切换到目标失败');
  probe.setActiveRing('gun', true);
  if (probe.state.activeRing !== 'gun') throw new Error('切换回车体失败');
  probe.render();
});

check('弹着点绘制与反推面板', () => {
  probe.state.snap = SNAP;
  probe.render();
  probe.renderImpact({
    rangeErrorMeters: 121.7, bearingErrorDegrees: -1.46, rangeMetersPerMil: 4.938,
    milCorrection: -24.7, bearingCorrectionMil: 26,
    next: { mil: -65.0, bearingDegrees: 60.8, bearingMil: 1080.2 },
  });
  probe.renderImpact(null);
});

check('教程弹窗 5 步', () => {
  for (let i = 0; i < 5; i++) {
    probe.showTutorial(i);
    const body = sandbox.document.getElementById('tutorial-body');
    if (!body.innerHTML || body.innerHTML.length < 10) throw new Error(`第 ${i + 1} 步内容为空`);
  }
  probe.hideTutorial();
});

check('教程可走完并关闭', () => {
  const modal = sandbox.document.getElementById('tutorial');
  const next = sandbox.document.getElementById('tutorial-next');
  const prev = sandbox.document.getElementById('tutorial-prev');
  const close = sandbox.document.getElementById('tutorial-close');
  const step = sandbox.document.getElementById('tutorial-step');

  probe.showTutorial(0);
  if (modal.hidden) throw new Error('showTutorial 后弹窗仍是 hidden');
  if (prev.disabled !== true) throw new Error('第 1 步「上一步」应当禁用');
  if (!/^1\s*\/\s*5$/.test(step.textContent)) throw new Error(`步数显示异常：${step.textContent}`);

  for (let i = 0; i < 4; i++) {
    next.click();
    if (modal.hidden) throw new Error(`第 ${i + 2} 次点「下一步」就关掉了弹窗`);
  }
  if (!/^5\s*\/\s*5$/.test(step.textContent)) throw new Error(`最后一步步数异常：${step.textContent}`);
  if (next.textContent !== '完成') throw new Error(`最后一步按钮文案应为「完成」，实际「${next.textContent}」`);
  if (prev.disabled === true) throw new Error('最后一步「上一步」不该禁用');

  next.click();
  if (!modal.hidden) throw new Error('点「完成」后弹窗没有关闭');

  probe.showTutorial(0);
  next.click();
  prev.click();
  if (!/^1\s*\/\s*5$/.test(step.textContent)) throw new Error('「上一步」没有退回第 1 步');
  close.click();
  if (!modal.hidden) throw new Error('点「关闭」后弹窗没有关闭');
});

check('后端清落点后前端同步', () => {
  probe.state.impact = { rangeErrorMeters: 1 };
  probe.renderStatus({ ...SNAP, impact: null });
  if (probe.state.impact !== null) throw new Error('落点没有被清掉');
});

check('界面语言中↔英切换', () => {
  const cjk = /[\u4e00-\u9fa5]/;
  probe.setLang('zh');
  const hint = sandbox.document.getElementById('click-hint');
  if (!cjk.test(hint.textContent)) throw new Error(`中文模式提示里没有中文：${hint.textContent}`);
  probe.showTutorial(0);
  const titleZh = sandbox.document.getElementById('tutorial-title').textContent;
  if (!cjk.test(titleZh)) throw new Error(`中文教程标题异常：${titleZh}`);

  probe.setLang('en');
  if (cjk.test(hint.textContent)) throw new Error(`英文模式提示里仍有中文：${hint.textContent}`);
  const titleEn = sandbox.document.getElementById('tutorial-title').textContent;
  if (cjk.test(titleEn)) throw new Error(`英文教程标题里仍有中文：${titleEn}`);
  if (titleEn === titleZh) throw new Error('切换语言后教程标题没变');

  probe.setLang('zh');
  if (!cjk.test(sandbox.document.getElementById('tutorial-title').textContent)) throw new Error('切回中文失败');
  probe.hideTutorial();
});

check('落点坐标回填输入框', () => {
  probe.syncCoordInputs({
    gun: { x: 81.6, y: 81.6, known: true },
    target: { x: 94.0, y: 88.0 },
    impact: { x: 94.9, y: 88.9 },
  });
  const ix = sandbox.document.getElementById('impact-x').value;
  const iy = sandbox.document.getElementById('impact-y').value;
  if (ix !== '94.90' || iy !== '88.90') throw new Error(`落点坐标未回填：x=${ix} y=${iy}`);
  probe.syncCoordInputs({ gun: { x: 1, y: 2, known: true }, target: null, impact: null });
  if (sandbox.document.getElementById('impact-x').value !== '') throw new Error('落点清除后输入框没清空');
});

check('落点标记可命中', () => {
  const impact = { x: 95.0, y: 88.0 };
  probe.state.snap = { ...SNAP, impact };
  const p = probe.gameToScreen(impact.x, impact.y);
  const hit = probe.hitMarker(p.sx, p.sy);
  if (hit !== 'impact') throw new Error(`落点处命中结果应为 impact，实际 ${hit}`);

  const far = probe.gameToScreen(impact.x + 5, impact.y + 5);
  if (probe.hitMarker(far.sx, far.sy) !== null) throw new Error('空白处不该命中标记');
  probe.state.snap = SNAP;
});

check('倾斜修正单独成行', () => {
  probe.renderSolution({
    inRange: true, rangeMeters: 2405, heightDeltaMeters: -135.8, deltaX: 22.87, deltaY: -7.44,
    baseMil: 361.2, sightCorrectionMil: -66.1, elevationMil: 295.1, flightTimeSeconds: 13.48,
    bearingDegrees: 108.0, converged: true, weapon: 'spg', arc: 'low',
    flatBaseMil: 361.2, flatElevationMil: 361.2, tableMinRangeMeters: 1181, tableMaxRangeMeters: 2629,
    pitchDegrees: -5.62, rollDegrees: 7.95, tiltCorrectionMil: 103.9,
    correctedElevationMil: 399.1, correctedBearingDegrees: 110.4, bearingCorrectionDegrees: 2.4,
  });
  const txt = sandbox.document.getElementById('sol-tilt-corr').textContent;
  if (!/\+?103\.9/.test(txt)) throw new Error(`倾斜修正行没渲染出 103.9：${txt}`);
});

check('朝向：+Y 朝上（北在上）', () => {
  const { gameToScreen } = probe;
  const south = gameToScreen(80, 40);
  const north = gameToScreen(80, 120);
  if (!(north.sy < south.sy)) throw new Error(`北 y=120 的 sy=${north.sy} 应小于南 y=40 的 sy=${south.sy}`);
  const right = gameToScreen(120, 80);
  const left = gameToScreen(40, 80);
  if (!(right.sx > left.sx)) throw new Error('+X 应在屏幕右侧');

  const p = gameToScreen(97.31, 42.07);
  const back = probe.screenToGame(p.sx, p.sy);
  if (Math.abs(back.x - 97.31) > 1e-6 || Math.abs(back.y - 42.07) > 1e-6) {
    throw new Error(`坐标往返不一致：${JSON.stringify(back)}`);
  }
});

console.log(JSON.stringify(checks, null, 2));
const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`webrender: 失败 ${failed.length} 项`);
  process.exit(1);
}
console.log('webrender: 通过');
