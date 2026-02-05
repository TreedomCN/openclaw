import { ChannelPlugin, ChannelMessageActionAdapter } from "openclaw/plugin-sdk";
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
    name: "RedBook Note",
    description: "Xiaohongshu automation for posting and interaction",
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
    // We map "sendText" to commenting on a note if 'to' looks like a note ID
    sendText: async ({ to, text, accountId }) => {
      const browser = getBrowser(process.env.HOME + "/.openclaw/data", true);
      const page = await browser.getPage();

      console.log(`[RedBook] Commenting on note ${to}: ${text}`);
      try {
        await commentNote(page, to, text);
        return { channel: "redbooknote", id: Date.now().toString() };
      } catch (err) {
        console.error(`[RedBook] Failed to comment: ${err}`);
        throw err;
      }
    },

    // Custom method handling (if supported by core via some mechanism)
    // For now, we only implement standard methods.
    // "Post Note" would likely be triggered via a specific Tool/Skill, not standard messaging.
  },

  // Expose custom actions as Tools (New OpenClaw Feature)
  // Note: This depends on if ChannelPlugin supports 'actions' or 'tools'.
  // Based on previous file reads (Discord plugin), there is an 'actions' property.
  actions: {
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
    handleAction: async (ctx) => {
      const { action, parameters } = ctx;
      const browser = getBrowser(process.env.HOME + "/.openclaw/data", true);
      const page = await browser.getPage();

      if (action === "post_note") {
        const { title, body, images } = parameters as any;
        await postNote(page, { title, body, images });
        return { success: true };
      }
      if (action === "like_note") {
        const { noteId } = parameters as any;
        await likeNote(page, noteId);
        return { success: true };
      }
      throw new Error(`Unknown action: ${action}`);
    },
  },
};
