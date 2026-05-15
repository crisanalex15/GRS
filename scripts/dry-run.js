import { launchBrowser, closeBrowser } from "../src/browser.js";
import { loadConfig } from "../src/config.js";
import { isLoggedIn, navigateToCourt } from "../src/navigate.js";
import { scanAllPriorities } from "../src/reservation.js";

const config = loadConfig();

console.log("=== GRS — Dry run (fara click REZERVA) ===\n");

const { context, page } = await launchBrowser(config);

try {
  console.log("[dry-run] Pornesc Firefox si deschid site-ul...\n");

  if (!(await isLoggedIn(page, config))) {
    console.error("\n[eroare] Nu esti logat. Ruleaza: npm run login");
    process.exit(1);
  }

  console.log("[dry-run] Sesiune OK. Navighez la teren...\n");
  await navigateToCourt(page, config);
  const found = await scanAllPriorities(page, config);

  if (found.length === 0) {
    console.log("\n[rezultat] Niciun slot cu REZERVA acum.");
  } else {
    console.log("\n[rezultat] Sloturi disponibile:", found);
  }
} finally {
  await closeBrowser(context);
}
