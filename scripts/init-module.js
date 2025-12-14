/* eslint-disable no-console */

/**
 * Module i18n loader (separate from system translation).
 *
 * Context:
 * - lang/ru.json is reserved for WoD20 *system* translation (big dictionary).
 * - Module-only strings are stored separately and are loaded manually into game.i18n.translations.
 *
 * Loading strategy:
 * - If UI language is "ru": load "lang/module-ru.json"
 * - Otherwise: load "lang/module-en.json"
 * - If primary load fails: load fallback "lang/module-en.json"
 *
 * Logging:
 * - Uses shared logger (scripts/logger/core.js)
 * - Controlled by module setting: game.settings.get(MOD_ID, "debugLogging")
 * - Messages are prefixed with "I18N:" for easy filtering.
 */

import { info, warn, safe, MOD_ID } from "./logger/core.js";

function getLang() {
  return safe(() => game?.i18n?.lang, null) ?? document.documentElement?.lang ?? "en";
}

async function loadJson(path) {
  // Use an absolute path for reliability (avoid dependence on base URL).
  const url = `/modules/${MOD_ID}/${path}`;

  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);

  return res.json();
}

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== "object") target[k] = {};
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

async function loadModuleTranslations() {
  const lang = getLang();
  const chosen = lang === "ru" ? "lang/module-ru.json" : "lang/module-en.json";
  const fallback = "lang/module-en.json";

  info("I18N: loading module translations (primary)", { lang, chosen, fallback });

  try {
    const data = await loadJson(chosen);

    // Ensure a translation store exists and merge module strings into it.
    const store = (game.i18n.translations ??= {});
    deepMerge(store, data);

    info("I18N: loaded module translations (primary)", {
      lang,
      chosen,
      topKeys: Object.keys(data ?? {})
    });

    return;
  } catch (e) {
    warn("I18N: primary module translation load failed, trying fallback", {
      lang,
      chosen,
      fallback,
      err: String(e),
      stack: e?.stack ?? null
    });

    // Fallback attempt
    const data = await loadJson(fallback);
    const store = (game.i18n.translations ??= {});
    deepMerge(store, data);

    info("I18N: loaded module translations (fallback)", {
      lang,
      chosen: fallback,
      topKeys: Object.keys(data ?? {})
    });
  }
}

Hooks.on("i18nInit", () => {
  loadModuleTranslations().catch((e) => {
    warn("I18N: module i18n load failed (unhandled)", {
      err: String(e),
      stack: e?.stack ?? null
    });
  });
});
