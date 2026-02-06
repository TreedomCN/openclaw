import { ChannelPlugin, ChannelMessageActionAdapter } from "openclaw/plugin-sdk";
import { z } from "zod";
import { ensureLogin, postNote, likeNote, commentNote } from "./actions";
import { XhsBrowser } from "./browser";

// Configuration interface
interface RedBookConfig {
  headless?: boolean;
}

interface RedBookAccount {
  accountId: string;
  config: RedBookConfig;
}

// Config Schema using Zod
const RedBookAccountSchema = z.object({
  enabled: z.boolean().optional().default(true),
  headless: z.boolean().optional().default(true),
});

// Singleton browser instance (shared across accounts for now, or per account)
// For simplicity, we assume one default account using the local browser session.
let browserInstance: XhsBrowser | null = null;

function getBrowser(dataDir: string, headless: boolean) {
  if (!browserInstance) {
    browserInstance = new XhsBrowser(dataDir, headless);
  }
  return browserInstance;
}

export const redbookPlugin: ChannelPlugin<RedBookAccount> = {
  id: "redbooknote",

  meta: {
    id: "redbooknote",
    label: "RedBook Note",
    selectionLabel: "RedBook Note (Xiaohongshu)",
    docsPath: "/channels/redbooknote",
    blurb: "Xiaohongshu automation via Playwright",
  },

  configSchema: {
    schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        headless: { type: "boolean" },
      },
    },
  },

  capabilities: {
    chatTypes: ["channel"], // Treat notes as channels?
    media: true,
    threads: false,
  },

  config: {
    listAccountIds: () => ["default"],
    resolveAccount: (cfg, accountId) => ({
      accountId: accountId || "default",
      config: cfg.channels?.redbooknote || {},
    }),
    isConfigured: () => true, // Always "configured" as it relies on local browser state
  },

  gateway: {
    startAccount: async (ctx) => {
      const { account, runtime } = ctx;
      const dataDir = process.env.HOME + "/.openclaw/data"; // Or use runtime path
      const headless = account.config.headless ?? true;

      ctx.log?.info(`[RedBook] Starting gateway for ${account.accountId}`);
      const browser = getBrowser(dataDir, headless);

      try {
        await browser.init();
        const page = await browser.getPage();
        await ensureLogin(page, (msg) => ctx.log?.info(`[RedBook] ${msg}`));

        // Save state after login check
        await browser.saveState();
      } catch (err) {
        ctx.log?.error(`[RedBook] Setup failed: ${err}`);
      }

      // Return cleanup function
      return async () => {
        ctx.log?.info("[RedBook] Stopping gateway...");
        await browser.close();
      };
    },
  },

  outbound: {
    deliveryMode: "direct",
    // We map "sendText" to commenting on a note if 'to' looks like a note ID
    sendText: async ({ to, text, accountId }) => {
      const browser = getBrowser(process.env.HOME + "/.openclaw/data", true);
      const page = await browser.getPage();

      console.log(`[RedBook] Commenting on note ${to}: ${text}`);
      try {
        await commentNote(page, to, text);
        return { channel: "redbooknote", messageId: Date.now().toString() };
      } catch (err) {
        console.error(`[RedBook] Failed to comment: ${err}`);
        throw err;
      }
    },

    // Custom method handling (if supported by core via some mechanism)
    // For now, we only implement standard methods.
    // "Post Note" would likely be triggered via a specific Tool/Skill, not standard messaging.
  },
};

// Expose custom actions as Tools (New OpenClaw Feature)
export const redbookActions = {
  listActions: () => [
    {
      name: "post_note",
      description: "Post a new note to Xiaohongshu",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          images: { type: "array", items: { type: "string" } },
        },
        required: ["title", "body", "images"],
      },
    },
    {
      name: "like_note",
      description: "Like a note",
      parameters: {
        type: "object",
        properties: {
          noteId: { type: "string" },
        },
        required: ["noteId"],
      },
    },
  ],
  handleAction: async (ctx: any) => {
    const { action, parameters } = ctx;
    const browser = getBrowser(process.env.HOME + "/.openclaw/data", true);
    const page = await browser.getPage();

    if (action === "post_note") {
      const { title, body, images } = parameters as any;
      await postNote(page, { title, body, images });
      // Cleanup: Navigate to blank page to save resources
      try {
        await page.goto("about:blank");
      } catch (e) {}
      return { success: true };
    }
    if (action === "like_note") {
      const { noteId } = parameters as any;
      await likeNote(page, noteId);
      // Cleanup: Navigate to blank page to save resources
      try {
        await page.goto("about:blank");
      } catch (e) {}
      return { success: true };
    }
    throw new Error(`Unknown action: ${action}`);
  },
};
