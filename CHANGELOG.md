# 变更日志 / Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] — 2026-09-08

首个公开版本。**纯火炮解算软件**：只做数学与地图计算，输出游戏内方位角与刻度。

### 新增

- **解算核心（`WardogsArtillery.Core`，零第三方依赖）**
  - 射表插值弹道求解：距离 / 方位角 / 高低刻度 / 飞行时间
  - `ITerrainHeight` 抽象，同时支持构建期原始高程块与分发期压缩高程网格
  - 地形倾斜修正（实验性）：按弹道落点切面估算坡向坡角并给出修正量
  - 弹着点反推：记录上一发落点偏差，自动给出第二发修正刻度
  - 可达性判定：逐方位采样 3D 高程 + 仰角窗口，判定目标是否在射界内
- **本地服务（`WardogsArtillery.Server`）**
  - 纯 REST + SSE，无外部 CDN、无原生依赖
  - 射程圈 / 高程着色 / 1~5 塔被射图 / 占领圈 / 量距 / 目标收藏（最多 3 个目标）
  - 切换目标、换炮位、换弹种、换地图时**自动清空落点矫正**
- **前端（`web/`，原生 JS + Canvas）**
  - 双语 5 步上手教程 + 功能说明弹窗（首次进入自动提示，右上角 `?` 随时重看）
  - 右下角署名 `by model115`
- **资产管线（`tools/WardogsArtillery.Tools`）**
  - 原始 ~1.5 GB 地图/高程数据 → 12 MB 分发资产（单张 4096² webp + 1024² int16 高程网格）
  - 运行时零原生库依赖（OpenCvSharp 只在构建期使用）
- **发行包**
  - 单文件自包含 exe（18.7 MB，`win-x64`，免装 .NET）
  - `启动.cmd` 一键启动并打开浏览器（默认 <http://127.0.0.1:5188>）

### 修复

- **高差修正曾完全失效（影响所有非平地射击）**：旧实现每次迭代都用当前仰角重算隐含初速
  `v₀ = sqrt(R·g/sin2θ)`，代入后 `g·R²/(2v₀²cos²θ) ≡ R·tanθ`，弹道高度 `y(R)` 恒为 0，
  修正量退化成常数并匀速漂移 40 次 —— 金标准里 14 个高差用例 `converged` 全为 `false`。
  现改为固定 `v₀` 后对 `y(θ) = ΔZ` 求根（倍增步长括区间 + 二分），并把 θ 限制在射表密位窗口内。
  实测 1395 m / +294 m 高差：旧版 209.98 mil，新版 274.66 mil（旧版少修 65 mil ≈ 91 m 落点偏差）。
- 视线角换算把弧度当成了度（`asin` 的结果乘 `MilPerDegree` 而非 `MilPerRadian`），
  新增 `SightAngleMil()` 并加了回归测试。
- **落点反推方向在 2/3 张射表上是反的**：`RangePerMil` 用绝对值求斜率，隐含假设
  「密位越大射程越远」（低抛）。而 `spg/high`（2629 m@610 mil → 735 m@1400 mil）与
  `mortar/single`（80 m@950 mil → 697 m@120 mil）是「密位越大射程越近」，
  现改为有符号斜率 `dR/dMil`，方向自动跟随弹道弧段。
- **统一解算会挑到「钳到边界的假解」**：`SolveBest` 只看仰角高低，低抛在高差解不出时
  会把仰角钳到表下界，于是仰角天然比高抛低、反而胜出。现按
  「已收敛 &gt; 仅在表内 &gt; 超程」排序，同级再比仰角；逻辑抽到 `WeaponSolver` 并补了单测。
- **请求体字段名写错会被静默忽略**：`{"weaponId":"mortar"}` 返回 200 却什么都没做。
  现在开启严格反序列化，未知字段直接 400。
- 可达性判定：解算无解时会钳到射表边界，导致 `仰角超限` 检查失效、射程圈退化成正圆。
  现在按 `Converged` 判定，射程圈重新随地形起伏（实测 72 方位最大射程 2261~2629 m）。
- **教程弹窗关不掉（走不到「完成」）**：`.modal { display: flex }` 是作者样式，
  优先级高于浏览器 UA 的 `[hidden] { display: none }`，于是 `hidden` 属性形同虚设。
  补 `[hidden] { display: none !important; }`，并给 `webcheck` 加了这类覆盖的静态检查、
  给 `webrender-check` 加了「5 步走完 → 按钮变完成 → 点击关闭」的流程测试。
