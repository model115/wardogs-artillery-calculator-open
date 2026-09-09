
'use strict';

const root = typeof globalThis !== 'undefined' ? globalThis : window;
const state = {
  maps: [],
  map: null,
  mapImage: null,
  terrainImage: null,
  showTerrain: false,
  showTowers: false,
  towerReach: null,
  legend: null,
  view: { cx: 0, cy: 0, scale: 40 },
  snap: null,
  rulerMode: false,
  zoneMode: false,
  impactMode: false,
  impact: null,
  placeMode: null,
  zoneRadius: 150,
  activeRing: 'gun',
  ringGun: null,
  ringTarget: null,
  solution: null,
  displayMil: null,
  displayBearing: null,
  logs: [],
  feed: [],
  dragging: false,
  dragStart: null,
  dragMarker: null,
  dragPos: null,
  cursor: null,
  lockGun: false,
  lockTarget: false,
  ruler: [],
};

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');

const I18N = {
  zh: {
    'app.title': 'WARDOGS 火炮解算器',
    'conn.connecting': '连接中…',
    'conn.ok': (v) => `已连接 · ${v}`,
    'conn.on': '已连接',
    'conn.off': '未连接',
    'conn.lost': '实时连接中断，正在重连…',
    'conn.fail': (m) => `连接失败：${m}`,
    'feed.title': '实时日志',
    'feed.clear': '清空',
    'feed.idle': '等待操作…',
    'feed.backend': (m) => `后端：${m}`,
    'card.points': '点位',
    'card.solution': '射击诸元',
    'card.impact': '弹着点反推',
    'card.layers': '图层',
    'card.ring': '射程圈（3D 高程计算）',
    'card.zones': '占领圈',
    'card.view': '视图',
    'card.targets': '目标列表',
    'point.vehicle': '车体',
    'point.target': '目标',
    'point.impact': '落点',
    'point.copy': '复制',
    'point.lock': '锁',
    'point.locked': '已锁',
    'point.record': '记录',
    'point.goto': '定位到坐标',
    'point.saveGun': '存车体',
    'point.swap': '交换点位',
    'point.hint': '手输坐标 → 回车或「定位到坐标」；锁上后在地图上误点也不会覆盖。',
    'point.unknown': '未知',
    'point.unset': '未设定',
    'point.needGunXY': '炮位需要 X 和 Y 两个值',
    'point.needTargetXY': '目标需要 X 和 Y 两个值',
    'point.noCoord': '没有可复制的坐标',
    'point.copied': (t) => `已复制 ${t}`,
    'point.copyFail': (t) => `复制失败（浏览器限制）：${t}`,
    'point.lockGun': '炮位',
    'point.lockTarget': '目标',
    'point.lockedMsg': (l) => `${l}已锁定`,
    'point.unlockedMsg': (l) => `${l}已解锁`,
    'point.lockFirst': (l) => `${l}已锁定，先解锁`,
    'point.noGun': '还没有炮位坐标',
    'point.gunSaved': '炮位已存入目标列表',
    'sol.tilt': '地形倾斜修正（实验：用 3D 高程推算车体姿态）',
    'sol.range': '水平距离',
    'sol.bearing': '游戏内方位角',
    'sol.elev': '游戏内刻度',
    'sol.dxdy': 'ΔX / ΔY',
    'sol.dz': '高差 ΔZ',
    'sol.flat': '射表（平地）',
    'sol.corr': '高差修正',
    'sol.tiltCorr': '倾斜修正（实验）',
    'sol.pitch': '车体俯仰（地形）',
    'sol.roll': '车体侧倾（地形）',
    'sol.flight': '飞行时间',
    'sol.inrange': '射程判定',
    'sol.fire': '可发射',
    'sol.nofire': '超出射程',
    'sol.arcHigh': '高抛',
    'sol.arcLow': '低抛',
    'sol.arcSingle': '单一弹道',
    'sol.converged': '已收敛',
    'sol.notConverged': '未完全收敛（高差较大）',
    'sol.wasBase': (v) => `（不含倾斜修正 ${v}）`,
    'sol.pitchUp': '上仰',
    'sol.pitchDown': '下俯',
    'sol.hintOk': (w, arc, min, max, conv) =>
      `弹道 ${w}（${arc}，已统一解算）· 射表 ${min}~${max} m · ${conv}`,
    'sol.hintOut': (min, max) => `目标超出射程（${min}~${max} m），靠近或换武器`,
    'sol.tiltWarn': (p, m) => `坡度 ${p}°（倾斜修正 ${m} mil）—— 由高程网格推算，未经游戏验证，建议用落点反推校准`,
    'imp.clear': '清除',
    'imp.range': '距离偏差',
    'imp.bearing': '方位偏差',
    'imp.mil': '刻度修正',
    'imp.nextMil': '下一发刻度',
    'imp.nextAz': '下一发方位',
    'imp.hint': '点「记录落点」再点地图上炮弹落点，或直接填坐标按「记录」，自动反推第二发要改多少。',
    'imp.far': '打远',
    'imp.near': '打近',
    'imp.right': '偏右',
    'imp.left': '偏左',
    'imp.perMil': (v) => `（1 mil ≈ ${v} m）`,
    'imp.cleared': '已清除弹着点',
    'imp.modeOn': '记录落点：点地图上炮弹落点',
    'imp.modeOff': '退出记录落点',
    'imp.needCoords': '落点需要 X 和 Y 两个值',
    'imp.noShot': '还没有解算记录，先设好车体/目标',
    'imp.failed': (m) => `弹着反推失败：${m}`,
    'layer.terrain': '高度热力图（越高越红）',
    'layer.towers': '1~5 塔被射范围（预算图）',
    'layer.hint': '热力图来自游戏原生 3D 高程场（2 m 顶点间距），半透明叠在地图上。',
    'layer.noData': '无高程数据',
    'ring.gun': '车体射程',
    'ring.target': '目标射程',
    'ring.lock': '锁定（拖动时不再自动切换）',
    'ring.terrain': '用 3D 高程逐方位计算（关掉=射表平地）',
    'ring.masking': '弹道遮挡检查（近似，可能偏保守）',
    'ring.now': '当前显示',
    'ring.gunTxt': '车体可达射程',
    'ring.azTxt': '目标方位射程',
    'ring.targetTxt': '目标可达射程',
    'ring.hint': '高抛/低抛已合并为统一射程；拖动标点时实时重算。',
    'ring.gunRing': '炮位圈',
    'ring.targetRing': '目标圈',
    'ring.hidden': '（未显示）',
    'ring.terrainTag': '地形',
    'ring.flatTag': '射表平地',
    'ring.unreachable': '该方向不可达',
    'ring.azRange': (a, b, az) => `${a} ~ ${b} m（方位 ${az}°）`,
    'ring.hintTerrain': (n) => `已用 3D 高程逐方位计算（${n} 个方位）；环带边界随地形起伏。`,
    'ring.hintFlat': '未使用高程（无地形数据或已关闭）—— 当前按射表平地算，是正圆。',
    'zone.radius': '半径',
    'zone.m': '米',
    'zone.clear': '清空',
    'zone.label': '占领圈',
    'zone.hint': '点左下角「占领圈」按钮进入放置模式，再点地图即可放一个圈（可放多个）。',
    'view.reset': '重置',
    'view.zoom': (v) => `${v} px/单位 · 大图`,
    'why.initial': '初始',
    'why.dragPreview': '拖动预览',
    'why.drag': '拖动',
    'why.placeGun': '放车体',
    'why.placeTarget': '放目标',
    'why.switchTarget': '切换目标',
    'why.typedGun': '手输炮位',
    'why.typedTarget': '手输目标',
    'why.terrainToggle': '切换高程',
    'why.maskingToggle': '切换遮挡检查',
    'why.manual': '手动切换',
    'why.weapon': '换武器',
    'view.hint': '按住鼠标右键拖动地图；滚轮缩放。局域网内任何设备打开本页都能用同一份状态。',
    'targets.export': '导出',
    'targets.import': '导入',
    'targets.clear': '清空',
    'targets.set': '设为目标',
    'targets.empty': '暂无收藏目标（点地图设目标后自动加入）',
    'targets.isEmpty': '目标列表为空',
    'targets.exported': (n) => `已导出 ${n} 个目标`,
    'targets.imported': (n) => `已导入 ${n} 个目标`,
    'targets.badJson': '导入失败：不是合法 JSON',
    'targets.badList': '导入失败：没有 targets 数组',
    'hint.placeGun': '点地图放车体（炮位）',
    'hint.placeTarget': (n) => `点地图放目标（已有 ${n}/3）`,
    'hint.ruler': '量距：点两个点',
    'hint.zone': '点地图放占领圈',
    'hint.impact': '点地图记录炮弹落点',
    'hint.firstGun': '点地图放车体（第 1 下）',
    'hint.secondTarget': '点地图放目标（第 2 下）',
    'hint.idle': '右键拖动地图 · 左键点目标可切换 · 拖动标记可移动 · 右上角选放置模式',
    'hint.changePoint': '要改点位：右上角选「放车体 / 放目标」，或直接拖动标记',
    'ruler.two': '量距：点两个点',
    'ruler.oneMore': '量距：再点一个点',
    'ruler.result': (d, az) => `量距：${d} m · 方位 ${az}°`,
    'tut.skip': '不再自动显示',
    'tut.prev': '上一步',
    'tut.next': '下一步',
    'tut.done': '完成',
    'tut.close': '关闭',
    'log.connected': (v, maps, weapons) => `已连接后端 ${v}（地图 ${maps} 张，弹道 ${weapons}）`,
    'log.mapLoaded': (n, w, h) => `地图加载完成：${n}（${w}×${h}）`,
    'log.mapFail': (id) => `地图大图加载失败：${id}`,
    'log.terrainLoaded': (id) => `高度热力图加载完成：${id}`,
    'log.terrainFail': (id) => `高度热力图加载失败：${id}（这张图可能没有高程数据）`,
    'log.towerLoaded': (n, az) => `塔被射范围载入：${n} 个塔（${az} 方位）`,
    'log.towerFail': (m) => `塔被射范围载入失败：${m}（先跑 tools ... tower-reach）`,
    'log.gunDrag': (x, y) => `车体拖到 x${x} y${y}`,
    'log.targetDrag': (x, y) => `目标拖到 x${x} y${y}`,
    'log.gunPlace': (x, y) => `放置车体（炮位）→ x${x} y${y}`,
    'log.targetPlace': (x, y) => `放置目标 → x${x} y${y}`,
    'log.targetSwitch': (x, y) => `切换目标 → x${x} y${y}`,
    'log.gunInput': (x, y) => `车体（炮位）→ x${x} y${y}（手输）`,
    'log.targetInput': (x, y) => `目标 → x${x} y${y}（手输）`,
    'log.zoneAdd': (x, y, r) => `占领圈：x${x} y${y} 半径 ${r} m`,
    'log.zoneClear': '已清空占领圈',
    'log.mapSwitch': (n) => `切换地图：${n}`,
    'log.weapon': (w) => `切换到武器：${w}（统一射程）`,
    'log.ringTarget': (a, b, src, why) => `目标可达圈：${a}~${b} m（${src}）${why ? ' · ' + why : ''}`,
    'log.ringGun': (a, b, src, why) => `车体可达圈：${a}~${b} m（${src}）${why ? ' · ' + why : ''}`,
    'log.ringFail': (m) => `可达圈计算失败：${m}`,
    'log.ringSwitch': (w) => `射程圈切换到：${w}`,
    'log.needTarget': '先放一个目标',
    'log.ringLocked': '射程圈已锁定（拖动不再自动切换）',
    'log.ringUnlocked': '射程圈解锁（拖动会跟随）',
    'log.terrainOn': '打开高度热力图（越高越红）',
    'log.terrainOff': '关闭高度热力图',
    'log.towersOn': '打开 1~5 塔被射范围',
    'log.towersOff': '关闭塔被射范围',
    'log.tiltOn': '开启地形倾斜修正（实验）',
    'log.tiltOff': '关闭地形倾斜修正',
    'log.solve': (s) => `解算 ${s.weapon}/${s.arc}：距离 ${s.range} m · 方位 ${s.bearing}° · ` +
      `ΔZ ${s.dz} · 射表 ${s.flat} → 实际 ${s.elev}${s.tilt} · 飞行 ${s.flight} · ${s.verdict}`,
    'log.impact': (x, y, dir, m, side, deg, nm, nb) =>
      `弹着点 (${x}, ${y})：${dir} ${m} m、${side} ${deg}° → 下一发 ${nm} mil / ${nb}°`,
    'log.impactCleared': '已清除弹着点',
    'log.dragPreview': '拖动预览',
    'log.drag': '拖动',
    'log.ring': '可达圈',
  },
  en: {
    'app.title': 'WARDOGS Artillery Calculator',
    'conn.connecting': 'Connecting…',
    'conn.ok': (v) => `Connected · ${v}`,
    'conn.on': 'Connected',
    'conn.off': 'Disconnected',
    'conn.lost': 'Live connection lost, reconnecting…',
    'conn.fail': (m) => `Connection failed: ${m}`,
    'feed.title': 'Live log',
    'feed.clear': 'Clear',
    'feed.idle': 'Waiting for input…',
    'feed.backend': (m) => `Backend: ${m}`,
    'card.points': 'Points',
    'card.solution': 'Firing solution',
    'card.impact': 'Impact correction',
    'card.layers': 'Layers',
    'card.ring': 'Range ring (3D terrain)',
    'card.zones': 'Capture zones',
    'card.view': 'View',
    'card.targets': 'Target list',
    'point.vehicle': 'Vehicle',
    'point.target': 'Target',
    'point.impact': 'Impact',
    'point.copy': 'Copy',
    'point.lock': 'Lock',
    'point.locked': 'Locked',
    'point.record': 'Record',
    'point.goto': 'Go to coords',
    'point.saveGun': 'Save vehicle',
    'point.swap': 'Swap points',
    'point.hint': 'Type coords → Enter or "Go to coords". Locked points are not overwritten by map clicks.',
    'point.unknown': 'unknown',
    'point.unset': 'not set',
    'point.needGunXY': 'Vehicle needs both X and Y',
    'point.needTargetXY': 'Target needs both X and Y',
    'point.noCoord': 'No coordinates to copy',
    'point.copied': (t) => `Copied ${t}`,
    'point.copyFail': (t) => `Copy failed (browser restriction): ${t}`,
    'point.lockGun': 'Vehicle',
    'point.lockTarget': 'Target',
    'point.lockedMsg': (l) => `${l} locked`,
    'point.unlockedMsg': (l) => `${l} unlocked`,
    'point.lockFirst': (l) => `${l} is locked — unlock first`,
    'point.noGun': 'No vehicle position yet',
    'point.gunSaved': 'Vehicle saved to target list',
    'sol.tilt': 'Terrain tilt correction (experimental: vehicle pose from 3D heightmap)',
    'sol.range': 'Horizontal range',
    'sol.bearing': 'In-game azimuth',
    'sol.elev': 'In-game elevation',
    'sol.dxdy': 'ΔX / ΔY',
    'sol.dz': 'Height ΔZ',
    'sol.flat': 'Table (flat)',
    'sol.corr': 'Height correction',
    'sol.tiltCorr': 'Tilt correction (exp.)',
    'sol.pitch': 'Vehicle pitch (terrain)',
    'sol.roll': 'Vehicle roll (terrain)',
    'sol.flight': 'Flight time',
    'sol.inrange': 'Range check',
    'sol.fire': 'Can fire',
    'sol.nofire': 'Out of range',
    'sol.arcHigh': 'high arc',
    'sol.arcLow': 'low arc',
    'sol.arcSingle': 'single arc',
    'sol.converged': 'converged',
    'sol.notConverged': 'not fully converged (large height delta)',
    'sol.wasBase': (v) => ` (without tilt ${v})`,
    'sol.pitchUp': 'nose up',
    'sol.pitchDown': 'nose down',
    'sol.hintOk': (w, arc, min, max, conv) =>
      `Table ${w} (${arc}, arcs merged) · ${min}~${max} m · ${conv}`,
    'sol.hintOut': (min, max) => `Target out of range (${min}~${max} m) — move closer or switch weapon`,
    'sol.tiltWarn': (p, m) => `Slope ${p}° (tilt correction ${m} mil) — from the height grid, not verified in-game; calibrate with the impact back-solve`,
    'imp.clear': 'Clear',
    'imp.range': 'Range error',
    'imp.bearing': 'Bearing error',
    'imp.mil': 'Mil correction',
    'imp.nextMil': 'Next elevation',
    'imp.nextAz': 'Next azimuth',
    'imp.hint': 'Click "Record impact" then the impact on the map — or type the coords and press "Record".',
    'imp.far': 'over',
    'imp.near': 'short',
    'imp.right': 'right',
    'imp.left': 'left',
    'imp.perMil': (v) => ` (1 mil ≈ ${v} m)`,
    'imp.cleared': 'Impact cleared',
    'imp.modeOn': 'Record impact: click the shell impact on the map',
    'imp.modeOff': 'Impact recording off',
    'imp.needCoords': 'Impact needs both X and Y',
    'imp.noShot': 'No solution recorded yet — set vehicle/target first',
    'imp.failed': (m) => `Impact back-solve failed: ${m}`,
    'layer.terrain': 'Elevation heatmap (higher = redder)',
    'layer.towers': 'Tower 1~5 reach (precomputed)',
    'layer.hint': 'Heatmap comes from the game\'s native 3D height field (2 m vertices), overlaid translucent.',
    'layer.noData': 'no elevation data',
    'ring.gun': 'Vehicle ring',
    'ring.target': 'Target ring',
    'ring.lock': 'Lock (no auto switch while dragging)',
    'ring.terrain': 'Per-azimuth 3D terrain (off = flat table)',
    'ring.masking': 'Trajectory masking check (approx., may be conservative)',
    'ring.now': 'Showing',
    'ring.gunTxt': 'Vehicle reach',
    'ring.azTxt': 'Range toward target',
    'ring.targetTxt': 'Target reach',
    'ring.hint': 'High/low arcs merged into one effective range; recomputed live while dragging.',
    'ring.gunRing': 'vehicle ring',
    'ring.targetRing': 'target ring',
    'ring.hidden': '(hidden)',
    'ring.terrainTag': 'terrain',
    'ring.flatTag': 'flat table',
    'ring.unreachable': 'not reachable in this direction',
    'ring.azRange': (a, b, az) => `${a} ~ ${b} m (azimuth ${az}°)`,
    'ring.hintTerrain': (n) => `Computed per azimuth from 3D terrain (${n} azimuths); the band follows the terrain.`,
    'ring.hintFlat': 'No terrain used (missing data or disabled) — currently a flat-table circle.',
    'zone.radius': 'Radius',
    'zone.m': 'm',
    'zone.clear': 'Clear',
    'zone.label': 'Zone',
    'zone.hint': 'Click the "Capture zone" button, then click the map to place a circle (multiple allowed).',
    'view.reset': 'Reset',
    'view.zoom': (v) => `${v} px/unit · whole map`,
    'why.initial': 'initial',
    'why.dragPreview': 'drag preview',
    'why.drag': 'drag',
    'why.placeGun': 'place vehicle',
    'why.placeTarget': 'place target',
    'why.switchTarget': 'switch target',
    'why.typedGun': 'typed vehicle',
    'why.typedTarget': 'typed target',
    'why.terrainToggle': 'terrain toggle',
    'why.maskingToggle': 'masking toggle',
    'why.manual': 'manual switch',
    'why.weapon': 'weapon change',
    'view.hint': 'Right-drag to pan, wheel to zoom. Any device on the LAN sees the same state.',
    'targets.export': 'Export',
    'targets.import': 'Import',
    'targets.clear': 'Clear',
    'targets.set': 'Set as target',
    'targets.empty': 'No saved targets yet (placing a target adds it automatically)',
    'targets.isEmpty': 'Target list is empty',
    'targets.exported': (n) => `Exported ${n} target(s)`,
    'targets.imported': (n) => `Imported ${n} target(s)`,
    'targets.badJson': 'Import failed: not valid JSON',
    'targets.badList': 'Import failed: no targets array',
    'hint.placeGun': 'Click the map to place the vehicle (gun)',
    'hint.placeTarget': (n) => `Click the map to place a target (${n}/3)`,
    'hint.ruler': 'Ruler: click two points',
    'hint.zone': 'Click the map to place a capture zone',
    'hint.impact': 'Click the map to record the shell impact',
    'hint.firstGun': 'Click the map to place the vehicle (1st click)',
    'hint.secondTarget': 'Click the map to place the target (2nd click)',
    'hint.idle': 'Right-drag to pan · click a target to switch · drag markers · place modes top-right',
    'hint.changePoint': 'To move a point: pick "Place vehicle / target" top-right, or just drag the marker',
    'ruler.two': 'Ruler: click two points',
    'ruler.oneMore': 'Ruler: click one more point',
    'ruler.result': (d, az) => `Ruler: ${d} m · azimuth ${az}°`,
    'tut.skip': 'Don\'t show again',
    'tut.prev': 'Back',
    'tut.next': 'Next',
    'tut.done': 'Done',
    'tut.close': 'Close',
    'log.connected': (v, maps, weapons) => `Connected to backend ${v} (${maps} map(s), tables ${weapons})`,
    'log.mapLoaded': (n, w, h) => `Map image loaded: ${n} (${w}×${h})`,
    'log.mapFail': (id) => `Map image failed to load: ${id}`,
    'log.terrainLoaded': (id) => `Elevation heatmap loaded: ${id}`,
    'log.terrainFail': (id) => `Elevation heatmap failed: ${id} (this map may have no height data)`,
    'log.towerLoaded': (n, az) => `Tower reach loaded: ${n} towers (${az} azimuths)`,
    'log.towerFail': (m) => `Tower reach failed to load: ${m} (run tools ... tower-reach first)`,
    'log.gunDrag': (x, y) => `Vehicle dragged to x${x} y${y}`,
    'log.targetDrag': (x, y) => `Target dragged to x${x} y${y}`,
    'log.gunPlace': (x, y) => `Vehicle (gun) placed → x${x} y${y}`,
    'log.targetPlace': (x, y) => `Target placed → x${x} y${y}`,
    'log.targetSwitch': (x, y) => `Switched target → x${x} y${y}`,
    'log.gunInput': (x, y) => `Vehicle (gun) → x${x} y${y} (typed)`,
    'log.targetInput': (x, y) => `Target → x${x} y${y} (typed)`,
    'log.zoneAdd': (x, y, r) => `Capture zone: x${x} y${y} radius ${r} m`,
    'log.zoneClear': 'Capture zones cleared',
    'log.mapSwitch': (n) => `Switched map: ${n}`,
    'log.weapon': (w) => `Switched weapon: ${w} (arcs merged)`,
    'log.ringTarget': (a, b, src, why) => `Target reach: ${a}~${b} m (${src})${why ? ' · ' + why : ''}`,
    'log.ringGun': (a, b, src, why) => `Vehicle reach: ${a}~${b} m (${src})${why ? ' · ' + why : ''}`,
    'log.ringFail': (m) => `Range ring failed: ${m}`,
    'log.ringSwitch': (w) => `Range ring switched to: ${w}`,
    'log.needTarget': 'Place a target first',
    'log.ringLocked': 'Range ring locked (no auto switch while dragging)',
    'log.ringUnlocked': 'Range ring unlocked (follows dragging)',
    'log.terrainOn': 'Elevation heatmap on (higher = redder)',
    'log.terrainOff': 'Elevation heatmap off',
    'log.towersOn': 'Tower 1~5 reach on',
    'log.towersOff': 'Tower reach off',
    'log.tiltOn': 'Terrain tilt correction on (experimental)',
    'log.tiltOff': 'Terrain tilt correction off',
    'log.solve': (s) => `Solution ${s.weapon}/${s.arc}: range ${s.range} m · azimuth ${s.bearing}° · ` +
      `ΔZ ${s.dz} · table ${s.flat} → actual ${s.elev}${s.tilt} · flight ${s.flight} · ${s.verdict}`,
    'log.impact': (x, y, dir, m, side, deg, nm, nb) =>
      `Impact (${x}, ${y}): ${dir} ${m} m, ${side} ${deg}° → next shot ${nm} mil / ${nb}°`,
    'log.impactCleared': 'Impact cleared',
    'log.dragPreview': 'drag preview',
    'log.drag': 'drag',
    'log.ring': 'ring',
  },
};

