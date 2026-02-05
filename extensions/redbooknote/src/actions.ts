import { Page } from "playwright";
import qrcode from "qrcode-terminal";

export interface NoteContent {
  title: string;
  body: string;
  images: string[];
}

export async function ensureLogin(page: Page, log: (msg: string) => void) {
  // Check login on creator platform first
  if (page.url().includes("creator.xiaohongshu.com")) {
    try {
      // Creator platform login check
      // Look for user avatar or specific creator elements
      const creatorAvatar = page.locator(".header-user-avatar");

      if (await creatorAvatar.isVisible({ timeout: 5000 }).catch(() => false)) {
        log("Logged in on Creator platform.");
        return true;
      }

      // If not logged in on creator, we might need to redirect to login
      log("Not logged in on Creator platform. Redirecting...");
      // Use waitUntil: "domcontentloaded" to avoid timeout on tracking scripts
      await page.goto("https://creator.xiaohongshu.com/login", {
        timeout: 30000,
        waitUntil: "domcontentloaded",
      });

      // Wait for manual login
      const qrCanvas = page.locator("canvas");
      if (await qrCanvas.isVisible({ timeout: 10000 }).catch(() => false)) {
        log("Please scan QR code to login to Creator platform.");

        // Wait for navigation after login
        // Increased timeout for manual scan operation
        // Also handle potential redirects or intermediate states
        await page.waitForURL("**/publish/publish", {
          timeout: 120000,
          waitUntil: "domcontentloaded",
        });
        return true;
      }
    } catch (e) {
      log(`Creator login check failed: ${e}`);
    }
  }

  log("Checking login status...");
  // Skip navigation if already on explore page to save time on restarts
  if (!page.url().includes("xiaohongshu.com/explore")) {
    try {
      await page.goto("https://www.xiaohongshu.com/explore", {
        timeout: 30000,
        waitUntil: "domcontentloaded",
      });
    } catch (e) {
      log(`Navigation failed: ${e}`);
      // Try to continue anyway, maybe page loaded partially
    }
  } else {
    log("Already on explore page, skipping navigation.");
  }

  // Wait a bit for page load
  try {
    // Check for user avatar or specific logged-in element
    // Selectors:
    // - .side-bar .user-info (Sidebar user info)
    // - .user-side-content (Old sidebar)
    // - #app .avatar (Avatar image)
    // - .login-btn (Login button)

    const loggedInSelectors = [
      ".side-bar .user-info",
      ".user-side-content",
      ".avatar-wrapper",
      "a[href*='/user/profile']",
    ];

    const loginButton = page.locator(".login-btn");

    // Check if any logged-in selector is visible
    for (const selector of loggedInSelectors) {
      if (
        await page
          .locator(selector)
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        log(`Detected logged in state via selector: ${selector}`);
        return true;
      }
    }

    // Check if login button is visible
    if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      log("Detected login button. Not logged in.");
    } else {
      // If no login button and we are on explore page, we might be logged in but selector changed.
      // Let's assume logged in if we don't see a login button explicitly
      log("No login button found. Assuming logged in.");
      return true;
    }
  } catch (e) {
    log(`Login check error: ${e}`);
  }

  log("Not logged in. Initiating login flow...");
  await page.goto("https://www.xiaohongshu.com/login");

  // Wait for QR code canvas or image
  // Selector for QR code might be canvas or img inside a specific container
  const qrSelector = "canvas";
  try {
    await page.waitForSelector(qrSelector, { timeout: 10000 });
    log("QR Code detected on page.");

    // In a real headless env, we can't easily extract QR content from canvas without client-side JS.
    // For now, we'll take a screenshot and ask user to view it,
    // OR if we can extract the URL.
    // Advanced: Execute JS to get base64 from canvas -> decode.
    // For this demo, let's assume we might need manual intervention or just wait.

    // However, the prompt asked for implementation. Let's try to be helpful.
    // Since we can't easily decode QR in pure node without heavy deps (jimp/jsqr),
    // and `qrcode-terminal` is for displaying string as QR.
    // We will save a screenshot.
    const screenshotPath = process.cwd() + "/redbook-login-qr.png";
    await page.screenshot({ path: screenshotPath });
    log(`Login QR Code saved to: ${screenshotPath}`);
    log("Please open this image and scan with your RedBook app.");
  } catch (e) {
    log("Could not find QR code element.");
  }

  // Wait for login success (URL change or avatar appearance)
  log("Waiting for login...");
  await page.waitForURL("**/explore", { timeout: 120000 });
  log("Login successful!");
  return true;
}

