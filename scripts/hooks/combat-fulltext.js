/* eslint-disable no-console */

/**
 * Combat table full-text restoration hook.
 *
 * Restores full weapon/armor item names and their abilities in Combat tables,
 * bypassing the Handlebars `shorten` helper output (system templates are not modified).
 *
 * Scope:
 * - RU language only.
 * - Actor sheets only.
 * - Idempotent per-row (won't rewrite the same row repeatedly on rerender).
 */

import { debugNs, safe } from "../logger/core.js";

/**
 * Resolve an Item id from a combat row.
 * System templates use `data-itemid` (not `data-item-id`) and often place it on `.dragrow`.
 */
function resolveItemId(row) {
  if (!row) return "";

  // dataset mapping:
  // data-itemid    -> dataset.itemid
  // data-item-id   -> dataset.itemId
  const direct = row.dataset?.itemid || row.dataset?.itemId;
  if (direct) return direct;

  const nested = row.querySelector("[data-itemid], [data-item-id]");
  if (!nested) return "";

  return nested.dataset?.itemid || nested.dataset?.itemId || "";
}

/**
 * Try to set text into a cell regardless of whether it contains nested spans/anchors or an input.
 */
function setCellText(cell, text) {
  if (!cell || !text) return false;

  // If the cell contains an input/textarea, update its value
  const input = cell.querySelector("input, textarea");
  if (input) {
    input.value = text;
    input.dataset.fullText = text;
    return true;
  }

  // Replace plain text
  cell.textContent = text;
  cell.dataset.fullText = text;
  return true;
}

/**
 * Compute ability label exactly like system templates:
 * - If attack.ability === "custom" => getSecondaryAbility("custom", actor, secondaryabilityid)
 * - else => localize(getAbility(ability, actor))
 */
function computeAttackAbilityLabel(item, actor) {
  const ability = item?.system?.attack?.ability ?? "";
  const secondaryId = item?.system?.attack?.secondaryabilityid ?? "";

  const hb = globalThis.Handlebars;
  const helpers = hb?.helpers ?? {};

  // Fallbacks if helpers are not present for some reason
  const fallbackPlain = () => {
    if (!ability) return "";
    if (ability === "custom") return "";
    return String(ability);
  };

  if (!ability) return "";

  if (ability === "custom") {
    // System does NOT localize this helper in template (it returns item.system.label)
    const sec = helpers.getSecondaryAbility
      ? helpers.getSecondaryAbility(ability, actor, secondaryId)
      : "";
    return typeof sec === "string" ? sec : String(sec ?? "");
  }

  const raw = helpers.getAbility ? helpers.getAbility(ability, actor) : fallbackPlain();
  const rawStr = typeof raw === "string" ? raw : String(raw ?? "");

  // System wraps getAbility with localize()
  return game?.i18n?.localize ? game.i18n.localize(rawStr) : rawStr;
}

Hooks.on("renderActorSheet", (app, html) => {
  safe(() => {
    debugNs("combat", "renderActorSheet entered", {
      sheetClass: app?.constructor?.name ?? null,
      actorId: app?.actor?.id ?? null,
      lang: game?.i18n?.lang ?? null
    });
  });

  try {
    if (game?.i18n?.lang !== "ru") {
      safe(() => debugNs("combat", "skip: non-RU", { lang: game?.i18n?.lang ?? null }));
      return;
    }

    const actor = app?.actor;
    if (!actor) {
      safe(() => debugNs("combat", "skip: no actor"));
      return;
    }

    const root = html?.[0];
    if (!root) {
      safe(() => debugNs("combat", "skip: no root"));
      return;
    }

    const rows = root.querySelectorAll(
      ".item-row-area.combat-natural-itemlist, " +
        ".item-row-area.combat-melee-itemlist, " +
        ".item-row-area.combat-ranged-itemlist, " +
        ".item-row-area.combat-armor-itemlist"
    );

    safe(() => debugNs("combat", "rows selected", { rowsFound: rows.length }));
    if (!rows.length) return;

    let processed = 0;
    let updatedName = 0;
    let updatedAbility = 0;

    let skippedAlready = 0;
    let noItemId = 0;
    let missingItems = 0;
    let noDragRow = 0;

    rows.forEach((row) => {
      if (row.dataset.fulltextApplied === "true") {
        skippedAlready += 1;
        return;
      }

      // IMPORTANT: id is stored as data-itemid in system templates
      const itemId = resolveItemId(row);
      if (!itemId) {
        noItemId += 1;
        return;
      }

      const item = actor.items.get(itemId);
      if (!item) {
        missingItems += 1;
        return;
      }

      // In system templates, data-itemid is placed on `.dragrow`
      const dragRow =
        row.querySelector(".dragrow[data-itemid], .dragrow[data-item-id], .dragrow") ||
        row.querySelector("[data-itemid], [data-item-id]");

      if (!dragRow) {
        noDragRow += 1;
        return;
      }

      // Name (all combat templates shorten item.name)
      const nameCell = dragRow.querySelector(".width-namebox");
      if (nameCell && item.name) {
        if (setCellText(nameCell, item.name)) {
          nameCell.dataset.fullName = item.name;
          updatedName += 1;
        }
      }

      // Ability (melee/ranged/natural use item.system.attack.* and helpers)
      const abilityCell = dragRow.querySelector(".width-abilitybox");
      if (abilityCell) {
        const label = computeAttackAbilityLabel(item, actor);
        if (label) {
          if (setCellText(abilityCell, label)) {
            abilityCell.dataset.fullAbility = label;
            updatedAbility += 1;
          }
        }
      }

      row.dataset.fulltextApplied = "true";
      processed += 1;
    });

    safe(() =>
      debugNs("combat", "fulltext summary", {
        rowsFound: rows.length,
        processedRows: processed,
        updatedName,
        updatedAbility,
        skippedAlready,
        noItemId,
        missingItems,
        noDragRow,
        actorName: actor.name ?? null
      })
    );
  } catch (e) {
    console.error("[wod-v20-ru][combat] fulltext hook error", e);
  }
});