const LANG_KEY = 'wardogs-lang';
let lang = 'zh';

function t(key, ...args) {
  const dict = I18N[lang] || I18N.zh;
  const v = dict[key] !== undefined ? dict[key] : I18N.zh[key];
  if (v === undefined) return key;
  return typeof v === 'function' ? v(...args) : v;
}

function applyLang() {
  if (document.documentElement) document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  const langBtn = $('btn-lang');
  if (langBtn) langBtn.textContent = lang === 'en' ? '中文' : 'EN';
  const tutLang = $('tutorial-lang');
  if (tutLang) tutLang.textContent = lang === 'en' ? '中文' : 'English';

  const gunLock = $('gun-lock');
  if (gunLock) gunLock.textContent = state.lockGun ? t('point.locked') : t('point.lock');
  const targetLock = $('target-lock');
  if (targetLock) targetLock.textContent = state.lockTarget ? t('point.locked') : t('point.lock');

  if (state.snap) { renderStatus(state.snap); renderTargetList(state.snap); }
  renderSolution(state.solution);
  renderImpact(state.impact);
  renderRings();
  updateClickHint();
  updateRulerText();
  renderFeed();
  renderTutorial();
}

function setLang(next) {
  lang = next === 'en' ? 'en' : 'zh';
  try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}
  applyLang();
  draw();
}

