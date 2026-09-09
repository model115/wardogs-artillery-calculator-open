
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const URL_ = argVal('--url', 'http://127.0.0.1:5188/');
const PORT = Number(argVal('--port', '9226'));
const REPEAT = args.includes('--repeat');

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) { console.error('找不到 Edge/Chrome'); process.exit(2); }

const profile = mkdtempSync(join(tmpdir(), 'wa-net-'));
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--window-size=1920,1080', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, nextId = 1;
const pending = new Map();
const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
};

const reqs = new Map();
let recording = false;

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error('连不上调试端口');
}

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
      return;
    }
    if (!recording) return;
    if (m.method === 'Network.responseReceived') {
      const r = m.params.response;
      reqs.set(m.params.requestId, {
        url: r.url, status: r.status, mime: r.mimeType,
        cacheControl: (r.headers['cache-control'] || r.headers['Cache-Control'] || '') || '(无)',
        contentEncoding: r.headers['content-encoding'] || '-',
        fromCache: !!r.fromDiskCache || !!r.fromPrefetchCache || !!r.fromServiceWorker,
        bytes: 0,
      });
    } else if (m.method === 'Network.loadingFinished') {
      const rec = reqs.get(m.params.requestId);
      if (rec) rec.bytes = m.params.encodedDataLength;
    }
  };
  await send('Network.enable');
  await send('Page.enable');

  recording = true;
  await send('Page.navigate', { url: URL_ });
  await sleep(12000);
  if (REPEAT) { await send('Page.reload', { ignoreCache: false }); await sleep(9000); }
  recording = false;

  const rows = [...reqs.values()].filter((r) => r.url.startsWith(URL_.replace(/\/$/, '')));
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const big = rows.slice().sort((a, b) => b.bytes - a.bytes);

  console.log(`\n页面：${URL_}${REPEAT ? '（含一次刷新）' : ''}\n`);
  console.log('请求明细（按字节降序）：');
  console.log('  字节        状态  缓存头                          编码   资源');
  for (const r of big) {
    const kb = (r.bytes / 1024).toFixed(0).padStart(8);
    console.log(`  ${kb} KB  ${String(r.status).padEnd(5)} ${r.cacheControl.slice(0, 30).padEnd(32)} ${r.contentEncoding.padEnd(6)} ${r.url.replace(URL_.replace(/\/$/, ''), '')}`);
  }
  console.log(`\n合计传输：${(total / 1024 / 1024).toFixed(2)} MB / ${rows.length} 个请求`);
  const uncached = rows.filter((r) => !r.fromCache && r.status === 200);
  console.log(`其中 200（真实下载）：${(uncached.reduce((a, r) => a + r.bytes, 0) / 1024 / 1024).toFixed(2)} MB / ${uncached.length} 个`);
  const noCache = rows.filter((r) => r.cacheControl === '(无)');
  console.log(`没有 Cache-Control 的：${noCache.length} 个${noCache.length ? ' —— ' + noCache.map((r) => r.url.split('/').pop()).slice(0, 6).join(', ') : ''}`);
} catch (err) {
  console.error('netcheck 失败：', err.message || err);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch (_) {}
  try { child.kill(); } catch (_) {}
}
