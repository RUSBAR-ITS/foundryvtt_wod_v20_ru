/* eslint-disable no-console */

/**
 * VERY VERBOSE DEBUG LOGGER (gated by module setting)
 *
 * Fixes:
 * - Register debug hooks early enough to capture init/setup/ready.
 * - Make saved logs readable: do not rely on console object expansion.
 *
 * Design:
 * - We always register Hooks.once("init") and inside it decide whether debug is enabled.
 * - If enabled at init time, we immediately log init-state and register the rest (setup/ready/render/etc).
 * - If disabled, we only print a single short status line at ready.
 *
 * Note:
 * - This module targets Foundry V13, system sheets may be V1 and produce core warnings (not ours).
 */

const MOD_ID = "foundryvtt_wod_v20_ru";
const TAG = "[wod-v20-ru][debug]";

function now() {
  try {
    const t = (globalThis.performance?.now?.() ?? 0).toFixed(1);
    return `t+${t}ms`;
  } catch {
    return "t+?";
  }
}

function enabled() {
  // Safe: settings are registered on init by settings.js (loaded before this file).
  try {
    return !!game.settings.get(MOD_ID, "debugLogging");
  } catch {
    return false;
  }
}

function log(level, msg, data) {
  if (!enabled()) return;

  const prefix = `${TAG} ${now()} ${msg}`;
  if (data === undefined) {
    console[level](prefix);
    return;
  }

  // Make sure saved logs are readable: print a JSON string.
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

function debug(msg, data) {
  log("debug", msg, data);
}

function warn(msg, data) {
  log("warn", msg, data);
}

function error(msg, data) {
  log("error", msg, data);
}

function safe(fn, fallback = undefined) {
  try {
    return fn();
  } catch (e) {
    warn("safe() caught", { err: String(e) });
    return fallback;
  }
}

function classString(el) {
  if (!el) return "";
  try {
    return Array.from(el.classList).join(" ");
  } catch {
    return "";
  }
}

function dumpCoreState(phase) {
  info(`Core state (${phase})`, {
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
      htmlClasses: safe(() => classString(document.documentElement))
    },
    module: {
      id: MOD_ID,
      active: safe(() => game.modules?.get(MOD_ID)?.active),
      version: safe(() => game.modules?.get(MOD_ID)?.version),
      styles: safe(() => game.modules?.get(MOD_ID)?.styles),
      esmodules: safe(() => game.modules?.get(MOD_ID)?.esmodules)
    },
    debugLogging: enabled()
  });
}

function cssSanityCheck() {
  const matchedStyleSheets = [];
  const matchedLinks = [];

  const sheets = safe(() => Array.from(document.styleSheets ?? []), []);
  for (const s of sheets) {
    const href = s?.href ?? "";
    if (href.includes(`/modules/${MOD_ID}/`) || href.includes("ru-sheets.css")) matchedStyleSheets.push(href);
  }

  const links = safe(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]')), []);
  for (const l of links) {
    const href = l?.href ?? "";
    if (href.includes(`/modules/${MOD_ID}/`) || href.includes("ru-sheets.css")) matchedLinks.push(href);
  }

  info("CSS sanity check", { matchedStyleSheets, matchedLinks });
}

function patchTemplateLoaders() {
  // Optional but very useful during debugging.
  const originalGetTemplate = globalThis.getTemplate;
  if (typeof originalGetTemplate === "function") {
    globalThis.getTemplate = async function patchedGetTemplate(path, ...rest) {
      debug("getTemplate", { path });
      return originalGetTemplate.call(this, path, ...rest);
    };
    info("Patched getTemplate");
  } else {
    warn("getTemplate not found");
  }

  const originalLoadTemplates = globalThis.loadTemplates;
  if (typeof originalLoadTemplates === "function") {
    globalThis.loadTemplates = async function patchedLoadTemplates(paths, ...rest) {
      try {
        if (Array.isArray(paths)) debug("loadTemplates", { count: paths.length });
        else debug("loadTemplates", { paths: String(paths) });
      } catch (e) {
        warn("loadTemplates logging failed", { err: String(e) });
      }
      return originalLoadTemplates.call(this, paths, ...rest);
    };
    info("Patched loadTemplates");
  } else {
    warn("loadTemplates not found");
  }
}

function dumpRender(app, html) {
  const el = app?.element?.[0] ?? html?.[0] ?? null;
  const inner = el?.querySelector?.(".sheet-inner-area") ?? null;

  info("Render", {
    app: {
      class: app?.constructor?.name,
      appId: safe(() => app?.appId),
      title: safe(() => app?.title),
      template: safe(() => app?.template),
      optionsClasses: safe(() => app?.options?.classes)
    },
    element: {
      id: safe(() => el?.id),
      classString: classString(el),
      styleAttr: safe(() => el?.getAttribute?.("style"))
    },
    inner: inner
      ? {
          classString: classString(inner),
          computedWidth: safe(() => getComputedStyle(inner).width)
        }
      : null
  });
}

function registerDebugHooks() {
  // We are already inside init when this is called (see Hooks.once("init") below).

  // i18n init
  Hooks.on("i18nInit", () => {
    info("Hooks.on(i18nInit)", { lang: safe(() => game.i18n?.lang) });
  });

  // setup / ready
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

  // Errors (if fired)
  Hooks.on("error", (location, err) => {
    error("Hooks.on(error)", { location, err: String(err) });
  });

  info("Debug hooks registered");
}

// Always register init: inside we decide whether to enable the noisy hooks.
Hooks.once("init", () => {
  const on = enabled();

  // Always print one line at init if debug enabled (readable in saved log).
  if (on) {
    info("Debug logging ENABLED at init");
    dumpCoreState("init");
    patchTemplateLoaders();
    registerDebugHooks();
  }
});

// Always print a single status line at ready (even if debug disabled) so user sees the mode.
// This is intentionally minimal.
Hooks.once("ready", () => {
  const on = enabled();
  console.info(`${TAG} ${now()} Debug logging is ${on ? "ENABLED" : "DISABLED"} (toggle in module settings).`);
});
