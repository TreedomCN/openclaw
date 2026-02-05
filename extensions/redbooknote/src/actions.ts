import { Page } from "playwright";
import qrcode from "qrcode-terminal";

export interface NoteContent {
  title: string;
  body: string;
  images: string[];
}

export async function ensureLogin(page: Page, log: (msg: string) => void) {
  log("Checking login status...");
  await page.goto("https://www.xiaohongshu.com/explore");

  // Wait a bit for page load
  try {
    // Check for user avatar or specific logged-in element
    // Note: Selectors might change. ".user-side-content" or ".user-avatar" are common guesses.
    // Let's try to wait for a known logged-in indicator or login button.
    const loginButton = page.locator(".login-btn");
    const avatar = page.locator(".user-side-content"); // Sidebar avatar in explore

    // Quick race to see if we are logged in
    const isLoggedIn = await Promise.race([
      avatar.waitFor({ timeout: 5000 }).then(() => true),
      loginButton.waitFor({ timeout: 5000 }).then(() => false),
    ]).catch(() => false);

    if (isLoggedIn) {
      log("Already logged in.");
      return true;
    }
  } catch (e) {
    // ignore timeout
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
  await page.goto("https://creator.xiaohongshu.com/publish/publish");

  // Upload images
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(content.images);

  // Wait for upload (check for preview)
  await page.waitForSelector(".preview-item", { timeout: 30000 });

  // Fill title
  const titleInput = page.locator('input[placeholder*="标题"]');
  await titleInput.fill(content.title);

  // Fill body
  const bodyInput = page.locator(".post-content"); // Content editable div or textarea
  // Note: Editors can be tricky.
  await bodyInput.fill(content.body);

  // Click publish
  const publishBtn = page.getByText("发布", { exact: true });
  await publishBtn.click();

  await page.waitForURL("**/success", { timeout: 30000 });
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
