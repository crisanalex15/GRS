/**
 * @param {string} hhmm - "09:45"
 */
function parseTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return { hours: h, minutes: m };
}

/**
 * Asteapta pana duminica in fereastra configurata.
 * @param {{ start: string, end: string }} window
 * @param {{ pollFastMs: number, pollSlowMs: number }} timing
 */
export async function waitForSundayWindow(window, timing) {
  const start = parseTime(window.start);
  const end = parseTime(window.end);

  while (true) {
    const now = new Date();
    const day = now.getDay();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const startMin = start.hours * 60 + start.minutes;
    const endMin = end.hours * 60 + end.minutes;

    if (day === 0) {
      if (minutesNow >= startMin && minutesNow <= endMin) {
        console.log("[scheduler] Fereastra critica activa (duminica).");
        return "critical";
      }
      if (minutesNow < startMin) {
        const waitMs = Math.min(
          timing.pollSlowMs,
          (startMin - minutesNow) * 60_000 - now.getSeconds() * 1000,
        );
        console.log(
          `[scheduler] Duminica — pana la ${window.start}, astept ${Math.round(waitMs / 1000)}s...`,
        );
        await sleep(Math.max(waitMs, 5_000));
        continue;
      }
      console.log("[scheduler] Fereastra duminica inchisa (dupa end).");
      return "timeout";
    }

    const daysUntilSunday = (7 - day) % 7 || 7;
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (day === 0 ? 0 : daysUntilSunday));
    nextSunday.setHours(start.hours, start.minutes, 0, 0);
    if (day === 0 && minutesNow > endMin) {
      nextSunday.setDate(nextSunday.getDate() + 7);
    }
    const ms = nextSunday.getTime() - now.getTime();
    console.log(
      `[scheduler] Nu e duminica. Urmatoarea fereastra: ${nextSunday.toLocaleString("ro-RO")}`,
    );
    await sleep(Math.min(ms, timing.pollSlowMs));
  }
}

export function isSundayCriticalWindow(window) {
  const now = new Date();
  if (now.getDay() !== 0) return false;
  const [sh, sm] = window.start.split(":").map(Number);
  const [eh, em] = window.end.split(":").map(Number);
  const m = now.getHours() * 60 + now.getMinutes();
  return m >= sh * 60 + sm && m <= eh * 60 + em;
}

/**
 * @param {boolean} runNow
 * @param {{ start: string, end: string }} window
 */
export async function ensureRunAllowed(runNow, window) {
  if (runNow) {
    console.log("[scheduler] Mod --now: sar peste asteptarea de duminica.");
    return;
  }
  const result = await waitForSundayWindow(window, {
    pollFastMs: 2000,
    pollSlowMs: 45_000,
  });
  if (result === "timeout") {
    throw new Error("Fereastra duminica s-a inchis fara rulare.");
  }
}

export function getPollIntervalMs(config, runNow) {
  if (runNow) return 3000;
  return isSundayCriticalWindow(config.sundayWindow)
    ? config.pollFastMs
    : config.pollSlowMs;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