- 清除落点矫正时写入 `NaN` 导致 `/api/state` 返回 500、SSE 流中断
- 切换目标后落点矫正未自动删除
- 落点记录模式下点击目标标记会误触发拖拽
- 射程圈外边界因统一圆弧合并而偏小

### 界面

- **落点不再挡着改点位**：记录落点后「记录落点」模式不会自动退出，标记因此拖不动，
  看起来像「放了落点就不能动目标」。现在记完自动退出该模式。
- **落点保留规则改为「只有产生新目标才清空」**：拖动/手输目标坐标（`keepImpact: true`）、
  移动车体、换武器都保留落点；新增/切换/清除目标才清空。新增 `GET /api/impact`
  用新参数重算修正量，面板会跟着走。
- **落点坐标可手填**：弹着点反推卡片里新增 X / Y 输入框 + 「记录」按钮，和车体/目标一致。
- **反推基准修正**：倾斜修正开关只在前端，后端却无条件优先用倾斜修正后的刻度，
  没勾选时反推基准就错了（实测 1395 m 处「下一发」显示 5.1 mil，应为约 250 mil）。
  现在前端把界面实际显示的 `firedMil` / `firedBearing` 传给后端。
- **中英双语界面**：默认中文，右上角按钮与教程内按钮可切换 English，选择记在 localStorage；
  `webcheck` 新增词条完整性校验（中英各 194 条，缺键即失败）。
- 浅色化「放车体 / 放目标 / 记录落点 / 清除点位」四个按钮；未选中目标的不透明度从
  0.35 提到 0.72，更容易看到。
- **落点标记可以拖动**（以前只能重新点一次地图）。拖动即重新记录，修正量跟着变；
  记录落点模式下点已有的落点标记也是拖动，点别处才是记录新落点。
- **射击诸元里「倾斜修正」单独成行**，并把主数字的括注改成「不含倾斜修正 xxx」——
  以前只显示「399.1 mil（原 295.1）」，看不出这 104 mil 是哪来的。
  提醒文案也补上了「由高程网格推算、未经游戏验证、建议用落点反推校准」，
  并且修正量 ≥30 mil 时就会提示（以前只在坡度 >5° 时提示）。

### 许可与合规

- 新增 `THIRD-PARTY-NOTICES.md`：照录上游 **apollyon-sys/wardogs-calculator** 的 MIT
  全文（Copyright (c) 2026 Apollyon），列出全部依赖的许可（.NET 8 / System.Text.Json /
  Test.Sdk / Mvc.Testing = MIT；OpenCvSharp4 / OpenCV / xunit = Apache-2.0），
  并说明游戏素材不适用 MIT。
- 修正 `LICENSE` 与 README 的错误归属：WARDOGS 由 **BULKHEAD** 开发、**Team17** 发行
  （原文误写 Bohemia Interactive），并补上「非官方爱好者项目、无关联无背书」声明。
- 新增 `SECURITY.md`（含威胁模型：默认只监听 127.0.0.1、CORS 放开、无鉴权的取舍）
  与 `CONTRIBUTING.md`。
- 新增 `.github/dependabot.yml` 与 issue 模板；CI 令牌收紧为 `contents: read`。
- README 补发行包 SHA256 校验值。

### 构建 / 发布

- **修复 `启动.cmd` 双击报错**：文件是 LF 行尾 + UTF-8 中文，cmd.exe 会按错误的字节偏移
  切行，于是出现 `'RDOGS' 不是内部或外部命令`、`'http:' 不是内部或外部命令`、
  中文乱码等现象。现在改成 **CRLF + 纯 ASCII**（cmd 处理多字节批处理本身就不可靠，
  代码页 65001 下 GBK 又会乱码，两边都不行）。
  `package.ps1` 增加了校验：行尾非 CRLF 或含非 ASCII 字节直接打包失败；
  测试里也加了回归用例。
