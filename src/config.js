import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** @returns {import('./types.js').AppConfig} */
export function loadConfig() {
  const raw = readFileSync(join(root, "config.json"), "utf-8");
  return JSON.parse(raw);
}

export function getProfilePath(config) {
  return join(root, config.profileDir);
}
