import { checkFacultyLimit, checkFacultyLimitAfterAction } from "./notifications.js";

/**
 * Reguli (tab = o zi, randuri cu intervale):
 * 1. Selectam tab-ul zilei -> doar .mat-tab-body-active conteaza.
 * 2. Un interval e LIBER doar daca exista buton REZERVA pe ACEEASI linie (Y) cu textul orei.
 * 3. Nu cautam in toata pagina (evita fals pozitive intre zile/ore).
 */

/** @param {string} timeSlot */
export function buildTimeRegex(timeSlot) {
  const [start, end] = timeSlot.split(/\s*-\s*/).map((s) => s.trim());
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${esc(start)}\\s*[-–—]\\s*${esc(end)}`, "i");
}

/** @param {string} day */
function dayPattern(day) {
  const patterns = {
    Luni: /luni/i,
    "Marți": /mar[tțîi]/i,
    Miercuri: /miercuri/i,
    Joi: /joi/i,
    Vineri: /vineri/i,
    "Sâmbătă": /s[aâ]mb[aă]t[aă]/i,
    "Duminică": /duminic[aă]/i,
  };
  return patterns[day] ?? new RegExp(day, "i");
}

const Y_TOLERANCE_PX = 32;

/**
 * @param {import('playwright').Page} page
 */
export async function waitForSchedule(page) {
  await Promise.race([
    page.locator(".mat-tab-label").first().waitFor({ state: "visible", timeout: 25_000 }),
    page.locator('[role="tab"]').first().waitFor({ state: "visible", timeout: 25_000 }),
    page.getByText(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/).first().waitFor({ state: "visible", timeout: 25_000 }),
  ]).catch(() => {});

  await page.waitForTimeout(800);
}

/**
 * @param {import('playwright').Page} page
 */
async function getActiveDayPanel(page) {
  const panel = page.locator(".mat-tab-body-active").first();
  await panel.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  return panel;
}

/**
 * @param {import('playwright').Page} page
 * @param {string} dayName
 */
export async function selectDayTab(page, dayName) {
  const pat = dayPattern(dayName);
  const tab = page.locator(".mat-tab-label, [role='tab']").filter({ hasText: pat });

  if ((await tab.count()) === 0) {
    console.warn(`[scan] Tab negasit: "${dayName}"`);
    return false;
  }

  await tab.first().click();

  await page
    .locator(".mat-tab-label-active, [role='tab'][aria-selected='true']")
    .filter({ hasText: pat })
    .waitFor({ state: "visible", timeout: 8_000 })
    .catch(() => {});

  await page.waitForTimeout(600);
  return true;
}

/**
 * @param {import('playwright').Locator} panel
 */
function reserveButtons(panel) {
  return panel.getByRole("button", { name: /REZERV/i });
}

/**
 * Eticheta orei (cel mai mic element vizibil — evita parinti mari).
 * @param {import('playwright').Locator} panel
 * @param {string} timeSlot
 */
async function findTimeLabel(panel, timeSlot) {
  const timeRe = buildTimeRegex(timeSlot);
  const candidates = panel.getByText(timeRe);

  let best = null;
  let bestArea = Infinity;

  for (let i = 0; i < (await candidates.count()); i++) {
    const el = candidates.nth(i);
    if (!(await el.isVisible())) continue;

    const box = await el.boundingBox();
    if (!box) continue;

    const area = box.width * box.height;
    if (area < bestArea) {
      bestArea = area;
      best = el;
    }
  }

  return best;
}

/** @param {import('playwright').Locator} el */
async function centerY(el) {
  const box = await el.boundingBox();
  if (!box) return null;
  return box.y + box.height / 2;
}

/**
 * Buton REZERVA apartine acestui interval daca:
 * - e pe aceeasi linie (Y)
 * - e la dreapta etichetei orei
 * - Y-ul butonului e mai aproape de aceasta ora decat de celelalte intervale
 *
 * @param {import('playwright').Locator} panel
 * @param {string} timeSlot
 * @param {string[]} allTimeSlots
 */
async function findReserveButtonOnSameRow(panel, timeSlot, allTimeSlots) {
  const timeEl = await findTimeLabel(panel, timeSlot);
  if (!timeEl) return null;

  const timeBox = await timeEl.boundingBox();
  const timeY = await centerY(timeEl);
  if (!timeBox || timeY === null) return null;

  const otherCenters = [];
  for (const other of allTimeSlots) {
    if (other === timeSlot) continue;
    const otherEl = await findTimeLabel(panel, other);
    if (!otherEl) continue;
    const y = await centerY(otherEl);
    if (y !== null) otherCenters.push(y);
  }

  const buttons = reserveButtons(panel);
  for (let i = 0; i < (await buttons.count()); i++) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible())) continue;

    const btnBox = await btn.boundingBox();
    if (!btnBox) continue;

    const btnY = btnBox.y + btnBox.height / 2;
    if (Math.abs(btnY - timeY) > Y_TOLERANCE_PX) continue;
    if (btnBox.x < timeBox.x + 40) continue;

    const closerToOther = otherCenters.some(
      (oy) => Math.abs(btnY - oy) < Math.abs(btnY - timeY),
    );
    if (closerToOther) continue;

    return btn;
  }

  return null;
}

/**
 * @param {import('playwright').Locator} panel
 * @param {string} timeSlot
 */
async function describeOccupiedRow(panel, timeSlot) {
  const timeEl = await findTimeLabel(panel, timeSlot);
  if (!timeEl) return "interval negasit";

  const timeBox = await timeEl.boundingBox();
  if (!timeBox) return "ocupat";

  const panelText = (await panel.textContent()) ?? "";
  const timeRe = buildTimeRegex(timeSlot);
  const lines = panelText.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (!timeRe.test(line)) continue;
    const rest = line.replace(timeRe, "").replace(/REZERVĂ|REZERVA/gi, "").trim();
    if (rest.length > 1 && rest.length < 60) {
      return `ocupat (${rest})`;
    }
  }

  return "ocupat / fara REZERVA";
}

/**
 * @param {import('playwright').Page} page
 * @param {string} dayName
 * @param {string} timeSlot
 */
export async function inspectSlot(page, dayName, timeSlot, allTimeSlots) {
  if (!(await selectDayTab(page, dayName))) {
    return { available: false, status: "tab zi negasit" };
  }

  const panel = await getActiveDayPanel(page);
  const btn = await findReserveButtonOnSameRow(panel, timeSlot, allTimeSlots);

  if (btn) {
    return { available: true, status: "REZERVA disponibil", button: btn };
  }

  const timeEl = await findTimeLabel(panel, timeSlot);
  if (!timeEl) {
    return { available: false, status: "interval negasit in pagina" };
  }

  return { available: false, status: await describeOccupiedRow(panel, timeSlot) };
}

/**
 * @param {import('playwright').Page} page
 * @param {string} dayName
 * @param {string} timeSlot
 */
export async function scanSlot(page, dayName, timeSlot, allTimeSlots) {
  return (await inspectSlot(page, dayName, timeSlot, allTimeSlots)).available;
}

/**
 * @param {import('playwright').Page} page
 * @param {string} dayName
 * @param {string} timeSlot
 * @param {string} studentNameHint
 */
export async function tryReserve(page, dayName, timeSlot, allTimeSlots, config) {
  const limitBefore = await checkFacultyLimit(page, config);
  if (limitBefore?.stop) {
    return { ok: false, reason: "faculty_limit", stop: true };
  }

  const result = await inspectSlot(page, dayName, timeSlot, allTimeSlots);

  if (!result.available || !result.button) {
    return { ok: false, reason: result.status, slowPollMs: limitBefore?.slowPollMs };
  }

  console.log(`[book] REZERVA: ${dayName} @ ${timeSlot}`);

  const responsePromise = page
    .waitForResponse(
      (r) =>
        r.url().includes("/api/SportReservation/Add") &&
        r.request().method() === "POST",
      { timeout: 20_000 },
    )
    .catch(() => null);

  await result.button.click();

  const limitAfter = await checkFacultyLimitAfterAction(page, config);
  if (limitAfter?.stop) {
    return { ok: false, reason: "faculty_limit", stop: true };
  }
  if (limitAfter?.slowPollMs) {
    return { ok: false, reason: "faculty_limit", slowPollMs: limitAfter.slowPollMs };
  }

  const response = await responsePromise;
  if (response?.ok()) {
    const body = await response.json().catch(() => ({}));
    if (body?.message && /maxim de rezerv/i.test(String(body.message))) {
      const limit = await checkFacultyLimit(page, config);
      if (limit?.stop) return { ok: false, reason: "faculty_limit", stop: true };
    }
    console.log(`[book] API OK — id: ${body.id ?? "?"}`);
    return { ok: true, via: "api", body };
  }

  if (response && !response.ok()) {
    const errBody = await response.json().catch(() => ({}));
    if (/maxim de rezerv/i.test(JSON.stringify(errBody))) {
      const limit = await checkFacultyLimit(page, config);
      return {
        ok: false,
        reason: "faculty_limit",
        stop: limit?.stop ?? true,
        slowPollMs: limit?.slowPollMs,
      };
    }
  }

  await page.waitForTimeout(1500);
  if (await verifyReservationOnPage(page, config.studentNameHint, timeSlot)) {
    return { ok: true, via: "ui" };
  }

  return { ok: false, reason: "click_fara_confirmare" };
}

/**
 * @param {import('playwright').Page} page
 * @param {string} nameHint
 * @param {string} timeSlot
 */
export async function verifyReservationOnPage(page, nameHint, timeSlot) {
  const hasDelete = (await page.getByRole("button", { name: /ȘTERGE|STERGE/i }).count()) > 0;
  const bodyText = (await page.locator("body").textContent()) ?? "";
  return (
    hasDelete &&
    bodyText.toUpperCase().includes(nameHint.toUpperCase()) &&
    bodyText.includes(timeSlot.split(" ")[0])
  );
}

/**
 * @param {import('playwright').Page} page
 * @param {import('./types.js').AppConfig} config
 */
export async function scanAllPriorities(page, config) {
  await waitForSchedule(page);

  const limit = await checkFacultyLimit(page, config);
  if (limit) {
    console.log(
      "[scan] ATENTIE: limita facultatii e deja atinsa — REZERVA din calendar poate fi inselatoare.\n",
    );
  }

  const found = [];
  console.log(`[scan] Zile: ${config.dayPriority.join(" | ")}\n`);

  for (const day of config.dayPriority) {
    if (!(await selectDayTab(page, day))) {
      for (const timeSlot of config.timeSlots) {
        console.log(`[scan] ${day} | ${timeSlot} => tab zi negasit`);
      }
      console.log("");
      continue;
    }

    const panel = await getActiveDayPanel(page);

    for (const timeSlot of config.timeSlots) {
      const btn = await findReserveButtonOnSameRow(panel, timeSlot, config.timeSlots);

      if (btn) {
        console.log(`[scan] ${day} | ${timeSlot} => REZERVA disponibil`);
        found.push({ day, slot: timeSlot });
      } else {
        const status = await describeOccupiedRow(panel, timeSlot);
        console.log(`[scan] ${day} | ${timeSlot} => ${status}`);
      }
    }
    console.log("");
  }

  return found;
}

/**
 * @param {import('playwright').Page} page
 * @param {import('./types.js').AppConfig} config
 */
export async function bookFirstAvailable(page, config) {
  const limitStart = await checkFacultyLimit(page, config);
  if (limitStart?.stop) {
    return { ok: false, reason: "faculty_limit", stop: true };
  }

  let slowPollMs = limitStart?.slowPollMs;

  for (const day of config.dayPriority) {
    for (const slot of config.timeSlots) {
      const result = await tryReserve(page, day, slot, config.timeSlots, config);

      if (result.stop) {
        return { ok: false, reason: "faculty_limit", stop: true };
      }
      if (result.slowPollMs) {
        slowPollMs = result.slowPollMs;
        continue;
      }
      if (result.ok) {
        return { ...result, day, slot };
      }
    }
  }

  return { ok: false, slowPollMs };
}
