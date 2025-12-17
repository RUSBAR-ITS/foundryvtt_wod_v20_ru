/* eslint-disable no-console */

/**
 * RU SHEET WIDTH PATCH
 *
 * Responsibility:
 * - Apply RU-specific language class normalization on Actor Sheets.
 * - Ensure ONLY langRU is present when game language is "ru".
 * - Never interfere with non-RU languages.
 *
 * Logging:
 * - Uses shared logger from scripts/logger/core.js
 * - All logs are gated by module debug setting
 * - Uses namespaced debug logger (debugNs)
 */

import {
  warn,
  safe,
  classString,
  debugNs
} from "./logger/core.js";

const NS = "ru-width";

const LANG_CLASS = "langRU";
const LANG_CLASS_RE = /^lang[A-Z]{2}$/;

// RU always disables splat fonts for readability.
// This is a system-supported class (used by WoD20 sheets/CSS).
const NO_SPLAT_CLASS = "noSplatFont";

/**
 * Resolve active language in a safe and tolerant way.
 * game.i18n.lang is authoritative, but we fallback to <html lang>.
 */
function getLang() {
  return (
    safe(() => game.i18n?.lang, null) ??
    document.documentElement?.lang ??
    "en"
  );
}

/**
 * Extract the root HTML element of an application render.
 */
function getRootElement(app, html) {
  return app?.element?.[0] ?? html?.[0] ?? null;
}

/**
 * Safe computed style getter.
 */
function computed(el, prop) {
  try {
    if (!el) return null;
    return getComputedStyle(el).getPropertyValue(prop);
  } catch {
    return null;
  }
}

/**
 * Snapshot relevant classes/styles for debugging.
 */
function snapshotSheet(app, root) {
  const inner = root?.querySelector?.(".sheet-inner-area") ?? null;

  return {
    title: app?.title ?? null,
    sheetClass: app?.constructor?.name ?? null,
    appId: app?.appId ?? null,
    root: {
      classString: classString(root),
      computed: {
        width: computed(root, "width"),
        minWidth: computed(root, "min-width"),
        height: computed(root, "height"),
        minHeight: computed(root, "min-height")
      }
    },
    sheetInnerArea: inner
      ? {
          computed: {
            width: computed(inner, "width"),
            minWidth: computed(inner, "min-width")
          }
        }
      : null,
    nodes: {
      hasSheetInnerArea: Boolean(inner)
    }
  };
}

/**
 * Normalize language classes for RU.
 * Removes any existing langXX (langEN/langDE/...) and applies langRU.
 */
function normalizeLangClassesForRU(root) {
  const removed = [];

  for (const cls of Array.from(root.classList)) {
    if (LANG_CLASS_RE.test(cls) && cls !== LANG_CLASS) {
      root.classList.remove(cls);
      removed.push(cls);
    }
  }

  root.classList.add(LANG_CLASS);
  return removed;
}

/**
 * Ensure the global document language class is consistent with current Foundry language.
 *
 * Goal:
 * - When language is "ru": enforce ONLY langRU among langXX classes on <html>.
 * - When language is not "ru": remove langRU from <html> but do not touch any other classes.
 */
function syncDocumentLangClass() {
  const lang = getLang();
  const root = document.documentElement;
  if (!root) return;

  if (lang === "ru") {
    const removed = normalizeLangClassesForRU(root);
    if (removed.length) {
      debugNs(NS, "normalized <html> language classes", { removed });
    }
  } else if (root.classList.contains(LANG_CLASS)) {
    root.classList.remove(LANG_CLASS);
    debugNs(NS, "removed langRU from <html> (non-RU language)", { lang });
  }
}

// Keep global <html> language class in sync.
Hooks.once("ready", () => {
  syncDocumentLangClass();
});

// Some UI pieces render without ActorSheet hooks; keep <html> synced whenever apps render.
Hooks.on("renderApplication", () => {
  syncDocumentLangClass();
});

/**
 * Main hook: applied on every ActorSheet render.
 */
Hooks.on("renderActorSheet", (app, html) => {
  const lang = getLang();
  const shouldApply = lang === "ru";

  const root = getRootElement(app, html);
  if (!root) {
    warn("[ru-width] renderActorSheet without root element", {
      sheetClass: app?.constructor?.name ?? null,
      title: app?.title ?? null
    });
    return;
  }

  // Always keep <html> in sync too (ActorSheet render is a safe additional sync point).
  syncDocumentLangClass();

  // Never touch non-RU sheets.
  if (!shouldApply) return;

  // Make sure sheet root has ONLY langRU among langXX.
  const removed = normalizeLangClassesForRU(root);

  // Disable splat fonts for RU readability.
  if (!root.classList.contains(NO_SPLAT_CLASS)) {
    root.classList.add(NO_SPLAT_CLASS);
  }

  debugNs(NS, "applied langRU normalization on ActorSheet", {
    removed,
    title: app?.title ?? null,
    sheetClass: app?.constructor?.name ?? null
  });

  const snap = snapshotSheet(app, root);

  if (shouldApply && !snap.nodes.hasSheetInnerArea) {
    warn("[ru-width] .sheet-inner-area not found", {
      sheetClass: snap.sheetClass,
      title: snap.title,
      classes: snap.root.classString
    });
  }

  debugNs(NS, "sheet snapshot", snap);
});
