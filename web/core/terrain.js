
(function (root) {
  'use strict';
  const Core = root.WardogsCore = root.WardogsCore || {};
  const { MetresPerGameUnit, MilPerDegree, MilPerRadian, milToRadians, clamp } = Core;

  const NoData = -32768;

  class ElevationGrid {
    constructor(meta, cells) {
      Object.assign(this, meta);
      this.cells = cells;
      this.bounds = {
        minX: this.originX, maxX: this.originX + this.cols * this.stepX,
        minY: this.originY, maxY: this.originY + this.rows * this.stepY,
      };
    }

    get cellSizeMeters() { return this.stepX * MetresPerGameUnit; }

    decode(raw) { return this.baseHeight + raw * this.heightScale; }

    heightAt(gameX, gameY) {
      const fx = (gameX - this.originX) / this.stepX;
      const fy = (gameY - this.originY) / this.stepY;
      if (fx < 0 || fy < 0 || fx > this.cols - 1 || fy > this.rows - 1) return null;

      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(this.cols - 1, x0 + 1), y1 = Math.min(this.rows - 1, y0 + 1);
      const tx = fx - x0, ty = fy - y0;
      const c = this.cells;

      const v00 = c[y0 * this.cols + x0], v10 = c[y0 * this.cols + x1];
      const v01 = c[y1 * this.cols + x0], v11 = c[y1 * this.cols + x1];
      if (v00 === NoData || v10 === NoData || v01 === NoData || v11 === NoData) {
        const fallback = v00 !== NoData ? v00 : v10 !== NoData ? v10 : v01 !== NoData ? v01 : v11;
        if (fallback === NoData) return null;
        return this.decode(fallback);
      }
      const a = this.decode(v00) * (1 - tx) + this.decode(v10) * tx;
      const b = this.decode(v01) * (1 - tx) + this.decode(v11) * tx;
      return a * (1 - ty) + b * ty;
    }

    static fromArrayBuffer(buf) {
      const dv = new DataView(buf);
      const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
      if (magic !== 'WHG1') throw new Error(`不是高程网格文件（magic=${magic}）`);
      let p = 4;
      const version = dv.getUint32(p, true); p += 4;
      if (version !== 1) throw new Error(`高程网格版本不支持：${version}`);
      const idLen = dv.getUint32(p, true); p += 4;
      const mapId = new TextDecoder('utf-8').decode(new Uint8Array(buf, p, idLen)); p += idLen;
      const cols = dv.getUint32(p, true); p += 4;
      const rows = dv.getUint32(p, true); p += 4;
      const originX = dv.getFloat64(p, true); p += 8;
      const originY = dv.getFloat64(p, true); p += 8;
      const stepX = dv.getFloat64(p, true); p += 8;
      const stepY = dv.getFloat64(p, true); p += 8;
      const baseHeight = dv.getFloat32(p, true); p += 4;
      const heightScale = dv.getFloat32(p, true); p += 4;

      const n = cols * rows;
      const cells = new Int16Array(n);
      for (let i = 0; i < n; i++) { cells[i] = dv.getInt16(p, true); p += 2; }
      return new ElevationGrid({ mapId, cols, rows, originX, originY, stepX, stepY, baseHeight, heightScale }, cells);
    }

    describe() {
      const r = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
      return {
        mapId: this.mapId, cols: this.cols, rows: this.rows,
        originX: r(this.originX, 3), originY: r(this.originY, 3),
        stepX: r(this.stepX, 4), stepY: r(this.stepY, 4),
        cellSizeMeters: r(this.cellSizeMeters, 2),
        baseHeight: r(this.baseHeight, 2),
        heightScale: this.heightScale,
        heightRangeMeters: { min: r(this.baseHeight, 1), max: r(this.baseHeight + 32767 * this.heightScale, 1) },
        bytes: this.cols * this.rows * 2,
      };
    }
  }

  const DefaultSpacingMeters = 12.0;

  function computeTilt(terrain, x, y, azimuthDeg, spacingMeters = DefaultSpacingMeters) {
    const none = {
      gradientX: 0, gradientY: 0, alongSlope: 0, crossSlope: 0,
      pitchDegrees: 0, rollDegrees: 0, azimuthDegrees: azimuthDeg, sampleSpacingMeters: 0, valid: false,
    };
    if (!terrain) return none;
    const spacing = Math.max(1, spacingMeters);
    const d = spacing / MetresPerGameUnit;

    const hx1 = terrain.heightAt(x + d, y), hx0 = terrain.heightAt(x - d, y);
    const hy1 = terrain.heightAt(x, y + d), hy0 = terrain.heightAt(x, y - d);
    if (hx1 === null || hx0 === null || hy1 === null || hy0 === null) return none;

    const gx = (hx1 - hx0) / (2 * spacing);
    const gy = (hy1 - hy0) / (2 * spacing);
    const az = azimuthDeg * Math.PI / 180;
    const dirX = Math.sin(az), dirY = Math.cos(az);
    const along = gx * dirX + gy * dirY;
    const cross = gx * dirY - gy * dirX;

    return {
      gradientX: gx, gradientY: gy, alongSlope: along, crossSlope: cross,
      pitchDegrees: Math.atan(along) * 180 / Math.PI,
      rollDegrees: Math.atan(cross) * 180 / Math.PI,
      azimuthDegrees: azimuthDeg, sampleSpacingMeters: spacing, valid: true,
    };
  }

  const pitchMil = (t) => t.pitchDegrees * MilPerDegree;
  const rollMil = (t) => t.rollDegrees * MilPerDegree;

  const correctionMil = (t) => (t.valid ? -pitchMil(t) : 0);

  function correctedElevationMil(requiredMil, t) {
    if (!t.valid) return requiredMil;
    const theta = milToRadians(requiredMil);
    const pitch = t.pitchDegrees * Math.PI / 180;
    const roll = t.rollDegrees * Math.PI / 180;
    let s = Math.sin(theta - pitch) / Math.cos(roll);
    s = clamp(s, -1, 1);
    return Math.asin(s) * MilPerRadian;
  }

  function correctedBearingDegrees(requiredBearingDeg, elevationMil, t) {
    if (!t.valid) return requiredBearingDeg;
    const theta = milToRadians(elevationMil);
    const roll = t.rollDegrees * Math.PI / 180;
    const delta = Math.atan(Math.tan(theta) * Math.sin(roll)) * 180 / Math.PI;
    const v = requiredBearingDeg + delta;
    return (v % 360 + 360) % 360;
  }

  function bearingCorrectionDegrees(requiredBearingDeg, elevationMil, t) {
    const corrected = correctedBearingDegrees(requiredBearingDeg, elevationMil, t);
    let d = corrected - requiredBearingDeg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  Object.assign(Core, {
    ElevationGrid, NoData, DefaultSpacingMeters,
    computeTilt, pitchMil, rollMil, correctionMil,
    correctedElevationMil, correctedBearingDegrees, bearingCorrectionDegrees,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