function loadLang() {
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (_) {}
  if (saved === 'en' || saved === 'zh') lang = saved;
}

function toggleLang() { setLang(lang === 'en' ? 'zh' : 'en'); }

const FEED_MAX = 40;
function pushLog(text, kind = 'info') {
  const t = new Date();
  const stamp = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
  state.feed.push({ stamp, text, kind });
  if (state.feed.length > FEED_MAX) state.feed.shift();
  renderFeed();
}

function renderFeed() {
  const box = $('feed-list');
  if (!box) return;
  const rows = state.feed.slice(-14).reverse();
  box.innerHTML = rows.map((e) =>
    `<div class="feed-item ${e.kind}"><span class="t">${e.stamp}</span><span>${escapeHtml(e.text)}</span></div>`
  ).join('') || `<div class="feed-item muted">${t('feed.idle')}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : Number(v).toFixed(d);

async function api(path, options) {
  const method = (options && options.method) || 'GET';
  const [p, qs] = String(path).split('?');
  const q = new URLSearchParams(qs || '');
  let body = {};
  if (options && options.body) { try { body = JSON.parse(options.body); } catch (_) { body = {}; } }
  try {
    const res = await root.WardogsStore.handle(method, p, q, body);

    if (method === 'POST' && typeof refreshState === 'function') await refreshState();
    return res;
  } catch (err) {
    throw new Error(err && err.message ? err.message : String(err));
  }
}
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body || {}) });

function gameToScreen(x, y) {
  const { cx, cy, scale } = state.view;
  return {
    sx: canvas.clientWidth / 2 + (x - cx) * scale,
    sy: canvas.clientHeight / 2 - (y - cy) * scale,
  };
}
function screenToGame(sx, sy) {
  const { cx, cy, scale } = state.view;
  return {
    x: cx + (sx - canvas.clientWidth / 2) / scale,
    y: cy - (sy - canvas.clientHeight / 2) / scale,
  };
}

function tileBounds() {
  const m = state.map;
  return (m && m.tileBounds) ? m.tileBounds : m.bounds;
}

function getMapImage() {
  if (!state.map) return null;
  const id = state.map.id;
  if (state.mapImage && state.mapImage.id === id) return state.mapImage;

  const rec = { id, img: new Image(), ready: false, failed: false };
  rec.img.decoding = 'async';
  rec.img.onload = () => {
    rec.ready = true;
    pushLog(t('log.mapLoaded', state.map.name, rec.img.naturalWidth, rec.img.naturalHeight), 'ok');
    draw();
  };
  rec.img.onerror = () => {
    rec.failed = true;
    pushLog(t('log.mapFail', id), 'bad');
    draw();
  };
  rec.img.src = `data/images/${id}_map.webp`;
  state.mapImage = rec;
  return rec;
}

function drawMapImage() {
  const rec = getMapImage();
  if (!rec) return;
  const tb = tileBounds();
  const a = gameToScreen(tb.minX, tb.maxY);
  const b = gameToScreen(tb.maxX, tb.minY);
  const w = b.sx - a.sx, h = b.sy - a.sy;
  if (rec.ready) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(rec.img, a.sx, a.sy, w, h);
  } else {
    ctx.fillStyle = '#0d131b';
    ctx.fillRect(a.sx, a.sy, w, h);
    if (rec.failed) {
      ctx.fillStyle = '#ff5a5a';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText(t('log.mapFail', ''), a.sx + 16, a.sy + 24);
    }
  }
}

function getTerrainImage() {
  if (!state.map) return null;
  const id = state.map.id;
  if (state.terrainImage && state.terrainImage.id === id) return state.terrainImage;

  const rec = { id, img: new Image(), ready: false, failed: false };
  rec.img.onload = () => {
    rec.ready = true;
    pushLog(t('log.terrainLoaded', id), 'ok');
    draw();
  };
  rec.img.onerror = () => {
    rec.failed = true;
    pushLog(t('log.terrainFail', id), 'bad');
    draw();
  };
  rec.img.src = `data/images/${id}_terrain.webp`;
  state.terrainImage = rec;
  return rec;
}

function drawTerrainHeatmap() {
  if (!state.showTerrain || !state.map) return;
  const rec = getTerrainImage();
  if (!rec || !rec.ready) return;
  const tb = tileBounds();
  const a = gameToScreen(tb.minX, tb.maxY);
  const b = gameToScreen(tb.maxX, tb.minY);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.drawImage(rec.img, a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
  ctx.restore();
}

const TOWER_COLORS = ['#4ea3ff', '#33d17a', '#ffb020', '#dc78ff', '#ff5a5a'];

async function getTowerReach() {
  const id = state.map && state.map.id;
  if (!id) return null;
  if (state.towerReach && state.towerReach.mapId === id) return state.towerReach;
  try {
    const data = await fetch(`data/reach/${id}_towers.json`).then((r) => r.json());
    state.towerReach = { mapId: id, towers: data.towers || [] };
    pushLog(t('log.towerLoaded', (data.towers || []).length, data.azimuths), 'ok');
  } catch (err) {
    state.towerReach = { mapId: id, towers: [], error: err.message };
    pushLog(t('log.towerFail', err.message), 'bad');
  }
  return state.towerReach;
}

function drawTowerReach() {
  const data = state.towerReach;
  if (!state.showTowers || !data || !data.towers) return;
  ctx.save();
  data.towers.forEach((tw, i) => {
    const color = TOWER_COLORS[i % TOWER_COLORS.length];
    const outer = [];
    const inner = [];
    for (const s of tw.samples) {
      if (!s.reachable) continue;
      const a = s.azimuthDeg * Math.PI / 180;
      const ro = s.maxRangeMeters / 100, ri = s.minRangeMeters / 100;
      outer.push(gameToScreen(tw.x + ro * Math.sin(a), tw.y + ro * Math.cos(a)));
      if (ri > 0.5) inner.push(gameToScreen(tw.x + ri * Math.sin(a), tw.y + ri * Math.cos(a)));
    }
    if (outer.length < 3) return;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    tracePolygon(outer);
    if (inner.length >= 3) tracePolygon(inner);
    ctx.fillStyle = color;
    ctx.fill(inner.length >= 3 ? 'evenodd' : 'nonzero');

    ctx.globalAlpha = 0.85;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.beginPath();
    tracePolygon(outer);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

async function refreshLegend() {
  const legend = $('legend');
  if (!state.showTerrain) { legend.hidden = true; return; }
  legend.hidden = false;
  if (state.legend) {
    $('legend-min').textContent = `${fmt(state.legend.minHeightMeters, 0)} m`;
    $('legend-max').textContent = `${fmt(state.legend.maxHeightMeters, 0)} m`;
    return;
  }
  try {
    state.legend = await root.WardogsStore.terrainInfo(state.map.id);
    $('legend-min').textContent = `${fmt(state.legend.minHeightMeters, 0)} m`;
    $('legend-max').textContent = `${fmt(state.legend.maxHeightMeters, 0)} m`;
  } catch (err) {
    $('legend-min').textContent = '—';
    $('legend-max').textContent = t('layer.noData');
  }
}

function ringPolygon(ring, which) {
  const pts = (ring.samples || []).filter((s) => s.reachable);
  if (pts.length === 0) return null;
  const out = [];
  for (const s of pts) {
    const r = (which === 'max' ? s.maxRangeMeters : s.minRangeMeters) / 100;
    if (!Number.isFinite(r) || r <= 0) continue;
    const a = s.azimuthDeg * Math.PI / 180;
    out.push(gameToScreen(ring.centerX + r * Math.sin(a), ring.centerY + r * Math.cos(a)));
  }
  return out.length >= 3 ? out : null;
}

function ringInnerIsZero(ring) {
  const pts = (ring.samples || []).filter((s) => s.reachable);
  if (pts.length === 0) return true;
  return pts.every((s) => !(s.minRangeMeters > 1));
}

function tracePolygon(pts) {
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
  ctx.closePath();
}

function drawRing(ring, color, fill) {
  if (!ring) return;
  const outer = ringPolygon(ring, 'max');
  const inner = ringInnerIsZero(ring) ? null : ringPolygon(ring, 'min');
  ctx.save();

  if (outer) {

    if (inner && fill) {
      ctx.beginPath();
      tracePolygon(outer);
      tracePolygon(inner);
      ctx.fillStyle = fill;
      ctx.fill('evenodd');
    } else if (fill) {

      ctx.beginPath();
      tracePolygon(outer);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();
    tracePolygon(outer);
    ctx.stroke();
    if (inner) {
      ctx.beginPath();
      tracePolygon(inner);
      ctx.stroke();
    }
  } else {

    const center = gameToScreen(ring.centerX, ring.centerY);
    for (const [m, dashed] of [[ring.minRangeMeters, true], [ring.maxRangeMeters, true]]) {
      const rp = (m / 100) * state.view.scale;
      if (!Number.isFinite(rp) || rp <= 0) continue;
      ctx.beginPath();
      ctx.setLineDash(dashed ? [6, 6] : []);
      ctx.lineWidth = 1;
      ctx.strokeStyle = color;
      ctx.arc(center.sx, center.sy, rp, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

const MARKER_STYLE = {
  tower:            { color: '#4ea3ff', r: 5, label: true,  always: true },
  valkyra:          { color: '#d86666', r: 9, label: true,  always: true, ring: true },
  manticore:        { color: '#82c596', r: 9, label: true,  always: true, ring: true },
  lonestar:         { color: '#5fa8d3', r: 9, label: true,  always: true, ring: true },
  wardogs:          { color: '#c9a227', r: 8, label: true,  always: true, ring: true },
  bulkhead:         { color: '#b8b8b8', r: 6, label: true,  always: false },
  weapons_vendor:   { color: 'rgba(220,220,220,.75)', r: 3, label: false, always: false },
  garage_vendor:    { color: 'rgba(220,220,220,.75)', r: 3, label: false, always: false },
  spawn_board:      { color: 'rgba(220,220,220,.75)', r: 3, label: false, always: false },
};
const DEFAULT_MARKER_STYLE = { color: 'rgba(200,200,200,.7)', r: 4, label: true, always: false };

function drawMarkers() {
  if (!state.map) return;
  const z = state.view.scale;
  for (const m of (state.map.markers || [])) {
    const style = MARKER_STYLE[m.icon] || DEFAULT_MARKER_STYLE;
    const visible = style.always || (m.minZoom ? z >= m.minZoom / 2 : true);
    if (!visible) continue;

    const p = gameToScreen(m.x / 100, m.y / 100);
    ctx.save();
    if (style.ring) {
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, style.r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, style.r, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (style.label && m.label && (style.always || z >= 12)) {
      ctx.font = style.ring ? 'bold 12px "Microsoft YaHei UI", sans-serif' : '11px Consolas, monospace';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(m.label, p.sx + style.r + 5, p.sy + 4);
      ctx.fillStyle = style.color;
      ctx.fillText(m.label, p.sx + style.r + 5, p.sy + 4);
    }
    ctx.restore();
  }
}

function drawPolygons() {
  if (!state.map || !state.map.polygons) return;
  for (const poly of state.map.polygons) {
    const pts = (poly.points || []).map((pt) => gameToScreen(pt.x / 100, pt.y / 100));
    if (pts.length < 3) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();

    const color = poly.color || '#888888';
    ctx.globalAlpha = clamp(poly.fillOpacity ?? 0.12, 0.02, 0.5);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash(poly.dashed ? [8, 6] : []);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    if (poly.label) {
      const c = pts.reduce((a, p) => ({ sx: a.sx + p.sx / pts.length, sy: a.sy + p.sy / pts.length }),
                           { sx: 0, sy: 0 });
      ctx.setLineDash([]);
      ctx.font = 'bold 12px "Microsoft YaHei UI", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(poly.label, c.sx + 8, c.sy);
      ctx.fillStyle = color;
      ctx.fillText(poly.label, c.sx + 8, c.sy);
    }
    ctx.restore();
  }
}

function drawZones() {
  const list = [];
  for (const z of (state.map?.zones || [])) list.push(z);
  for (const z of (state.snap?.zones || [])) list.push(z);

  for (const z of list) {
    const c = gameToScreen(z.x, z.y);
    const rp = ((z.radiusMeters || 150) / 100) * state.view.scale;
    if (!Number.isFinite(rp) || rp <= 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, rp, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,210,77,.10)';
    ctx.fill();
    ctx.setLineDash([10, 7]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = z.color || '#ffd24d';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 12px "Microsoft YaHei UI", sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.strokeText(z.label || t('zone.label'), c.sx + 8, c.sy - rp - 6);
    ctx.fillStyle = z.color || '#ffd24d';
    ctx.fillText(z.label || t('zone.label'), c.sx + 8, c.sy - rp - 6);
    ctx.restore();
  }

  if (state.zoneMode && state.cursor) {
    const c = gameToScreen(state.cursor.x, state.cursor.y);
    const rp = (state.zoneRadius / 100) * state.view.scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, rp, 0, Math.PI * 2);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,210,77,.9)';
    ctx.stroke();
    ctx.restore();
  }
}

function drawImpact(pt) {
  const p = gameToScreen(pt.x, pt.y);
  ctx.save();
  ctx.strokeStyle = '#ff5a5a';
  ctx.fillStyle = 'rgba(255,90,90,.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const r = i % 2 === 0 ? 10 : 4;
    const x = p.sx + Math.cos(a) * r, y = p.sy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.8)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const s = state.snap;
  if (s && s.target) {
    const t = gameToScreen(s.target.x, s.target.y);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,90,90,.7)';
    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy);
    ctx.lineTo(t.sx, t.sy);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawPoint(pt, color, label, size, alpha = 1) {  const p = gameToScreen(pt.x, pt.y);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  if (label === 'gun') {

    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy - size * 1.5);
    ctx.lineTo(p.sx - size * 1.35, p.sy + size * 1.15);
    ctx.lineTo(p.sx + size * 1.35, p.sy + size * 1.15);
    ctx.closePath();
    ctx.fillStyle = 'rgba(4,10,16,.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy - size);
    ctx.lineTo(p.sx - size * 0.92, p.sy + size * 0.78);
    ctx.lineTo(p.sx + size * 0.92, p.sy + size * 0.78);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, size * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.sx - size, p.sy); ctx.lineTo(p.sx + size, p.sy);
    ctx.moveTo(p.sx, p.sy - size); ctx.lineTo(p.sx, p.sy + size);
    ctx.stroke();
  }
  ctx.restore();
}

let rafPending = false;
function draw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

function render() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  drawMapImage();
  drawTerrainHeatmap();
  drawTowerReach();
  drawPolygons();
  drawZones();
  drawMarkers();

  const s = state.snap;

  if (state.activeRing === 'target' && state.ringTarget)
    drawRing(state.ringTarget, 'rgba(51,209,122,.9)', 'rgba(51,209,122,.10)');
  else if (state.ringGun)
    drawRing(state.ringGun, 'rgba(78,163,255,.85)', 'rgba(78,163,255,.10)');

  if (s) {
    const gun = state.dragMarker === 'gun' && state.dragPos ? state.dragPos : s.gun;
    const target = state.dragMarker === 'target' && state.dragPos ? state.dragPos : s.target;
    if (gun && gun.known) drawPoint(gun, '#4ea3ff', 'gun', 9);
    const impact = state.dragMarker === 'impact' && state.dragPos ? state.dragPos : s.impact;
    if (impact) drawImpact(impact);

    for (const t of (s.targets || [])) {
      const isActive = target && Math.abs(t.x - target.x) < 1e-6 && Math.abs(t.y - target.y) < 1e-6;
      if (!isActive) drawPoint(t, 'rgba(255,176,32,.62)', 'target', 8, 0.72);
    }
    for (const t of (s.waypoints || [])) drawPoint(t, 'rgba(180,120,255,.85)', 'wp', 5);
    if (target) drawPoint(target, '#33d17a', 'target', 9);

    if (gun && gun.known && target) {
      const a = gameToScreen(gun.x, gun.y), b = gameToScreen(target.x, target.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(51,209,122,.5)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      const dx = (target.x - gun.x) * 100, dy = (target.y - gun.y) * 100;
      const dist = Math.hypot(dx, dy);
      const az = (Math.atan2(dx, dy) * 180 / Math.PI % 360 + 360) % 360;
      if (dist > 0) {
        const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
        const text = `${dist.toFixed(0)} m · ${az.toFixed(1)}°`;
        ctx.setLineDash([]);
        ctx.font = '11px Consolas, monospace';
        const w = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(6,10,14,.78)';
        ctx.fillRect(mx - w / 2 - 4, my - 8, w + 8, 15);
        ctx.fillStyle = '#9fe8bd';
        ctx.fillText(text, mx - w / 2, my + 3);
      }
      ctx.restore();
    }
  }

  if (state.ruler.length) {
    const pts = state.ruler.map((p) => gameToScreen(p.x, p.y));
    ctx.save();
    ctx.strokeStyle = 'rgba(255,210,80,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.stroke();
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,210,80,.9)';
      ctx.fill();
    }
    ctx.restore();
  }
  $('map-zoom').textContent = t('view.zoom', fmt(state.view.scale, 0));
}

const MARKER_HIT_PX = 14;

function hitMarker(sx, sy) {
  const s = state.snap;
  if (!s) return null;
  const near = (pt) => {
    if (!pt) return false;
    const p = gameToScreen(pt.x, pt.y);
    return Math.hypot(p.sx - sx, p.sy - sy) <= MARKER_HIT_PX;
  };
  if (s.impact && near(s.impact)) return 'impact';
  if (near(s.target)) return 'target';
  if (s.gun && s.gun.known && near(s.gun)) return 'gun';
  return null;
}

function hitSavedTarget(sx, sy) {
  const s = state.snap;
  if (!s || !s.targets) return null;
  for (const t of s.targets) {
    if (s.target && Math.abs(t.x - s.target.x) < 1e-6 && Math.abs(t.y - s.target.y) < 1e-6) continue;
    const p = gameToScreen(t.x, t.y);
    if (Math.hypot(p.sx - sx, p.sy - sy) <= MARKER_HIT_PX) return t;
  }
  return null;
}

let liveSolveAt = 0, liveRingAt = 0;
function livePreview() {
  const now = performance.now();
  const s = state.snap;
  if (!s) return;
  if (state.dragMarker === 'impact') return;
  const gun = state.dragMarker === 'gun' ? state.dragPos : (s.gun && s.gun.known ? s.gun : null);
  const target = state.dragMarker === 'target' ? state.dragPos : s.target;
  if (!gun || !target) return;

  if (now - liveSolveAt > 120) {
    liveSolveAt = now;
    refreshSolution({ gun, target }, true);
  }
  if (now - liveRingAt > 350) {
    liveRingAt = now;
    refreshRings(t('why.dragPreview'), { gun, target, light: true });
  }
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = screenToGame(e.offsetX, e.offsetY);
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  state.view.scale = clamp(state.view.scale * factor, 2, 400);
  const after = screenToGame(e.offsetX, e.offsetY);
  state.view.cx += before.x - after.x;
  state.view.cy += before.y - after.y;
  draw();
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {

  if (e.button === 2) {
    state.dragging = true;
    state.dragStart = { x: e.offsetX, y: e.offsetY, cx: state.view.cx, cy: state.view.cy };
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;

  let hit = (state.rulerMode || state.zoneMode) ? null : hitMarker(e.offsetX, e.offsetY);
  if (state.impactMode && hit !== 'impact') hit = null;
  if (hit) {
    state.dragMarker = hit;
    state.dragPos = screenToGame(e.offsetX, e.offsetY);
    canvas.style.cursor = 'grabbing';
    draw();
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousemove', (e) => {
  const g = screenToGame(e.offsetX, e.offsetY);
  state.cursor = g;
  $('cursor-pos').textContent = `x ${fmt(g.x)}  y ${fmt(g.y)}`;

  if (state.dragMarker) {
    state.dragPos = g;
    livePreview();
    draw();
    return;
  }
  if (state.dragging) {
    const dx = (e.offsetX - state.dragStart.x) / state.view.scale;
    const dy = (e.offsetY - state.dragStart.y) / state.view.scale;
    state.view.cx = state.dragStart.cx - dx;
    state.view.cy = state.dragStart.cy + dy;
    draw();
    return;
  }

  canvas.style.cursor = hitMarker(e.offsetX, e.offsetY) ? 'grab' : 'crosshair';});

canvas.addEventListener('mouseup', async (e) => {
  const moved = state.dragStart
    ? Math.abs(e.offsetX - state.dragStart.x) + Math.abs(e.offsetY - state.dragStart.y)
    : 0;

  if (state.dragMarker) {
    const marker = state.dragMarker;
    const pos = state.dragPos || screenToGame(e.offsetX, e.offsetY);
    state.dragMarker = null;
    state.dragPos = null;
    canvas.style.cursor = 'crosshair';
    if (marker === 'gun') {
      if (state.lockGun) { flash(t('point.lockFirst', t('point.lockGun'))); draw(); return; }
      await post('/api/gun', { x: pos.x, y: pos.y });
      pushLog(t('log.gunDrag', fmt(pos.x), fmt(pos.y)), 'ok');
      if (!ringLocked()) setActiveRing('gun');
    } else if (marker === 'impact') {

      await recordImpact(pos);
      draw();
      return;
    } else {
      if (state.lockTarget) { flash(t('point.lockFirst', t('point.lockTarget'))); draw(); return; }

      await post('/api/target', { x: pos.x, y: pos.y, keepImpact: true });
      pushLog(t('log.targetDrag', fmt(pos.x), fmt(pos.y)), 'ok');
      if (!ringLocked()) setActiveRing('target');
    }

    await refreshState();
    await refreshSolution();
    await refreshImpact();
    await refreshRings(t('why.drag'));
    draw();
    return;
  }

  state.dragging = false;
  canvas.style.cursor = 'crosshair';
  if (e.button !== 0) return;
  if (moved > 4) return;

  const g = screenToGame(e.offsetX, e.offsetY);

  if (state.impactMode) {
    await recordImpact(g);
    return;
  }

  if (state.zoneMode) {
    await post('/api/zones', { x: g.x, y: g.y, radiusMeters: state.zoneRadius });
    await refreshState();
    pushLog(t('log.zoneAdd', fmt(g.x), fmt(g.y), state.zoneRadius), 'ok');
    draw();
    return;
  }

  if (state.rulerMode) {
    state.ruler.push(g);
    if (state.ruler.length > 2) state.ruler = [g];
    updateRulerText();
    draw();
    return;
  }

  const s = state.snap;
  const gunKnown = !!(s && s.gun && s.gun.known);
  const targetKnown = !!(s && s.target);
  let mode = state.placeMode;
  if (!mode) {
    if (!gunKnown) mode = 'gun';
    else if (!targetKnown) mode = 'target';
  }

  if (mode === 'gun') {
    if (state.lockGun) { flash(t('point.lockFirst', t('point.lockGun'))); return; }
    await post('/api/gun', { x: g.x, y: g.y });
    pushLog(t('log.gunPlace', fmt(g.x), fmt(g.y)), 'ok');
    if (!ringLocked()) setActiveRing('gun');
    await refreshState();
    await refreshSolution();
    await refreshImpact();
    await refreshRings(t('why.placeGun'));
    updateClickHint();
    draw();
    return;
  }

  if (mode === 'target') {
    if (state.lockTarget) { flash(t('point.lockFirst', t('point.lockTarget'))); return; }
    await post('/api/target', { x: g.x, y: g.y, add: true });
    pushLog(t('log.targetPlace', fmt(g.x), fmt(g.y)), 'ok');
    if (!ringLocked()) setActiveRing('target');
    await refreshState();
    await refreshSolution();
    await refreshRings(t('why.placeTarget'));
    updateClickHint();
    draw();
    return;
  }

  const picked = hitSavedTarget(e.offsetX, e.offsetY);
  if (picked) {
    await post('/api/target', { x: picked.x, y: picked.y });
    pushLog(t('log.targetSwitch', fmt(picked.x), fmt(picked.y)), 'ok');
    if (!ringLocked()) setActiveRing('target');
    await refreshState();
    await refreshSolution();
    await refreshRings(t('why.switchTarget'));
    draw();
    return;
  }
  flash(t('hint.changePoint'));
});

canvas.addEventListener('mouseleave', () => {
  state.dragging = false;
  if (state.dragMarker) { state.dragMarker = null; state.dragPos = null; draw(); }
  canvas.style.cursor = 'crosshair';
});

$('btn-ruler').addEventListener('click', () => {
  state.rulerMode = !state.rulerMode;
  if (state.rulerMode) { state.zoneMode = false; state.placeMode = null; }
  $('btn-ruler').classList.toggle('active', state.rulerMode);
  $('btn-zone').classList.toggle('active', state.zoneMode);
  $('place-gun').classList.remove('on');
  $('place-target').classList.remove('on');
  if (!state.rulerMode) state.ruler = [];
  updateRulerText();
  updateClickHint();
  pushLog(state.rulerMode ? t('hint.ruler') : t('ruler.two'), 'info');
  draw();
});
$('btn-zone').addEventListener('click', () => {
  state.zoneMode = !state.zoneMode;
  if (state.zoneMode) { state.rulerMode = false; state.placeMode = null; }
  $('btn-zone').classList.toggle('active', state.zoneMode);
  $('btn-ruler').classList.toggle('active', state.rulerMode);
  $('place-gun').classList.remove('on');
  $('place-target').classList.remove('on');
  state.ruler = [];
  updateRulerText();
  updateClickHint();
  pushLog(state.zoneMode ? t('hint.zone') : t('zone.clear'), 'info');
  draw();
});
$('zone-radius').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  if (Number.isFinite(v)) state.zoneRadius = clamp(v, 10, 5000);
  draw();
});
$('btn-clear-zones').addEventListener('click', async () => {
  await post('/api/zones', { clear: true });
  await refreshState();
  pushLog(t('log.zoneClear'), 'warn');
  draw();
});
$('btn-impact').addEventListener('click', () => {
  state.impactMode = !state.impactMode;
  if (state.impactMode) { state.rulerMode = false; state.zoneMode = false; state.placeMode = null; }
  $('btn-impact').classList.toggle('active', state.impactMode);
  $('btn-ruler').classList.remove('active');
  $('btn-zone').classList.remove('active');
  $('place-gun').classList.remove('on');
  $('place-target').classList.remove('on');
  updateClickHint();
  pushLog(state.impactMode ? t('imp.modeOn') : t('imp.modeOff'), 'info');
  draw();
});
$('btn-impact-clear').addEventListener('click', async () => {
  state.impact = null;
  renderImpact(null);
  await post('/api/impact', { clear: true });
  await refreshState();
  pushLog(t('imp.cleared'), 'warn');
  draw();
});

$('impact-set').addEventListener('click', () => {
  applyImpactFromInputs().catch((err) => flash(err.message));
});
['impact-x', 'impact-y'].forEach((id) => $(id).addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); applyImpactFromInputs().catch((err) => flash(err.message)); }
}));
$('btn-clear-points').addEventListener('click', async () => {
  await post('/api/target', { clear: true });
  state.ringTarget = null;
  await refreshSolution();
  await refreshRings();
  updateClickHint();
  draw();
});

function setPlaceMode(mode) {
  state.placeMode = state.placeMode === mode ? null : mode;
  if (state.placeMode) { state.rulerMode = false; state.zoneMode = false; state.ruler = []; }
  $('place-gun').classList.toggle('on', state.placeMode === 'gun');
  $('place-target').classList.toggle('on', state.placeMode === 'target');
  $('btn-ruler').classList.remove('active');
  $('btn-zone').classList.remove('active');
  updateRulerText();
  updateClickHint();
  pushLog(state.placeMode === 'gun' ? t('hint.placeGun')
        : state.placeMode === 'target' ? t('hint.placeTarget', (state.snap?.targets || []).length)
        : t('hint.idle'), 'info');
}
$('place-gun').addEventListener('click', () => setPlaceMode('gun'));
$('place-target').addEventListener('click', () => setPlaceMode('target'));

function updateClickHint() {
  const s = state.snap;
  const gunKnown = !!(s && s.gun && s.gun.known);
  const targetKnown = !!(s && s.target);
  const el = $('click-hint');
  if (state.placeMode === 'gun') el.textContent = t('hint.placeGun');
  else if (state.placeMode === 'target') el.textContent = t('hint.placeTarget', (s?.targets || []).length);
  else if (state.rulerMode) el.textContent = t('hint.ruler');
  else if (state.zoneMode) el.textContent = t('hint.zone');
  else if (state.impactMode) el.textContent = t('hint.impact');
  else if (!gunKnown) el.textContent = t('hint.firstGun');
  else if (!targetKnown) el.textContent = t('hint.secondTarget');
  else el.textContent = t('hint.idle');
}

async function refreshState() {
  try {
    state.snap = await api('/api/state');
    renderStatus(state.snap);
    draw();
  } catch (err) { setConn(false, err.message); }
}

const inflight = { solution: false, ring: false };

async function refreshSolution(override = null, quiet = false) {
  if (inflight.solution && quiet) return;
  inflight.solution = true;
  const q = [];
  if (override?.gun) q.push(`gx=${override.gun.x}&gy=${override.gun.y}`);
  if (override?.target) q.push(`tx=${override.target.x}&ty=${override.target.y}`);
  try {
    state.solution = await api('/api/solution' + (q.length ? '?' + q.join('&') : ''));
    renderSolution(state.solution, quiet);
  } catch (err) {
    state.solution = null;
    renderSolution(null, quiet);
    $('sol-hint').textContent = err.message;
  } finally {
    inflight.solution = false;
  }
}

async function refreshRings(why = '', override = null) {
  const light = !!override?.light;
  if (inflight.ring && light) return;
  inflight.ring = true;
  try {

    const samples = light ? 24 : ($('ring-terrain').checked ? 72 : 0);
    const masking = $('ring-masking').checked ? '&masking=true' : '';
    const gun = override?.gun || (state.snap && state.snap.gun && state.snap.gun.known ? state.snap.gun : null);
    const target = override?.target || (state.snap ? state.snap.target : null);
    const which = state.activeRing;
    const gunQ = gun ? `&gx=${gun.x}&gy=${gun.y}` : '';

    if (which === 'target') {
      if (!target) { state.ringTarget = null; renderRings(); draw(); return; }
      const tQ = override?.target ? `&cx=${target.x}&cy=${target.y}` : '';
      state.ringTarget = await api(`/api/range-ring?kind=target&samples=${samples}${gunQ}${tQ}${masking}`);
      state.ringGun = null;
      const r = state.ringTarget;
      pushLog(t('log.ringTarget', fmt(r.minEffectiveMeters, 0), fmt(r.maxEffectiveMeters, 0),
                r.terrainUsed ? t('ring.hintTerrain', (r.samples || []).length) : t('ring.flatTag'), why),
              r.terrainUsed ? 'ok' : 'warn');
    } else {
      const cQ = override?.gun ? `&cx=${gun.x}&cy=${gun.y}` : '';
      state.ringGun = await api(`/api/range-ring?kind=gun&samples=${samples}${gunQ}${cQ}${masking}`);
      state.ringTarget = null;
      const r = state.ringGun;
      pushLog(t('log.ringGun', fmt(r.minEffectiveMeters, 0), fmt(r.maxEffectiveMeters, 0),
                r.terrainUsed ? t('ring.hintTerrain', (r.samples || []).length) : t('ring.flatTag'), why),
              r.terrainUsed ? 'ok' : 'warn');
    }
    renderRings();
    draw();
  } catch (err) {
    pushLog(t('log.ringFail', err.message), 'bad');
    console.warn('距离环失败', err);
  } finally {
    inflight.ring = false;
  }
}

function setActiveRing(which, announce = false) {
  state.activeRing = which === 'target' ? 'target' : 'gun';
  const gunBtn = $('ring-show-gun'), tgtBtn = $('ring-show-target');
  if (gunBtn) gunBtn.classList.toggle('on', state.activeRing === 'gun');
  if (tgtBtn) tgtBtn.classList.toggle('on', state.activeRing === 'target');
  if (announce) pushLog(t('log.ringSwitch', state.activeRing === 'target' ? t('ring.targetRing') : t('ring.gunRing')), 'info');
}

function ringLocked() {
  return !!($('ring-lock') && $('ring-lock').checked);
}

function renderStatus(s) {
  $('st-gun').textContent = s.gun.known ? `${fmt(s.gun.x)} , ${fmt(s.gun.y)}` : t('point.unknown');
  $('st-target').textContent = s.target ? `${fmt(s.target.x)} , ${fmt(s.target.y)}` : t('point.unset');

  if (s.mapId && state.map && state.map.id !== s.mapId) {
    const m = state.maps.find((x) => x.id === s.mapId);
    if (m) selectMap(m, false);
  }
  $('weapon-select').value = s.weapon;

  if (!s.impact && state.impact) { state.impact = null; renderImpact(null); }

  syncCoordInputs(s);
  renderTargetList(s);
  updateClickHint();
}

function syncCoordInputs(s) {
  setInput('gun-x', s.gun.known ? s.gun.x : null);
  setInput('gun-y', s.gun.known ? s.gun.y : null);
  setInput('target-x', s.target ? s.target.x : null);
  setInput('target-y', s.target ? s.target.y : null);
  setInput('impact-x', s.impact ? s.impact.x : null);
  setInput('impact-y', s.impact ? s.impact.y : null);
}

function setInput(id, value) {
  const el = $(id);
  if (document.activeElement === el) return;
  el.value = value === null || value === undefined ? '' : fmt(value);
}

function readCoord(id) {
  const raw = $(id).value.trim();
  if (raw === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

async function applyGunFromInputs() {
  const x = readCoord('gun-x'), y = readCoord('gun-y');
  if (x === null || y === null) { flash(t('point.needGunXY')); return; }
  await post('/api/gun', { x, y });
  pushLog(t('log.gunInput', fmt(x), fmt(y)), 'ok');
  if (!ringLocked()) setActiveRing('gun');
  await refreshSolution();
  await refreshImpact();
  await refreshRings(t('why.typedGun'));
  centerOn(x, y);
  draw();
}

async function applyTargetFromInputs() {
  const x = readCoord('target-x'), y = readCoord('target-y');
  if (x === null || y === null) { flash(t('point.needTargetXY')); return; }

  await post('/api/target', { x, y, keepImpact: true });
  pushLog(t('log.targetInput', fmt(x), fmt(y)), 'ok');
  if (!ringLocked()) setActiveRing('target');
  await refreshSolution();
  await refreshImpact();
  await refreshRings(t('why.typedTarget'));
  centerOn(x, y);
  draw();
}

async function applyImpactFromInputs() {
  const x = readCoord('impact-x'), y = readCoord('impact-y');
  if (x === null || y === null) { flash(t('imp.needCoords')); return; }
  await recordImpact({ x, y });
}

function centerOn(x, y) {
  state.view.cx = x;
  state.view.cy = y;
}

async function copyCoord(which) {
  const x = readCoord(`${which}-x`), y = readCoord(`${which}-y`);
  if (x === null || y === null) { flash(t('point.noCoord')); return; }
  const text = `x${x.toFixed(2)} y${y.toFixed(2)}`;
  try {
    await navigator.clipboard.writeText(text);
    flash(t('point.copied', text));
  } catch (_) {
    flash(t('point.copyFail', text));
  }
}

let flashTimer = null;
function flash(msg) {
  let el = $('flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash';
    el.className = 'chip flash';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function updateRulerText() {
  const el = $('ruler-txt');
  el.hidden = !state.rulerMode && state.ruler.length === 0;
  if (state.ruler.length === 0) { el.textContent = t('ruler.two'); return; }
  if (state.ruler.length === 1) { el.textContent = t('ruler.oneMore'); return; }
  const [a, b] = state.ruler;
  const dx = (b.x - a.x) * 100, dy = (b.y - a.y) * 100;
  const dist = Math.hypot(dx, dy);
  const az = (Math.atan2(dx, dy) * 180 / Math.PI % 360 + 360) % 360;
  el.textContent = t('ruler.result', dist.toFixed(0), az.toFixed(1));
}

function exportTargets() {
  const s = state.snap;
  if (!s || !s.targets || s.targets.length === 0) { flash(t('targets.isEmpty')); return; }
  const payload = {
    type: 'wardogs-compass-targets',
    version: 1,
    mapId: s.mapId,
    exportedAt: new Date().toISOString(),
    targets: s.targets.map((t) => ({ x: t.x, y: t.y })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wardogs-targets-${s.mapId}-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  flash(t('targets.exported', payload.targets.length));
}

async function importTargets(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (err) { flash(t('targets.badJson')); return; }
  const list = Array.isArray(data) ? data : (data.targets || []);
  if (!Array.isArray(list) || list.length === 0) { flash(t('targets.badList')); return; }
  let ok = 0;
  for (const t of list) {
    const x = Number(t.x), y = Number(t.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    await post('/api/target', { x, y, add: true });
    ok++;
  }
  await refreshState();
  flash(t('targets.imported', ok));
}

function renderSolution(sol, quiet = false) {
  if (!sol) {
    ['sol-range', 'sol-bearing', 'sol-elev', 'sol-dxdy', 'sol-dz', 'sol-flat', 'sol-corr',
     'sol-pitch', 'sol-roll', 'sol-flight']
      .forEach((id) => { $(id).textContent = '—'; });
    $('sol-inrange').textContent = '—';
    state.displayMil = null;
    state.displayBearing = null;
    return;
  }
  const tiltOn = $('sol-tilt') && $('sol-tilt').checked;
  const withBase = (main, base, unit, digits = 1) =>
    (base === null || base === undefined || !tiltOn || Math.abs(main - base) < 0.05)
      ? `${fmt(main, digits)}${unit}`
      : `${fmt(main, digits)}${unit}${t('sol.wasBase', fmt(base, digits))}`;

  $('sol-range').textContent = `${fmt(sol.rangeMeters, 0)} m`;

  const bearingMain = (tiltOn && sol.correctedBearingDegrees !== null && sol.correctedBearingDegrees !== undefined)
    ? sol.correctedBearingDegrees : sol.bearingDegrees;
  $('sol-bearing').textContent = withBase(bearingMain, sol.bearingDegrees, '°', 1);

  const milMain = (tiltOn && sol.correctedElevationMil !== null && sol.correctedElevationMil !== undefined)
    ? sol.correctedElevationMil : sol.elevationMil;
  $('sol-elev').textContent = milMain === null || milMain === undefined
    ? '—' : withBase(milMain, sol.elevationMil, ' mil', 1);
  $('sol-elev').className = 'mono' + (tiltOn ? ' ok' : '');
  $('sol-bearing').className = 'mono' + (tiltOn ? ' ok' : '');

  state.displayMil = (typeof milMain === 'number' && Number.isFinite(milMain)) ? milMain : null;
  state.displayBearing = (typeof bearingMain === 'number' && Number.isFinite(bearingMain)) ? bearingMain : null;

  $('sol-dxdy').textContent = `${fmt(sol.deltaX)} , ${fmt(sol.deltaY)}`;
  $('sol-dz').textContent = `${sol.heightDeltaMeters >= 0 ? '+' : ''}${fmt(sol.heightDeltaMeters, 1)} m`;

  $('sol-flat').textContent = sol.flatElevationMil === null
    ? '—' : `${fmt(sol.flatElevationMil, 1)} mil`;
  $('sol-corr').textContent = sol.sightCorrectionMil === null ? '—'
    : `${sol.sightCorrectionMil >= 0 ? '+' : ''}${fmt(sol.sightCorrectionMil, 1)} mil`;

  const tiltCorr = sol.tiltCorrectionMil;
  $('sol-tilt-corr').textContent = (tiltCorr === null || tiltCorr === undefined) ? '—'
    : `${tiltCorr >= 0 ? '+' : ''}${fmt(tiltCorr, 1)} mil`;
  $('sol-pitch').textContent = sol.pitchDegrees === null || sol.pitchDegrees === undefined ? '—'
    : `${sol.pitchDegrees >= 0 ? '+' : ''}${fmt(sol.pitchDegrees, 2)}°（${sol.pitchDegrees >= 0 ? t('sol.pitchUp') : t('sol.pitchDown')}）`;
  $('sol-roll').textContent = sol.rollDegrees === null || sol.rollDegrees === undefined ? '—'
    : `${sol.rollDegrees >= 0 ? '+' : ''}${fmt(sol.rollDegrees, 2)}°`;
  $('sol-flight').textContent = sol.flightTimeSeconds === null ? '—' : `${fmt(sol.flightTimeSeconds)} s`;
  const el = $('sol-inrange');
  el.textContent = sol.inRange ? t('sol.fire') : t('sol.nofire');
  el.className = sol.inRange ? 'ok' : 'bad';
  const arcName = sol.arc === 'high' ? t('sol.arcHigh') : sol.arc === 'low' ? t('sol.arcLow') : t('sol.arcSingle');
  $('sol-hint').textContent = sol.inRange
    ? t('sol.hintOk', sol.weapon, arcName, fmt(sol.tableMinRangeMeters, 0), fmt(sol.tableMaxRangeMeters, 0),
        sol.converged ? t('sol.converged') : t('sol.notConverged'))
    : t('sol.hintOut', fmt(sol.tableMinRangeMeters, 0), fmt(sol.tableMaxRangeMeters, 0));

  const steep = (sol.pitchDegrees !== null && sol.pitchDegrees !== undefined && Math.abs(sol.pitchDegrees) > 5)
    || (tiltOn && tiltCorr !== null && tiltCorr !== undefined && Math.abs(tiltCorr) >= 30);
  $('tilt-warn').hidden = !steep;
  if (steep) {
    $('tilt-warn').textContent = t('sol.tiltWarn', fmt(sol.pitchDegrees ?? 0, 1), fmt(tiltCorr ?? 0, 0));
  }

  if (quiet) return;
  const tiltTxt = (sol.pitchDegrees !== null && sol.pitchDegrees !== undefined)
    ? ` · ${t('sol.pitch')} ${sol.pitchDegrees >= 0 ? '+' : ''}${fmt(sol.pitchDegrees, 2)}°` +
      (tiltOn && sol.correctedElevationMil ? ` → ${fmt(sol.correctedElevationMil, 1)} mil` : '')
    : '';
  pushLog(t('log.solve', {
    weapon: sol.weapon,
    arc: arcName,
    range: fmt(sol.rangeMeters, 0),
    bearing: fmt(sol.bearingDegrees, 1),
    dz: `${sol.heightDeltaMeters >= 0 ? '+' : ''}${fmt(sol.heightDeltaMeters, 1)} m`,
    flat: sol.flatElevationMil === null ? '—' : fmt(sol.flatElevationMil, 1) + ' mil',
    elev: sol.elevationMil === null ? '—' : fmt(sol.elevationMil, 1) + ' mil',
    tilt: tiltTxt,
    flight: sol.flightTimeSeconds === null ? '—' : fmt(sol.flightTimeSeconds, 2) + ' s',
    verdict: sol.inRange ? t('sol.fire') : t('sol.nofire'),
  }), sol.inRange ? 'ok' : 'bad');
}

function renderImpact(c) {
  if (!c) {
    ['imp-range', 'imp-bearing', 'imp-mil', 'imp-next-mil', 'imp-next-az']
      .forEach((id) => { $(id).textContent = '—'; });
    return;
  }
  $('imp-range').textContent = `${c.rangeErrorMeters >= 0 ? t('imp.far') : t('imp.near')} ${fmt(Math.abs(c.rangeErrorMeters), 0)} m`;
  $('imp-bearing').textContent = `${c.bearingErrorDegrees >= 0 ? t('imp.right') : t('imp.left')} ${fmt(Math.abs(c.bearingErrorDegrees), 2)}°`;
  $('imp-mil').textContent = `${c.milCorrection >= 0 ? '+' : ''}${fmt(c.milCorrection, 1)} mil` +
    t('imp.perMil', fmt(c.rangeMetersPerMil, 2));
  $('imp-next-mil').textContent = `${fmt(c.next.mil, 1)} mil`;
  $('imp-next-az').textContent = `${fmt(c.next.bearingDegrees, 1)}°（${fmt(c.next.bearingMil, 0)} mil）`;
}

async function recordImpact(g) {
  try {
    const body = { x: g.x, y: g.y };
    if (state.displayMil !== null) body.firedMil = state.displayMil;
    if (state.displayBearing !== null) body.firedBearing = state.displayBearing;
    const c = await post('/api/impact', body);
    state.impact = c;
    renderImpact(c);
    pushLog(t('log.impact', fmt(g.x), fmt(g.y),
              c.rangeErrorMeters >= 0 ? t('imp.far') : t('imp.near'), fmt(Math.abs(c.rangeErrorMeters), 0),
              c.bearingErrorDegrees >= 0 ? t('imp.right') : t('imp.left'), fmt(Math.abs(c.bearingErrorDegrees), 2),
              fmt(c.next.mil, 1), fmt(c.next.bearingDegrees, 1)), 'ok');

    if (state.impactMode) {
      state.impactMode = false;
      $('btn-impact').classList.remove('active');
      updateClickHint();
    }
    await refreshState();
    draw();
  } catch (err) {
    pushLog(t('imp.failed', err.message), 'bad');
    flash(err.message);
  }
}

async function refreshImpact() {
  if (!state.snap || !state.snap.impact) {
    if (state.impact) { state.impact = null; renderImpact(null); }
    return;
  }
  try {
    const q = [];
    if (state.displayMil !== null) q.push(`firedMil=${state.displayMil}`);
    if (state.displayBearing !== null) q.push(`firedBearing=${state.displayBearing}`);
    const c = await api('/api/impact' + (q.length ? '?' + q.join('&') : ''));
    if (c && c.impact) { state.impact = c; renderImpact(c); }
    else { state.impact = null; renderImpact(null); }
  } catch (_) {  }
}
function renderRings() {
  const fmtRing = (r) => {
    if (!r) return '—';
    const span = `${fmt(r.minEffectiveMeters, 0)} ~ ${fmt(r.maxEffectiveMeters, 0)} m`;
    return r.terrainUsed ? `${span}（${t('ring.terrainTag')}）` : `${span}（${t('ring.flatTag')}）`;
  };
  const showing = state.activeRing === 'target' ? t('ring.targetRing') : t('ring.gunRing');
  $('ring-now-txt').textContent = showing;
  $('ring-gun-txt').textContent = state.activeRing === 'gun' ? fmtRing(state.ringGun) : t('ring.hidden');
  $('ring-target-txt').textContent = state.activeRing === 'target' ? fmtRing(state.ringTarget) : t('ring.hidden');

  const s = state.snap;
  const ring = state.activeRing === 'target' ? state.ringTarget : state.ringGun;
  if (ring && ring.samples && ring.samples.length && s && s.gun && s.gun.known && s.target) {
    const dx = (s.target.x - s.gun.x) * 100, dy = (s.target.y - s.gun.y) * 100;
    const az = (Math.atan2(dx, dy) * 180 / Math.PI % 360 + 360) % 360;
    let best = null, bestDiff = 1e9;
    for (const sample of ring.samples) {
      const diff = Math.abs(((sample.azimuthDeg - az + 540) % 360) - 180);
      if (diff < bestDiff) { bestDiff = diff; best = sample; }
    }
    $('ring-az-txt').textContent = best && best.reachable
      ? t('ring.azRange', fmt(best.minRangeMeters, 0), fmt(best.maxRangeMeters, 0), fmt(best.azimuthDeg, 0))
      : t('ring.unreachable');
  } else {
    $('ring-az-txt').textContent = '—';
  }

  $('ring-hint').textContent = (state.ringGun && state.ringGun.terrainUsed)
    ? t('ring.hintTerrain', (state.ringGun.samples || []).length)
    : t('ring.hintFlat');
}

function renderTargetList(s) {
  const box = $('target-list');
  $('target-count').textContent = `${(s.targets || []).length}`;
  const items = (s.targets || []).map((p, i) =>
    `<div class="item"><span class="mono">${i + 1}. ${fmt(p.x)} , ${fmt(p.y)}</span>` +
    `<span><button class="tiny ghost" data-set="${i}">${t('targets.set')}</button></span></div>`).join('');
  box.innerHTML = items || `<div class="muted small">${t('targets.empty')}</div>`;
  box.querySelectorAll('button[data-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const p = s.targets[Number(btn.dataset.set)];
      await post('/api/target', { x: p.x, y: p.y });
      await refreshSolution();
      await refreshRings();
    });
  });
}

function setConn(ok, text) {
  $('conn-dot').classList.toggle('on', ok);
  $('conn-text').textContent = text || (ok ? t('conn.on') : t('conn.off'));
}

async function selectMap(mapDef, push) {
  state.map = mapDef;
  state.mapImage = null;
  state.terrainImage = null;
  state.towerReach = null;
  state.legend = null;
  const b = mapDef.bounds;
  state.view.cx = (b.minX + b.maxX) / 2;
  state.view.cy = (b.minY + b.maxY) / 2;
  fitView();
  if (push) await post('/api/map', { mapId: mapDef.id }).catch(() => {});
  pushLog(t('log.mapSwitch', mapDef.name), 'info');

  if (root.WardogsStore.hasTerrain(mapDef.id)) {
    try { await root.WardogsStore.terrain(mapDef.id); }
    catch (err) { pushLog(`高程加载失败：${err.message}`, 'bad'); }
  }
  draw();
}

function fitView() {
  if (!state.map) return;
  const b = state.map.bounds;
  const spanX = b.maxX - b.minX, spanY = b.maxY - b.minY;
  const sx = canvas.clientWidth / spanX, sy = canvas.clientHeight / spanY;
  state.view.scale = clamp(Math.min(sx, sy) * 0.92, 2, 400);
  draw();
}

$('btn-clear-targets').addEventListener('click', () => post('/api/targets/clear').catch(alert));
$('btn-swap').addEventListener('click', async () => {
  try {
    await post('/api/swap');
    await refreshState();
    await refreshSolution();
    await refreshRings();
    draw();
  } catch (err) { alert(err.message); }
});

[['gun-x', applyGunFromInputs], ['gun-y', applyGunFromInputs],
 ['target-x', applyTargetFromInputs], ['target-y', applyTargetFromInputs]]
  .forEach(([id, fn]) => $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fn().catch((err) => flash(err.message)); }
  }));
$('btn-goto').addEventListener('click', () => {
  applyTargetFromInputs().catch((err) => flash(err.message));
});
$('btn-save-gun').addEventListener('click', async () => {
  const s = state.snap;
  if (!s || !s.gun || !s.gun.known) { flash(t('point.noGun')); return; }
  await post('/api/target', { x: s.gun.x, y: s.gun.y, add: true });
  await refreshState();
  flash(t('point.gunSaved'));
});
$('gun-copy').addEventListener('click', () => copyCoord('gun'));
$('target-copy').addEventListener('click', () => copyCoord('target'));

function bindLock(btnId, key, labelKey) {
  $(btnId).addEventListener('click', () => {
    state[key] = !state[key];
    $(btnId).classList.toggle('on', state[key]);
    $(btnId).textContent = state[key] ? t('point.locked') : t('point.lock');
    flash(t(state[key] ? 'point.lockedMsg' : 'point.unlockedMsg', t(labelKey)));
  });
}
bindLock('gun-lock', 'lockGun', 'point.lockGun');
bindLock('target-lock', 'lockTarget', 'point.lockTarget');

function zoomBy(factor) {
  const cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2;
  const before = screenToGame(cx, cy);
  state.view.scale = clamp(state.view.scale * factor, 2, 400);
  const after = screenToGame(cx, cy);
  state.view.cx += before.x - after.x;
  state.view.cy += before.y - after.y;
  draw();
}
$('btn-zoom-in').addEventListener('click', () => zoomBy(1.25));
$('btn-zoom-out').addEventListener('click', () => zoomBy(1 / 1.25));
$('btn-reset').addEventListener('click', () => {
  state.ruler = [];
  updateRulerText();
  fitView();
  draw();
});

$('btn-export').addEventListener('click', exportTargets);
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (file) await importTargets(file);
});
$('btn-fit').addEventListener('click', fitView);
$('feed-clear').addEventListener('click', () => { state.feed = []; renderFeed(); });
$('ring-terrain').addEventListener('change', () => refreshRings(t('why.terrainToggle')));
$('ring-masking').addEventListener('change', () => refreshRings(t('why.maskingToggle')));
$('sol-tilt').addEventListener('change', (e) => {
  pushLog(e.target.checked ? t('log.tiltOn') : t('log.tiltOff'), 'info');
  refreshSolution();
});
$('ring-show-gun').addEventListener('click', () => {
  setActiveRing('gun', true);
  refreshRings(t('why.manual'));
});
$('ring-show-target').addEventListener('click', () => {
  if (!(state.snap && state.snap.target)) { pushLog(t('log.needTarget'), 'warn'); return; }
  setActiveRing('target', true);
  refreshRings(t('why.manual'));
});
$('ring-lock').addEventListener('change', (e) => {
  pushLog(e.target.checked ? t('log.ringLocked') : t('log.ringUnlocked'), 'info');
});
$('layer-terrain').addEventListener('change', (e) => {
  state.showTerrain = e.target.checked;
  if (state.showTerrain) getTerrainImage();
  refreshLegend();
  pushLog(state.showTerrain ? t('log.terrainOn') : t('log.terrainOff'), 'info');
  draw();
});
$('layer-towers').addEventListener('change', async (e) => {
  state.showTowers = e.target.checked;
  if (state.showTowers) await getTowerReach();
  pushLog(state.showTowers ? t('log.towersOn') : t('log.towersOff'), 'info');
  draw();
});

$('map-select').addEventListener('change', async (e) => {
  const m = state.maps.find((x) => x.id === e.target.value);
  if (!m) return;
  await selectMap(m, true);
  await refreshSolution();
  await refreshRings();
});
$('weapon-select').addEventListener('change', async (e) => {
  await post('/api/weapon', { weapon: e.target.value });
  pushLog(t('log.weapon', e.target.value.toUpperCase()), 'info');
  await refreshSolution();
  await refreshImpact();
  await refreshRings(t('why.weapon'));
});

$('btn-lang').addEventListener('click', toggleLang);
$('tutorial-lang').addEventListener('click', toggleLang);

const TUTORIAL = {
  zh: [
    {
      title: '① 放车体 / Place your vehicle',
      html: `
        <p>右上角点 <b>「放车体」</b>，再点地图上你所在的位置。</p>
        <p>也可以直接在侧栏「点位」里手输 X / Y（回车生效），或用 <b>锁</b> 防止误点覆盖。</p>
        <p class="muted">Click <b>Place vehicle</b> (top-right) then click the map. You can also type X / Y
        in the sidebar, or lock a point so a stray click cannot move it.</p>`,
    },
    {
      title: '② 放目标 / Place targets',
      html: `
        <p>点 <b>「放目标」</b> 再点地图，最多同时存 <b>3 个</b>目标。</p>
        <p>点已放置的淡色目标即可切回它；拖动标记可以移动，按住<b>右键</b>拖动地图。</p>
        <p class="muted">Click <b>Place target</b> and click the map — up to 3 targets are kept.
        Click a faded target to switch back to it, drag a marker to move it, drag with the
        <b>right mouse button</b> to pan.</p>`,
    },
    {
      title: '③ 读两个数 / Read two numbers',
      html: `
        <p>侧栏「射击诸元」里放大的两个数就是要在游戏里输入的：</p>
        <ul>
          <li><b>游戏内方位角</b>（度）</li>
          <li><b>游戏内刻度</b>（密位）</li>
        </ul>
        <p>勾上 <b>地形倾斜修正</b> 会显示按 3D 高程推算车体姿态后的修正值，括号里是修正前的原值。</p>
        <p class="muted">The two highlighted numbers are what you dial in-game: <b>azimuth</b> (degrees)
        and <b>elevation</b> (mil). Enable <b>terrain tilt correction</b> to see values adjusted for the
        vehicle pose derived from the 3D heightmap; the original value stays in parentheses.</p>`,
    },
    {
      title: '④ 打一发后修正 / Correct after the first shot',
      html: `
        <p>游戏会把炮弹落点画在地图上。点左下角 <b>「记录落点」</b>，再点地图上的落点；</p>
        <p>也可以直接在「弹着点反推」卡片里<b>填落点坐标</b>，按「记录」。</p>
        <ul>
          <li>面板会显示打远/打近多少米、偏左/偏右多少度</li>
          <li>并直接给出 <b>下一发刻度</b> 与 <b>下一发方位</b></li>
          <li>之后挪车体或目标，落点不会丢，修正量会自动重算</li>
        </ul>
        <p class="muted">The game draws shell impacts on the map. Click <b>Record impact</b>, then click
        the impact — or simply type the impact coordinates in the impact card. You get the range/deflection
        error and the corrected <b>next-shot mil &amp; azimuth</b>; moving the vehicle or target keeps the
        impact and just recomputes the correction.</p>`,
    },
    {
      title: '功能清单 / Features',
      html: `
        <ul class="feature-list">
          <li><b>整张大地图</b> · pre-composed single map image, no tile seams</li>
          <li><b>高度热力图</b> · elevation heatmap, higher = redder</li>
          <li><b>射程圈</b> · terrain-driven reachability ring (gun / target)</li>
          <li><b>1~5 塔被射图</b> · precomputed "where can hit tower N" layer</li>
          <li><b>射击诸元</b> · azimuth / mil / flight time / table vs actual</li>
          <li><b>地形倾斜修正</b> · vehicle pitch &amp; roll from the heightmap (experimental)</li>
          <li><b>弹着点反推</b> · impact-based second-shot correction</li>
          <li><b>占领圈 / 量距 / 目标收藏</b> · zones, ruler, saved targets</li>
          <li><b>界面语言</b> · 中文 / English，随时切换（选择会记住）</li>
        </ul>`,
    },
  ],
  en: [
    {
      title: '① Place your vehicle',
      html: `
        <p>Click <b>Place vehicle</b> (top-right), then click your position on the map.</p>
        <p>You can also type X / Y in the sidebar <b>Points</b> card (Enter to apply), or <b>lock</b>
        a point so a stray map click cannot move it.</p>`,
    },
    {
      title: '② Place targets',
      html: `
        <p>Click <b>Place target</b>, then click the map — up to <b>3</b> targets are kept.</p>
        <p>Click a faded target to switch back to it, drag a marker to move it, and drag with the
        <b>right mouse button</b> to pan the map.</p>`,
    },
    {
      title: '③ Read two numbers',
      html: `
        <p>The two large numbers in <b>Firing solution</b> are what you dial in-game:</p>
        <ul>
          <li><b>In-game azimuth</b> (degrees)</li>
          <li><b>In-game elevation</b> (mil)</li>
        </ul>
        <p>Enable <b>terrain tilt correction</b> to also see the value adjusted for the vehicle pose
        derived from the 3D heightmap; the unadjusted value stays in parentheses.</p>`,
    },
    {
      title: '④ Correct after the first shot',
      html: `
        <p>The game draws shell impacts on the map. Click <b>Record impact</b>, then click the impact —
        or type the impact coordinates directly in the impact card and press <b>Record</b>.</p>
        <ul>
          <li>You get the range / deflection error of the last shot</li>
          <li>And the corrected <b>next-shot elevation &amp; azimuth</b></li>
          <li>Moving the vehicle or target keeps the impact — the correction is recomputed</li>
        </ul>`,
    },
    {
      title: 'Features',
      html: `
        <ul class="feature-list">
          <li><b>Whole map image</b> · pre-composed, no tile seams</li>
          <li><b>Elevation heatmap</b> · higher terrain = redder</li>
          <li><b>Range ring</b> · terrain-driven reachability (vehicle / target)</li>
          <li><b>Tower 1~5 reach</b> · precomputed layer</li>
          <li><b>Firing solution</b> · azimuth / mil / flight time / table vs actual</li>
          <li><b>Terrain tilt</b> · vehicle pitch &amp; roll from the heightmap (experimental)</li>
          <li><b>Impact back-solve</b> · second-shot correction from where the shell landed</li>
          <li><b>Zones / ruler / saved targets</b></li>
          <li><b>UI language</b> · 中文 / English, switchable anytime (remembered)</li>
        </ul>`,
    },
  ],
};

function tutorialSteps() { return TUTORIAL[lang] || TUTORIAL.zh; }

let tutorialIndex = 0;

function renderTutorial() {
  const steps = tutorialSteps();
  tutorialIndex = clamp(tutorialIndex, 0, steps.length - 1);
  const step = steps[tutorialIndex];
  $('tutorial-title').textContent = step.title;
  $('tutorial-step').textContent = `${tutorialIndex + 1} / ${steps.length}`;
  $('tutorial-body').innerHTML = step.html;
  $('tutorial-prev').disabled = tutorialIndex === 0;
  $('tutorial-next').textContent = tutorialIndex === steps.length - 1 ? t('tut.done') : t('tut.next');
}

function showTutorial(index = 0) {
  tutorialIndex = clamp(index, 0, tutorialSteps().length - 1);
  renderTutorial();
  $('tutorial').hidden = false;
}

function hideTutorial() {
  $('tutorial').hidden = true;
  try {
    localStorage.setItem('wardogs-tutorial-skip', $('tutorial-skip').checked ? '1' : '0');
  } catch (_) {}
}

$('btn-help').addEventListener('click', () => showTutorial(0));
$('tutorial-close').addEventListener('click', hideTutorial);
$('tutorial-prev').addEventListener('click', () => { tutorialIndex--; renderTutorial(); });
$('tutorial-next').addEventListener('click', () => {
  if (tutorialIndex >= tutorialSteps().length - 1) { hideTutorial(); return; }
  tutorialIndex++;
  renderTutorial();
});
$('tutorial').addEventListener('click', (e) => { if (e.target.id === 'tutorial') hideTutorial(); });
document.addEventListener('keydown', (e) => {
  if ($('tutorial').hidden) return;
  if (e.key === 'Escape') hideTutorial();
  if (e.key === 'ArrowRight') $('tutorial-next').click();
  if (e.key === 'ArrowLeft' && tutorialIndex > 0) $('tutorial-prev').click();
});

function maybeShowTutorial() {
  let skip = false;
  try { skip = localStorage.getItem('wardogs-tutorial-skip') === '1'; } catch (_) {}
  $('tutorial-skip').checked = skip;
  if (!skip) showTutorial(0);
}

async function boot() {
  loadLang();
  applyLang();
  try {
    const store = root.WardogsStore;
    await store.init();

    setConn(true, t('conn.ok', 'v1.0.0'));
    pushLog(t('log.connected', 'v1.0.0', store.maps.length, Object.keys(store.library.tables).join(' / ')), 'ok');

    state.maps = store.maps;
    const mapSel = $('map-select');
    mapSel.innerHTML = state.maps.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
    const weaponSel = $('weapon-select');
    const weapons = store.weapons();
    weaponSel.innerHTML = weapons.map((w) => `<option value="${w}">${w.toUpperCase()}</option>`).join('');

    const startMap = state.maps.find((m) => m.id === store.mapId) || state.maps[0];
    if (startMap) await selectMap(startMap, false);
    weaponSel.value = store.weapon;
    setActiveRing('gun');

    await refreshState();
    await refreshSolution();
    await refreshImpact();
    await refreshRings(t('why.initial'));
    maybeShowTutorial();
  } catch (err) {
    setConn(false, t('conn.fail', err.message));
    pushLog(t('conn.fail', err.message), 'bad');
  }
}

window.addEventListener('resize', () => { fitView(); });
boot();
