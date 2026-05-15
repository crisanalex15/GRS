import readline from "readline";
import { launchBrowser, closeBrowser } from "../src/browser.js";
import { loadConfig } from "../src/config.js";
import { isLoggedIn } from "../src/navigate.js";

const config = loadConfig();

console.log("=== GRS — Login o singura data (Firefox) ===");
console.log("Se deschide Firefox cu profil persistent in:", config.profileDir);
console.log("1. Logheaza-te pe https://rezervari.upt.ro daca nu esti deja.");
console.log("2. Apasa ENTER aici cand vezi numele tau in header.\n");

const { context, page } = await launchBrowser(config);

await page.goto(`${config.baseUrl}/apps`, { waitUntil: "domcontentloaded" });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

await new Promise((resolve) => {
  rl.question("Apasa ENTER dupa login... ", () => {
    rl.close();
    resolve();
  });
});

const loggedIn = await isLoggedIn(page, config);
if (loggedIn) {
  console.log("[ok] Sesiune detectata. Profilul Firefox a fost salvat.");
} else {
  console.warn(
    `[warn] Nu am gasit "${config.studentNameHint}" in pagina. Verifica login-ul manual.`,
  );
}

await closeBrowser(context);
console.log("Gata. Ruleaza: npm run dry-run  sau  npm run book:now");
