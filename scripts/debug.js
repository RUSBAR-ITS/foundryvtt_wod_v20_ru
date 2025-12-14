/* eslint-disable no-console */

/**
 * Extremely verbose debug logger for FoundryVTT + WoD20 + this module.
 * NOTE: Intentionally noisy. We'll gate it behind a setting later.
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

function safe(fn, fallback = undefined) {
  try {
    return fn();
  } catch (e) {
    console.warn(`${TAG} ${now()} safe() caught`, e);
    return fallback;
  }
}

function group(title, fn) {
  console.groupCollapsed(`${TAG} ${now()} ${title}`);
  try { fn(); } finally { console.groupEnd(); }
}

function info(...args) { console.info(`${TAG} ${now()}`, ...args); }
function warn(...args) { console.warn(`${TAG} ${now()}`, ...args); }
function error(...args) { console.error(`${TAG} ${now()}`, ...args); }
function debug(...args) { console.debug(`${TAG} ${now()}`, ...args); }

function dumpCoreState(phase) {
  group(`Core state dump (${phase})`, () => {
    info("Foundry version:", safe(() => game.version), "| Release:", safe(() => game.release));
    info("System:", safe(() => game.system?.id), safe(() => game.system?.version), safe(() => game.system?.title));
    info("World:", safe(() => game.world?.id), safe(() => game.world?.title));
    info("User:", safe(() => game.user?.id), safe(() => game.user?.name), "| isGM:", safe(() => game.user?.isGM));
    info("i18n:", "game.i18n.lang =", safe(() => game.i18n?.lang), "| html.lang =", safe(() => document.documentElement?.lang));
    info("DocumentElement classes:", safe(() => Array.from(document.documentElement.classList)));
    info("Active modules count:", safe(() => game.modules?.size), "| this enabled:", safe(() => game.modules?.get(MOD_ID)?.active));
    info("This module manifest:", safe(() => game.modules?.get(MOD_ID)?.toObject?.() ?? game.modules?.get(MOD_ID)));
  });
}

function dumpWindowClasses(app, html) {
  const el = app?.element?.[0] ?? html?.[0] ?? null;
  const classes = el ? Array.from(el.classList) : [];
  const id = el?.id ?? null;
  const title = safe(() => app?.title);
  const appId = safe(() => app?.appId);
  const position = safe(() => app?.position);

  group(`Render: ${app?.constructor?.name ?? "UnknownApp"} | title="${title}" | appId=${appId}`, () => {
    info("Element id:", id);
    info("Element classes:", classes);
    info("Element inline style:", safe(() => el?.getAttribute?.("style")));
    info("Position:", position);
    info("Options:", safe(() => app?.options));
    info("Rendered HTML root:", el);
  });
}

function dumpActorContext(app) {
  const actor = safe(() => app?.actor ?? app?.object ?? app?.document);
  if (!actor) return;
  group(`Actor context | ${safe(() => actor.name)} (${safe(() => actor.type)})`, () => {
    info("Actor id:", safe(() => actor.id));
    info("Actor system keys:", safe(() => Object.keys(actor.system ?? {})));
    info("Sheet class:", app?.constructor?.name);
    info("Sheet options.classes:", safe(() => app?.options?.classes));
    info("Sheet template:", safe(() => app?.template));
  });
}

function dumpItemContext(app) {
  const item = safe(() => app?.item ?? app?.object ?? app?.document);
  if (!item) return;
  group(`Item context | ${safe(() => item.name)} (${safe(() => item.type)})`, () => {
    info("Item id:", safe(() => item.id));
    info("Item system keys:", safe(() => Object.keys(item.system ?? {})));
    info("Sheet class:", app?.constructor?.name);
    info("Sheet options.classes:", safe(() => app?.options?.classes));
    info("Sheet template:", safe(() => app?.template));
  });
}

function logTemplateLoad(path) {
  debug("Template load:", path);
}

function patchTemplateLoaders() {
  group("Patching template loaders for logging", () => {
    const originalGetTemplate = globalThis.getTemplate;
    if (typeof originalGetTemplate === "function") {
      globalThis.getTemplate = async function patchedGetTemplate(path, ...rest) {
        logTemplateLoad(path);
        return originalGetTemplate.call(this, path, ...rest);
      };
      info("Patched global getTemplate()");
    } else {
      warn("global getTemplate() not found; skipping patch");
    }

    const originalLoadTemplates = globalThis.loadTemplates;
    if (typeof originalLoadTemplates === "function") {
      globalThis.loadTemplates = async function patchedLoadTemplates(paths, ...rest) {
        try {
          if (Array.isArray(paths)) for (const p of paths) logTemplateLoad(p);
          else logTemplateLoad(String(paths));
        } catch (e) {
          warn("loadTemplates logging failed", e);
        }
        return originalLoadTemplates.call(this, paths, ...rest);
      };
      info("Patched global loadTemplates()");
    } else {
      warn("global loadTemplates() not found; skipping patch");
    }
  });
}

function cssSanityChecks() {
  group("CSS sanity checks", () => {
    const sheets = safe(() => Array.from(document.styleSheets ?? []), []);
    const matches = [];
    for (const s of sheets) {
      const href = s?.href ?? "";
      if (!href) continue;
      if (href.includes(`/modules/${MOD_ID}/`) || href.includes("ru-sheets.css")) matches.push(href);
    }
    info("Matched stylesheets:", matches.length);
    debug(matches);
  });
}

function moduleListEnabled() {
  group("Module list (enabled only)", () => {
    const enabled = [];
    safe(() => {
      if (!game.modules) return;
      for (const m of game.modules.values()) {
        if (m?.active) enabled.push({ id: m.id, version: m.version, title: m.title });
      }
    });
    info("Enabled modules:", enabled.length);
    debug(enabled);
  });
}

function hookAll() {
  Hooks.once("init", () => {
    info("Hooks.once(init)");
    dumpCoreState("init");
    patchTemplateLoaders();
  });

  Hooks.once("setup", () => {
    info("Hooks.once(setup)");
    dumpCoreState("setup");
  });

  Hooks.once("ready", () => {
    info("Hooks.once(ready)");
    dumpCoreState("ready");
    cssSanityChecks();
    moduleListEnabled();
  });

  Hooks.on("i18nInit", () => info("Hooks.on(i18nInit) | lang =", safe(() => game.i18n?.lang)));

  Hooks.on("renderApplication", (app, html) => dumpWindowClasses(app, html));
  Hooks.on("closeApplication", (app) => debug("closeApplication:", app?.constructor?.name, "appId=", app?.appId, "title=", safe(() => app?.title)));

  Hooks.on("renderActorSheet", (app, html) => {
    dumpWindowClasses(app, html);
    dumpActorContext(app);
  });

  Hooks.on("renderItemSheet", (app, html) => {
    dumpWindowClasses(app, html);
    dumpItemContext(app);
  });

  Hooks.on("renderDialog", (app, html) => dumpWindowClasses(app, html));

  Hooks.on("renderChatMessage", (message, html) => {
    group(`renderChatMessage | id=${safe(() => message.id)} | speaker=${safe(() => message.speaker?.alias)}`, () => {
      info("Message flags:", safe(() => message.flags));
      info("Message content length:", safe(() => (message.content ?? "").length));
      debug("HTML:", html?.[0]);
    });
  });

  Hooks.on("preCreateChatMessage", (doc, data) => debug("preCreateChatMessage:", data));
  Hooks.on("createChatMessage", (doc) => debug("createChatMessage:", safe(() => doc.toObject?.() ?? doc)));

  Hooks.on("changeSetting", (setting, value, options, userId) => {
    debug("changeSetting:", setting, "=", value, "| userId:", userId, "| options:", options);
  });

  Hooks.on("error", (location, err) => {
    error("Hooks.on(error):", location, err);
  });

  info("Hook registration complete");
}

hookAll();
