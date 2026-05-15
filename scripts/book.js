import { launchBrowser, closeBrowser } from "../src/browser.js";
import { loadConfig } from "../src/config.js";
import { isLoggedIn, navigateToCourt } from "../src/navigate.js";
import { checkFacultyLimit } from "../src/notifications.js";
import { bookFirstAvailable } from "../src/reservation.js";
import {
  ensureRunAllowed,
  getPollIntervalMs,
  isSundayCriticalWindow,
} from "../src/scheduler.js";

const config = loadConfig();
const runNow = process.argv.includes("--now");

console.log("=== GRS — Rezervare automata ===");
console.log(`Teren: ${config.courtLinkText} (${config.sportSpacePath})`);
console.log(
  `Mod: ${runNow ? "TEST (--now)" : `Duminica ${config.sundayWindow.start}-${config.sundayWindow.end}`}`,
);
console.log(`Limita facultate: ${config.onFacultyLimit ?? "stop"}\n`);

const { context, page } = await launchBrowser(config);

try {
  console.log("[book] Deschid site-ul...\n");

  if (!(await isLoggedIn(page, config))) {
    console.error("[eroare] Nu esti logat. Ruleaza: npm run login");
    process.exit(1);
  }

  if (!runNow) {
    await ensureRunAllowed(false, config.sundayWindow);
  }

  await navigateToCourt(page, config);

  const endTime = runNow
    ? Date.now() + 5 * 60_000
    : getSundayEndTimestamp(config.sundayWindow);

  let booked = false;
  let facultyStopped = false;

  while (!booked && Date.now() < endTime) {
    const limitEarly = await checkFacultyLimit(page, config);
    if (limitEarly?.stop) {
      facultyStopped = true;
      break;
    }

    const result = await bookFirstAvailable(page, config);

    if (result.ok) {
      console.log(
        `\n[SUCCES] Rezervat: ${result.day} ${result.slot} (via ${result.via})`,
      );
      booked = true;
      break;
    }

    if (result.stop) {
      facultyStopped = true;
      break;
    }

    const interval = result.slowPollMs ?? getPollIntervalMs(config, runNow);

    if (!runNow && !isSundayCriticalWindow(config.sundayWindow)) {
      console.log("[book] In afara ferestrei critice, opresc.");
      break;
    }

    if (result.slowPollMs) {
      console.log(`[book] Limita facultate — astept ${interval / 1000}s inainte de retry...`);
    } else {
      console.log(`[book] Nimic rezervat. Reincerc in ${interval / 1000}s...`);
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await sleep(interval);
  }

  if (facultyStopped) {
    console.log("\n[stop] Limita de rezervari pe facultate — bot oprit.");
    process.exit(2);
  }

  if (!booked) {
    console.log("\n[esec] Nu s-a rezervat in aceasta sesiune.");
    process.exit(1);
  }
} finally {
  await sleep(3000);
  await closeBrowser(context);
}

function getSundayEndTimestamp(window) {
  const [eh, em] = window.end.split(":").map(Number);
  const d = new Date();
  d.setHours(eh, em, 0, 0);
  return d.getTime();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
