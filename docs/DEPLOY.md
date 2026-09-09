# 部署指南 / Deployment

本项目的**整站是静态文件**（`web/` + `data/`），没有后端进程、没有数据库、没有状态。
所以部署只需要一件事：**把这些文件发给浏览器**。

```
站点根/
├── index.html  app.css  app.js  store.js
├── core/{ballistics,terrain,reach}.js       ← 计算核心，浏览器里跑
└── data/                                     ← 必须挂在 /data 路径下
    ├── maps.json  weapons.json
    ├── images/<图>_map.webp  images/<图>_terrain.webp
    ├── terrain/<图>.hgt
    ├── markers/*.webp
    └── reach/*
```

> `WardogsArtillery.exe` 只是**本地**用的静态服务器（为了让浏览器能 `fetch` 到 `data/`，
> 绕开 `file://` 的限制）。部署到网站**不需要它**。

---

## 一、先算清成本

实测（真实浏览器抓包）：

| 项 | 数值 |
| --- | --- |
| 首屏传输 | **5.57 MB / 12 请求** |
| ├ 地图大图 `bakurani_map.webp` | 3.47 MB（62%） |
| ├ 高程网格 `bakurani.hgt` | 2.05 MB（37%） |
| └ 代码 + 配置 + HTML | 约 200 KB（3.5%） |
| 回访传输 | **≈0**（有 `Cache-Control`，走浏览器缓存） |

服务器开销（16 并发压测，65.7 MB）：

| 资源 | 实测 | 打满 200 Mbps 时 |
| --- | --- | --- |
| CPU | 0.64 s / 65.7 MB ≈ **103 MB/CPU秒** | **0.24 核**（2 vCPU 的 12%） |
| 内存 | ~75 MB | 2 GiB 的 3.7% |
| 磁盘 | 50 MB | 40 GiB 的 0.1% |
| **带宽** | — | **100% ← 唯一瓶颈** |

**容量**：200 Mbps = 25 MB/s ÷ 5.57 MB ≈ **4.5 新访客/秒 ≈ 16,000 人/小时**。

**结论：CPU/内存永远不是问题，带宽才是。** 所以要么上 CDN，要么接受这个上限。

---

## 二、三种部署方式

| 方式 | 国内访问 | 抗 DDoS | 需要备案 | 适合 |
| --- | --- | --- | --- | --- |
| **A. 直连源站** | 最快 | 弱（只能靠防火墙限速） | 大陆服务器：需要 | 小流量、内测 |
| **B. 国内 CDN**（阿里云/腾讯云） | 最快 | 中（有基础防护，需买高防） | **需要** | 大陆服务器 + 国内用户 |
| **C. Cloudflare** | **可能变慢**（免费版无大陆节点） | **强（免费无限量）** | 境外服务器：不需要 | 全球用户 / 暂无备案 / 抗 D |

> ⚠️ **Cloudflare 免费版对中国大陆用户常常是减速器**：大陆没有 PoP，
> 流量被导到香港/新加坡/圣何塞再回源。源站在大陆时尤其明显（绕出国再绕回来）。
> 用户主要在国内 → 选 **B**，不要选 C。

---

### 方式 A：直连源站（nginx）

```nginx
server {
    listen 443 ssl http2;
    server_name your.domain;

    root /var/www/wardogs;          # web/ 的内容放这里
    index index.html;

    ssl_certificate     /etc/letsencrypt/live/your.domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your.domain/privkey.pem;

    # 与程序内建策略保持一致（见下节「缓存规则」）
    location ~* \.(webp|png|hgt|wrg|ico)$ {
        add_header Cache-Control "public, max-age=86400";
        access_log off;
        try_files $uri =404;
    }
    location ~* \.(js|css|json)$ {
        add_header Cache-Control "public, max-age=3600";
        try_files $uri =404;
    }
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    # .hgt / .wrg 是二进制，别让 nginx 当文本处理
    types { application/octet-stream hgt wrg; }

    # 压缩：.hgt 是 int16 二进制，能压掉 30~50%；webp 压不动
    gzip on;
    gzip_types application/octet-stream application/json text/css application/javascript;
    gzip_min_length 1024;

    # 基础限速：单 IP 每秒 20 个请求、突发 40（防单点刷量）
    limit_req_zone $binary_remote_addr zone=wardogs:10m rate=20r/s;
    location / {
        limit_req zone=wardogs burst=40 nodelay;
        try_files $uri $uri/ /index.html;
    }

    location /data/ {
        limit_req zone=wardogs burst=40 nodelay;
        try_files $uri =404;
    }
}
```

**HTTPS**：`certbot --nginx -d your.domain` 一条命令搞定，或前面挂 caddy（自动证书）。

---

### 方式 B：国内 CDN（阿里云 / 腾讯云）

前提：**域名已备案**（见第六节）。

1. 源站按方式 A 配好，只监听 80，**安全组只放行 CDN 回源 IP 段**（不要对公网开放源站）
2. CDN 控制台添加域名 → 源站填你的服务器 IP
3. **缓存规则**（关键，直接照抄）：

| 路径 | 缓存时间 | 说明 |
| --- | --- | --- |
| `*.webp` `*.png` `*.hgt` `*.wrg` | **7~30 天** | 大二进制，几乎不变，命中率接近 100% |
| `*.js` `*.css` `*.json` | 1 小时 | 更新后 1 小时内全网生效 |
| `index.html` | **不缓存** | 保证改完立刻生效 |
| `data/maps.json` `data/weapons.json` | 1 小时 | — |

4. 开启 **智能压缩**（gzip/brotli）
5. 开启 **HTTPS**，证书用免费 DV 证书

> 重新生成过 `data/` 之后，CDN 上要**手动刷新缓存**（或把文件名加版本号）。

