
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const repo = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
};
const TOL = Number(argVal('--tol', '1e-9'));
const SHOW = Number(argVal('--show', '5'));
const GOLDEN = argVal('--golden', null);

const goldenPath = GOLDEN ? (GOLDEN.match(/^([A-Za-z]:)?[\\/]/) ? GOLDEN : join(repo, GOLDEN))
  : join(repo, 'tests', 'golden_core.json');
if (!existsSync(goldenPath)) {
  console.error(`缺少金标准：${goldenPath}\n先跑： dotnet run --project tools/WardogsArtillery.Tools -c Release -- core-golden`);
  process.exit(1);
}
const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));

for (const f of ['ballistics.js', 'terrain.js', 'reach.js']) {
  const p = join(repo, 'web', 'core', f);
  if (!existsSync(p)) { console.error(`缺少 ${p}`); process.exit(1); }
  vm.runInThisContext(readFileSync(p, 'utf8'), { filename: f });
}
const Core = globalThis.WardogsCore;
if (!Core) { console.error('web/core/*.js 没有导出 WardogsCore'); process.exit(1); }

let checks = 0;
const failures = [];
function eq(path, got, want) {
  checks++;
  if (want === null || want === undefined) {
    if (got !== null && got !== undefined && !(typeof got === 'number' && !Number.isFinite(got)))
      failures.push({ path, got, want });
    return;
  }
  if (typeof want === 'number') {
    if (typeof got !== 'number' || !Number.isFinite(got) || Math.abs(got - want) > TOL)
      failures.push({ path, got, want, diff: typeof got === 'number' ? got - want : NaN });
    return;
  }
  if (got !== want) failures.push({ path, got, want });
}

for (const [k, v] of Object.entries(golden.constants)) {
  const jsKey = k.charAt(0).toUpperCase() + k.slice(1);
  eq(`constants.${k}`, Core[jsKey], v);
}

const lib = Core.BallisticLibrary.fromJson(JSON.parse(readFileSync(join(repo, 'data', 'weapons.json'), 'utf8')));
for (const [name, t] of Object.entries(golden.tables)) {
  const jt = lib.get(name);
  if (!jt) { failures.push({ path: `tables.${name}`, got: null, want: 'table' }); continue; }
  eq(`tables.${name}.minRange`, jt.minRange, t.minRange);
  eq(`tables.${name}.maxRange`, jt.maxRange, t.maxRange);
  eq(`tables.${name}.minMil`, jt.minMil, t.minMil);
  eq(`tables.${name}.maxMil`, jt.maxMil, t.maxMil);
  eq(`tables.${name}.isHighArc`, jt.isHighArc, t.isHighArc);
}

for (const c of golden.interp) {
  const t = lib.require(c.table);
  const got = c.mode === 'milForRange' ? t.milForRange(c.input) : t.rangeForMil(c.input);
  eq(`interp.${c.table}.${c.mode}(${c.input})`, got, c.output);
}

for (const c of golden.solutions) {
  const t = lib.require(c.table);
  const s = Core.solve(t, c.range, c.dz);
  const tag = `solve.${c.table}@${c.range}/${c.dz}`;
  eq(`${tag}.inRange`, s.inRange, c.inRange);
  if (!c.inRange) continue;
  eq(`${tag}.baseMil`, s.baseMil, c.baseMil);
  eq(`${tag}.sightCorrectionMil`, s.sightCorrectionMil, c.sightCorrectionMil);
  eq(`${tag}.elevationMil`, s.elevationMil, c.elevationMil);
  eq(`${tag}.flightTimeSeconds`, s.flightTimeSeconds, c.flightTimeSeconds);
  eq(`${tag}.converged`, s.converged, c.converged);
}

