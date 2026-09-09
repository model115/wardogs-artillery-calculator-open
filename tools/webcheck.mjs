
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const webDir = process.argv[2] ?? join(import.meta.dirname, '..', 'web');
const htmlPath = join(webDir, 'index.html');
const jsPath = join(webDir, 'app.js');
const cssPath = join(webDir, 'app.css');

for (const p of [htmlPath, jsPath, cssPath]) {
  if (!existsSync(p)) {
    console.error(`缺少文件：${p}`);
    process.exit(1);
  }
}

const html = readFileSync(htmlPath, 'utf8');
const js = readFileSync(jsPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const jsIds = [...new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))];
const missingIds = jsIds.filter((id) => !htmlIds.has(id));

const dynamicIds = new Set(['flash']);
const realMissing = missingIds.filter((id) => !dynamicIds.has(id));

const ALLOWED_EXTERNAL = /^https:\/\/github\.com\//;
const external = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/g)]
  .map((m) => m[1])
  .filter((u) => !ALLOWED_EXTERNAL.test(u));
const externalJs = [...js.matchAll(/["'`](https?:\/\/[^"'`]+)["'`]/g)]
  .map((m) => m[1])
  .filter((u) => !u.startsWith('http://127.0.0.1') && !u.startsWith('http://localhost')
                 && !ALLOWED_EXTERNAL.test(u));

const cssClasses = [...new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)\s*[,{:]/g)].map((m) => m[1]))];
const usedClasses = new Set([
  ...[...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
  ...[...js.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
  ...[...js.matchAll(/classList\.(?:add|toggle|remove)\('([^']+)'/g)].map((m) => m[1]),
]);
const unusedClasses = cssClasses.filter((c) => !usedClasses.has(c) && !c.startsWith('webkit'));

const cssRules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim(), body: m[2] }));
const hiddenClasses = new Set(
  [...html.matchAll(/<[^>]*\bhidden\b[^>]*>/g)].flatMap((tag) => {
    const c = tag[0].match(/class="([^"]+)"/);
    return c ? c[1].split(/\s+/) : [];
  }));
const clobbering = cssRules
  .filter((r) => /display\s*:\s*(?!none)/.test(r.body)
    && [...hiddenClasses].some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(r.sel)))
  .map((r) => r.sel);
const hiddenOverride = cssRules.some((r) => /\[hidden\]/.test(r.sel) && /display\s*:\s*none/.test(r.body));
const hiddenOk = hiddenOverride || clobbering.length === 0;

const i18nBlock = js.slice(js.indexOf('const I18N = {'), js.indexOf('const LANG_KEY'));
const zhAt = i18nBlock.indexOf('zh: {');
const enAt = i18nBlock.indexOf('en: {');
const keysOf = (chunk) => new Set([...chunk.matchAll(/^\s*'([\w.]+)':/gm)].map((m) => m[1]));
const zhKeys = keysOf(i18nBlock.slice(zhAt, enAt));
const enKeys = keysOf(i18nBlock.slice(enAt));
const usedKeys = new Set([
  ...[...js.matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1]),
  ...[...html.matchAll(/data-i18n="([\w.]+)"/g)].map((m) => m[1]),
]);
const missingZh = [...usedKeys].filter((k) => !zhKeys.has(k));
const missingEn = [...usedKeys].filter((k) => !enKeys.has(k));
const i18nOk = zhAt > 0 && enAt > zhAt && missingZh.length === 0 && missingEn.length === 0;

const scriptOrder = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const expectedOrder = ['core/ballistics.js', 'core/terrain.js', 'core/reach.js', 'store.js', 'app.js'];
const orderOk = JSON.stringify(scriptOrder) === JSON.stringify(expectedOrder);
const missingFiles = expectedOrder.filter((f) => !existsSync(join(webDir, f)));
const serverCalls = [
  ...js.matchAll(/['"`]\/api\/(map-image|terrain-image|terrain-info|tower-reach|marker-icon)/g),
].map((m) => m[1]);
const hasEventSource = /EventSource/.test(js);
const staticOk = missingFiles.length === 0 && serverCalls.length === 0 && !hasEventSource && orderOk;

const report = {
  htmlIds: htmlIds.size,
  jsIdRefs: jsIds.length,
  missingIds: realMissing,
  externalRefs: external.concat(externalJs),
  unusedClasses,
  hiddenElements: hiddenClasses.size,
  hiddenClobbering: clobbering,
  hiddenOverride,
  i18nKeys: { zh: zhKeys.size, en: enKeys.size, used: usedKeys.size },
  i18nMissingZh: missingZh,
  i18nMissingEn: missingEn,
  scripts: scriptOrder,
  staticOnly: staticOk,
};
console.log(JSON.stringify(report, null, 2));

const failed = realMissing.length > 0 || report.externalRefs.length > 0 || !hiddenOk || !i18nOk || !staticOk;
if (!hiddenOk) {
  console.error(`hidden 属性被 CSS display 覆盖（${clobbering.join(', ')}），且 app.css 没有 [hidden] { display: none }`);
}
if (missingZh.length) console.error(`中文词典缺少词条：${missingZh.join(', ')}`);
if (missingEn.length) console.error(`英文词典缺少词条：${missingEn.join(', ')}`);
if (missingFiles.length) console.error(`缺少前端文件：${missingFiles.join(', ')}`);
if (serverCalls.length) console.error(`前端仍在调用后端资产接口：${[...new Set(serverCalls)].join(', ')}`);
if (hasEventSource) console.error('前端仍在使用 EventSource（架构已改为纯静态）');
if (!orderOk) console.error(`脚本顺序应为 ${expectedOrder.join(' → ')}，实际 ${scriptOrder.join(' → ')}`);
console.log(failed ? 'webcheck: 失败' : 'webcheck: 通过');
process.exit(failed ? 1 : 0);
