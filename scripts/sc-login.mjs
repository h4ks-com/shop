#!/usr/bin/env node
// Open the Spreadconnect dashboard, wait for you to log in, save the session
// so other scripts (discover:eu, sync:sc) can talk to admin.spreadconnect.app
// without re-asking for credentials.
//
// Run with:
//   npm run sc:login
//
// Re-run whenever your session expires (typical web-app TTL — hours to days).
// The saved file lives at data/sc-dashboard-session.json and is gitignored.
// Nothing else needs to change after re-running.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.resolve(__dirname, "../data/sc-dashboard-session.json");

const LOGIN_URL = "https://login.spreadconnect.app/";
const SUCCESS_URL_PATTERN = /admin\.spreadconnect\.app/;
const LOGIN_TIMEOUT_MS = 10 * 60_000;

async function main() {
  await mkdir(path.dirname(sessionPath), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log("\nOpening Spreadconnect login page…");
  await page.goto(LOGIN_URL);

  console.log(`
A browser window just opened. Log in to your EU Spreadconnect
account. As soon as you land anywhere under admin.spreadconnect.app
this script saves the session and exits — no need to press anything.

(Window stays open up to ${Math.round(LOGIN_TIMEOUT_MS / 60_000)} minutes.)
`);

  try {
    await page.waitForURL(SUCCESS_URL_PATTERN, { timeout: LOGIN_TIMEOUT_MS });
  } catch {
    console.error("Timed out waiting for login. Did the browser get closed?");
    await browser.close();
    process.exit(1);
  }
  // Give the dashboard a moment to populate localStorage / x-auth-token after
  // the SPA hydrates on the post-login route.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2_000));

  await ctx.storageState({ path: sessionPath });
  console.log(`\nSession saved to ${sessionPath}`);
  console.log(`Closing browser. You can now run \`npm run discover:eu\`.`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
