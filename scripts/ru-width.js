/* eslint-disable no-console */

/**
 * RU SHEET WIDTH PATCH
 *
 * Goal:
 * - When Foundry UI language is ru, ensure sheet root has ONLY langRU language class
 *   (remove langEN/langDE/etc) to avoid CSS conflicts.
 * - Keep behavior non-invasive for other languages: do not touch their classes.
 *
 * Logging:
 * - Controlled by module setting: game.settings.get(MOD_ID, "debugLogging")
 * - Logs are JSON-stringified to be readable in exported console logs.
 */

const MOD_ID = "foundryvtt_wod_v20_ru";
const TAG = "[wod-v20-ru][ru-width]";
const LANG_CLASS = "langRU";
const LANG_CLASS_RE = /^lang[A-Z]{2}$/;

function now() {
  try {
    const t = (globalThis.performance?.now?.() ?? 0).toFixed(1);
    return `t+${t}ms`;
  } catch {
    return "t+?";
  }
}

function debugEnabled() {
  try {
    return !!game.settings.get(MOD_ID, "debugLogging");
  } catch {
    return false;
  }
}

function log(level, msg, data) {
  if (!debugEnabled()) return;

  const prefix = `${TAG} ${now()} ${msg}`;
  if (data === undefined) {
    console[level](prefix);
    return;
  }

  let json = "";
  try {
    json = JSON.stringify(data);
  } catch {
    json = String(data);
  }
  console[level](`${prefix} ${json}`);
}

function info(msg, data) {
  log("info", msg, data);
}

function warn(msg, data) {
  log("warn", msg, data);
}

function safe(fn, fallback = undefined) {
  try {
    return fn();
  } catch (e) {
    warn("safe() caught", { err: String(e) });
    return fallback;
  }
}

function getLang() {
  return safe(() => game.i18n?.lang, document.documentElement?.lang) ?? document.documentElement?.lang ?? "en";
}

function getRootElement(app, html) {
  return app?.element?.[0] ?? html?.[0] ?? null;
}

function classString(el) {
  if (!el) return "";
  try {
    return Array.from(el.classList).join(" ");
  } catch {
    return "";
  }
}

function computed(el, prop) {
  try {
    if (!el) return null;
    return getComputedStyle(el).getPropertyValue(prop);
  } catch {
    return null;
  }
}

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

function normalizeLangClassesForRU(root) {
  const removed = [];

  // Remove any existing langXX class to avoid conflicts (langEN, langDE, etc)
  for (const cls of Array.from(root.classList)) {
    if (LANG_CLASS_RE.test(cls) && cls !== LANG_CLASS) {
      root.classList.remove(cls);
      removed.push(cls);
    }
  }

  // Ensure langRU exists
  root.classList.add(LANG_CLASS);

  return removed;
}

Hooks.on("renderActorSheet", (app, html) => {
  const lang = getLang();
  const shouldApply = lang === "ru";

  const root = getRootElement(app, html);
  if (!root) {
    warn("renderActorSheet: no root element", { sheetClass: app?.constructor?.name, title: safe(() => app?.title) });
    return;
  }

  const hadLangRU = root.classList.contains(LANG_CLASS);
  const beforeClasses = classString(root);

  let removedLangClasses = [];
  if (shouldApply) {
    removedLangClasses = normalizeLangClassesForRU(root);
  } else {
    // Do not touch non-RU languages.
  }

  const afterClasses = classString(root);
  const hasLangRU = root.classList.contains(LANG_CLASS);

  const snap = takeSnapshot(app, root);

  info("Applied language class", {
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
    warn("No .sheet-inner-area found; CSS may need additional selectors", {
      sheetClass: snap.sheetClass,
      title: snap.title,
      classes: snap.root.classString
    });
  }

  info("Sheet snapshot", snap);
});
