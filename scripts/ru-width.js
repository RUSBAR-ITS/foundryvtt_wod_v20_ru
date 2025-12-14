/* eslint-disable no-console */

/**
 * RU SHEET WIDTH PATCH
 *
 * - Adds langRU class to WoD20 actor sheets when Foundry UI language is ru.
 * - Logs are readable in saved console exports:
 *   - One-line summary (always when debug enabled)
 *   - JSON details (always when debug enabled)
 */

const MOD_ID = "foundryvtt_wod_v20_ru";
const TAG = "[wod-v20-ru][ru-width]";
const LANG_CLASS = "langRU";

function now() {
  try {
    const t = (globalThis.performance?.now?.() ?? 0).toFixed(1);
    return `t+${t}ms`;
  } catch {
    return "t+?";
  }
}

function enabled() {
  try {
    return !!game.settings.get(MOD_ID, "debugLogging");
  } catch {
    return false;
  }
}

function info(msg, data) {
  if (!enabled()) return;
  if (data === undefined) {
    console.info(`${TAG} ${now()} ${msg}`);
    return;
  }
  let json = "";
  try {
    json = JSON.stringify(data);
  } catch {
    json = String(data);
  }
  console.info(`${TAG} ${now()} ${msg} ${json}`);
}

function warn(msg, data) {
  if (!enabled()) return;
  let json = "";
  try {
    json = data === undefined ? "" : JSON.stringify(data);
  } catch {
    json = String(data);
  }
  console.warn(`${TAG} ${now()} ${msg}${json ? " " + json : ""}`);
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
    windowContent: content
      ? {
          computed: {
            width: computed(content, "width"),
            overflow: computed(content, "overflow")
          }
        }
      : null,
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

Hooks.on("renderActorSheet", (app, html) => {
  const lang = getLang();
  const shouldApply = lang === "ru";

  const root = getRootElement(app, html);
  if (!root) {
    warn("renderActorSheet: no root element", { sheetClass: app?.constructor?.name, title: safe(() => app?.title) });
    return;
  }

  const had = root.classList.contains(LANG_CLASS);

  if (shouldApply) root.classList.add(LANG_CLASS);
  else root.classList.remove(LANG_CLASS);

  const has = root.classList.contains(LANG_CLASS);

  const snap = takeSnapshot(app, root);

  // Readable one-liner for saved logs:
  info(
    "Applied language class",
    {
      lang,
      shouldApply,
      had,
      has,
      sheetClass: snap.sheetClass,
      title: snap.title,
      appId: snap.appId,
      actorName: snap.actorName,
      actorType: snap.actorType,
      rootWidth: snap.root.computed.width,
      innerWidth: snap.sheetInnerArea?.computed?.width ?? null,
      classes: snap.root.classString
    }
  );

  // Optional warning if inner area not found (helps when sheet differs)
  if (shouldApply && !snap.nodes.hasSheetInnerArea) {
    warn("No .sheet-inner-area found; CSS may need additional selectors", {
      sheetClass: snap.sheetClass,
      title: snap.title,
      classes: snap.root.classString
    });
  }

  // Full snapshot as JSON (still readable)
  info("Sheet snapshot", snap);
});
