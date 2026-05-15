/**
 * @param {import('playwright').Page} page
 * @param {import('./types.js').AppConfig} config
 */
export async function navigateToCourt(page, config) {
  const base = config.baseUrl.replace(/\/$/, "");

  await page.goto(`${base}/apps`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const appsLink = page.getByRole("link", { name: /baze sportive/i });
  await appsLink.waitFor({ state: "visible", timeout: 60_000 });
  await appsLink.click();

  await page.waitForURL(/\/sport\/select/, { timeout: 30_000 });

  const courtLink = page.getByRole("link", { name: new RegExp(config.courtLinkText, "i") });
  await courtLink.waitFor({ state: "visible", timeout: 30_000 });
  await courtLink.click();

  const spacePath = config.sportSpacePath.replace(/^\//, "");
  await page.waitForURL(new RegExp(spacePath.replace(/\//g, "\\/")), {
    timeout: 30_000,
  });

  await page.waitForLoadState("networkidle").catch(() => {});

  const { waitForSchedule } = await import("./reservation.js");
  await waitForSchedule(page);

  console.log(`[nav] Pe pagina terenului: ${page.url()}`);
}

/**
 * Deschide site-ul daca pagina e inca goala (about:blank).
 * @param {import('playwright').Page} page
 * @param {import('./types.js').AppConfig} config
 */
export async function openSiteHome(page, config) {
  const base = config.baseUrl.replace(/\/$/, "");
  const url = page.url();

  if (!url.includes("rezervari.upt.ro")) {
    console.log("[nav] Deschid", `${base}/apps`);
    await page.goto(`${base}/apps`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByText(/BookingApp|Aplicații|Se încarcă/i).first().waitFor({
      state: "visible",
      timeout: 60_000,
    }).catch(() => {});
    await page.waitForTimeout(1500);
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {import('./types.js').AppConfig} config
 */
export async function isLoggedIn(page, config) {
  await openSiteHome(page, config);

  const hint = config.studentNameHint;
  const toolbar = page.locator("mat-toolbar, header, nav").first();
  const toolbarText = (await toolbar.textContent().catch(() => "")) ?? "";
  const bodyText = (await page.locator("body").textContent().catch(() => "")) ?? "";
  const combined = `${toolbarText} ${bodyText}`.toUpperCase();

  const loggedIn = combined.includes(hint.toUpperCase());
  if (!loggedIn) {
    console.log(`[auth] Nu am gasit "${hint}" pe ${page.url()}`);
    if (/login|autentific|sign.?in/i.test(combined) || page.url().includes("login")) {
      console.log("[auth] Pare pagina de login — ruleaza: npm run login");
    }
  }
  return loggedIn;
}
