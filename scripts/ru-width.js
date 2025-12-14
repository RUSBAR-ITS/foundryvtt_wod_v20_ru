/* eslint-disable no-console */

/**
 * RU width adaptation for WoD20 sheets.
 * Goal: make RU behave like DE by adding `langRU` class to the sheet root element.
 *
 * The WoD20 system uses language marker classes (langDE/langES/...) on the sheet element
 * and responsive.css targets those classes to set both the window width and the inner layout width.
 *
 * We do NOT override system files. We only add an extra class at render-time.
 */

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

function info(...args) { console.info(`${TAG} ${now()}`, ...args); }
function debug(...args) { console.debug(`${TAG} ${now()}`, ...args); }
function warn(...args) { console.warn(`${TAG} ${now()}`, ...args); }

function isRu() {
  const gl = game?.i18n?.lang;
  const hl = document?.documentElement?.lang;
  return gl === "ru" || hl === "ru";
}

function getSheetRootElement(app, html) {
  // For V1 ActorSheet, app.element[0] is typically the <form> element with class 'wod-sheet'.
  return app?.element?.[0] ?? html?.[0] ?? null;
}

function applyLangClass(app, html) {
  const ru = isRu();
  const el = getSheetRootElement(app, html);

  debug("renderActorSheet:", app?.constructor?.name, "title=", app?.title, "ru=", ru);

  if (!ru) return;
  if (!el) {
    warn("No sheet root element found; cannot apply", LANG_CLASS);
    return;
  }

  const before = Array.from(el.classList);
  const had = el.classList.contains(LANG_CLASS);
  el.classList.add(LANG_CLASS);
  const after = Array.from(el.classList);

  info("Applied", LANG_CLASS, "to sheet root.",
       "had=", had,
       "classes(before)=", before,
       "classes(after)=", after,
       "inlineStyle=", el.getAttribute("style"));

  // Additional visibility: report current computed widths of key nodes.
  try {
    const cs = getComputedStyle(el);
    info("Computed sheet width:", cs.width, "minWidth:", cs.minWidth, "maxWidth:", cs.maxWidth);

    const inner = el.querySelector?.(".sheet-inner-area");
    if (inner) {
      const cis = getComputedStyle(inner);
      info("Computed inner width:", cis.width, "minWidth:", cis.minWidth, "maxWidth:", cis.maxWidth);
    } else {
      warn("No .sheet-inner-area found inside sheet root.");
    }
  } catch (e) {
    warn("Failed to read computed styles:", e);
  }
}

Hooks.once("init", () => {
  info("init | game.i18n.lang=", game?.i18n?.lang, "| html.lang=", document?.documentElement?.lang);
});

Hooks.once("ready", () => {
  info("ready | RU mode =", isRu());
});

Hooks.on("renderActorSheet", (app, html) => {
  applyLangClass(app, html);
});
