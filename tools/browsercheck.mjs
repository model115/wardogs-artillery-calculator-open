
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const URL_ = argVal('--url', 'http://127.0.0.1:5188/');
const PORT = Number(argVal('--port', '9222'));
const SHOT = argVal('--shot', null);

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) { console.error('找不到 Edge/Chrome'); process.exit(2); }

const profile = mkdtempSync(join(tmpdir(), 'wa-cdp-'));
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--window-size=1920,1080', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, URL_,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page' && t.url.startsWith(URL_.replace(/\/$/, '')));
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (_) {  }
    await sleep(500);
  }
  throw new Error('连不上调试端口');
}

let ws;
let nextId = 1;
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || '页面脚本异常');
  return res.result?.value;
}

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  await send('Runtime.enable');

  let conn = null;
  for (let i = 0; i < 60; i++) {
    conn = await evaluate("(document.getElementById('conn-text') || {}).textContent || null");
    if (conn && conn.includes('已连接')) break;
    await sleep(500);
  }

  check('页面启动 / 数据层初始化', !!conn && conn.includes('已连接'), conn);

  const scripts = await evaluate('[...document.scripts].map((s) => s.src.split(\"/\").pop()).join(\",\")');
  check('脚本按 core→store→app 加载', scripts === 'ballistics.js,terrain.js,reach.js,store.js,app.js', scripts);

  const canvasOk = await evaluate("(() => { const c = document.getElementById('map'); return c.width > 100 && c.height > 100; })()");
  check('Canvas 已按 DPR 初始化', canvasOk, String(canvasOk));

  const solved = await evaluate(`(async () => {
    WardogsStore.setMap('bakurani');
    WardogsStore.setGun(81.6, 81.6);
    WardogsStore.setTarget(94.0, 88.0);
    await WardogsStore.terrain('bakurani');
    await refreshSolution();
    refreshState();
    await refreshRings();
    render();
    return {
      range: document.getElementById('sol-range').textContent,
      bearing: document.getElementById('sol-bearing').textContent,
      elev: document.getElementById('sol-elev').textContent,
      dz: document.getElementById('sol-dz').textContent,
      inrange: document.getElementById('sol-inrange').textContent,
      ring: document.getElementById('ring-gun-txt').textContent,
      gun: document.getElementById('st-gun').textContent,
      target: document.getElementById('st-target').textContent,
    };
  })()`);
  check('解算在浏览器里出结果', /1,?39[45]/.test(solved.range) && solved.elev.includes('mil'), JSON.stringify(solved));
  check('射程圈用上了地形', solved.ring.includes('地形'), solved.ring);

  const impact = await evaluate(`(async () => {
    await recordImpact({ x: 94.9, y: 88.9 });
    return { err: document.getElementById('imp-range').textContent, next: document.getElementById('imp-next-mil').textContent };
  })()`);
  check('落点反推出结果并渲染', impact.next.includes('mil') && impact.err.includes('打远'), JSON.stringify(impact));

  if (SHOT) {

    await evaluate('(() => { hideTutorial(); draw(); return true; })()');
    await sleep(800);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    console.log(`截图已保存：${SHOT}`);
  }
} catch (err) {
  check('浏览器自检执行', false, String(err.message || err));
} finally {
  try { ws && ws.close(); } catch (_) {}
  try { child.kill(); } catch (_) {}
}

console.log(JSON.stringify(checks, null, 2));
const failed = checks.filter((c) => !c.ok);
if (failed.length) { console.error(`browsercheck: 失败 ${failed.length} 项`); process.exit(1); }
console.log('browsercheck: 通过（真实浏览器里跑通完整流程）');
