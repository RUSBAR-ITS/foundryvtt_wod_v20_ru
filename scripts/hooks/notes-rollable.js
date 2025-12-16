/* eslint-disable no-console */

/**
 * Notes tab: enable rolling from the Notes list when `item.system.isrollable === true`.
 *
 * Problem:
 * - System template `templates/actor/parts/notes.html` does not mark Notes rows as rollable.
 * - Even if CSS shows a pointer (or we add `.vrollable`), the sheet listeners were bound
 *   earlier (during sheet render), so newly-patched nodes won't have click handlers.
 *
 * Solution:
 * - On `renderActorSheet` (RU language only), patch Notes rows:
 *   - If item.system.isrollable is true:
 *     - Add `.vrollable` to the Name cell
 *     - Add the minimal datasets expected by system roll handlers
 *     - Attach a click listener that calls the system's roll dialog handler
 *       (resolved dynamically from the sheet instance)
 * - Keep it stable with a MutationObserver (debounced) because Notes list can re-render.
 *
 * Important:
 * - Notes list uses Item type = "Feature".
 * - System ActionHelper.RollDialog has no Feature-specific dialog.
 * - However it can open the Item dialog when `dataset.object === "Item"`.
 *   Therefore we map Feature -> Item for the roll object.
 */

import { debugNs, safe, error } from "../logger/core.js";

const NS = "notes-rollables";

const DATASET_ROW_PATCHED = "wodruNotesRollPatched";
const DATASET_SCOPE_OBSERVED = "wodruNotesRollObserved";
const DATASET_SCOPE_PATCHING = "wodruNotesRollPatching";
const DATASET_CELL_BOUND = "wodruNotesRollBound";

