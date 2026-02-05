import fs from "fs";
import path from "path";
import { chromium, Browser, BrowserContext, Page } from "playwright";

export class XhsBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private authDir: string;
  private headless: boolean;

  constructor(dataDir: string, headless: boolean = true) {
    this.authDir = path.join(dataDir, "redbooknote");
    this.headless = headless;
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  async init() {
    // Use persistent context to ensure better session retention
    if (this.context) return;

    const storageStatePath = path.join(this.authDir, "state.json");
    console.log(`[RedBook] Launching browser (headless=${this.headless})...`);

    // Launch persistent context
    // This stores cookies/localStorage directly on disk, more robust than storageState
    const userDataDir = path.join(this.authDir, "user_data");
    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless: this.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled", // Reduce detection
      ],
      viewport: { width: 1280, height: 800 },
      // Set user agent to avoid headless detection
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });

    // Inject scripts to hide automation
    if (this.context) {
      await this.context.addInitScript(() => {
        // Overwrite navigator.webdriver
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
      });
    }

    this.page = await this.context.newPage();

    // Auto-save logic is less critical with persistent context, but still good for export
    this.context.on("page", (page) => {
      page.on("close", () => this.saveState());
    });
  }

  async getPage(): Promise<Page> {
    if (!this.page || this.page.isClosed()) {
      if (!this.context) await this.init();
      else this.page = await this.context!.newPage();
    }
    return this.page!;
  }

  async saveState() {
    if (this.context) {
      const statePath = path.join(this.authDir, "state.json");
      await this.context.storageState({ path: statePath });
      // console.log(`[RedBook] Session state saved to ${statePath}`);
    }
  }

  async close() {
    await this.saveState();
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
      this.browser = null; // Browser is managed by context in persistent mode
    }
  }
}
