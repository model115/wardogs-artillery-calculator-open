
(function (root) {
  'use strict';

  const Gravity = 9.80665;
  const MilPerDegree = 6400 / 360;
  const MilPerRadian = 6400 / (2 * Math.PI);
  const MetresPerGameUnit = 100;
  const ConvergenceMil = 0.05;
  const MaxIterations = 80;

  const milToRadians = (mil) => mil / MilPerRadian;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function interp(x, xs, ys) {
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + t * (ys[hi] - ys[lo]);
  }

  class BallisticTable {
    constructor(name, points) {
      const sorted = points.slice().sort((a, b) => a.range - b.range);
      if (sorted.length < 2) throw new Error('射表至少需要 2 个点');
      this.name = name;
      this.points = sorted;
      this._dist = sorted.map((p) => p.range);
      this._mil = sorted.map((p) => p.mil);
      this.minRange = this._dist[0];
      this.maxRange = this._dist[this._dist.length - 1];
      let lo = Infinity, hi = -Infinity;
      for (const m of this._mil) { if (m < lo) lo = m; if (m > hi) hi = m; }
      this.minMil = lo;
      this.maxMil = hi;
      const byMil = sorted.slice().sort((a, b) => a.mil - b.mil);
      this._milAsc = byMil.map((p) => p.mil);
      this._distByMil = byMil.map((p) => p.range);
      this.isHighArc = this._mil[this._mil.length - 1] > this._mil[0] && this.maxMil > 900;
    }

    milForRange(range) {
      if (range < this.minRange - 1e-6 || range > this.maxRange + 1e-6) return null;
      return interp(range, this._dist, this._mil);
    }

    rangeForMil(mil) {
      if (mil < this.minMil - 1e-6 || mil > this.maxMil + 1e-6) return null;
      return interp(mil, this._milAsc, this._distByMil);
    }
  }

  class BallisticLibrary {
    constructor(tables) { this.tables = tables; }

    get(name) { return Object.prototype.hasOwnProperty.call(this.tables, name) ? this.tables[name] : null; }

    require(name) {
      const t = this.get(name);
      if (!t) throw new Error(`未知弹道: ${name}（可选: ${Object.keys(this.tables).join(', ')}）`);
      return t;
    }

    static fromJson(json) {
      const tables = Object.create(null);
      if (json && Array.isArray(json.weapons)) {
        for (const w of json.weapons) {
          for (const arcName of Object.keys(w.ballistics)) {
            const pts = w.ballistics[arcName].map((p) => ({ range: p[0], mil: p[1] }));
            tables[`${w.id}/${arcName}`] = new BallisticTable(`${w.id}/${arcName}`, pts);
          }
        }
      } else if (json && json.tables) {
        for (const name of Object.keys(json.tables)) {
          const pts = json.tables[name].points.map((p) => ({ range: p[0], mil: p[1] }));
          tables[name] = new BallisticTable(name, pts);
        }
      } else {
        throw new Error('无法识别的射表 JSON');
      }
      return new BallisticLibrary(tables);
    }
  }

  const outOfRange = (range, dz) => ({
    inRange: false, range, dz,
    baseMil: NaN, sightCorrectionMil: NaN, elevationMil: NaN,
    flightTimeSeconds: null, converged: false,
  });

  function flightTime(range, mil) {
    const th = milToRadians(mil);
    const s = Math.sin(2 * th);
    if (s <= 1e-6 || range <= 0) return null;
    const v0 = Math.sqrt(range * Gravity / s);
    return 2 * v0 * Math.sin(th) / Gravity;
  }

  function solve(table, range, dz = 0) {
    if (!(range > 0)) return outOfRange(range, dz);
    const base = table.milForRange(range);
    if (base === null) return outOfRange(range, dz);
    const baseMilValue = base;

    if (Math.abs(dz) < 1e-9) {
      return {
        inRange: true, range, dz, baseMil: baseMilValue,
        sightCorrectionMil: 0, elevationMil: baseMilValue,
        flightTimeSeconds: flightTime(range, baseMilValue), converged: true,
      };
    }

    const th0 = milToRadians(baseMilValue);
    const sin2th0 = Math.sin(2 * th0);
    const cos0 = Math.cos(th0);
    if (sin2th0 <= 1e-9 || Math.abs(cos0) < 1e-9) return outOfRange(range, dz);
    const v0Squared = range * Gravity / sin2th0;

    const heightAt = (mil) => {
      const th = milToRadians(mil);
      const cos = Math.cos(th);
      if (Math.abs(cos) < 1e-12) return Infinity;
      return range * Math.tan(th) - Gravity * range * range / (2 * v0Squared * cos * cos);
    };
    const F = (mil) => heightAt(mil) - dz;

    const thetaStarMil = Math.atan(1 / sin2th0) * MilPerRadian;
    const ascending = baseMilValue < thetaStarMil;
    let marchLo = ascending ? table.minMil : Math.max(table.minMil, thetaStarMil);
    let marchHi = ascending ? Math.min(table.maxMil, thetaStarMil) : table.maxMil;
    if (marchLo > marchHi) { marchLo = table.minMil; marchHi = table.maxMil; }

    const dir = (dz > 0 ? 1 : -1) * (Math.cos(2 * th0) >= 0 ? 1 : -1);
    let a = baseMilValue, fA = F(a), b = NaN;
    for (let i = 1; i < 64; i++) {
      let cand = baseMilValue + dir * (Math.pow(2, i) - 1);
      if (cand < marchLo || cand > marchHi) {
        cand = dir > 0 ? marchHi : marchLo;
        if (fA * F(cand) <= 0) b = cand;
        break;
      }
      const fc = F(cand);
      if (fA * fc <= 0) { b = cand; break; }
      a = cand; fA = fc;
    }

    if (Number.isNaN(b)) {
      const edge = dir > 0 ? marchHi : marchLo;
      const thetaEdge = Math.abs(F(edge)) < Math.abs(fA) ? edge : a;
      return {
        inRange: true, range, dz, baseMil: baseMilValue,
        sightCorrectionMil: thetaEdge - baseMilValue, elevationMil: thetaEdge,
        flightTimeSeconds: flightTime(range, baseMilValue), converged: false,
      };
    }

    let lo = Math.min(a, b), hi = Math.max(a, b);
    let fLo = F(lo);
    for (let i = 0; i < MaxIterations && hi - lo > ConvergenceMil; i++) {
      const mid = 0.5 * (lo + hi);
      if (fLo * F(mid) <= 0) hi = mid;
      else { lo = mid; fLo = F(mid); }
    }
    const theta = 0.5 * (lo + hi);

    return {
      inRange: true, range, dz, baseMil: baseMilValue,
      sightCorrectionMil: theta - baseMilValue, elevationMil: theta,
      flightTimeSeconds: flightTime(range, baseMilValue), converged: true,
    };
  }

  function sightAngleMil(range, dz) {
    if (!(range > 0)) return 0;
    const slant = Math.sqrt(range * range + dz * dz);
    return Math.asin(clamp(dz / slant, -1, 1)) * MilPerRadian;
  }

  function bearingDegrees(x0, y0, x1, y1) {
    const dx = (x1 - x0) * MetresPerGameUnit;
    const dy = (y1 - y0) * MetresPerGameUnit;
    const deg = Math.atan2(dx, dy) * 180 / Math.PI;
    return (deg % 360 + 360) % 360;
  }

  function horizontalDistance(x0, y0, x1, y1) {
    const dx = (x1 - x0) * MetresPerGameUnit, dy = (y1 - y0) * MetresPerGameUnit;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function wrap180(deg) {
    let d = (deg + 180) % 360;
    if (d < 0) d += 360;
    return d - 180;
  }
  const wrap360 = (deg) => (deg % 360 + 360) % 360;

  function rangePerMil(table, range) {
    const probe = 50;
    const m1 = table.milForRange(range - probe);
    const m2 = table.milForRange(range + probe);
    if (m1 !== null && m2 !== null && Math.abs(m2 - m1) > 1e-6)
      return { metresPerMil: (2 * probe) / (m2 - m1), fromTable: true };
    const span = table.maxRange - table.minRange;
    const milSpan = table.maxMil - table.minMil;
    if (Math.abs(milSpan) < 1e-6) return { metresPerMil: 0, fromTable: false };
    return { metresPerMil: span / milSpan, fromTable: false };
  }

  function impactCorrection(table, gunX, gunY, targetX, targetY, firedMil, firedBearingDeg, impactX, impactY) {
    if (!table) return null;
    const targetRange = horizontalDistance(gunX, gunY, targetX, targetY);
    const impactRange = horizontalDistance(gunX, gunY, impactX, impactY);
    if (!(targetRange > 0) || !(impactRange > 0)) return null;

    const targetBearing = bearingDegrees(gunX, gunY, targetX, targetY);
    const impactBearing = bearingDegrees(gunX, gunY, impactX, impactY);
    const rangeError = impactRange - targetRange;
    const bearingError = wrap180(impactBearing - targetBearing);

    const { metresPerMil, fromTable } = rangePerMil(table, targetRange);
    if (Math.abs(metresPerMil) <= 1e-6) return null;

    const milCorrection = -rangeError / metresPerMil;
    const bearingCorrectionMil = -bearingError * MilPerDegree;

    return {
      rangeErrorMeters: rangeError,
      bearingErrorDegrees: bearingError,
      rangeMetersPerMil: metresPerMil,
      milCorrection,
      bearingCorrectionMil,
      nextMil: firedMil + milCorrection,
      nextBearingDegrees: wrap360(firedBearingDeg - bearingError),
      impactRangeMeters: impactRange,
      targetRangeMeters: targetRange,
      rangePerMilFromTable: fromTable,
    };
  }

  root.WardogsCore = root.WardogsCore || {};
  Object.assign(root.WardogsCore, {
    Gravity, MilPerDegree, MilPerRadian, MetresPerGameUnit, ConvergenceMil, MaxIterations,
    milToRadians, clamp,
    BallisticTable, BallisticLibrary,
    solve, sightAngleMil, flightTime, bearingDegrees, horizontalDistance,
    impactCorrection,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
