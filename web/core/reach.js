
(function (root) {
  'use strict';
  const Core = root.WardogsCore = root.WardogsCore || {};
  const { solve, MetresPerGameUnit, clamp } = Core;

  const MilTolerance = 1e-6;

  function roundEven(v, d = 0) {
    if (!Number.isFinite(v)) return v;
    const f = Math.pow(10, d);
    const x = v * f;
    const floor = Math.floor(x);
    const diff = x - floor;
    let r;
    if (Math.abs(diff - 0.5) < 1e-9) r = (floor % 2 === 0) ? floor : floor + 1;
    else r = Math.round(x);
    return r / f;
  }

  const DEFAULT_OPTIONS = {
    azimuths: 72,
    stepMeters: 20.0,
    maxRadiusMeters: 0,
    ignoreMinRange: false,
    terrainMasking: false,
    maskClearanceMeters: 5.0,
    maskSamples: 3,
    outerEdgeFromMainArcOnly: true,
  };

  function clearsTerrain(terrain, originX, originY, originHeight, dirX, dirY, range, mil, options, reverseDir) {
    const th = Core.milToRadians(mil);
    const sin2 = Math.sin(2 * th);
    const cos = Math.cos(th);
    if (sin2 <= 1e-6 || Math.abs(cos) < 1e-6) return true;

    const v0 = Math.sqrt(range * Core.Gravity / sin2);
    const tan = Math.tan(th);
    const k = Core.Gravity / (2 * v0 * v0 * cos * cos);
    const dx = reverseDir ? -dirX : dirX;
    const dy = reverseDir ? -dirY : dirY;

    const samples = clamp(Math.round(options.maskSamples), 1, 12);
    for (let i = 1; i <= samples; i++) {
      const f = i / (samples + 1);
      const x = range * f;
      const y = x * tan - k * x * x;
      const wx = originX + dx * x / MetresPerGameUnit;
      const wy = originY + dy * x / MetresPerGameUnit;
      const h = terrain.heightAt(wx, wy);
      if (h === null) continue;
      if (originHeight + y < h + options.maskClearanceMeters) return false;
    }
    return true;
  }

  function compute(table, terrain, kind, centerX, centerY, centerHeight, options) {
    const o = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const aroundTarget = String(kind).toLowerCase() === 'target';
    const azimuths = clamp(Math.round(o.azimuths), 4, 720);
    const step = Math.max(1.0, o.stepMeters);
    const radius = o.maxRadiusMeters > 0 ? o.maxRadiusMeters : table.maxRange;

    const h0 = (centerHeight !== null && centerHeight !== undefined)
      ? centerHeight : (terrain ? terrain.heightAt(centerX, centerY) : null);
    const terrainUsed = terrain !== null && terrain !== undefined && h0 !== null && h0 !== undefined;

    const samples = [];
    let minEff = null, maxEff = null, terrainMin = null, terrainMax = null;

    for (let i = 0; i < azimuths; i++) {
      const azDeg = 360 * i / azimuths;
      const azRad = azDeg * Math.PI / 180;
      const dirX = Math.sin(azRad), dirY = Math.cos(azRad);
      let sMin = null, sMax = null, sTMin = null, sTMax = null;

      const consider = (d) => {
        const px = centerX + dirX * d / MetresPerGameUnit;
        const py = centerY + dirY * d / MetresPerGameUnit;
        let dz, h = null;
        if (terrainUsed) {
          h = terrain.heightAt(px, py);
          if (h === null) return;
          dz = aroundTarget ? h0 - h : h - h0;
        } else {
          dz = 0;
        }

        const sol = solve(table, d, dz);
        if (!sol.inRange || Number.isNaN(sol.elevationMil)) return;
        if (!sol.converged) return;
        if (sol.elevationMil > table.maxMil + MilTolerance) return;
        if (sol.elevationMil < table.minMil - MilTolerance) return;

        if (o.terrainMasking && terrainUsed) {
          const originX = aroundTarget ? px : centerX;
          const originY = aroundTarget ? py : centerY;
          const originH = aroundTarget ? h : h0;
          if (!clearsTerrain(terrain, originX, originY, originH, dirX, dirY, d, sol.elevationMil, o, aroundTarget))
            return;
        }

        sMin = sMin === null ? d : Math.min(sMin, d);
        sMax = sMax === null ? d : Math.max(sMax, d);
        if (h !== null) {
          sTMin = sTMin === null ? h : Math.min(sTMin, h);
          sTMax = sTMax === null ? h : Math.max(sTMax, h);
        }
      };

      const start = table.minRange;
      const end = Math.min(radius, table.maxRange);
      const steps = Math.floor((end - start) / step);
      for (let k = 0; k <= steps; k++) consider(start + k * step);
      if (start + steps * step < end - 1e-9) consider(end);

      let reachable = sMin !== null;
      if (reachable && o.ignoreMinRange) sMin = 0;
      samples.push({
        azimuthDeg: azDeg,
        minRangeMeters: sMin === null ? 0 : sMin,
        maxRangeMeters: sMax === null ? 0 : sMax,
        reachable,
        minTerrainMeters: sTMin,
        maxTerrainMeters: sTMax,
      });

      if (!reachable) continue;
      minEff = minEff === null ? sMin : Math.min(minEff, sMin);
      maxEff = maxEff === null ? sMax : Math.max(maxEff, sMax);
      if (sTMin !== null) terrainMin = terrainMin === null ? sTMin : Math.min(terrainMin, sTMin);
      if (sTMax !== null) terrainMax = terrainMax === null ? sTMax : Math.max(terrainMax, sTMax);
    }

    if (minEff === null || maxEff === null || minEff > maxEff) {
      minEff = table.minRange;
      maxEff = table.maxRange;
    }

    return {
      kind: aroundTarget ? 'target' : 'gun',
      centerX, centerY,
      tableMinRangeMeters: table.minRange,
      tableMaxRangeMeters: table.maxRange,
      minEffectiveMeters: roundEven(minEff, 1),
      maxEffectiveMeters: roundEven(maxEff, 1),
      minTerrainMeters: terrainMin === null ? null : roundEven(terrainMin, 1),
      maxTerrainMeters: terrainMax === null ? null : roundEven(terrainMax, 1),
      terrainUsed,
      samples,
    };
  }

  function merge(kind, centerX, centerY, parts, options) {
    if (!parts || parts.length === 0) throw new Error('至少需要一张弹道的计算结果');
    if (parts.length === 1) return parts[0];

    const o = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const mainArcOnly = o.outerEdgeFromMainArcOnly;
    const n = parts[0].samples.length;
    const samples = [];
    let minEff = null, maxEff = null, tMin = null, tMax = null;

    for (let i = 0; i < n; i++) {
      const azDeg = parts[0].samples[i].azimuthDeg;
      let sMin = null, sMax = null, sTMin = null, sTMax = null;
      for (const p of parts) {
        if (i >= p.samples.length) continue;
        const s = p.samples[i];
        if (!s.reachable) continue;
        sMin = sMin === null ? s.minRangeMeters : Math.min(sMin, s.minRangeMeters);
        sMax = sMax === null ? s.maxRangeMeters : Math.max(sMax, s.maxRangeMeters);
        if (s.minTerrainMeters !== null && s.minTerrainMeters !== undefined)
          sTMin = sTMin === null ? s.minTerrainMeters : Math.min(sTMin, s.minTerrainMeters);
        if (s.maxTerrainMeters !== null && s.maxTerrainMeters !== undefined)
          sTMax = sTMax === null ? s.maxTerrainMeters : Math.max(sTMax, s.maxTerrainMeters);
      }

      if (mainArcOnly && i < parts[0].samples.length && parts[0].samples[i].reachable)
        sMax = parts[0].samples[i].maxRangeMeters;

      const reachable = sMin !== null;
      samples.push({
        azimuthDeg: azDeg,
        minRangeMeters: sMin === null ? 0 : sMin,
        maxRangeMeters: sMax === null ? 0 : sMax,
        reachable,
        minTerrainMeters: sTMin,
        maxTerrainMeters: sTMax,
      });
      if (!reachable) continue;
      minEff = minEff === null ? sMin : Math.min(minEff, sMin);
      maxEff = maxEff === null ? sMax : Math.max(maxEff, sMax);
      if (sTMin !== null) tMin = tMin === null ? sTMin : Math.min(tMin, sTMin);
      if (sTMax !== null) tMax = tMax === null ? sTMax : Math.max(tMax, sTMax);
    }

    const tableMin = Math.min(...parts.map((p) => p.tableMinRangeMeters));
    const tableMax = Math.max(...parts.map((p) => p.tableMaxRangeMeters));
    if (minEff === null || maxEff === null || minEff > maxEff) {
      minEff = tableMin; maxEff = tableMax;
    }

    return {
      kind: parts[0].kind,
      centerX, centerY,
      tableMinRangeMeters: tableMin,
      tableMaxRangeMeters: tableMax,
      minEffectiveMeters: roundEven(minEff, 1),
      maxEffectiveMeters: roundEven(maxEff, 1),
      minTerrainMeters: tMin === null ? null : roundEven(tMin, 1),
      maxTerrainMeters: tMax === null ? null : roundEven(tMax, 1),
      terrainUsed: parts.some((p) => p.terrainUsed),
      samples,
    };
  }

  function nearestAzimuth(result, azimuthDeg) {
    if (!result.samples.length) return null;
    let best = Infinity, pick = null;
    for (const s of result.samples) {
      const diff = Math.abs(((s.azimuthDeg - azimuthDeg + 540) % 360) - 180);
      if (diff < best) { best = diff; pick = s; }
    }
    return pick;
  }

  Object.assign(Core, {
    MilTolerance, DEFAULT_REACH_OPTIONS: DEFAULT_OPTIONS, roundEven,
    reachability: { compute, merge, nearestAzimuth, clearsTerrain },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
