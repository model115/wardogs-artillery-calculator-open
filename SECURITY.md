# 安全策略 / Security Policy

## 报告漏洞 / Reporting a vulnerability

**请不要开公开 issue。** 用 GitHub 的
[私密漏洞报告](https://github.com/model115/wardogs-artillery-calculator/security/advisories/new)
（Security → Advisories → Report a vulnerability），或直接邮件联系维护者。

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/model115/wardogs-artillery-calculator/security/advisories/new)
instead.

请附上：复现步骤、影响范围、受影响的版本 / 提交号、以及你建议的修复方向（如果有）。

## 适用范围 / Scope

本项目的威胁模型很窄：它是一个**只在本机运行的解算服务**。真正值得关注的点：

| 面 | 说明 |
| --- | --- |
| **监听地址** | 默认 `http://127.0.0.1:5188`（仅本机）。用 `--urls http://0.0.0.0:5188` 或 `启动.cmd` 改成对外监听时，**同一局域网任何人都能读写你的状态**，且没有鉴权 —— 这是设计取舍，不是漏洞，但请知悉 |
| **CORS** | 服务端 `AllowAnyOrigin`，便于局域网内其它设备访问；同样意味着别把它暴露到公网 |
| **路径穿越** | 静态资源与 `/api/map-image/{map}` 等端点用地图 id / 图标名拼接路径，已做白名单校验；如果你发现能读到 `data/` 之外的文件，那是漏洞，请报告 |
| **依赖** | 运行时依赖只有 .NET 8 运行时（MIT）；构建期用到 OpenCvSharp（Apache-2.0），不随发行包分发 |
| **密钥** | 项目本身不需要任何凭据。仓库里不应出现 token / 密钥 |

## 不在范围内 / Out of scope

- 游戏本体、反作弊、账号相关的问题 —— 本项目不接触游戏进程
- 把服务暴露到公网后遭受的扫描 / 滥用（请自行加反向代理与鉴权）
- 上游数据来源项目（[apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator)）的问题

## 支持版本 / Supported versions

| 版本 | 是否维护 |
| --- | --- |
| 1.0.x | ✅ |
| < 1.0 | ❌ |
