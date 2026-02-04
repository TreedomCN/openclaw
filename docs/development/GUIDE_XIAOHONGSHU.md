# 小红书 (Xiaohongshu) 插件开发指南

针对小红书的操作，目前最推荐的方案是 **浏览器自动化 (Browser Automation)**。

## 1. 方案选择：为什么是浏览器自动化？

| 方案 | 难度 | 稳定性 | 风险 | 评价 |
| :--- | :--- | :--- | :--- | :--- |
| **协议逆向 (API)** | ⭐⭐⭐⭐⭐ | 低 | 高 | 小红书 API 有复杂的签名验证 (X-s, X-t) 和设备指纹，极易触发风控封号。维护成本极高。 |
| **官方 API** | ⭐⭐⭐ | 高 | 低 | 仅面向企业/MCN/广告商开放，个人开发者难以申请权限，且功能受限（通常只能读数据）。 |
| **浏览器自动化** | ⭐⭐ | 中 | 中 | **推荐**。模拟用户在网页版的操作。虽然资源占用稍高，但开发简单，且能复用网页版的完整功能（发布、评论、点赞）。 |

## 2. 技术架构

由于 OpenClaw 核心的 `src/browser` 模块目前是内部私有的，扩展无法直接调用。因此，你需要**在插件内部独立引入 Playwright**。

### 核心依赖
*   **Playwright**: 用于控制浏览器。
*   **qrcode-terminal**: 用于在终端展示登录二维码。

### 数据流向
1.  **Gateway 启动**: 插件启动时，初始化 Playwright 实例（Headless 模式）。
2.  **登录流程**: 检查本地是否有 Cookies -> 无则打开登录页 -> 截取二维码 -> 终端展示 -> 用户扫码 -> 保存 Cookies。
3.  **消息监听 (Inbound)**: 轮询网页上的通知中心或消息列表 DOM 变化。
4.  **操作执行 (Outbound)**: 接收 OpenClaw 指令 -> 页面跳转 (如创作中心) -> 模拟点击/输入 -> 完成操作。

## 3. 实现脚手架

### 3.1 目录结构

```text
extensions/xiaohongshu/
├── package.json
├── openclaw.plugin.json
└── src/
    ├── channel.ts       # 插件入口
    ├── browser.ts       # Playwright 封装 (单例管理)
    └── actions.ts       # 具体操作 (发布、评论等)
```

### 3.2 安装依赖

在 `extensions/xiaohongshu/` 下运行：

```bash
npm install playwright qrcode-terminal
npm install -D openclaw
```

### 3.3 核心代码示例

#### `src/browser.ts` (浏览器管理)

```typescript
import { chromium, Browser, BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs";

export class XhsBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private authDir: string;

  constructor(dataDir: string) {
    this.authDir = path.join(dataDir, "xiaohongshu");
    fs.mkdirSync(this.authDir, { recursive: true });
  }

  async init() {
    this.browser = await chromium.launch({ headless: true });
    // 加载持久化的 Cookies
    const storageStatePath = path.join(this.authDir, "state.json");
    if (fs.existsSync(storageStatePath)) {
      this.context = await this.browser.newContext({ storageState: storageStatePath });
    } else {
      this.context = await this.browser.newContext();
    }
    this.page = await this.context.newPage();
    
    // 自动保存 Cookies
    this.context.on("page", async (page) => {
        page.on("close", () => this.context?.storageState({ path: storageStatePath }));
    });
  }

  async getPage() {
    if (!this.page) await this.init();
    return this.page!;
  }
  
  async saveState() {
      if (this.context) {
          await this.context.storageState({ path: path.join(this.authDir, "state.json") });
      }
  }
}
```

#### `src/channel.ts` (登录与操作)

```typescript
import { ChannelPlugin } from "openclaw/plugin-sdk";
import { XhsBrowser } from "./browser";
import qrcode from "qrcode-terminal";

const xhs = new XhsBrowser(process.env.HOME + "/.openclaw/data");

export const xhsPlugin: ChannelPlugin<any> = {
  id: "xiaohongshu",
  // ...
  gateway: {
    startAccount: async (ctx) => {
      const page = await xhs.getPage();
      
      // 1. 检测登录状态
      await page.goto("https://www.xiaohongshu.com");
      const isLoggedIn = await page.locator(".user-avatar").count() > 0;
      
      if (!isLoggedIn) {
        ctx.log?.info("未登录，正在获取二维码...");
        await page.goto("https://www.xiaohongshu.com/login"); // 假设登录页
        
        // 等待二维码出现 (示例选择器，需按实际调整)
        const qrImg = page.locator("canvas.qrcode-img"); 
        await qrImg.waitFor();
        
        // TODO: 解析二维码内容并打印 (需引入解析库或拦截网络请求)
        // 简单做法：让用户看截图
        // await page.screenshot({ path: "xhs-login.png" });
        // ctx.log?.info("请查看 xhs-login.png 扫码登录");
        
        // 等待登录完成
        await page.waitForURL("https://www.xiaohongshu.com/explore", { timeout: 60000 });
        await xhs.saveState();
      }
      
      ctx.log?.info("小红书已登录！");
      
      // 2. 启动轮询监听消息 (可选)
      // setInterval(async () => { checkMessages(page, ctx) }, 5000);
      
      return async () => {
        await xhs.saveState();
        // browser.close();
      };
    }
  },
  outbound: {
    sendText: async ({ to, text }) => {
       const page = await xhs.getPage();
       // 模拟评论或私信操作
       // await page.goto(`https://www.xiaohongshu.com/user/profile/${to}`);
       // ... DOM 操作 ...
       return { channel: "xiaohongshu", id: "simulated-id" };
    }
  }
};
```

## 4. 关键功能实现提示

### 发布笔记
发布笔记通常在 `https://creator.xiaohongshu.com/publish/publish`。
1.  **上传图片/视频**: 使用 Playwright 的 `setInputFiles` 方法处理 `<input type="file">`。
2.  **填写内容**: 使用 `fill` 填写标题和正文。
3.  **发布**: 点击“发布”按钮。

### 评论/私信
*   **评论**: 进入笔记详情页 -> 找到输入框 -> 输入 -> 点击发送。
*   **私信**: 进入用户主页 -> 点击“发消息” -> 在弹出的聊天窗口中输入。

## 5. 注意事项
1.  **Headless 检测**: 小红书可能有反爬机制检测 Headless 浏览器。如果遇到空白页或验证码，尝试使用 `playwright-extra` 插件或设置 User-Agent。
2.  **频率限制**: 所有的操作（点赞、关注、评论）务必增加随机延时，不要并发过高，否则极易封号。
3.  **选择器维护**: 网页版 DOM 结构可能会变，建议使用相对稳定的属性（如 `aria-label`, `data-v-xxx`）或文本内容定位。
