/**
 * Notes table: render non-numeric "level" values in the Level column.
 *
 * System template (notes.html) shows Level only when (gt item.system.level 0),
 * which hides:
 * - 0 (expected)
 * - any non-numeric values (undesired for some content types)
 *
 * This hook:
 * - Runs on actor sheet render (RU language only).
 * - Finds Notes list rows (Feature list on Notes tab).
 * - Reads item.system.level from the actor item.
 * - If level is numeric > 0, outputs it.
 * - If level is a string, treats it as an i18n key:
 *   - If localization exists -> outputs localized value
 *   - If localization missing -> outputs empty (keeps cell as &nbsp;)
 * - If level is 0 / "0" / empty -> keeps it hidden.
 *
 * IMPORTANT: minimal DOM impact
 * - The hook only fills the existing `.width-valuebox` cell with plain text or "&nbsp;".
 * - It does NOT inject wrapper elements, does NOT attach observers, and does NOT store
 *   any custom references on DOM nodes.
 *
 * Timing:
 * - WoD20 system may adjust list layout after renderActorSheet.
 * - We patch after layout stabilizes using double requestAnimationFrame.
 *
 * Scope:
 * - RU language only.
 * - Actor sheets only.
 * - System templates are not modified (DOM patch only).
 */

import { debugNs, safe, error } from "../logger/core.js";

const NS = "notes-level";
const DATASET_ROW_PATCHED = "wodruNotesLevelPatched";

/**
 * Try to localize a string as an i18n key.
 * If localization is missing (returns the same key), return hidden.
 *
 * @param {string} key
 * @returns {{ text: string, hidden: boolean, kind: string }}
 */
function localizeOrEmpty(key) {
  const k = (key ?? "").trim();
  if (!k) return { text: "", hidden: true, kind: "empty-string" };
  if (k === "0") return { text: "", hidden: true, kind: "string-zero" };

  const localized = safe(() => game?.i18n?.localize?.(k), "");
  if (!localized || localized === k) return { text: "", hidden: true, kind: "i18n-missing" };

  return { text: localized, hidden: false, kind: "i18n" };
}

/**
 * Normalize "level" to a display string or hide it.
 * Rule: 0 is hidden.
 *
 * @param {unknown} raw
 * @returns {{ text: string, hidden: boolean, kind: string }}
 */
function normalizeLevel(raw) {
  if (raw === null || raw === undefined) return { text: "", hidden: true, kind: "nullish" };

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return { text: "", hidden: true, kind: "number<=0" };
    return { text: String(raw), hidden: false, kind: "number" };
  }

  if (typeof raw === "string") return localizeOrEmpty(raw);

  return { text: "", hidden: true, kind: "non-supported" };
}

/**
 * Run a function after system layout stabilizes.
 *
 * @param {() => void} fn
 */
function afterStableLayout(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Get the item id for a Notes row.
 *
 * @param {Element} row
 * @returns {string}
 */
function getRowItemId(row) {
  if (!row) return "";
  const drag = row.querySelector(".dragrow[data-itemid], .dragrow[data-itemId]");
  if (!drag) return "";
  return drag.getAttribute("data-itemid") || drag.getAttribute("data-itemId") || "";
}

/**
 * Find the "level" cell in a Notes row.
 *
 * @param {Element} row
 * @returns {HTMLElement|null}
 */
function getLevelCell(row) {
  const drag = row.querySelector(".dragrow");
  if (!drag) return null;

  const byClass = drag.querySelector(".width-valuebox");
  if (byClass && byClass instanceof HTMLElement) return byClass;

  const nth5 = drag.querySelector(":scope > div:nth-child(5)");
  return nth5 instanceof HTMLElement ? nth5 : null;
}

/**
 * Render cell content without changing the internal DOM structure.
 *
 * @param {HTMLElement} cell
 * @param {{ text: string, hidden: boolean }} norm
 */
function renderCell(cell, norm) {
  if (norm.hidden) {
    cell.innerHTML = "&nbsp;";
    cell.removeAttribute("title");
    return;
  }

  cell.textContent = norm.text;
  cell.setAttribute("title", norm.text);
}

/**
 * Patch Notes rows within the provided scope.
 *
 * @param {HTMLElement} scope
 * @param {any} actor
 */
function patch(scope, actor) {
  const rows = Array.from(scope.querySelectorAll(".item-row-area.feature-itemlist"));
  if (!rows.length) return { rowsFound: 0, updated: 0, skipped: 0, missingItem: 0, missingCell: 0 };

  let updated = 0;
  let skipped = 0;
  let missingItem = 0;
  let missingCell = 0;

  for (const row of rows) {
    if (row instanceof HTMLElement && row.dataset?.[DATASET_ROW_PATCHED] === "1") {
      skipped += 1;
      continue;
    }

    const itemId = getRowItemId(row);
    if (!itemId) {
      skipped += 1;
      continue;
    }

    const item = safe(() => actor?.items?.get?.(itemId), null);
    if (!item) {
      missingItem += 1;
      continue;
    }

    const raw = safe(() => item.system?.level, undefined);
    const norm = normalizeLevel(raw);

    const cell = getLevelCell(row);
    if (!cell) {
      missingCell += 1;
      continue;
    }

    const current = (cell.textContent ?? "").replace(/\u00A0/g, "").trim();
    const desired = norm.hidden ? "" : norm.text.trim();

    if (current !== desired) {
      renderCell(cell, norm);
      updated += 1;
    } else {
      if (norm.hidden && cell.innerHTML.trim() !== "&nbsp;") renderCell(cell, norm);
      skipped += 1;
    }

    if (row instanceof HTMLElement) row.dataset[DATASET_ROW_PATCHED] = "1";
  }

  return { rowsFound: rows.length, updated, skipped, missingItem, missingCell };
}

Hooks.on("renderActorSheet", (app, html) => {
  try {
    const lang = safe(() => game?.i18n?.lang, "");
    if (!lang || !lang.toLowerCase().startsWith("ru")) return;

    const actor = safe(() => app?.actor, null);
    if (!actor) return;

    const root = /** @type {HTMLElement|null} */ (html?.[0] ?? html);
    if (!root || !(root instanceof HTMLElement)) return;

    const noteTab = root.querySelector('.tab[data-tab="note"], .tab.note');
    const scope = noteTab instanceof HTMLElement ? noteTab : root;

    afterStableLayout(() => {
      const r = patch(scope, actor);
      if (r.rowsFound > 0) {
        debugNs(NS, "notes level patch done", {
          actorName: actor.name ?? null,
          rowsFound: r.rowsFound,
          updated: r.updated,
          skipped: r.skipped,
          missingItem: r.missingItem,
          missingCell: r.missingCell
        });
      }
    });
  } catch (e) {
    error(`[${NS}] hook error`, {
      err: String(e),
      stack: e?.stack ?? null
    });
  }
});
