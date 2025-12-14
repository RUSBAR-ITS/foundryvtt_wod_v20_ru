/* eslint-disable no-console */

/**
 * RU SHEET WIDTH PATCH
 *
 * - Adds langRU class to WoD20 actor sheets when Foundry UI language is ru.
 * - Mirrors the system's language-class approach (langDE, langFR, etc).
 * - This file MUST NOT be noisy unless debugLogging setting is enabled.
 */

const MOD_ID = "foundryvtt_wod_v20_ru";
const TAG = "[wod-v20-ru][ru-width]";
const LANG_CLASS = "langRU";

function isDebug() {
  try {
    return !!game.settings.get(MOD_ID, "debugLogging");
  } catch {
    return false;
  }
}

function now() {
  try {
    const t = (globalThis.performance?.now?.() ?? 0).toFixed(1);
    return `t+${t}ms`;
  } catch {
    return "t+?";
  }
}

function logInfo(...args) {
  if (!isDebug()) return;
  console.info(`${TAG} ${now()}`, ...args);
}

function logDebug(...args) {
  if (!isDebug()) return;
  console.debug(`${TAG} ${now()}`, ...args);
}

function logWarn(...args) {
  if (!isDebug()) return;
  console.warn(`${TAG} ${now()}`, ...args);
}

function safe(fn, fallback = undefined) {
  try {
    return fn();
  } catch (e) {
    logWarn("safe() caught", e);
    return fallback;
  }
}

function getLang() {
  // Prefer game.i18n.lang once initialized; fallback to <html lang>.
  return safe(() => game.i18n?.lang, document.documentElement?.lang) ?? document.documentElement?.lang ?? "en";
}

function getRootElement(app, html) {
  // V1 sheets: app.element is a jQuery object
  return app?.element?.[0] ?? html?.[0] ?? null;
}

function toClassString(el) {
  if (!el) return "";
  return Array.from(el.classList).join(" ");
}

function computed(el, prop) {
  try {
    if (!el) return null;
    return getComputedStyle(el).getPropertyValue(prop);
  } catch {
    return null;
  }
}

function snapshot(app, root) {
  if (!isDebug()) return;

  const inner = root?.querySelector?.(".sheet-inner-area") ?? null;
  const content = root?.querySelector?.(".window-content") ?? null;

  logDebug("Sheet snapshot:", {
    sheetClass: app?.constructor?.name,
    title: safe(() => app?.title),
    appId: safe(() => app?.appId),
    actorName: safe(() => app?.actor?.name),
    actorType: safe(() => app?.actor?.type),
    rootClasses: toClassString(root),
    rootStyleAttr: safe(() => root?.getAttribute?.("style")),
    computed: {
      rootWidth: computed(root, "width"),
      rootMinWidth: computed(root, "min-width"),
      contentWidth: computed(content, "width"),
      innerWidth: computed(inner, "width"),
      innerMinWidth: computed(inner, "min-width")
    },
    nodes: {
      root: !!root,
      windowContent: !!content,
      sheetInnerArea: !!inner
    }
  });
}

Hooks.on("renderActorSheet", (app, html) => {
  const lang = getLang();
  const shouldApply = lang === "ru";

  const root = getRootElement(app, html);
  if (!root) {
    logWarn("renderActorSheet: no root element found", { app });
    return;
  }

  const hadClass = root.classList.contains(LANG_CLASS);

  // Apply/remove language class
  if (shouldApply) root.classList.add(LANG_CLASS);
  else root.classList.remove(LANG_CLASS);

  const hasClass = root.classList.contains(LANG_CLASS);

  // Strict, readable one-liner (only in debug)
  logInfo(
    "Applied language class:",
    {
      lang,
      shouldApply,
      hadClass,
      hasClass,
      sheetClass: app?.constructor?.name,
      title: safe(() => app?.title),
      appId: safe(() => app?.appId),
      actor: safe(() => app?.actor?.name),
      actorType: safe(() => app?.actor?.type),
      rootClasses: toClassString(root)
    }
  );

  // Rich snapshot (only in debug)
  snapshot(app, root);
});
