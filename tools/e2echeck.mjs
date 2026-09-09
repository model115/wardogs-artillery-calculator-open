
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const repo = join(import.meta.dirname, '..');
const webDir = join(repo, 'web');

const FILES = ['core/ballistics.js', 'core/terrain.js', 'core/reach.js', 'store.js'];
const sandbox = {
  console, Math, JSON, Number, String, Array, Object, Map, Set, Promise, Error,
  isNaN, parseFloat, parseInt, setTimeout, clearTimeout,
  TextDecoder, DataView, Uint8Array, Int16Array, ArrayBuffer, URLSearchParams,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  fetch: async (url) => {
    const rel = String(url).replace(/^\.?\//, '');
    const p = join(repo, rel);
    if (!existsSync(p)) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    const buf = readFileSync(p);
    return {
      ok: true, status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of FILES) vm.runInContext(readFileSync(join(webDir, f), 'utf8'), sandbox, { filename: f });

const Store = sandbox.WardogsStore;
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, ok: true }); }
  catch (err) { checks.push({ name, ok: false, error: String((err && err.message) || err) }); }
}
function near(a, b, tol = 0.02) {
  if (typeof a !== 'number' || !Number.isFinite(a)) throw new Error(`期望数字，实际 ${a}`);
  if (Math.abs(a - b) > tol) throw new Error(`期望 ${b}，实际 ${a}（差 ${(a - b).toFixed(4)}）`);
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${b}，实际 ${a}`); }

await Store.init();

const hasTerrain = existsSync(join(repo, 'data', 'terrain', 'bakurani.hgt'));
if (!hasTerrain) console.log('（本仓库没有 data/terrain/*.hgt —— 跳过地形相关检查；用 assets all --source 生成）');

check('加载射表/地图', () => {
  if (!Store.library) throw new Error('射表没加载');
  const keys = Object.keys(Store.library.tables);
  if (keys.length !== 3) throw new Error(`应有 3 张射表，实际 ${keys.length}：${keys}`);
  if (Store.maps.length !== 2) throw new Error(`应有 2 张地图，实际 ${Store.maps.length}`);
});

if (hasTerrain) {
  await Store.terrain('bakurani');
  check('高程网格解析（.hgt）', () => {
    const g = Store.terrainSync('bakurani');
    if (!g) throw new Error('高程没加载');
    eq(g.cols, 1024); eq(g.rows, 1024);
    const h = g.heightAt(81.6, 81.6);
    if (h === null || !Number.isFinite(h)) throw new Error(`(81.6,81.6) 取不到高度：${h}`);
    if (h > 0 || h < -1200) throw new Error(`高度不合理：${h}`);
  });
}

Store.setMap('bakurani');
Store.setGun(81.6, 81.6);
Store.setTarget(94.0, 88.0);

const sol = await Store.solution();
check('解算：与 C# 版数值一致', () => {
  near(sol.rangeMeters, 1395.42, 0.01);
  near(sol.bearingDegrees, 62.7, 0.05);
  if (hasTerrain) {
    near(sol.elevationMil, 274.66, 0.05);
    near(sol.heightDeltaMeters, 293.96, 0.05);
  } else {
    near(sol.heightDeltaMeters, 0, 0.01);
  }
  eq(sol.inRange, true);
  eq(sol.converged, true);
});

check('射程圈：逐方位采样', async () => {  });
checks.pop();
const ring = await Store.rangeRing({ kind: 'gun', samples: 36 });
check('射程圈：逐方位采样（有高程时随地形起伏）', () => {
  eq(ring.terrainUsed, hasTerrain);
  if (!hasTerrain) { eq(ring.samples.length, 0); return; }
  eq(ring.samples.length, 36);
  const maxes = ring.samples.filter((s) => s.reachable).map((s) => s.maxRangeMeters);
  if (maxes.length < 10) throw new Error(`可达方位太少：${maxes.length}`);
  if (Math.max(...maxes) - Math.min(...maxes) < 1)
    throw new Error('各方位最大射程完全一致 —— 没用上地形');
  near(ring.maxEffectiveMeters, Math.max(...maxes), 1);
});

const imp = await Store.handle('POST', '/api/impact', new URLSearchParams(),
  { x: 94.9, y: 88.9, firedMil: sol.elevationMil, firedBearing: sol.bearingDegrees });
check('落点反推：打远 → 减刻度', () => {
  if (!imp || !imp.next) throw new Error('反推没结果');
  near(imp.rangeErrorMeters, 121.7, 1.5);
  if (!(imp.milCorrection < 0)) throw new Error(`打远应减刻度，实际 ${imp.milCorrection}`);
  near(imp.next.mil, sol.elevationMil + imp.milCorrection, 0.11);
});

check('状态快照与持久化', () => {
  const s = Store.snapshot();
  near(s.gun.x, 81.6, 1e-9);
  near(s.target.x, 94.0, 1e-9);
  eq(s.mapId, 'bakurani');
  if (!s.impact) throw new Error('快照里没有落点');
});

check('换目标保留落点（keepImpact）', () => {
  Store.setTarget(94.2, 88.1, { keepImpact: true });
  if (!Store.impactPoint) throw new Error('拖动目标后落点被清掉了');
  Store.setTarget(95.0, 89.0, { add: true });
  if (Store.impactPoint) throw new Error('新增目标后落点应该清空');
});

console.log(JSON.stringify(checks, null, 2));
const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`e2echeck: 失败 ${failed.length} 项`);
  process.exit(1);
}
console.log('e2echeck: 通过（静态站在 Node 里跑通完整数据流）');