const grids = {};
for (const mapId of ['bakurani', 'ozeti']) {
  const p = join(repo, 'data', 'terrain', mapId + '.hgt');
  if (!existsSync(p)) continue;
  const buf = readFileSync(p);
  grids[mapId] = Core.ElevationGrid.fromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
for (const c of golden.tilt) {
  const g = grids[c.mapId];
  if (!g) continue;
  const tag = `tilt.${c.mapId}(${c.x},${c.y})@${c.azimuthDeg}`;
  eq(`${tag}.height`, g.heightAt(c.x, c.y), c.height);
  eq(`${tag}.cellSizeMeters`, g.cellSizeMeters, c.cellSizeMeters);
  const t = Core.computeTilt(g, c.x, c.y, c.azimuthDeg);
  eq(`${tag}.valid`, t.valid, c.valid);
  if (!c.valid) continue;
  eq(`${tag}.gradientX`, t.gradientX, c.gradientX);
  eq(`${tag}.gradientY`, t.gradientY, c.gradientY);
  eq(`${tag}.pitchDegrees`, t.pitchDegrees, c.pitchDegrees);
  eq(`${tag}.rollDegrees`, t.rollDegrees, c.rollDegrees);
}

for (const c of golden.reach) {
  const g = grids[c.mapId];
  if (!g) continue;
  const tables = Object.keys(golden.tables)
    .filter((n) => n.startsWith(c.weapon + '/'))
    .sort((a, b) => golden.tables[a].maxMil - golden.tables[b].maxMil)
    .map((n) => lib.require(n));
  const opt = {
    azimuths: c.samples, stepMeters: 40, terrainMasking: c.masking,
    ignoreMinRange: c.ringKind === 'target',
  };
  const h0 = g.heightAt(c.centerX, c.centerY);
  const parts = tables.map((t) => Core.reachability.compute(t, g, c.ringKind, c.centerX, c.centerY, h0, opt));
  const r = Core.reachability.merge(c.ringKind, c.centerX, c.centerY, parts, opt);
  const tag = `reach.${c.mapId}/${c.weapon}/${c.ringKind}/${c.samples}${c.masking ? '/mask' : ''}(${c.centerX},${c.centerY})`;
  eq(`${tag}.tableMinRangeMeters`, r.tableMinRangeMeters, c.TableMinRangeMeters);
  eq(`${tag}.tableMaxRangeMeters`, r.tableMaxRangeMeters, c.TableMaxRangeMeters);
  eq(`${tag}.minEffectiveMeters`, r.minEffectiveMeters, c.MinEffectiveMeters);
  eq(`${tag}.maxEffectiveMeters`, r.maxEffectiveMeters, c.MaxEffectiveMeters);
  eq(`${tag}.minTerrainMeters`, r.minTerrainMeters, c.MinTerrainMeters);
  eq(`${tag}.maxTerrainMeters`, r.maxTerrainMeters, c.MaxTerrainMeters);
  eq(`${tag}.terrainUsed`, r.terrainUsed, c.TerrainUsed);
  eq(`${tag}.samples.length`, r.samples.length, c.samplesData.length);
  for (let i = 0; i < Math.min(r.samples.length, c.samplesData.length); i++) {
    const a = r.samples[i], b = c.samplesData[i];
    eq(`${tag}.s[${i}].azimuthDeg`, a.azimuthDeg, b.AzimuthDeg);
    eq(`${tag}.s[${i}].minRangeMeters`, a.minRangeMeters, b.MinRangeMeters);
    eq(`${tag}.s[${i}].maxRangeMeters`, a.maxRangeMeters, b.MaxRangeMeters);
    eq(`${tag}.s[${i}].reachable`, a.reachable, b.Reachable);
    eq(`${tag}.s[${i}].minTerrainMeters`, a.minTerrainMeters, b.MinTerrainMeters);
    eq(`${tag}.s[${i}].maxTerrainMeters`, a.maxTerrainMeters, b.MaxTerrainMeters);
  }
}

for (const c of golden.impact) {
  const t = lib.require(c.table);
  const r = Core.impactCorrection(t, c.gunX, c.gunY, c.targetX, c.targetY,
    c.firedMil, c.firedBearing, c.impactX, c.impactY);
  const tag = `impact.${c.table}(${c.impactX},${c.impactY})`;
  if (!r) { failures.push({ path: tag, got: null, want: 'correction' }); continue; }
  eq(`${tag}.rangeErrorMeters`, r.rangeErrorMeters, c.RangeErrorMeters);
  eq(`${tag}.bearingErrorDegrees`, r.bearingErrorDegrees, c.BearingErrorDegrees);
  eq(`${tag}.rangeMetersPerMil`, r.rangeMetersPerMil, c.RangeMetersPerMil);
  eq(`${tag}.milCorrection`, r.milCorrection, c.MilCorrection);
  eq(`${tag}.bearingCorrectionMil`, r.bearingCorrectionMil, c.BearingCorrectionMil);
  eq(`${tag}.nextMil`, r.nextMil, c.NextMil);
  eq(`${tag}.nextBearingDegrees`, r.nextBearingDegrees, c.NextBearingDegrees);
  eq(`${tag}.rangePerMilFromTable`, r.rangePerMilFromTable, c.RangePerMilFromTable);
}

const summary = {
  checks,
  failures: failures.length,
  tolerance: TOL,
  sections: {
    solutions: golden.solutions.length,
    interp: golden.interp.length,
    tilt: golden.tilt.length,
    reach: golden.reach.length,
    impact: golden.impact.length,
  },
};
console.log(JSON.stringify(summary, null, 2));

if (failures.length) {
  console.error(`\n前 ${Math.min(SHOW, failures.length)} 处偏差：`);
  for (const f of failures.slice(0, SHOW)) {
    console.error(`  ${f.path}\n    js   = ${f.got}\n    c#   = ${f.want}` +
      (Number.isFinite(f.diff) ? `\n    diff = ${f.diff}` : ''));
  }
  console.error(`\ncorecheck: 失败（${failures.length} / ${checks} 项不一致）`);
  process.exit(1);
}
console.log('corecheck: 通过（JS 核心与 C# 金标准逐字段一致）');