export async function postNote(page: Page, content: NoteContent) {
  // Use domcontentloaded to handle potential network issues or slow tracking scripts
  await page.goto("https://creator.xiaohongshu.com/publish/publish", {
    timeout: 60000,
    waitUntil: "domcontentloaded",
  });

  // Switch to Image/Text tab
  // Use a more specific selector to avoid the hidden duplicate
  // The structure shows duplicate "上传图文" tabs, one hidden with negative position.
  // We want the visible one. The parent .creator-tab doesn't have a unique class for "image/text",
  // but we can filter by visibility or index.
  // The order is Video, Image/Text (hidden), Image/Text (visible), Article.
  // So we want the 3rd tab (index 2) or filter by visibility.

  const tabs = page.locator(".header-tabs .creator-tab");
  const imageTab = tabs.filter({ hasText: "上传图文" }).locator(":visible").first();

  // Force click might still be needed if overlay exists, but specific locator is better
  // If element is outside viewport, try scrolling to it first explicitly
  // Fallback to JS click if Playwright's click fails due to viewport issues
  try {
    await imageTab.click({ force: true, timeout: 2000 });
  } catch (e) {
    // JS Click fallback
    await imageTab.evaluate((el: HTMLElement) => el.click());
  }

  // Upload images
  // The upload button doesn't have an input[type="file"] directly visible sometimes,
  // or it's handled via a button click that triggers the system dialog (which we can't control easily).
  // However, Playwright can handle file chooser events if we click the button.
  // OR, we can try to find the hidden input. Usually there is a hidden input.

  // Let's try to handle the file chooser event first, which is more robust for buttons.
  const fileChooserPromise = page.waitForEvent("filechooser");

  // Click the "上传图片" button
  // Use a specific locator based on the provided DOM
  const uploadBtn = page.locator(".upload-button").filter({ hasText: "上传图片" });
  await uploadBtn.click();

  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(content.images);

  // Wait for upload (check for preview)
  // New DOM structure: .img-upload-area .img-preview-area .img-container
  // We can wait for .img-container or img.preview
  await page.waitForSelector(".img-preview-area .img-container", { timeout: 30000 });

  // Fill title
  // Based on DOM: .d-input > input.d-text[placeholder="填写标题会有更多赞哦"]
  const titleInput = page.locator('input.d-text[placeholder*="填写标题"]');
  await titleInput.fill(content.title);

  // Fill body
  // Based on DOM: #post-textarea (div with contenteditable=true)
  // The structure shows a div with class "tiptap ProseMirror" which is the editor content.
  // We should click it first to focus, then type or fill.
  const editor = page.locator(".tiptap.ProseMirror");
  await editor.click();
  await editor.fill(content.body);

  // Click publish
  // DOM: .publish-page-publish-btn button.bg-red
  // Or filter by text "发布"
  const publishBtn = page
    .locator(".publish-page-publish-btn button.bg-red")
    .filter({ hasText: "发布" });
  await publishBtn.click();

  // Wait for success URL (either the success page or the redirect back to publish with param)
  // Use a regex to match either /publish/success OR published=true
  await page.waitForURL(/.*(\/publish\/success|published=true).*/, {
    timeout: 30000,
    waitUntil: "domcontentloaded", // Don't wait for full load, URL change is enough
  });
  return true;
}

export async function likeNote(page: Page, noteId: string) {
  const url = `https://www.xiaohongshu.com/explore/${noteId}`;
  await page.goto(url);

  // Find like button. Often has an svg icon.
  // This is fragile and depends on current class names.
  // Using aria-label is safer if available.
  const likeBtn = page.locator(".interact-container .like-wrapper");
  await likeBtn.click();
}

export async function commentNote(page: Page, noteId: string, text: string) {
  const url = `https://www.xiaohongshu.com/explore/${noteId}`;
  await page.goto(url);

  const input = page.locator(".comment-input"); // Pseudo selector
  await input.click();
  await input.fill(text);

  const sendBtn = page.locator(".comment-submit");
  await sendBtn.click();
}
