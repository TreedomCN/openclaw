# OpenClaw 二次开发指南：添加新平台（渠道）

OpenClaw 使用插件架构来支持不同的消息平台（如 Telegram, Discord）。要添加新的平台（例如飞书、企业微信、QQ 机器人），你需要创建一个符合 OpenClaw 插件规范的扩展（Extension）。

## 1. 架构概览

所有的渠道插件都位于 `extensions/` 目录下。每个插件是一个独立的 NPM 包，但作为 workspace 的一部分进行管理。

核心接口是 `ChannelPlugin`（定义在 `openclaw/plugin-sdk`），插件必须实现该接口来处理：
- **配置 (Config)**: 管理 Token 和其他设置。
- **网关 (Gateway)**: 启动长轮询或 Webhook 接收消息。
- **出站 (Outbound)**: 发送消息到平台。
- **状态 (Status)**: 健康检查。

## 2. 目录结构

假设我们要添加名为 `feishu` (飞书) 的平台，建议的目录结构如下：

```text
extensions/feishu/
├── package.json            # NPM 包定义
├── openclaw.plugin.json    # 插件元数据
├── src/
│   ├── channel.ts          # 核心实现 (实现 ChannelPlugin)
│   ├── runtime.ts          # 运行时单例 (可选)
│   ├── client.ts           # 平台 API 客户端 (封装 HTTP 请求)
│   └── index.ts            # 导出入口
```

## 3. 详细步骤

### 第一步：创建包配置文件

在 `extensions/feishu/package.json` 中定义包信息：

```json
{
  "name": "@openclaw/feishu",
  "version": "1.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "devDependencies": {
    "openclaw": "workspace:*" 
  },
  "openclaw": {
    "extensions": ["./src/index.ts"]
  }
}
```

在 `extensions/feishu/openclaw.plugin.json` 中定义插件元数据：

```json
{
  "id": "feishu",
  "channels": ["feishu"],
  "configSchema": {
    "type": "object",
    "properties": {
      "appId": { "type": "string" },
      "appSecret": { "type": "string" }
    }
  }
}
```

### 第二步：实现 ChannelPlugin 接口

在 `extensions/feishu/src/channel.ts` 中实现核心逻辑。以下是一个简化模板：

```typescript
import { ChannelPlugin, ChannelMessageActionAdapter } from "openclaw/plugin-sdk";

// 定义你的配置类型
interface FeishuAccount {
  accountId: string;
  appId: string;
  appSecret: string;
  // ...
}

export const feishuPlugin: ChannelPlugin<FeishuAccount> = {
  id: "feishu",
  
  // 1. 功能声明
  capabilities: {
    chatTypes: ["direct", "group"], // 支持私聊和群聊
    media: true,                    // 支持媒体消息
    threads: false,                 // 是否支持话题/线程
  },

  // 2. 配置管理
  config: {
    // 如何从配置对象中列出所有账户 ID
    listAccountIds: (cfg) => Object.keys(cfg.channels?.feishu?.accounts || {}),
    // 解析特定账户的配置
    resolveAccount: (cfg, accountId) => {
      // 实现配置读取逻辑
      const account = cfg.channels?.feishu?.accounts?.[accountId];
      return {
        accountId,
        ...account,
        token: account?.appSecret // 用于统一接口的 token 字段
      };
    },
    // 判断账户是否已配置
    isConfigured: (account) => Boolean(account.appId && account.appSecret),
  },

  // 3. 消息发送 (Outbound)
  outbound: {
    sendText: async ({ to, text, accountId }) => {
      // TODO: 调用飞书 API 发送文本消息
      console.log(`[Feishu] Sending to ${to}: ${text}`);
      // return client.sendMessage(to, text);
      return { channel: "feishu", id: "msg_id_from_api" };
    },
    sendMedia: async ({ to, mediaUrl, accountId }) => {
      // TODO: 调用飞书 API 发送图片/文件
      return { channel: "feishu", id: "msg_id_from_api" };
    }
  },

  // 4. 消息接收 (Gateway)
  gateway: {
    startAccount: async (ctx) => {
      const { account } = ctx;
      ctx.log?.info(`Starting Feishu gateway for ${account.accountId}`);

      // TODO: 启动 WebSocket 客户端或注册 Webhook 回调
      // const client = new FeishuClient(account);
      // client.on("message", (msg) => {
      //   // 将平台消息转换为 OpenClaw 内部格式并分发
      //   ctx.runtime.ingest.text({
      //     channel: "feishu",
      //     from: msg.senderId,
      //     text: msg.content,
      //     // ...
      //   });
      // });

      // 返回一个清理函数，用于停止服务
      return async () => {
        // client.stop();
        ctx.log?.info("Stopped Feishu gateway");
      };
    }
  },
  
  // 5. 状态检查 (Status)
  status: {
    probeAccount: async ({ account }) => {
      // TODO: 调用飞书 API 检查连通性 (如获取用户信息)
      return { ok: true };
    }
  },
  
  // ... 其他部分如 pairing, security 可参考 extensions/discord
};
```

### 第三步：导出插件

在 `extensions/feishu/src/index.ts` 中导出：

```typescript
export * from "./channel";
```

## 4. 关键概念说明

### 消息流向

1.  **Inbound (入站)**: 外部平台 -> 你的 Gateway -> `ctx.runtime.ingest` -> OpenClaw Core
    *   你需要将外部平台的 payload (JSON) 转换为 OpenClaw 的标准化消息格式。
2.  **Outbound (出站)**: OpenClaw Core -> 你的 Outbound -> 外部平台 API
    *   你需要实现 `sendText`, `sendMedia` 等方法。

### SDK 工具

`openclaw/plugin-sdk` 提供了许多辅助函数，建议参考 `extensions/discord` 的实现：
- `buildChannelConfigSchema`: 快速构建配置 Schema。
- `normalizeAccountId`: 标准化账户 ID。

## 5. 调试与测试

1.  **本地构建**: 在根目录运行 `pnpm install` 和 `pnpm build`。
2.  **配置**: 使用 `openclaw config set channels.feishu.accounts.default.appId <YOUR_ID>` 添加配置。
3.  **运行**: 使用 `pnpm dev gateway run` 启动网关，观察日志输出。

## 6. 参考代码

*   **Discord 实现**: `extensions/discord/src/channel.ts` (功能最全，推荐参考)
*   **Telegram 实现**: `src/telegram` (核心实现，逻辑较复杂)

祝你开发顺利！