function afterStableLayout(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Find the system roll dialog handler on the actor sheet instance.
 * We search for the first method matching /^_onRoll.*Dialog$/ (excluding Sort handlers).
 *
 * @param {any} app
 * @returns {(ev: Event) => any | null}
 */
function getRollDialogHandler(app) {
  if (!app) return null;

  const cached = safe(() => app.__wodruNotesRollDialogHandler, null);
  if (typeof cached === "function") return cached;

  /** @type {((ev: Event) => any) | null} */
  let found = null;

  let proto = app;
  for (let depth = 0; proto && depth < 6 && !found; depth += 1) {
    const names = safe(() => Object.getOwnPropertyNames(proto), []);
    for (const name of names) {
      if (!/^_onRoll.*Dialog$/.test(name)) continue;
      if (name.includes("Sort")) continue;
      const fn = safe(() => proto[name], null);
      if (typeof fn !== "function") continue;
      found = fn.bind(app);
      break;
    }
    proto = safe(() => Object.getPrototypeOf(proto), null);
  }

  try {
    Object.defineProperty(app, "__wodruNotesRollDialogHandler", {
      value: found,
      writable: true,
      configurable: true
    });
  } catch {
    // ignore
  }

  return found;
}

/**
 * notes.html puts `data-itemid` on `.dragrow`.
 *
 * @param {Element} row
 * @returns {string}
 */
function getRowItemId(row) {
  const drag = row?.querySelector?.(".dragrow[data-itemid], .dragrow[data-itemId]");
  if (!drag) return "";
  return drag.getAttribute("data-itemid") || drag.getAttribute("data-itemId") || "";
}

/**
 * Notes row structure: `.dragrow` children
 * 1 grip, 2 active, 3 name(.largeBox), 4 type(.largeBox), 5 level(.width-valuebox)
 *
 * @param {Element} row
 * @returns {HTMLElement|null}
 */
function getNameCell(row) {
  const drag = row?.querySelector?.(".dragrow");
  if (!drag) return null;
  const cell = drag.querySelector(":scope > div:nth-child(3)");
  return cell instanceof HTMLElement ? cell : null;
}

/**
 * Map Notes item type to the roll object expected by system ActionHelper.RollDialog.
 *
 * - Feature is shown in Notes list but not supported directly -> treat as Item.
 * - Other types: pass through.
 *
 * @param {any} item
 * @returns {string}
 */
function getRollObject(item) {
  const t = String(safe(() => item?.type, ""));
  if (t === "Feature") return "Item";
  return t;
}

/**
 * Patch Notes list rows inside scope.
 *
 * @param {HTMLElement} scope
 * @param {{ app: any, actor: any, reason: string }} ctx
 */
function patchNotesRollables(scope, ctx) {
  if (scope.dataset?.[DATASET_SCOPE_PATCHING] === "1") return;
  scope.dataset[DATASET_SCOPE_PATCHING] = "1";

  try {
    const rows = Array.from(scope.querySelectorAll(".item-row-area.feature-itemlist"));
    if (!rows.length) return;

    const handler = getRollDialogHandler(ctx.app);

    let patched = 0;
    let skipped = 0;
    let missingItem = 0;
    let missingCell = 0;
    let notRollable = 0;
    let noHandler = 0;

    for (const row of rows) {
      if (!(row instanceof HTMLElement)) continue;
      if (row.dataset?.[DATASET_ROW_PATCHED] === "1") {
        skipped += 1;
        continue;
      }

      const itemId = getRowItemId(row);
      if (!itemId) {
        skipped += 1;
        continue;
      }

      const item = safe(() => ctx.actor?.items?.get?.(itemId), null);
      if (!item) {
        missingItem += 1;
        continue;
      }

      if (!safe(() => item?.system?.isrollable, false)) {
        notRollable += 1;
        row.dataset[DATASET_ROW_PATCHED] = "1";
        continue;
      }

      const nameCell = getNameCell(row);
      if (!nameCell) {
        missingCell += 1;
        continue;
      }

      // Minimal dataset expected by system roll handlers.
      // IMPORTANT: for Notes/Feature we map object to "Item" so RollDialog can open Item dialog.
      nameCell.classList.add("vrollable");
      nameCell.dataset.type = String(ctx.actor?.type ?? "");
      nameCell.dataset.object = getRollObject(item);
      nameCell.dataset.rollitem = "true";
      nameCell.dataset.itemid = String(itemId);

      if (!handler) {
        noHandler += 1;
      } else if (nameCell.dataset[DATASET_CELL_BOUND] !== "1") {
        nameCell.dataset[DATASET_CELL_BOUND] = "1";
        nameCell.addEventListener("click", (ev) => {
          try {
            debugNs(NS, "notes roll click", {
              itemId,
              itemName: safe(() => item?.name, null),
              itemType: safe(() => item?.type, null),
              rollObject: safe(() => nameCell.dataset.object, null),
              actorType: safe(() => ctx.actor?.type, null),
              isRollable: safe(() => item?.system?.isrollable, null)
            });

            handler(ev);
          } catch (e) {
            error(`[${NS}] click handler error`, {
              err: String(e),
              stack: e?.stack ?? null,
              itemId
            });
          }
        });
      }

      row.dataset[DATASET_ROW_PATCHED] = "1";
      patched += 1;
    }

    debugNs(NS, "notes rollables patch done", {
      reason: ctx.reason,
      rowsFound: rows.length,
      patched,
      skipped,
      missingItem,
      missingCell,
      notRollable,
      noHandler
    });
  } finally {
    scope.dataset[DATASET_SCOPE_PATCHING] = "0";
  }
}

/**
 * Keep patch stable when Notes list is re-rendered (sorting, toggles, etc.).
 *
 * @param {HTMLElement} scope
 * @param {{ app: any, actor: any }} deps
 */
function ensureObserver(scope, deps) {
  if (scope.dataset?.[DATASET_SCOPE_OBSERVED] === "1") return;
  scope.dataset[DATASET_SCOPE_OBSERVED] = "1";

  let t = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  const observer = new MutationObserver((mutations) => {
    if (scope.dataset?.[DATASET_SCOPE_PATCHING] === "1") return;

    const meaningful = mutations.some(
      (m) => m.addedNodes.length || m.removedNodes.length || m.type === "characterData"
    );
    if (!meaningful) return;

    if (t) clearTimeout(t);
    t = setTimeout(() => {
      afterStableLayout(() => patchNotesRollables(scope, { ...deps, reason: "mutation" }));
    }, 50);
  });

  observer.observe(scope, {
    subtree: true,
    childList: true,
    characterData: true
  });

  debugNs(NS, "observer attached", {
    scopeTag: scope.tagName,
    scopeClasses: scope.className
  });
}

Hooks.on("renderActorSheet", (app, html) => {
  try {
    const lang = safe(() => game?.i18n?.lang, "");
    if (!lang || !lang.toLowerCase().startsWith("ru")) return;

    const actor = safe(() => app?.actor, null);
    if (!actor) return;

    const root = /** @type {HTMLElement|null} */ (html?.[0] ?? html);
    if (!root || !(root instanceof HTMLElement)) return;

    // Prefer Notes tab container if present, otherwise patch the whole sheet.
    const noteTab = root.querySelector('.tab[data-tab="note"], .tab.note');
    const scope = noteTab instanceof HTMLElement ? noteTab : root;

    ensureObserver(scope, { app, actor });
    afterStableLayout(() => patchNotesRollables(scope, { app, actor, reason: "render" }));
  } catch (e) {
    error(`[${NS}] hook error`, {
      err: String(e),
      stack: e?.stack ?? null
    });
  }
});