- **`assets check` 不再要求原始数据源**：以前它在命令分发前就检查 `--source`，导致
  新克隆的仓库和 CI 都跑不了（数据源默认值还硬编码了作者机器上的路径）。
  现在 `check` 只校验仓库里已提交的 `data/`，并**真读一遍**：
  `maps.json` 解析、`weapons.json` 建库、`.hgt` 解码、图片 webp 魔数校验。
  只有 `maps|weapons|markers|images|grid|reach|all` 才需要 `--source`
  （或环境变量 `WARDOCS_CALC_SOURCE`），没给会给出明确提示。
- 发行包补上 `THIRD-PARTY-NOTICES.md`（MIT 要求随分发附带声明）。
- `LICENSE` 恢复为**纯 MIT 文本**：之前在里面追加说明段导致 GitHub 识别成
  `NOASSERTION`（没有 license 徽章、`licensee` 也认不出）。游戏数据/素材的说明
  统一放在 `THIRD-PARTY-NOTICES.md`，README 指向它。
- 新增 `CODE_OF_CONDUCT.md`（Contributor Covenant 2.1）与 PR 模板。

### 许可变更

- **原创代码从 MIT 改为 [PolyForm Noncommercial 1.0.0](LICENSE)**：非商业用途免费
  （个人/学习/研究/改装/学校/慈善/政府），**任何商业用途需另行授权**；作者本人保留
  商业使用权。源码依然公开，但这不再属于 OSI 定义的 “open source”，
  准确说法是 **source-available**（GitHub 许可证标识会显示 `Other`）。
- README 新增「商业授权」与「不适用本许可的部分」两节，明确三件事分开：
  原创代码（PolyForm NC）、`data/` 里的上游 MIT 数据（仍 MIT，允许商用，我们限制不了）、
  `data/` 里的游戏素材（BULKHEAD / Team17 所有，我们无权授权）。
- `CONTRIBUTING.md` 新增**贡献者授权条款**：提交 PR 即授予维护者非独占、永久、
  全球、免版税、可再许可的许可（含商业许可）。没有这一条，他人贡献会一直挂在
  贡献者名下，维护者就无法商用。
- `THIRD-PARTY-NOTICES.md` 的范围说明同步更新。

> 提示：商业站点若仍要分发 `data/` 里的游戏地图图与高程，需要权利人许可；
> 否则请只发代码，让用户用 `tools` 从自己安装的游戏生成 `data/`。

### 架构

- **解算搬到浏览器，服务器只做静态分发。** 原来「后端算、前端显示」意味着：一份全局
  状态（多人访问互相覆盖）、没有鉴权、没有限流、每次拖动都要服务器算 20 ms。
  现在 `web/core/*.js`（约 29 KB）在本地算，服务器退化成静态文件托管：
  没有状态、不用鉴权、不会被刷、可以直接丢给 nginx / GitHub Pages / 对象存储。
  - `web/core/ballistics.js` 射表插值 + 弹道解算 + 弹着反推（移植自 C# Core）
  - `web/core/terrain.js` 紧凑高程网格解析 + 车体姿态推算
  - `web/core/reach.js` 逐方位可达射程
  - `web/store.js` 数据层：状态 + 本地「接口」路由，状态存 localStorage
  - 服务端删掉 `AssetStore` / `CalculatorState` / `JsonContract` / `Requests` /
    `RangeRingCalculator` / `WeaponSolver`，`Program.cs` 只剩静态托管 + `/api/health`
- **一致性保障**：新增 `tools/... core-golden` 用 C# Core 生成金标准，
  `tools/corecheck.mjs` 让 JS 实现逐字段对齐 —— 当前 **56,244 项检查，容差 1e-9**，
  覆盖插值、解算、地形倾斜、可达射程、弹着反推。CI 会重新生成金标准并 `git diff`，
  防止改了 C# 却忘了同步。
- 新增 `tools/e2echeck.mjs`：在 Node 里用磁盘上的 `data/` 当后端，跑通
  「选图 → 放车体/目标 → 解算 → 射程圈 → 落点反推」，验证静态站完整数据流。
- 首屏只多了约 29 KB 的 JS 核心；地图大图仍是 3.5 MB 且走浏览器缓存。

### 已知限制

- 地形倾斜修正为实验性，起伏剧烈地形下误差偏大
- 分发包使用 16 m 高程网格，与构建期 2 m 原始数据的解算结果存在小幅数值差异
- 仅内置 2 张地图（bakurani / ozeti），其余地图需按 README 自备原始数据生成
