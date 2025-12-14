/* eslint-disable no-console */

/**
 * VERY VERBOSE DEBUG LOGGER (gated by module setting)
 *
 * Goals:
 * - Provide strict, readable diagnostics.
 * - Make init-time failures actionable:
 *   - Named hook functions (avoid Foundry showing '' as callback name)
 *   - Step runner with BEGIN/OK/FAIL
 *   - Full stack traces
 *   - Global error/unhandledrejection handlers (debug mode only)
 *
 * Includes:
 * - CSS sanity checks via probe (authoritative)
 *   - Expected values are sourced from CSS custom properties (no JS hardcode)
 *
 * - Template loader patch WITHOUT deprecated globals:
 *   - Prefer foundry.applications.handlebars.getTemplate/loadTemplates (V13+)
 *   - Fallback to global getTemplate/loadTemplates only if namespaced is missing
 */

const MOD_ID = "foundryvtt_wod_v20_ru";
const TAG = "[wod-v20-ru][debug]";

/* ---------------- basics ---------------- */

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

function toJson(data) {
  if (data === undefined) return "";
  try {
    return JSON.stringify(data);
  } catch {
    try {
      return String(data);
    } catch {
      return "[unstringifiable]";
    }
  }
}

function log(level, msg, data) {
  if (!enabled()) return;

  const prefix = `${TAG} ${now()} ${msg}`;
  if (data === undefined) {
    console[level](prefix);
    return;
  }
  console[level](`${prefix} ${toJson(data)}`);
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
    warn("safe() caught", { err: String(e), stack: e?.stack ?? null });
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

/* ---------------- strict step runner ---------------- */

let __stepSeq = 0;

async function runStep(name, fn) {
  const id = ++__stepSeq;
  const start = safe(() => globalThis.performance?.now?.() ?? null, null);

  info(`STEP BEGIN #${id} ${name}`);

  try {
    const res = await fn();
    const end = safe(() => globalThis.performance?.now?.() ?? null, null);
    const dur = start !== null && end !== null ? Number(end - start).toFixed(1) : null;
    info(`STEP OK    #${id} ${name}`, { durMs: dur });
    return res;
  } catch (e) {
    const end = safe(() => globalThis.performance?.now?.() ?? null, null);
    const dur = start !== null && end !== null ? Number(end - start).toFixed(1) : null;

    error(`STEP FAIL  #${id} ${name}`, {
      durMs: dur,
      err: String(e),
      stack: e?.stack ?? null
    });

    // rethrow so outer init handler can also see it (optional)
    throw e;
  }
}

/* ---------------- global error hooks (debug-only) ---------------- */

let __globalErrorHooksInstalled = false;

function installGlobalErrorHooks() {
  if (__globalErrorHooksInstalled) return;
  __globalErrorHooksInstalled = true;

  // window.onerror
  globalThis.addEventListener?.("error", (ev) => {
    if (!enabled()) return;
    try {
      const e = ev?.error;
      error("window.error", {
        message: ev?.message ?? null,
        filename: ev?.filename ?? null,
        lineno: ev?.lineno ?? null,
        colno: ev?.colno ?? null,
        err: e ? String(e) : null,
        stack: e?.stack ?? null
      });
    } catch (ex) {
      console.error(`${TAG} ${now()} window.error handler failed`, ex);
    }
  });

  // unhandledrejection
  globalThis.addEventListener?.("unhandledrejection", (ev) => {
    if (!enabled()) return;
    try {
      const reason = ev?.reason;
      error("window.unhandledrejection", {
        reason: reason ? String(reason) : null,
        stack: reason?.stack ?? null
      });
    } catch (ex) {
      console.error(`${TAG} ${now()} unhandledrejection handler failed`, ex);
    }
  });

  info("Global error hooks installed");
}

/* ---------------- core state dump ---------------- */

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

/* ---------------- CSS sanity ---------------- */

function expectedStyleUrls() {
  const styles = safe(() => game.modules?.get(MOD_ID)?.styles, []) ?? [];
  const urls = [];
  for (const p of styles) urls.push(`/modules/${MOD_ID}/${p}`);
  return urls;
}

function matchesAnySuffix(href, suffixes) {
  if (!href) return false;
  for (const s of suffixes) if (href.includes(s)) return true;
  return false;
}

function readCssVar(style, name) {
  try {
    const v = (style?.getPropertyValue(name) ?? "").trim();
    return v || null;
  } catch {
    return null;
  }
}

function cssProbeCheck() {
  // Create a hidden probe which matches our selectors and carries langRU.
  const probe = document.createElement("div");
  probe.className = "langRU wod-sheet";
  probe.style.position = "absolute";
  probe.style.left = "-10000px";
  probe.style.top = "-10000px";
  probe.style.visibility = "hidden";

  const inner = document.createElement("div");
  inner.className = "sheet-inner-area";
  probe.appendChild(inner);

  document.body.appendChild(probe);

  const probeComputed = safe(() => getComputedStyle(probe), null);
  const innerComputed = safe(() => getComputedStyle(inner), null);

  // Expected values come from CSS variables (single source of truth).
  const expected = {
    sheetMinWidth: readCssVar(probeComputed, "--wodru-sheet-min-width"),
    sheetMinHeight: readCssVar(probeComputed, "--wodru-sheet-min-height"),
    innerWidth: readCssVar(probeComputed, "--wodru-inner-width")
  };

  const result = {
    probe: {
      width: probeComputed?.width ?? null,
      minWidth: probeComputed?.minWidth ?? null,
      height: probeComputed?.height ?? null,
      minHeight: probeComputed?.minHeight ?? null
    },
    inner: {
      width: innerComputed?.width ?? null,
      minWidth: innerComputed?.minWidth ?? null
    }
  };

  probe.remove();

  const pass = {
    sheetMinWidth: expected.sheetMinWidth ? result.probe.minWidth === expected.sheetMinWidth : null,
    sheetMinHeight: expected.sheetMinHeight ? result.probe.minHeight === expected.sheetMinHeight : null,
    innerWidth: expected.innerWidth ? result.inner.width === expected.innerWidth : null
  };

  return { result, expected, pass };
}

function cssSanityCheck() {
  const expected = expectedStyleUrls();

  const linkHrefs = [];
  const links = safe(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]')), []);
  for (const l of links) {
    const href = l?.href ?? "";
    if (matchesAnySuffix(href, expected) || href.includes("ru-sheets.css") || href.includes("ru-vars.css")) {
      linkHrefs.push(href);
    }
  }

  const sheetHrefs = [];
  const sheets = safe(() => Array.from(document.styleSheets ?? []), []);
  for (const s of sheets) {
    const href = s?.href ?? "";
    if (matchesAnySuffix(href, expected) || href.includes("ru-sheets.css") || href.includes("ru-vars.css")) {
      sheetHrefs.push(href);
    }
  }

  const probe = safe(() => cssProbeCheck(), null);

  info("CSS sanity check", {
    expectedSuffixes: expected,
    matchedLinkTags: linkHrefs,
    matchedStyleSheets: sheetHrefs,
    probe
  });
}

/* ---------------- Template loader patch (no deprecated globals) ---------------- */

function getHandlebarsApi() {
  const api = safe(() => globalThis.foundry?.applications?.handlebars, null);
  if (!api) return null;

  const gt = api.getTemplate;
  const lt = api.loadTemplates;

  return {
    api,
    hasGetTemplate: typeof gt === "function",
    hasLoadTemplates: typeof lt === "function"
  };
}

function patchTemplateFns(target, label) {
  const patched = {
    label,
    patchedGetTemplate: false,
    patchedLoadTemplates: false
  };

  if (typeof target.getTemplate === "function") {
    const original = target.getTemplate;
    target.getTemplate = async function patchedGetTemplate(path, ...rest) {
      debug("getTemplate", { label, path });
      return original.call(this, path, ...rest);
    };
    patched.patchedGetTemplate = true;
  }

  if (typeof target.loadTemplates === "function") {
    const original = target.loadTemplates;
    target.loadTemplates = async function patchedLoadTemplates(paths, ...rest) {
      try {
        if (Array.isArray(paths)) debug("loadTemplates", { label, count: paths.length });
        else debug("loadTemplates", { label, paths: String(paths) });
      } catch (e) {
        warn("loadTemplates logging failed", { label, err: String(e), stack: e?.stack ?? null });
      }
      return original.call(this, paths, ...rest);
    };
    patched.patchedLoadTemplates = true;
  }

  return patched;
}

function patchTemplateLoaders() {
  const hb = getHandlebarsApi();

  // Prefer namespaced API (V13+)
  if (hb?.api && (hb.hasGetTemplate || hb.hasLoadTemplates)) {
    const res = patchTemplateFns(hb.api, "foundry.applications.handlebars");
    info("Template patch applied (namespaced)", res);
    return;
  }

  // Fallback for older cores only — best-effort.
  const globals = {
    getTemplate: globalThis.getTemplate,
    loadTemplates: globalThis.loadTemplates
  };

  if (typeof globals.getTemplate === "function" || typeof globals.loadTemplates === "function") {
    const res = patchTemplateFns(globals, "globalThis (fallback)");
    if (globals.getTemplate) globalThis.getTemplate = globals.getTemplate;
    if (globals.loadTemplates) globalThis.loadTemplates = globals.loadTemplates;
    info("Template patch applied (global fallback)", res);
    return;
  }

  warn("Template patch skipped (no known API found)");
}

/* ---------------- Render logging ---------------- */

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

  Hooks.on("renderApplication", (app, html) => dumpRender(app, html));
  Hooks.on("renderActorSheet", (app, html) => dumpRender(app, html));
  Hooks.on("renderItemSheet", (app, html) => dumpRender(app, html));
  Hooks.on("renderDialog", (app, html) => dumpRender(app, html));
  Hooks.on("renderSettings", (app, html) => dumpRender(app, html));

  Hooks.on("error", (location, errObj) => {
    error("Hooks.on(error)", {
      location,
      err: errObj ? String(errObj) : null,
      stack: errObj?.stack ?? null
    });
  });

  info("Debug hooks registered");
}

/* ---------------- Lifecycle (named callbacks) ---------------- */

async function onInitDebug() {
  const on = enabled();
  if (!on) return;

  info("Debug logging ENABLED at init");

  // Install global error hooks ASAP to catch init-time async errors.
  await runStep("installGlobalErrorHooks", async () => {
    installGlobalErrorHooks();
  });

  await runStep("dumpCoreState(init)", async () => {
    dumpCoreState("init");
  });

  await runStep("patchTemplateLoaders", async () => {
    patchTemplateLoaders();
  });

  await runStep("registerDebugHooks", async () => {
    registerDebugHooks();
  });

  info("Init debug flow completed OK");
}

function onReadyBanner() {
  const on = enabled();
  console.info(`${TAG} ${now()} Debug logging is ${on ? "ENABLED" : "DISABLED"} (toggle in module settings).`);
}

Hooks.once("init", onInitDebug);
Hooks.once("ready", onReadyBanner);
