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
    if (this.browser) return;

    console.log(`[RedBook] Launching browser (headless=${this.headless})...`);
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const storageStatePath = path.join(this.authDir, "state.json");
    if (fs.existsSync(storageStatePath)) {
      console.log("[RedBook] Loading existing session state...");
      this.context = await this.browser.newContext({ storageState: storageStatePath });
    } else {
      console.log("[RedBook] Starting new session...");
      this.context = await this.browser.newContext();
    }

    // Auto-save state on page close or periodically
    this.context.on("page", (page) => {
      page.on("close", () => this.saveState());
    });

    this.page = await this.context.newPage();
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
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}
