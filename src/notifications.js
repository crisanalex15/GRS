/** Mesaj snackbar UPT: limita de rezervari pe facultate. */
export const FACULTY_LIMIT_RE =
  /num[aă]rul maxim de rezerv[aă]ri.*a fost atins/i;

/**
 * @param {import('playwright').Page} page
 */
export async function isFacultyLimitReached(page) {
  const locators = [
    page.locator(".mat-snack-bar-container"),
    page.locator("snack-bar-container"),
    page.locator('[role="alert"]'),
    page.locator(".cdk-overlay-container"),
  ];

  for (const root of locators) {
    const n = await root.count();
    for (let i = 0; i < n; i++) {
      const el = root.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const text = (await el.textContent()) ?? "";
      if (FACULTY_LIMIT_RE.test(text)) return true;
    }
  }

  const inline = page.getByText(FACULTY_LIMIT_RE);
  for (let i = 0; i < (await inline.count()); i++) {
    if (await inline.nth(i).isVisible()) return true;
  }

  return false;
}

/**
 * @param {import('playwright').Page} page
 * @param {import('./types.js').AppConfig} config
 * @returns {Promise<{ stop: boolean, slowPollMs?: number } | null>}
 */
export async function checkFacultyLimit(page, config) {
  if (!(await isFacultyLimitReached(page))) return null;

  const action = config.onFacultyLimit ?? "stop";
  const slowMs = config.facultyLimitSlowPollMs ?? 5 * 60_000;

  console.log(
    "[limit] Numarul maxim de rezervari pentru facultate a fost atins (notificare site).",
  );

  if (action === "slow_poll") {
    console.log(`[limit] Pooling incetinit la ${slowMs / 1000}s (nu mai are rost click rapid).`);
    return { stop: false, slowPollMs: slowMs };
  }

  console.log("[limit] Oprire — nu se mai incearca rezervari in gol.");
  return { stop: true };
}

/**
 * Asteapta putin dupa click — snackbar-ul apare cu intarziere.
 * @param {import('playwright').Page} page
 * @param {import('./types.js').AppConfig} config
 */
export async function checkFacultyLimitAfterAction(page, config) {
  await page.waitForTimeout(900);
  return checkFacultyLimit(page, config);
}
