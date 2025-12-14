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
 * - Messages are prefixed logically with "RU-WIDTH"
 */

import {
  info,
  warn,
  safe,
  classString
} from "./logger/core.js";

const LANG_CLASS = "langRU";
const LANG_CLASS_RE = /^lang[A-Z]{2}$/;

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
 * Collect a detailed snapshot of the sheet state.
 * Used purely for diagnostics/logging.
 */
function takeSnapshot(app, root) {
  const inner = root?.querySelector?.(".sheet-inner-area") ?? null;
  const content = root?.querySelector?.(".window-content") ?? null;

  return {
    sheetClass: app?.constructor?.name,
    title: safe(() => app?.title),
    appId: safe(() => app?.appId),
    actorName: safe(() => app?.actor?.name),
    actorType: safe(() => app?.actor?.type),

    root: {
      classString: classString(root),
      styleAttr: safe(() => root?.getAttribute?.("style")),
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
      hasWindowContent: !!content,
      hasSheetInnerArea: !!inner
    }
  };
}

/**
 * Normalize language classes on the sheet root for RU.
 *
 * - Removes all langXX classes except langRU
 * - Ensures langRU is present
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
 * Main hook: applied on every ActorSheet render.
 */
Hooks.on("renderActorSheet", (app, html) => {
  const lang = getLang();
  const shouldApply = lang === "ru";

  const root = getRootElement(app, html);
  if (!root) {
    warn("RU-WIDTH: renderActorSheet without root element", {
      sheetClass: app?.constructor?.name,
      title: safe(() => app?.title)
    });
    return;
  }

  const hadLangRU = root.classList.contains(LANG_CLASS);
  const beforeClasses = classString(root);

  let removedLangClasses = [];
  if (shouldApply) {
    removedLangClasses = normalizeLangClassesForRU(root);
  }

  const afterClasses = classString(root);
  const hasLangRU = root.classList.contains(LANG_CLASS);
  const snap = takeSnapshot(app, root);

  info("RU-WIDTH: language class applied", {
    lang,
    shouldApply,
    hadLangRU,
    hasLangRU,
    removedLangClasses,
    beforeClasses,
    afterClasses,
    sheetClass: snap.sheetClass,
    title: snap.title,
    appId: snap.appId,
    actorName: snap.actorName,
    actorType: snap.actorType,
    rootWidth: snap.root.computed.width,
    innerWidth: snap.sheetInnerArea?.computed?.width ?? null
  });

  if (shouldApply && !snap.nodes.hasSheetInnerArea) {
    warn("RU-WIDTH: .sheet-inner-area not found", {
      sheetClass: snap.sheetClass,
      title: snap.title,
      classes: snap.root.classString
    });
  }

  info("RU-WIDTH: sheet snapshot", snap);
});
