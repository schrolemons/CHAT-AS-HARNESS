# CHAT AS HARNESS

以 Harness 形态聊天：把 QQ 聊天机器人、七层 Agent 架构、插件体系、MCP 工具面、七层驾驶舱与个性化人格，打包成一个**可安装、可分发**的插件。任何刚装好 DeepSeek Harness 的空白用户，装上本插件、让 AI 按步骤激活、选小组件（默认全上）、登录 QQ、设好机器人 QQ / 管理员 QQ / 白名单，双击《一键启动》就能跑起来。

## 特性

- **七层架构 + SCHNIE**：C 上下文记忆 / T 工具 / E 环境执行 / L 生命周期 / O 观测运维 / V 验证评估 / G 治理安全 / S 近人意识（SCHNIE，占位）。
- **插件体系**：每个能力一个插件目录（`plugin.json` + `index.js` + `skill.md`），可独立启停、热重载、排序；管理页按层浏览。
- **QQ 聊天**：SnowLuma（OneBot v11）接入；发送/等待/收尾的机械约束、拟人节奏、限频。
- **记忆**：短期会话状态、中期任务进度、长期记忆与日记、全局用户画像（完整层 + 脱敏可分享层）。
- **七层驾驶舱**：`/api/harness/page`（本机控制台）。
- **安全**：白名单、令牌、内容闸门、画像脱敏、出站敏感信息拦截、state ACL。

## 快速开始

1. 安装 **DeepSeek Harness**（本仓库不含 Harness 本体）。
2. 安装本插件到 Harness 的插件目录。
3. 启动 Harness 后，在会话里对 AI 说「激活」或双击《一键启动》。
4. AI 按激活剧本引导：装依赖 → 起 SnowLuma → 填机器人/管理员/白名单 → 选组件（默认全上）→ 起桥接。
5. 打开本机控制台（默认 `http://127.0.0.1:3100`）或 `/api/harness/page` 看七层驾驶舱。

## 目录

```
src/                桥接内核 + 插件宿主 + MCP 工具面
plugins/qq-components/   七层插件（每个带 skill.md）
public/             前端：harness.html（七层）、plugins.html、console.html
roles/              人格卡（大肥鱼等）
dsh/agent-presets/  Harness preset（qq-chat / qq-chat-v2 / qq-chat-dev）
docs/               文档与蓝图
config.example.json 配置模板（无任何真实凭据）
一键启动.bat        双击启动
```

## 配置要点

- 复制 `config.example.json` 为 `config.json`，填 `ownerQQ`、`allow.groups` / `allow.private`（白名单）、SnowLuma 连接。
- 凭据、令牌、QQ 号**只在本地 config/state 里**，绝不入库、绝不外发。
- 浏览器登录态与任何用户目录**不会被打包**；浏览器管理组件只在本机复用你的真实登录态。

## 源项目署名与许可

- **DeepSeek Harness**：运行环境，请自行安装（本仓库不重分发）。
- **SnowLuma**（OneBot v11 网关）：请按其说明安装；本仓库只含连接配置与指引。
- **qq-bridge** 本仓库衍生，保留上游 MIT 许可与说明。

## License

[MIT](LICENSE)

> 提醒：本项目不含任何账号凭据、令牌、QQ 号、浏览器登录态。使用前请自行完成本地配置。
