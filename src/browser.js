import { firefox } from "playwright";
import { getProfilePath } from "./config.js";

/**
 * @param {import('./types.js').AppConfig} config
 */
export async function launchBrowser(config) {
  const userDataDir = getProfilePath(config);
  const context = await firefox.launchPersistentContext(userDataDir, {
    headless: config.headless ?? false,
    viewport: { width: 1280, height: 900 },
    locale: "ro-RO",
  });

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

/**
 * @param {import('playwright').BrowserContext} context
 */
export async function closeBrowser(context) {
  await context.close();
}
