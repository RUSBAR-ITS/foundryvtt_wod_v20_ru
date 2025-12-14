/**
 * Debug hooks:
 * Central place to register Foundry Hooks for lifecycle and render logging.
 *
 * What we log here:
 * - i18nInit: which game language is initialized
 * - setup/ready: core state snapshots and sanity checks
 * - render*: details about rendered applications (sheets/dialogs/settings)
 *
 * Why we log render:
 * - Helps confirm class injection (langRU/langDE etc.)
 * - Helps confirm CSS layout (sheet-inner-area width)
 * - Helps identify what template a sheet is using
 */

import { info, error, safe } from "../logger/core.js";
import { dumpCoreState } from "../diagnostics/core-state.js";
import { cssSanityCheck } from "../diagnostics/css-sanity.js";

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
      classString: safe(() => (el ? Array.from(el.classList).join(" ") : "")),
      styleAttr: safe(() => el?.getAttribute?.("style"))
    },
    inner: inner
      ? {
          classString: safe(() => Array.from(inner.classList).join(" ")),
          computedWidth: safe(() => getComputedStyle(inner).width)
        }
      : null
  });
}

export function registerDebugHooks() {
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

    // CSS sanity is most meaningful at "ready" because styles are loaded.
    cssSanityCheck();
  });

  // Generic application renders (covers many UI windows).
  Hooks.on("renderApplication", (app, html) => dumpRender(app, html));

  // Specific application types (sheets and dialogs).
  Hooks.on("renderActorSheet", (app, html) => dumpRender(app, html));
  Hooks.on("renderItemSheet", (app, html) => dumpRender(app, html));
  Hooks.on("renderDialog", (app, html) => dumpRender(app, html));
  Hooks.on("renderSettings", (app, html) => dumpRender(app, html));

  // Hook-level error reporting (supplements global errors).
  Hooks.on("error", (location, errObj) => {
    error("Hooks.on(error)", {
      location,
      err: errObj ? String(errObj) : null,
      stack: errObj?.stack ?? null
    });
  });

  info("Debug hooks registered");
}
