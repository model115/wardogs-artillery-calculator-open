# 第三方声明 / Third-Party Notices

本文件汇总本项目使用的第三方代码与数据的许可信息。
This file lists the licenses of third-party code and data used by this project.

> **许可范围一句话**：本项目**原创代码**是
> [PolyForm Noncommercial 1.0.0](LICENSE)（可自由用于非商业用途，商用需授权）；
> `data/` 里的**上游 MIT 数据**（射表、地图边界、标记点）仍按上游 MIT 授权，
> 本项目的许可**无法**限制这部分；`data/` 里的**游戏素材**版权归
> **BULKHEAD / Team17**，本项目无权授权。上游 MIT 声明照录在下面第 1 节。
>
> **Scope in one line**: the project's **original code** is
> [PolyForm Noncommercial 1.0.0](LICENSE) (free for noncommercial use, commercial use
> needs a license); upstream **MIT data** under `data/` stays MIT-licensed and cannot be
> restricted by us; **game assets** under `data/` remain the property of
> **BULKHEAD / Team17** and are not licensed by this project.

---

## 1. 上游数据来源 / Upstream data source

`data/` 目录下的射表（`weapons.json`）、地图边界与标记点（`maps.json`、`markers/`）等数据，
以及弹道模型的部分思路，源自社区开源工程
**[apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator)**（MIT 许可）。

按 MIT 许可要求，其版权与许可声明全文如下（原文照录）：

```
MIT License

Copyright (c) 2026 Apollyon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

上游项目同样声明：其 MIT 许可**只覆盖其原创源码**，WARDOGS 游戏素材（地图图、图标、贴图、
商标、名称）不在 MIT 范围内，且该项目与 BULKHEAD / WARDOGS 开发团队无关联。

---

## 2. 游戏数据与素材 / Game assets

`data/images/*.webp`（地图大图与热力图）、`data/terrain/*.hgt`（高程网格）、
`data/markers/*.webp`（标记图标）、`data/reach/*`（可达性预算图）都是
**由 WARDOGS 游戏本体文件重新渲染 / 降采样得到的衍生数据**。

- **WARDOGS** © [BULKHEAD](https://www.bulkhead.com/)，由 **Team17** 发行
- 这些素材**不属于**本项目的许可范围，版权归原权利人所有
- 本项目是**非官方、爱好者项目**，与 BULKHEAD、Team17 及 WARDOGS 开发团队
  **没有任何关联**，未获其背书、赞助或授权
- 本仓库不对 WARDOGS 或其他第三方知识产权主张任何权利

**再分发提示**：如果你想 fork / 再分发本仓库，请自行评估游戏素材的再分发风险。
只保留代码也可以正常工作 —— 按 README「数据来源」一节，用构建期工具从你自己安装的游戏
重新生成 `data/` 即可：

```powershell
dotnet run --project tools/WardogsArtillery.Tools -- assets all --source <wardogs-calculator 目录>
```

---

## 3. 依赖 / Dependencies

| 组件 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| .NET 8 / ASP.NET Core | 8.0 | MIT | 运行时（随自包含 exe 分发） |
| System.Text.Json | 8.0 | MIT | JSON 序列化（框架内置） |
| OpenCvSharp4 | 4.13.0 | Apache-2.0 | **仅构建期** `tools` 工程使用，不随发行包分发 |
| OpenCvSharp4.runtime.win | 4.13.0 | Apache-2.0 | 同上（OpenCV 原生库） |
| OpenCV | 4.13 | Apache-2.0 | 同上（OpenCvSharp 的底层） |
| xunit | 2.9.3 | Apache-2.0 | 单元测试 |
| xunit.runner.visualstudio | 3.1.4 | Apache-2.0 | 测试适配器 |
| Microsoft.NET.Test.Sdk | 17.14.1 | MIT | 测试宿主 |
| Microsoft.AspNetCore.Mvc.Testing | 8.0.11 | MIT | HTTP 集成测试 |

发行包 `WardogsArtillery-<版本>-win-x64.zip` 内只包含 **.NET 运行时（MIT）** 与本项目代码，
**不含** OpenCV 原生库 —— OpenCvSharp 只在构建期资产管线里用到。
