
(function (root) {
  'use strict';
  const Core = root.WardogsCore;
  const STORAGE_KEY = 'wardogs-state-v1';

  const r2 = (v) => (Number.isFinite(v) ? Core.roundEven(v, 2) : null);
  const round = (v, d) => (Number.isFinite(v) ? Core.roundEven(v, d) : null);

  const Store = {
    maps: [],
    library: null,
    mapId: 'bakurani',
    weapon: 'spg',
    gun: { x: 81.6, y: 81.6, known: false },
    target: null,
    targets: [],
    zones: [],
    impactPoint: null,
    lastSolution: null,
    _grids: Object.create(null),
    _gridPromises: Object.create(null),
    logs: [],

    async init() {
      const [maps, weapons] = await Promise.all([
        fetch('data/maps.json').then((r) => r.json()),
        fetch('data/weapons.json').then((r) => r.json()),
      ]);
      this.maps = maps;
      this.library = Core.BallisticLibrary.fromJson(weapons);
      this._loadState();
      if (!this.maps.some((m) => m.id === this.mapId)) this.mapId = this.maps[0].id;
      return this;
    },

    weapons() {
      return [...new Set(Object.keys(this.library.tables).map((k) => k.split('/')[0]))];
    },

    hasTerrain(mapId) {
      const m = this.maps.find((x) => x.id === mapId);
      return !m || m.hasTerrain !== false;
    },

    async terrain(mapId = this.mapId) {
      if (this._grids[mapId]) return this._grids[mapId];
      if (!this.hasTerrain(mapId)) return null;
      if (!this._gridPromises[mapId]) {
        this._gridPromises[mapId] = fetch(`data/terrain/${mapId}.hgt`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`高程加载失败 ${mapId}`))))
          .then((buf) => { this._grids[mapId] = Core.ElevationGrid.fromArrayBuffer(buf); return this._grids[mapId]; })
          .catch((err) => { this._gridPromises[mapId] = null; throw err; });
      }
      return this._gridPromises[mapId];
    },

    terrainSync(mapId = this.mapId) { return this._grids[mapId] || null; },

    async terrainInfo(mapId = this.mapId) {
      const g = await this.terrain(mapId);
      if (!g) return null;
      let min = null, max = null;
      const rowStep = Math.max(1, Math.floor(g.rows / 64));
      const colStep = Math.max(1, Math.floor(g.cols / 64));
      for (let row = 0; row < g.rows; row += rowStep) {
        for (let col = 0; col < g.cols; col += colStep) {
          const h = g.heightAt(g.originX + col * g.stepX, g.originY + row * g.stepY);
          if (h === null) continue;
          min = min === null ? h : Math.min(min, h);
          max = max === null ? h : Math.max(max, h);
        }
      }
      return {
        mapId, cols: g.cols, rows: g.rows,
        cellSizeMeters: Math.round(g.cellSizeMeters * 100) / 100,
        minHeightMeters: Math.round((min ?? 0) * 10) / 10,
        maxHeightMeters: Math.round((max ?? 0) * 10) / 10,
        originX: g.originX, originY: g.originY, stepX: g.stepX, stepY: g.stepY,
      };
    },

    snapshot() {
      return {
        gun: { x: this.gun.x, y: this.gun.y, known: this.gun.known },
        target: this.target ? { x: this.target.x, y: this.target.y } : null,
        targets: this.targets.map((p) => ({ x: p.x, y: p.y })),
        zones: this.zones.map((z) => ({ x: z.x, y: z.y, radiusMeters: z.radiusMeters, label: z.label, color: z.color })),
        impact: this.impactPoint ? { x: this.impactPoint.x, y: this.impactPoint.y } : null,
        weapon: this.weapon,
        mapId: this.mapId,
        updatedAt: new Date().toISOString(),
        lastMessage: null,
      };
    },

    _saveState() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          mapId: this.mapId, weapon: this.weapon, gun: this.gun,
          target: this.target, targets: this.targets, zones: this.zones, impact: this.impactPoint,
        }));
      } catch (_) {  }
    },

    _loadState() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) {}
      if (!s) return;
      if (s.mapId) this.mapId = s.mapId;
      if (s.weapon && this.library.get(`${s.weapon}/`)) this.weapon = s.weapon;
      if (s.gun) this.gun = s.gun;
      if (s.target) this.target = s.target;
      if (Array.isArray(s.targets)) this.targets = s.targets;
      if (Array.isArray(s.zones)) this.zones = s.zones;
      if (s.impact) this.impactPoint = s.impact;
    },

    setGun(x, y) { this.gun = { x, y, known: true }; this._saveState(); return this.snapshot(); },

    setTarget(x, y, opts = {}) {
      this.target = { x, y };
      if (opts.add) {
        this.targets = this.targets.filter((p) => Math.abs(p.x - x) > 1e-6 || Math.abs(p.y - y) > 1e-6);
        this.targets.push({ x, y });
        while (this.targets.length > 3) this.targets.shift();
      }
      if (opts.add || !opts.keepImpact) this.impactPoint = null;
      this._saveState();
      return this.snapshot();
    },

    clearTarget() { this.target = null; this.impactPoint = null; this._saveState(); return this.snapshot(); },
    clearTargets() { this.targets = []; this._saveState(); return this.snapshot(); },
    setWeapon(w) { this.weapon = w; this._saveState(); return this.snapshot(); },
    setMap(id) { this.mapId = id; this.impactPoint = null; this._saveState(); return this.snapshot(); },

    swap() {
      if (!this.target) return null;
      const gun = this.gun, t = this.target;
      this.gun = { x: t.x, y: t.y, known: true };
      this.target = { x: gun.x, y: gun.y };
      this.impactPoint = null;
      this._saveState();
      return this.snapshot();
    },

    addZone(x, y, radiusMeters, label, color) {
      this.zones.push({ x, y, radiusMeters, label: label || `占领圈 ${this.zones.length + 1}`, color: color || '#ffd24d' });
      this._saveState();
      return this.snapshot();
    },
    clearZones() { this.zones = []; this._saveState(); return this.snapshot(); },

    tablesFor(weapon) {
      return Object.keys(this.library.tables)
        .filter((k) => k.toLowerCase().startsWith(weapon.toLowerCase() + '/'))
        .map((k) => this.library.tables[k])
        .sort((a, b) => a.maxMil - b.maxMil);
    },

    solveBest(tables, range, dz) {
      let best = null, bestSol = null, bestRank = -1;
      for (const t of tables) {
        const s = Core.solve(t, range, dz);
        const rank = (!s.inRange || Number.isNaN(s.elevationMil)) ? 0 : (s.converged ? 2 : 1);
        const better = best === null || rank > bestRank
          || (rank === bestRank && rank > 0 && s.elevationMil < bestSol.elevationMil);
        if (better) { best = t; bestSol = s; bestRank = rank; }
      }
      return { table: best, sol: bestSol };
    },

    async solution({ tx, ty, gx, gy, weapon } = {}) {
      const weaponId = weapon || this.weapon;
      const tables = this.tablesFor(weaponId);
      if (!tables.length) throw new Error(`未知武器 ${weaponId}`);

      const gunX = gx !== undefined && gx !== null ? gx : this.gun.x;
      const gunY = gy !== undefined && gy !== null ? gy : this.gun.y;
      const targetX = tx !== undefined && tx !== null ? tx : (this.target ? this.target.x : NaN);
      const targetY = ty !== undefined && ty !== null ? ty : (this.target ? this.target.y : NaN);
      if (Number.isNaN(targetX) || Number.isNaN(targetY)) throw new Error('未设定目标');

      const dx = targetX - gunX, dy = targetY - gunY;
      const range = Math.sqrt(dx * dx + dy * dy) * Core.MetresPerGameUnit;
      const bearing = Core.bearingDegrees(gunX, gunY, targetX, targetY);

      const terrain = this.terrainSync(this.mapId);
      let dz = 0;
      if (terrain) {
        const h = terrain.heightAt(targetX, targetY), g = terrain.heightAt(gunX, gunY);
        if (h !== null && g !== null) dz = h - g;
      }

      const { table, sol } = this.solveBest(tables, range, dz);
      const flat = Core.solve(table, range, 0);
      const tilt = Core.computeTilt(terrain, gunX, gunY, bearing);

      let corrElev = null, corrBearing = null, bearingCorr = null;
      if (tilt.valid && sol.inRange && Number.isFinite(sol.elevationMil)) {
        corrElev = r2(Core.correctedElevationMil(sol.elevationMil, tilt));
        corrBearing = r2(Core.correctedBearingDegrees(bearing, sol.elevationMil, tilt));
        bearingCorr = r2(Core.bearingCorrectionDegrees(bearing, sol.elevationMil, tilt));
      }

      const dto = {
        inRange: sol.inRange,
        rangeMeters: round(range, 2),
        heightDeltaMeters: round(dz, 2),
        deltaX: round(dx, 4),
        deltaY: round(dy, 4),
        baseMil: r2(sol.baseMil),
        sightCorrectionMil: r2(sol.sightCorrectionMil),
        elevationMil: r2(sol.elevationMil),
        flightTimeSeconds: sol.flightTimeSeconds === null ? null : round(sol.flightTimeSeconds, 2),
        bearingDegrees: round(bearing, 1),
        converged: sol.converged,
        weapon: weaponId,
        arc: table.name.includes('/') ? table.name.split('/')[1] : '',
        flatBaseMil: r2(flat.baseMil),
        flatElevationMil: r2(flat.elevationMil),
        tableMinRangeMeters: round(table.minRange, 1),
        tableMaxRangeMeters: round(table.maxRange, 1),
        pitchDegrees: tilt.valid ? r2(tilt.pitchDegrees) : null,
        rollDegrees: tilt.valid ? r2(tilt.rollDegrees) : null,
        tiltCorrectionMil: r2(Core.correctionMil(tilt)),
        correctedElevationMil: corrElev,
        correctedBearingDegrees: corrBearing,
        bearingCorrectionDegrees: bearingCorr,
      };

      this.lastSolution = {
        gunX, gunY, targetX, targetY, rangeMeters: range, bearingDegrees: bearing,
        elevationMil: Number.isFinite(sol.elevationMil) ? sol.elevationMil : null,
        correctedElevationMil: corrElev, correctedBearingDegrees: corrBearing,
        weapon: weaponId, arc: dto.arc, at: new Date().toISOString(),
      };
      return dto;
    },

    async rangeRing({ cx, cy, gx, gy, masking, kind, weapon, samples } = {}) {
      const weaponId = weapon || this.weapon;
      const tables = this.tablesFor(weaponId);
      if (!tables.length) throw new Error(`未知武器 ${weaponId}`);

      const gunX = gx !== undefined && gx !== null ? gx : this.gun.x;
      const gunY = gy !== undefined && gy !== null ? gy : this.gun.y;
      const aroundTarget = String(kind).toLowerCase() === 'target';
      let centerX, centerY;
      if (cx !== undefined && cx !== null && cy !== undefined && cy !== null) { centerX = cx; centerY = cy; }
      else if (aroundTarget) {
        if (!this.target) throw new Error('未设定目标');
        centerX = this.target.x; centerY = this.target.y;
      } else { centerX = gunX; centerY = gunY; }

      const s = samples === undefined || samples === null ? 72 : Math.min(360, Math.max(0, samples));

      let terrain = null;
      if (s > 0) { try { terrain = await this.terrain(this.mapId); } catch (_) { terrain = null; } }

      let dz = 0, centerHeight = 0;
      if (terrain) {
        const ch = terrain.heightAt(centerX, centerY), gh = terrain.heightAt(gunX, gunY);
        if (ch !== null && gh !== null) { centerHeight = ch; dz = ch - gh; }
      }

      const opt = {
        azimuths: s <= 0 ? 4 : Math.min(720, Math.max(4, s)),
        stepMeters: 20,
        terrainMasking: !!masking,
        ignoreMinRange: false,
      };
      const useTerrain = s > 0 ? terrain : null;
      const parts = tables.map((t) => Core.reachability.compute(t, useTerrain, aroundTarget ? 'target' : 'gun',
        centerX, centerY, centerHeight, opt));
      const r = Core.reachability.merge(aroundTarget ? 'target' : 'gun', centerX, centerY, parts, opt);

      return {
        kind: r.kind,
        centerX, centerY,
        minRangeMeters: r.tableMinRangeMeters,
        maxRangeMeters: r.tableMaxRangeMeters,
        minEffectiveMeters: r.minEffectiveMeters === null ? r.tableMinRangeMeters : r.minEffectiveMeters,
        maxEffectiveMeters: r.maxEffectiveMeters === null ? r.tableMaxRangeMeters : r.maxEffectiveMeters,
        heightDeltaMeters: dz,
        minTerrainMeters: r.minTerrainMeters,
        maxTerrainMeters: r.maxTerrainMeters,
        terrainUsed: r.terrainUsed,
        samples: r.terrainUsed
          ? r.samples.map((x) => ({
            azimuthDeg: round(x.azimuthDeg, 2),
            minRangeMeters: round(x.minRangeMeters, 1),
            maxRangeMeters: round(x.maxRangeMeters, 1),
            reachable: x.reachable,
          }))
          : [],
      };
    },

    async tilt({ x, y, azimuth, spacing } = {}) {
      const px = x !== undefined && x !== null ? x : this.gun.x;
      const py = y !== undefined && y !== null ? y : this.gun.y;
      const az = azimuth !== undefined && azimuth !== null ? azimuth
        : (this.target ? Core.bearingDegrees(px, py, this.target.x, this.target.y) : 0);
      const terrain = await this.terrain(this.mapId);
      const t = Core.computeTilt(terrain, px, py, az,
        spacing === undefined || spacing === null ? Core.DefaultSpacingMeters : spacing);
      if (!t.valid) throw new Error('该位置没有地形数据，无法推算倾斜');
      return {
        x: px, y: py, azimuthDeg: round(t.azimuthDegrees, 2),
        heightMeters: terrain ? terrain.heightAt(px, py) : null,
        gradientX: round(t.gradientX, 5), gradientY: round(t.gradientY, 5),
        alongSlope: round(t.alongSlope, 5), crossSlope: round(t.crossSlope, 5),
        pitchDegrees: round(t.pitchDegrees, 3), rollDegrees: round(t.rollDegrees, 3),
        pitchMil: round(Core.pitchMil(t), 2), rollMil: round(Core.rollMil(t), 2),
        correctionMil: round(Core.correctionMil(t), 2),
        sampleSpacingMeters: t.sampleSpacingMeters,
      };
    },

    async impact({ x, y, firedMil, firedBearing } = {}) {
      const shot = this.lastSolution;
      const point = (x !== undefined && x !== null && y !== undefined && y !== null)
        ? { x, y } : this.impactPoint;
      if (!shot || !point) return { impact: null };

      const table = this.library.get(`${shot.weapon}/${shot.arc}`) || this.tablesFor(shot.weapon)[0];
      if (!table) throw new Error(`未知弹道 ${shot.weapon}/${shot.arc}`);

      const fm = firedMil !== undefined && firedMil !== null ? firedMil
        : (shot.correctedElevationMil !== null && shot.correctedElevationMil !== undefined
          ? shot.correctedElevationMil : shot.elevationMil);
      const fb = firedBearing !== undefined && firedBearing !== null ? firedBearing
        : (shot.correctedBearingDegrees !== null && shot.correctedBearingDegrees !== undefined
          ? shot.correctedBearingDegrees : shot.bearingDegrees);
      if (fm === null || fm === undefined || Number.isNaN(fm)) throw new Error('上一发没有有效刻度（可能超程）');

      const c = Core.impactCorrection(table, shot.gunX, shot.gunY, shot.targetX, shot.targetY, fm, fb, point.x, point.y);
      if (!c) throw new Error('无法反推（距离/弹道异常）');

      return {
        impact: { x: point.x, y: point.y },
        fired: { mil: round(fm, 1), bearingDegrees: round(fb, 1) },
        rangeErrorMeters: round(c.rangeErrorMeters, 1),
        bearingErrorDegrees: round(c.bearingErrorDegrees, 2),
        rangeMetersPerMil: round(Math.abs(c.rangeMetersPerMil), 3),
        rangePerMilFromTable: c.rangePerMilFromTable,
        milCorrection: round(c.milCorrection, 1),
        bearingCorrectionMil: round(c.bearingCorrectionMil, 1),
        next: {
          mil: round(c.nextMil, 1),
          bearingDegrees: round(c.nextBearingDegrees, 1),
          bearingMil: round(c.nextBearingDegrees * Core.MilPerDegree, 1),
        },
        targetRangeMeters: round(c.targetRangeMeters, 1),
        impactRangeMeters: round(c.impactRangeMeters, 1),
      };
    },

    async handle(method, path, q, body) {
      const num = (k) => (q.has(k) && q.get(k) !== '' ? Number(q.get(k)) : undefined);
      switch (`${method} ${path}`) {
        case 'GET /api/health':
          return { ok: true, version: 'v1.0.0', author: 'model115', maps: this.maps.length, weapons: Object.keys(this.library.tables) };
        case 'GET /api/maps': return this.maps;
        case 'GET /api/state': return this.snapshot();
        case 'GET /api/solution':
          return this.solution({ tx: num('tx'), ty: num('ty'), gx: num('gx'), gy: num('gy'), weapon: q.get('weapon') || undefined });
        case 'GET /api/range-ring':
          return this.rangeRing({
            cx: num('cx'), cy: num('cy'), gx: num('gx'), gy: num('gy'),
            masking: q.get('masking') === 'true', kind: q.get('kind') || 'gun',
            weapon: q.get('weapon') || undefined, samples: num('samples'),
          });
        case 'GET /api/tilt':
          return this.tilt({ x: num('x'), y: num('y'), azimuth: num('azimuth'), spacing: num('spacing') });
        case 'GET /api/impact':
          return this.impact({ firedMil: num('firedMil'), firedBearing: num('firedBearing') });
        case 'GET /api/logs': return [];

        case 'POST /api/gun':
          if (body.x === undefined || body.y === undefined) throw new Error('需要 x/y');
          return this.setGun(body.x, body.y);
        case 'POST /api/target':
          if (body.clear === true) return this.clearTarget();
          if (body.x === undefined || body.y === undefined) throw new Error('需要 x/y 或 clear=true');
          return this.setTarget(body.x, body.y, { add: body.add === true, keepImpact: body.keepImpact === true });
        case 'POST /api/targets/clear': return this.clearTargets();
        case 'POST /api/swap':
          if (!this.target) throw new Error('没有目标可交换');
          return this.swap();
        case 'POST /api/weapon': return this.setWeapon(body.weapon || this.weapon);
        case 'POST /api/map': {
          if (body.mapId && !this.maps.some((m) => m.id === body.mapId)) throw new Error(`没有这张地图：${body.mapId}`);
          return this.setMap(body.mapId || this.mapId);
        }
        case 'POST /api/zones':
          if (body.clear === true) return this.clearZones();
          if (body.x === undefined || body.y === undefined) throw new Error('需要 x/y');
          return this.addZone(body.x, body.y, Math.min(5000, Math.max(10, body.radiusMeters || 150)), body.label, body.color);
        case 'POST /api/impact': {
          if (body.clear === true) { this.impactPoint = null; this._saveState(); return { cleared: true }; }
          if (body.x === undefined || body.y === undefined) throw new Error('需要 x/y');
          const res = await this.impact({ x: body.x, y: body.y, firedMil: body.firedMil, firedBearing: body.firedBearing });
          this.impactPoint = { x: body.x, y: body.y };
          this._saveState();
          return res;
        }
        default: throw new Error(`未知接口：${method} ${path}`);
      }
    },
  };

  root.WardogsStore = Store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
