/* eslint-disable no-console */

/**
 * VERY VERBOSE DEBUG LOGGER (gated by setting)
 *
 * This logger is extremely noisy and should only run when:
 *   game.settings.get(MOD_ID, "debugLogging") === true
 *
 * Improvements for readability:
 * - Structured logs with consistent tags
 * - Always include class strings (not Array(n))
 * - "Important-only" snapshots per rendered window
 */

const MOD_ID = "foundryvtt_wod_v20_ru";
const TAG = "[wod-v20-ru][debug]";

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

function info(...args) {
  if (!isDebug()) return;
  console.info(`${TAG} ${now()}`, ...args);
}

function debug(...args) {
  if (!isDebug()) return;
  console.debug(`${TAG} ${now()}`, ...args);
}

function warn(...args) {
  if (!isDebug()) return;
  console.warn(`${TAG} ${now()}`, ...args);
}

function error(...args) {
  if (!isDebug()) return;
  console.error(`${TAG} ${now()}`, ...args);
}

function group(title, fn) {
  if (!isDebug()) return;
  console.groupCollapsed(`${TAG} ${now()} ${title}`);
  try {
    fn();
  } finally {
    console.groupEnd();
  }
}

function safe(fn, fallback = undefined) {
  try {
    return fn();
  } catch (e) {
    warn("safe() caught", e);
    return fallback;
  }
}

function classString(el) {
  if (!el) return "";
  return Array.from(el.classList).join(" ");
}

function dumpCoreState(phase) {
  group(`Core state (${phase})`, () => {
    info({
      foundry: {
        version: safe(() => game.version),
        release: safe(() => game.release)
      },
      system: {
        id: safe(() => game.system?.id),
        version: safe(() => game.system?.version),
        title: safe(() => game.system?.title)
      },
      world: {
        id: safe(() => game.world?.id),
        title: safe(() => game.world?.title)
      },
      user: {
        id: safe(() => game.user?.id),
        name: safe(() => game.user?.name),
        isGM: safe(() => game.user?.isGM)
      },
      i18n: {
        gameLang: safe(() => game.i18n?.lang),
        htmlLang: safe(() => document.documentElement?.lang),
        htmlClasses: safe(() => Array.from(document.documentElement.classList).join(" "))
      },
      module: {
        id: MOD_ID,
        active: safe(() => game.modules?.get(MOD_ID)?.active),
        version: safe(() => game.modules?.get(MOD_ID)?.version),
        styles: safe(() => game.modules?.get(MOD_ID)?.styles),
        esmodules: safe(() => game.modules?.get(MOD_ID)?.esmodules)
      },
      debugLogging: isDebug()
    });
  });
}

function cssSanityCheck() {
  group("CSS sanity check", () => {
    const sheets = safe(() => Array.from(document.styleSheets ?? []), []);
    const matchedSheets = [];

    for (const s of sheets) {
      const href = s?.href ?? "";
      if (href.includes(`/modules/${MOD_ID}/`) || href.includes("ru-sheets.css")) matchedSheets.push(href);
    }

    const links = safe(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]')), []);
    const matchedLinks = links
      .map((l) => l.href)
      .filter((h) => h.includes(`/modules/${MOD_ID}/`) || h.includes("ru-sheets.css"));

    info({
      matchedStyleSheets: matchedSheets,
      matchedLinkTags: matchedLinks
    });
  });
}

function patchTemplateLoaders() {
  group("Template loader patch", () => {
    const originalGetTemplate = globalThis.getTemplate;
    if (typeof originalGetTemplate === "function") {
      globalThis.getTemplate = async function patchedGetTemplate(path, ...rest) {
        debug("getTemplate:", path);
        return originalGetTemplate.call(this, path, ...rest);
      };
      info("Patched getTemplate()");
    } else {
      warn("getTemplate() not found; skipping patch");
    }

    const originalLoadTemplates = globalThis.loadTemplates;
    if (typeof originalLoadTemplates === "function") {
      globalThis.loadTemplates = async function patchedLoadTemplates(paths, ...rest) {
        try {
          if (Array.isArray(paths)) for (const p of paths) debug("loadTemplates:", p);
          else debug("loadTemplates:", String(paths));
        } catch (e) {
          warn("loadTemplates logging failed", e);
        }
        return originalLoadTemplates.call(this, paths, ...rest);
      };
      info("Patched loadTemplates()");
    } else {
      warn("loadTemplates() not found; skipping patch");
    }
  });
}

function dumpRender(app, html) {
  const el = app?.element?.[0] ?? html?.[0] ?? null;

  group(`Render ${app?.constructor?.name ?? "Unknown"} | "${safe(() => app?.title)}"`, () => {
    info({
      app: {
        class: app?.constructor?.name,
        appId: safe(() => app?.appId),
        title: safe(() => app?.title),
        position: safe(() => app?.position),
        optionsClasses: safe(() => app?.options?.classes)
      },
      element: {
        id: safe(() => el?.id),
        classString: classString(el),
        styleAttr: safe(() => el?.getAttribute?.("style"))
      }
    });

    // Optional extra nodes for sheets
    const inner = el?.querySelector?.(".sheet-inner-area") ?? null;
    if (inner) {
      info({
        sheetInnerArea: {
          classString: classString(inner),
          computedWidth: safe(() => getComputedStyle(inner).width)
        }
      });
    }
  });
}

function registerDebugHooks() {
  // Lifecycle
  Hooks.once("init", () => {
    info("Hooks.once(init)");
    dumpCoreState("init");
    patchTemplateLoaders();
  });

  Hooks.on("i18nInit", () => {
    info("Hooks.on(i18nInit)", { lang: safe(() => game.i18n?.lang) });
  });

  Hooks.once("setup", () => {
    info("Hooks.once(setup)");
    dumpCoreState("setup");
  });

  Hooks.once("ready", () => {
    info("Hooks.once(ready)");
    dumpCoreState("ready");
    cssSanityCheck();
  });

  // Render hooks
  Hooks.on("renderApplication", (app, html) => dumpRender(app, html));
  Hooks.on("renderActorSheet", (app, html) => dumpRender(app, html));
  Hooks.on("renderItemSheet", (app, html) => dumpRender(app, html));
  Hooks.on("renderDialog", (app, html) => dumpRender(app, html));
  Hooks.on("renderSettings", (app, html) => dumpRender(app, html));

  // Errors
  Hooks.on("error", (location, err) => {
    error("Hooks.on(error)", { location, err });
  });

  info("Debug hooks registered");
}

/**
 * We register a minimal watcher hook always, to show when debug mode toggles.
 * The noisy debug hooks are only registered once debug is enabled on startup.
 *
 * (We can later support live enable/disable without reload, but for now: enable -> reload.)
 */
Hooks.once("ready", () => {
  const enabled = isDebug();
  console.info(`[wod-v20-ru][debug] ${now()} Debug logging is ${enabled ? "ENABLED" : "DISABLED"} (toggle in module settings).`);

  if (enabled) registerDebugHooks();
});
