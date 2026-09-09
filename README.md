# WARDOGS 火炮解算器 · WARDOGS Artillery Calculator

> 📦 **公开版**：本仓库不含游戏素材（地图图 / 高程 / 图标），
> 需要按「数据来源」一节用自己的游戏原始数据生成 `data/`。
> 完整版（含预生成素材）不公开。源码注释已移除。

> 一个纯解算的火炮指挥台：**地图 + 3D 高程 + 射表 → 游戏内要打的方位角与刻度**。
> A pure **calculator** for WARDOGS artillery: map + 3D heightmap + firing tables →
> the **azimuth and elevation (mil) you actually dial in game**.

作者 / Author: **model115** · <https://github.com/model115>

> ⚖️ **非官方爱好者项目**，与 **BULKHEAD**、**Team17** 及 WARDOGS 开发团队无任何关联。
> 游戏素材不适用本项目许可 —— [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
> Unofficial fan-made project, not affiliated with BULKHEAD or Team17.

---

## 功能 / Features

| 功能 | 说明 |
| --- | --- |
| **整张大地图** | 构建期把瓦片拼成一张 4096² 图，前端一次绘制，没有接缝 |
| **高度热力图** | 由游戏原生 3D 高程场渲染，越高越红，直方图均衡后小高差也能看出来 |
| **射击诸元** | 只突出两个数：**游戏内方位角**、**游戏内刻度**；同时给出距离、ΔZ、飞行时间、射表平地值对照 |
| **射程圈（可达圈）** | 逐方位采样 3D 高程 → 代入弹道解算 → 用火炮仰角上下限判定可达性，画出来是随地形起伏的环带；车体/目标两种圆心 |
| **1~5 塔被射图** | 预算好的「塔能从哪些位置被打到」叠加层（360 方位） |
| **地形倾斜修正**（实验） | 用高程场梯度推算车体俯仰/侧倾，修正刻度**和方位**；坡度 >5° 会提示慎用 |
| **弹着点反推** | 点地图记录炮弹落点（也可**直接填落点坐标**）→ 自动算出打远/打偏多少 → 给出**第二发的刻度与方位**；挪车体/目标时落点保留、修正量自动重算 |
| **占领圈 / 量距 / 目标收藏** | 圆形区域标注、两点测距、最多 3 个目标快速切换 |
| **中英双语界面** | 默认中文，右上角 / 教程里一键切换 English，选择会记住 |
| **局域网共用** | 后端是本地 Web 服务，同一局域网任何设备打开同一地址都是同一份状态 |

| Feature | Notes |
| --- | --- |
| **Single big map** | tiles are pre-composed into one 4096² image at build time — no seams |
| **Elevation heatmap** | rendered from the game's native 3D heightmap; higher = redder |
| **Firing solution** | highlights just two numbers: in-game **azimuth** and **mil** |
| **Reachability ring** | per-azimuth terrain sampling + ballistic solve + gun elevation limits |
| **Tower coverage** | precomputed "where can hit tower N" layer |
| **Terrain tilt correction** *(experimental)* | vehicle pitch/roll from the heightmap gradient |
| **Impact correction** | record the impact on the map (or **type its coordinates**) → corrected second shot |
| **Zones / ruler / saved targets** | tactical annotations |
| **Bilingual UI** | Chinese by default, one click to English (top-right or in the tutorial), remembered |

---

## 快速开始 / Quick start

### 方式一：下载发行包（推荐）

1. 下载 `WardogsArtillery-<版本>-win-x64.zip` 并解压；
2. 双击 **`WardogsArtillery.exe`**（或 `启动.cmd` 会自动打开浏览器）；
3. 浏览器访问 <http://127.0.0.1:5188>。

需要 Windows 10/11 x64。exe 是自包含的，**不需要安装 .NET**。

> `启动.cmd` 的内容是**纯 ASCII**的：cmd.exe 处理含中文的批处理会因编码/行尾问题解析错乱
> （`'RDOGS' 不是内部或外部命令`），所以启动器只用英文；网页界面本身是中英双语的。

### 方式二：从源码构建

```powershell
git clone https://github.com/model115/wardogs-artillery-calculator.git
cd wardogs-artillery-calculator

# 1) 生成数据资产（需要原始数据源，见下文「数据来源」）
dotnet run --project tools/WardogsArtillery.Tools -- assets all

# 2) 跑测试
dotnet test

# 3) 本地运行
dotnet run --project src/WardogsArtillery.Server --urls http://127.0.0.1:5188

# 4) 打单文件 exe
dotnet publish src/WardogsArtillery.Server -c Release -o dist
#    → dist/WardogsArtillery.exe（约 18 MB，自包含 + 裁剪）
```

---

## 使用流程 / How to use

1. **放车体** — 右上角点「放车体」，再点地图上你所在的位置（也可以手输坐标）。
2. **放目标** — 点「放目标」再点地图，最多同时存 3 个；点淡色的目标可切回，拖标记可移动。
3. **读两个数** — 侧栏放大的 **游戏内方位角** 与 **游戏内刻度** 就是要在游戏里输入的。
   勾上「地形倾斜修正」会显示按 3D 高程推算的修正值，括号里是原值。
4. **打一发后修正** — 游戏会把炮弹落点画在地图上，点「记录落点」再点地图上的落点，
   面板直接给出 **下一发的刻度与方位**。

首次打开会自动弹出教程（4 步流程 + 功能清单），右上角 **?** 可随时重开。

---

## 界面截图 / Screenshots

主界面（真实浏览器截图：左侧地图 + 右侧诸元面板）：

![UI](docs/static-site.png)

> 这张图由 `node tools/browsercheck.mjs --shot docs/static-site.png` 自动生成 ——
> 它会真的开一个无头浏览器，设好车体/目标、跑完解算与落点反推，再截图。

地图（构建期拼成的一整张大图）：

![map](data/images/bakurani_map.webp)

高度热力图（越高越红）：

![heatmap](data/images/bakurani_terrain.webp)

1~5 塔被射范围（预计算层）：

![towers](data/reach/bakurani_towers_preview.png)

射程范围网格文件预览（地图中心 300 m，10 m 格）：

![reach-grid](data/reach/bakurani_r300_s10_preview.png)

---

## 数据来源与许可 / Data sources & licensing

本仓库 `data/` 里的地图、标记、射表与高程数据是从社区开源工程
**[apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator)**
导出的游戏数据（地图瓦片、`weapons.json` 射表、Terrain3D 高度场），
再经过本项目构建期工具压缩成紧凑格式：

| 数据 | 原始形态 | 分发形态 |
| --- | --- | --- |
| 地图 | 瓦片金字塔 1.26 GB | `images/<地图>_map.webp` 7.3 MB |
| 高程 | Terrain3D chunk 256 MB | `terrain/<地图>.hgt` 4 MB（int16 网格，16 m/格） |
| 射表 | `weapons.json` | 原样 15 KB |

原始数据**不随包分发**，只用于构建期生成。若你要重新生成，请自行准备该仓库的副本：

```powershell
dotnet run --project tools/WardogsArtillery.Tools -- assets all --source <wardogs-calculator 目录>
```

代码以 **[PolyForm Noncommercial 1.0.0](LICENSE)** 发布：非商业用途免费，商业用途需授权。

**免责声明**：本项目是**非官方、爱好者项目**，与 **BULKHEAD**、**Team17** 及 WARDOGS
开发团队没有任何关联，未获其背书或授权。WARDOGS 及其素材版权归各自权利人所有，
不适用本项目许可 —— 详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

**Disclaimer**: unofficial fan-made project, not affiliated with, endorsed by, or
officially associated with BULKHEAD, Team17, or the WARDOGS development team.
WARDOGS assets remain the property of their respective owners and are **not**
covered by this project's license — see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

---

## 架构 / Architecture

**没有后端。** 解算全部在浏览器里跑，服务器（或任何静态托管）只负责发文件。

- 前端：原生 JS + Canvas，无 CDN、无打包器。计算核心是从 C# 版 1:1 移植的独立模块，
  浏览器里直接算弹道、可达射程与弹着反推
- 后端：只是一个静态文件服务（单文件 exe），不含任何业务逻辑
- 数据：地图大图、高程网格、射表都是**静态文件**，由构建期工具从游戏原始数据生成

### 计算放在前端的理由

原本是「后端算、前端显示」，那意味着：一份全局状态、没有鉴权、容易被刷、
公网多人访问会互相覆盖。搬到浏览器之后，服务器 CPU 占用归零、状态天然隔离、
不需要鉴权与限流，整站可以直接丢给任意静态托管。

### 一致性怎么保证

前端是唯一实现，一旦和验证过的算法分叉，用户拿到的是错的射击诸元 —— 而且没人会发现。
所以用 C# 参考实现生成金标准，逐字段比对 JS 移植版，覆盖射表插值、解算、
地形倾斜、可达射程、弹着反推，容差 1e-9。

**体积对比**：原始数据约 1.5 GB + 运行时 OpenCvSharp 96 MB →
**发行包约 30 MB**（exe 17.8 MB + data 12 MB），运行时零原生依赖。

## 已知限制 / Limitations

- **精度取舍**：分发用的高程网格是 16 m/格（原始 2 m）。射程圈用 20 m 步长扫描，
  追求速度而非绝对精度；需要更细可自行用 `assets grid` 生成 2048² 网格。
- **地形倾斜是实验功能**：高程场是地形碰撞网格，不等于车体悬挂后的真实姿态；
  没有车体朝向数据，用炮口方位近似；侧倾的横向影响未建模。
- **弹道模型**：游戏是可变装药/表驱动，本工具以射表为权威。高差修正在
  「隐含初速 v₀ 由基准仰角反推并固定」的真空模型上求根 `y(θ) = ΔZ`，
  并限制在射表的密位窗口内；解不出时返回 `converged=false`，界面会标注「未完全收敛」。

---

## 开发 / Development

```powershell
dotnet test                                                   # 单元 + 集成测试
node tools/webcheck.mjs                                       # 前端 id/外链自检
node tools/webrender-check.mjs                                # 用 DOM/Canvas 桩真跑 render()
dotnet run --project tools/WardogsArtillery.Tools -- assets check   # 资产自检
```

## 许可 / License

本项目**原创代码**（`src/`、`web/`、`tools/`、`tests/`）以
**[PolyForm Noncommercial 1.0.0](LICENSE)** 发布 © 2026 **model115**。

| 用途 | 是否允许 |
| --- | --- |
| 个人使用、学习、研究、改装、二次开发 | ✅ 免费 |
| 学校 / 慈善 / 政府 / 公益组织使用 | ✅ 免费 |
| 部署到自己的非商业站点、分享给别人 | ✅ 免费 |
| **任何商业用途**（含 SaaS、收费服务、企业内部生产使用、随商品分发） | ❌ **需另行取得商业授权** |

> 保留源码公开，但**不允许他人商用**。注意：这类许可不属于 OSI 定义的
> “open source”（OSI 要求不得限制使用领域），准确说法是 **source-available**；
> GitHub 的许可证标识会显示为 `Other`，这是正常的。

### 商业授权 / Commercial licensing

作者本人保留商业使用的权利（著作权人不受自己授予他人的许可限制）。
需要商业授权请联系 **[@model115](https://github.com/model115)**（开 issue 或邮件均可），
说明用途、规模与部署方式。

### 不适用本许可的部分

- `data/` 里的**上游 MIT 数据**（射表、地图边界、标记点）：仍按上游 MIT 授权，
  MIT 允许商用，本许可**无法**限制这部分 —— 详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
- `data/` 里的**游戏素材**（地图图 / 高程 / 图标）：版权归 **BULKHEAD / Team17**，
  本项目无权授权，任何用途（含商用）都需自行取得权利人许可
- 本项目为非官方爱好者项目，与 BULKHEAD、Team17 无关联、无背书

> ⚠️ **商用前务必先解决游戏素材问题**：`data/` 里的地图图与高程是从游戏提取的衍生数据。
> 若你的商业站点要分发它们，需要权利人许可；否则请改为只发代码，
> 让用户用 `tools` 从自己安装的游戏生成 `data/`。

> 下载校验：每个 [Release](https://github.com/model115/wardogs-artillery-calculator/releases)
> 的说明里都附了该发行包的 SHA256，下载后可用
> `Get-FileHash .\WardogsArtillery-*.zip -Algorithm SHA256` 核对。
