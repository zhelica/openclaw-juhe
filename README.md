# openclaw-juhe

<div align="center">

**微信/企微通道插件 - 为 OpenClaw 带来微信和企微集成**

[![GitHub](https://img.shields.io/badge/GitHub-hanson%2Fopenclaw--juhe-blue)](https://github.com/hanson/openclaw-juhe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)

[特性](#-核心特性) • [快速开始](#-快速开始) • [配置指南](#-配置指南) • [架构设计](#-架构设计) • [API 文档](#-api-文档)

</div>

---

## 项目简介

openclaw-juhe 是 [OpenClaw](https://github.com/openclaw/openclaw) 的通道插件，通过 **juhebot** 后端服务实现微信和企微的消息收发功能。

> **付费说明**
>
> 本插件为 **juhebot 付费平台的专属通道**，需要购买 juhebot 服务方可使用。未购买用户可作为学习参考，了解 OpenClaw 插件的开发模式和架构设计。

[企微接口](https://qqclaw.apifox.cn/)
[个微接口](https://qclaw.apifox.cn/)

**OpenClaw** 是一个开源的多通道聊天机器人框架，支持同时接入多个聊天平台（微信、企微、飞书、Telegram 等），并提供统一的 LLM 对话能力。

## 核心特性

### 消息收发
- **多消息类型支持** - 文本、图片、文件、语音、视频
- **私聊与群聊** - 完整支持个人和群组对话
- **@提及检测** - 智能识别群聊中的 @ 机器人消息

### 连接模式
- **WebSocket 客户端（推荐）** - 无需公网 IP，支持内网环境
- **HTTP 回调服务器** - 标准 HTTP 回调，兼容性好
- **自动重连机制** - 连接断开自动重连，最多 10 次尝试

### 账号管理
- **多账号支持** - 单个插件实例支持多个微信/企微账号
- **独立配置文件** - 敏感信息存储在 `accounts.json`，避免泄露
- **权限控制** - 精细化的联系人白名单和群组权限管理

### 用户体验
- **思考中提示** - 收到消息立即发送随机 emoji 提示，提升交互体验
- **消息去重** - 30 分钟内自动过滤重复消息
- **命令权限** - 管理员命令权限校验

## Skills

本插件计划提供以下可扩展技能：
- **会话存档** - 持久化存储聊天记录
- **数据分析** - 基于 LLM 的对话数据分析
- **自动推送** - 定时任务和触发式推送

## 快速开始

### 1. 安装依赖

使用 npm 安装项目所需依赖：

```bash
npm install
```

### 2. 编译插件

直接使用 TypeScript 编译器构建项目，生成 `dist` 目录：

```bash
npx tsc
```

> **注意**：确保 `tsconfig.json` 配置正确，编译成功后应看到 `dist/index.js` 文件。

### 3. 安装插件 (唯一推荐方式)

使用 OpenClaw CLI 将插件注册到系统中。**必须在项目根目录执行**。

```bash
# 安装你的项目目录
openclaw plugins install /code/projects/openclaw-juhe
```

> **注意**：
> - 此命令会自动读取 `package.json` 中的 `openclaw.extensions` 和 `openclaw.hooks` 字段。
> - 每次修改代码并重新 `npx tsc` 后，**无需**再次运行 install，只需重启网关即可生效。
> - 如果修改了 `package.json` 中的元数据字段，则需要重新运行 install。

### 4. 配置与启动

编辑 `~/.openclaw/openclaw.json` 添加渠道配置（见下方配置指南），然后重启网关：

```bash
openclaw gateway restart
```

## 配置指南

### 基础配置

在 `~/.openclaw/openclaw.json` 中添加 `channels.juhe` 配置：

```json
{
  "channels": {
    "juhe": {
      "enabled": true,
      "baseUrl": "https://chat-api.juhebot.com",
      "wsUrl": "wss://chat-api.juhebot.com/ws/juwe",
      "appKey": "YOUR_APP_KEY",
      "appSecret": "YOUR_APP_SECRET",
      "guid": "YOUR_GUID",
      "contacts": ["YOUR_WECHAT_ID"],
      "type": "wechat",
      "rooms": [
        {
          "id": "YOUR_GROUP_ID@chatroom",
          "requireMention": true,
          "scope": "whitelist",
          "whitelist": ["USER_ID_1", "USER_ID_2"]
        }
      ]
    }
  }
}
```

### 群组权限配置

群组支持三种权限范围 (`scope`)：
- `owner`: 仅群主/管理员可用
- `whitelist`: 仅白名单用户可用
- `everyone`: 所有人可用

```json
"rooms": [
  {
    "id": "YOUR_GROUP_ID@chatroom",
    "requireMention": true,
    "scope": "whitelist",
    "whitelist": ["USER_ID_1", "USER_ID_2"]
  }
]
```

## 架构设计

### 消息流程

```
┌─────────────┐         WebSocket/HTTP          ┌──────────────────┐
│   juhebot   │  <─────────────────────────>   │  openclaw-juhe   │
│   Backend   │                               │   (Plugin)       │
└─────────────┘                               └──────────────────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │   OpenClaw   │
                                                │   Core       │
                                                └──────────────┘
```

### 目录结构

```
openclaw-juhe/
├── index.ts              # 插件入口
├── src/
│   ├── channel.ts        # ChannelPlugin 实现
│   ├── outbound.ts       # Outbound Adapter
│   ├── client.ts         # juhebot API 客户端
│   └── ...               # 其他逻辑
├── package.json          # 包含 openclaw 元数据
├── tsconfig.json
└── README.md
```

## API 文档

### 消息类型
| 类型 | 说明 | 示例 |
|------|------|------|
| `text` | 文本消息 | `"hello"` |
| `image` | 图片消息 | `<media:image>` |
| `file` | 文件消息 | `<media:document>` |

### WebSocket 协议
- **Auth**: `{ "type": "auth", "app_key": "...", "app_secret": "...", "guid": "..." }`
- **Callback**: `{ "type": "callback", "event": { ... } }`
- **Ack**: `{ "type": "ack", "event_id": "...", "success": true }`

## 开发指南

```bash
# 安装依赖
npm install

# 类型检查
npx tsc --noEmit

# 编译构建
npx tsc

# 本地测试 WebSocket 连接
npm run test-ws

# 重新安装插件 (仅当修改 package.json 元数据时)
openclaw plugins install /code/projects/openclaw-juhe
```

## 常见问题

**Q: 修改代码后需要重新 install 吗？**
A: 不需要。只要 `package.json` 中的 `openclaw.extensions` 路径不变，修改代码后只需 `npx tsc` 然后 `openclaw gateway restart` 即可。

**Q: 如何获取 appKey、appSecret 和 guid？**
A: 登录 juhebot 后台管理界面创建应用获取。

**Q: 安装失败提示 missing openclaw.extensions？**
A: 请检查 `package.json` 是否包含正确的 `openclaw` 字段，并确保已运行 `npx tsc` 生成了 `dist` 目录。

**Q: npx tsc 报错找不到命令？**
A: 请确保已运行 `npm install` 安装了 TypeScript 依赖，或者全局安装：`npm install -g typescript`。

## 许可证

MIT License
EOF
```