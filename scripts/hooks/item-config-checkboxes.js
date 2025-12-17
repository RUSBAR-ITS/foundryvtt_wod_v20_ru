/* eslint-disable no-console */

/**
 * Item config (RU): make checkbox groups vertical in item sheets.
 *
 * Targets:
 * - Ranged Weapon: fire mode checkboxes (reload/burst/fullauto/spray)
 * - Armor: forms/shapes checkboxes (homid/glabro/crinos/hispo/lupus)
 *
 * We do NOT override system templates. Instead, we restructure the DOM on render.
 * The CSS is scoped to RU only and applies a vertical list layout.
 */

import { safe, warn, debugNs } from "../logger/core.js";

const NS = "ru-item-config";

const CLASS_INFOBOX = "wodru-checkbox-infobox";
const CLASS_LIST = "wodru-checkbox-list";
const CLASS_ROW = "wodru-checkbox-row";
const CLASS_LABEL = "wodru-checkbox-label";

function isRu() {
  return safe(() => game.i18n?.lang === "ru", false);
}

/**
 * In system templates, checkboxes are written as:
 *   <input ...>LABEL</input>
 * but <input> is void in HTML, so LABEL usually becomes a text node sibling.
 *
 * This helper extracts the label text immediately following the input element
 * (text nodes only) and removes those text nodes from DOM.
 */
function extractLabelTextFromSiblings(inputEl) {
  let text = "";
  const toRemove = [];
  let n = inputEl.nextSibling;

  while (n) {
    // Stop if we reached another element node (e.g. next <input>)
    if (n.nodeType === Node.ELEMENT_NODE) break;

    if (n.nodeType === Node.TEXT_NODE) {
      text += n.textContent ?? "";
      toRemove.push(n);
    }

    n = n.nextSibling;
  }

  for (const r of toRemove) r.remove();
  return text.trim();
}

function isAlreadyProcessed(container) {
  return Boolean(container?.classList?.contains(CLASS_LIST));
}

function ensureRow(container, inputEl) {
  const row = document.createElement("div");
  row.classList.add(CLASS_ROW);

  const labelText = extractLabelTextFromSiblings(inputEl);

  const labelSpan = document.createElement("span");
  labelSpan.classList.add(CLASS_LABEL);
  labelSpan.textContent = labelText;

  row.appendChild(inputEl);
  row.appendChild(labelSpan);

  container.appendChild(row);
}

/**
 * Convert a set of checkboxes (by form "name") into a vertical list.
 *
 * Also marks the containing `.infobox` with CLASS_INFOBOX so CSS can force
 * a single-column / stacked layout (label on top, list below in the SAME column).
 */
function processGroupByNames(root, names, { containerMode = "auto" } = {}) {
  const inputs = names
    .map((name) => root.querySelector(`input[type="checkbox"][name="${name}"]`))
    .filter(Boolean);

  if (!inputs.length) return;

  const infobox = inputs[0].closest(".infobox");
  if (!infobox) return;

  // Mark this infobox so CSS can override the system's grid/two-column layout.
  infobox.classList.add(CLASS_INFOBOX);

  let container = null;

  if (containerMode === "auto") {
    // Ranged Weapon has a dedicated wrapper <div> after the label.
    const parent = inputs[0].parentElement;
    if (parent && parent !== infobox) {
      container = parent;
    } else {
      containerMode = "create";
    }
  }

  if (containerMode === "create") {
    container = document.createElement("div");
    const label = infobox.querySelector("label");

    if (label) {
      label.insertAdjacentElement("afterend", container);
    } else {
      infobox.prepend(container);
    }
  }

  if (!container) return;
  if (isAlreadyProcessed(container)) return;

  container.classList.add(CLASS_LIST);

  for (const input of inputs) {
    if (!input.isConnected) continue;
    ensureRow(container, input);
  }

  debugNs(NS, "checkbox group converted", {
    names,
    itemContainerMode: containerMode,
    infoboxClass: infobox.className
  });
}

Hooks.on("renderItemSheet", (app, html) => {
  if (!isRu()) return;

  const root = html?.[0] ?? app?.element?.[0] ?? null;
  if (!root) {
    warn("renderItemSheet without root element", {
      ns: NS,
      sheetClass: app?.constructor?.name ?? null,
      title: app?.title ?? null
    });
    return;
  }

  const itemType = safe(() => app.item?.type, "");
  if (!itemType) return;

  // Ranged Weapon: fire modes
  if (itemType === "Ranged Weapon") {
    processGroupByNames(root, [
      "system.mode.hasreload",
      "system.mode.hasburst",
      "system.mode.hasfullauto",
      "system.mode.hasspray"
    ]);
  }

  // Armor: forms/shapes (Werewolf)
  if (itemType === "Armor") {
    processGroupByNames(
      root,
      [
        "system.forms.hashomid",
        "system.forms.hasglabro",
        "system.forms.hascrinos",
        "system.forms.hashispo",
        "system.forms.haslupus"
      ],
      { containerMode: "create" }
    );
  }
});
