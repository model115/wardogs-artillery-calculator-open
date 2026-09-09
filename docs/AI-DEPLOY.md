# 网页端部署任务书 / AI Deployment Brief

> **本文面向要把本项目网页端部署上线的 AI 建站助手（如阿里云万小智）与运维人员。**
> 请完整读完本文再动手。如果你（AI 助手）无法执行下述"原始静态文件伺服"，
> 请如实告知用户"该需求超出你的托管能力"，**不要**自行重写或重新生成一个"看起来像"的新站。

---

## 1. 这是什么（一句话）

**整站是纯静态文件**：没有后端进程、没有数据库、没有会话状态、**没有构建步骤**。

- 计算全部在浏览器里跑（`core/*.js` 是原生 JS 弹道/地形核心）；
- 服务端唯一职责：**把文件原样发给浏览器**；
- 入口是 `web/index.html`，全部引用都是**相对路径**，无打包、无转译、无依赖安装。

## 2. 站点结构（必须原样保持）

```text
<站点根>/
├── index.html        ← 入口（相对路径引用下列文件）
├── app.css
├── app.js
├── store.js
├── core/
│   ├── ballistics.js
│   ├── terrain.js
│   └── reach.js
└── data/             ← 必须挂在站点根的 /data 路径下
    ├── maps.json     （地图元信息）
    └── weapons.json  （射表）
```

> ⚠️ **本公开仓库不含游戏衍生素材**（`data/images/`、`data/terrain/`、`data/markers/`、
> `data/reach/`）。这不是缺失，而是版权合规的有意设计：站点在素材缺失时会**优雅降级**
> （地图与高程层不渲染，坐标/刻度换算、射表等功能仍可用）。
> 完整素材需使用者从本地游戏数据自行生成（见 README「数据来源与许可」），
> **严禁把游戏素材上传到任何公开托管**。

## 3. 硬性要求（不满足就白屏 / 404 / 重复下载）

| # | 要求 | 说明 |
| --- | --- | --- |
| 1 | 根路径直接伺服 `index.html` | 访问 `/` 返回 200 与该文件，`text/html` |
| 2 | `data/` 必须在站点根 `/data` 下 | 代码写死 `fetch('data/...')` 相对路径；改路径需同步改 `store.js` / `app.js` |
| 3 | `.hgt` / `.wrg` 用 `application/octet-stream` | int16 二进制高程/网格，不能当文本处理 |
| 4 | 缓存头 | `*.webp *.png *.hgt *.wrg` → `public, max-age=86400`；`*.js *.css *.json` → `max-age=3600`；`index.html` → `no-cache` |
| 5 | 开启 gzip/brotli | JSON/JS/CSS 收益大；`.hgt` 能压 30~50%；webp 已压缩，跳过 |
| 6 | HTTPS | 公网标配 |

## 4. 不需要的东西（防误判）

- ❌ 不需要 Node / npm / 任何构建工具；
- ❌ 不需要数据库、后端框架、服务端逻辑；
- ❌ 没有任何可被滥用的 API——没有登录、没有表单提交端点；
- ❌ 不需要 `.env`、密钥、环境变量。

## 5. 三种上线方式（任选其一）

**A. 任意"拖拽式"静态托管（最快验证）**：把 `web/` 整个目录拖到
Netlify Drop / Cloudflare Pages / Vercel，秒级得到公网 URL。

**B. nginx（自有服务器）**：

```nginx
server {
    listen 443 ssl http2;
    server_name your.domain;
    root /var/www/wardogs;          # web/ 的内容
    index index.html;

    location ~* \.(webp|png|hgt|wrg|ico)$ {
        add_header Cache-Control "public, max-age=86400";
        access_log off;
        try_files $uri =404;
    }
    location ~* \.(js|css|json)$ {
        add_header Cache-Control "public, max-age=3600";
        try_files $uri =404;
    }
    location = /index.html { add_header Cache-Control "no-cache"; }

    types { application/octet-stream hgt wrg; }
    gzip on;
    gzip_types application/octet-stream application/json text/css application/javascript;
    gzip_min_length 1024;
}
```

**C. 阿里云 OSS（对象存储静态托管）**：
Bucket（香港等境外区域免 ICP 备案）→ 读写权限**公共读** → 上传站点根内容 →
「基础设置 → 静态页面」默认首页 `index.html` → 域名管理绑 CNAME → 免费 DV 证书开 HTTPS。

> 更完整的成本测算、CDN 缓存策略、防 DDoS、ICP 备案合规见 [DEPLOY.md](DEPLOY.md)。

## 6. 上线自检清单

```text
[ ] GET /                          → 200, text/html, 含 <title> 与 app.js 引用
[ ] GET /core/ballistics.js        → 200, application/javascript
[ ] GET /data/maps.json            → 200, application/json
[ ] GET /data/terrain/<图>.hgt     → 200, application/octet-stream（有素材时）
[ ] 浏览器打开首页无白屏、无 404（F12 Network 全绿）
[ ] index.html 响应头为 no-cache；大二进制为长缓存
[ ] 页面底部有仓库/作者署名（如有要求）
```

## 7. 许可与边界

- 代码许可：**PolyForm Noncommercial 1.0.0**（非商业免费，商用需另行授权）；
- 游戏素材（地图图、高程、图标）版权归 **BULKHEAD / Team17**，本项目无权分发，
  因此不出现在本仓库、也**不应**出现在任何部署产物中；
- 非官方粉丝项目，与 BULKHEAD、Team17 无关联。