---

### 方式 C：Cloudflare

```text
用户 → Cloudflare 边缘（缓存 5.57 MB）→ 你的源站（只在未命中时回源）
```

配置要点：

| 项 | 设置 |
| --- | --- |
| DNS | 橙云（Proxied）开启 |
| SSL/TLS | Full (strict) |
| Cache Rules | `*.webp|*.hgt|*.wrg|*.png` → Cache Everything，Edge TTL 7 天 |
| | `index.html` → Bypass Cache |
| 源站保护 | 防火墙只放行 [Cloudflare IP 段](https://www.cloudflare.com/ips/)，隐藏真实 IP |
| 压缩 | Brotli 打开（默认开） |
| DDoS | 默认自动防护；被打时可临时开 **Under Attack Mode** |

**什么时候不该用**：用户几乎全在中国大陆，且源站在大陆 → 用国内 CDN。

---

## 三、缓存规则（程序内建，别改乱）

`WardogsArtillery.exe` 已经按扩展名设置了 `Cache-Control`：

| 扩展名 | Cache-Control |
| --- | --- |
| `.webp` `.png` `.hgt` `.wrg` `.ico` | `public, max-age=86400`（1 天） |
| `.js` `.css` `.json` | `public, max-age=3600`（1 小时） |
| 其它（含 `index.html`） | `no-cache`（每次都协商，保证更新立刻生效） |

> 用 nginx/CDN 部署时，**把上面的规则对齐**，否则回访会重新下载 5.57 MB。
> 实测：加了这个头之后，回访时 `bakurani_map.webp` / `bakurani.hgt` 都是 **0 KB**。

**更新资产后怎么办**：`index.html` 是 `no-cache`，所以页面一定是最新的；
但大二进制在缓存期内可能是旧的。要么等缓存过期，要么给文件名加版本号
（`bakurani_map.v2.webp`，同时改 `store.js` 里的路径），要么在 CDN 刷缓存。

---

## 四、防被打（DDoS）

**好消息**：计算搬到浏览器之后，服务器**没有任何可被滥用的接口** ——
没有登录、没有数据库、没有能刷的 API。攻击者唯一能做的就是**下载那 5.57 MB**。

| 层级 | 做法 | 效果 |
| --- | --- | --- |
| 1 | **CDN 前置**（国内 CDN 或 Cloudflare） | 流量打在边缘，源站看不见攻击 |
| 2 | **隐藏源站 IP**：防火墙只放行 CDN 回源段 | 攻击者找不到源站，无法绕过 CDN |
| 3 | **边缘限速**：nginx `limit_req` 或 CDN 的 WAF 限速 | 单 IP 刷量被掐 |
| 4 | **带宽告警**：云监控设 80% 阈值 | 被打时第一时间知道 |
| 5 | **降级预案**：临时把地图图换成低分辨率版本（3.47 MB → ~1 MB） | 带宽压力降 60% |

**不建议**：源站装 WAF/抗 D 软件（静态站没什么可挡的）、买高价抗 D 套餐（先上 CDN）。

---

## 五、上线检查清单

```text
[ ] HTTPS 可用，HTTP 自动跳转
[ ] index.html 是 no-cache，大二进制有长缓存
[ ] gzip/brotli 开启，.hgt 有被压缩
[ ] /data/ 路径可访问（.hgt 返回 application/octet-stream）
[ ] 首屏实测 ≈ 5.5 MB，回访 ≈ 0
[ ] 源站 IP 不直接对公网开放（只放行 CDN 回源段）
[ ] 带宽告警已配
[ ] 站点底部有备案号（大陆服务器必须）
[ ] 全站自检：node tools/browsercheck.mjs --url https://your.domain/
```

部署完可以直接跑仓库里的检查工具验证线上：

```cmd
node tools/browsercheck.mjs --url https://your.domain/ --shot out.png
node tools/netcheck.mjs --url https://your.domain/ --repeat
```

---

## 六、备案与合规（大陆服务器）

| 项 | 要求 |
| --- | --- |
| ICP 备案 | 服务器在**中国大陆** + 用域名 → **必须**，否则 80/443 被拦，且属违法 |
| 备案主体 | 域名实名信息必须与备案主体一致；域名须**境内注册**且后缀在工信部白名单内 |
| 商用 | **个人备案不能涉及经营行为**（不能收费、挂广告、卖东西）；商用需**企业/单位备案**，涉及在线收费还要**经营性 ICP 许可证** |
| 公安备案 | 上线后 30 日内到 [beian.gov.cn](http://www.beian.gov.cn/) 办 |
| 境外服务器 | 不需要备案（香港/新加坡等） |

> ⚠️ **游戏素材风险**：`data/` 里的地图图与高程是从 WARDOGS 提取的衍生数据，
> 版权归 **BULKHEAD / Team17**，本项目无权授权，商用前必须解决。
> 最稳的做法是**只部署代码**，让用户用 `tools` 从自己安装的游戏生成 `data/`：
>
> ```powershell
> dotnet run --project tools/WardogsArtillery.Tools -- assets all --source <wardogs-calculator 目录>
> ```

---

## 七、监控

静态站只需要看三件事：

| 指标 | 工具 | 阈值 |
| --- | --- | --- |
| 带宽 / 流量 | 云监控 / CDN 后台 | 80% 告警 |
| 5xx 比例 | CDN 后台 | > 0.1% |
| 回源率 | CDN 后台 | 正常应 < 5%（高了说明缓存规则配错） |

服务本身的存活探针：`GET /api/health` → `{"ok":true,"version":"v1.0.0","mode":"static"}`
（这个端点不含任何业务逻辑，只用来判断进程活着 / 反代健康检查）。
