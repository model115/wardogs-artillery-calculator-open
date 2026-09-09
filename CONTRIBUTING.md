# 贡献指南 / Contributing

感谢愿意帮忙！欢迎：修正射表 / 地图数据、翻译、bug 修复、性能与体验改进。

## 开发环境 / Setup

需要 **.NET 8 SDK** 与 **Node.js 20+**（Node 只用于两个无依赖的前端自检脚本）。

```powershell
git clone https://github.com/model115/wardogs-artillery-calculator.git
cd wardogs-artillery-calculator
dotnet test                                    # 单元 + 集成测试
node tools/webcheck.mjs                        # 前端 id / 外链 / hidden / i18n 词条自检
node tools/webrender-check.mjs                 # 用 DOM/Canvas 桩真跑 render()
dotnet run --project tools/WardogsArtillery.Tools -- assets check
```

`data/` 已随仓库提供，日常开发**不需要**原始游戏数据。只有重新生成资产时才需要
（见 README「数据来源」）。

## 提交前 / Before you push

```powershell
dotnet test
node tools/webcheck.mjs
node tools/webrender-check.mjs
```

三项全绿再提 PR。改了前端文案的话，记得**中英两份词典都要加** ——
`webcheck` 会校验 `t('键')` / `data-i18n` 用到的词条在中英词典里都存在。

## 代码风格 / Style

- C# 用 4 空格缩进，`file-scoped namespace`，公开 API 带 XML 文档注释
- 前端是**原生 JS + Canvas**，不引入打包器 / 框架 / CDN（离线可用是硬要求）
- 注释写「为什么」，不写「做了什么」；踩过的坑写清楚，避免后人重踩
- 改动行为时**同步更新** `CHANGELOG.md`

## 提交信息 / Commit messages

中文或英文都行，第一行说明改了什么，正文讲清原因。例如：

```
修复高抛表落点反推方向相反

RangePerMil 取了绝对值，隐含假设「密位越大射程越远」，
但 spg/high 与 mortar 是反的……
```

## 许可 / License

本项目原创代码以 **[PolyForm Noncommercial 1.0.0](LICENSE)** 发布（非商业免费，商业需授权）。

**贡献者授权**：提交 PR 即表示你确认自己有权提交该内容，并授予维护者
**非独占、永久、全球范围、免版税、可再许可**的许可，允许维护者以任何许可
（**包括商业许可**）使用、修改、分发你的贡献。

> 这一条很重要：如果没有它，你的贡献会一直挂在你名下，
> 维护者就无法把项目用于商业用途 —— 而商业授权正是本项目保留的权利。
> 如果你不接受这一条，请不要提交 PR。

游戏素材（`data/` 下的地图图、高程、图标）不适用本项目许可，详见
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
