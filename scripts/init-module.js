/* eslint-disable no-console */

/**
 * Module i18n loader (separate from system translation).
 *
 * - Keeps lang/ru.json reserved for WoD20 system translation (huge file).
 * - Loads module-only translations from:
 *     lang/module-ru.json (when game.i18n.lang === "ru")
 *     lang/module-en.json (fallback)
 *
 * IMPORTANT:
 * - We do NOT register these in module.json "languages" to avoid duplicate "ru".
 * - We load them manually into game.i18n translations.
 */

const MOD_ID = "foundryvtt_wod_v20_ru";
const TAG = "[wod-v20-ru][i18n]";

function isDebug() {
  try {
    return !!game.settings.get(MOD_ID, "debugLogging");
  } catch {
    return false;
  }
}

function log(...args) {
  // minimal info always; verbose only when debug enabled
  if (isDebug()) console.info(TAG, ...args);
}

function warn(...args) {
  console.warn(TAG, ...args);
}

function getLang() {
  return game?.i18n?.lang ?? document.documentElement?.lang ?? "en";
}

async function loadJson(path) {
  const url = `modules/${MOD_ID}/${path}`;
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

  try {
    const data = await loadJson(chosen);
    // Merge into i18n translations
    const store = (game.i18n.translations ??= {});
    deepMerge(store, data);

    log(`Loaded module translations: ${chosen}`, { lang, keysTop: Object.keys(data ?? {}) });
    return { lang, chosen };
  } catch (e) {
    warn("Primary module translation load failed, trying fallback", { chosen, fallback, err: String(e) });
    const data = await loadJson(fallback);
    const store = (game.i18n.translations ??= {});
    deepMerge(store, data);

    log(`Loaded module translations (fallback): ${fallback}`, { lang, keysTop: Object.keys(data ?? {}) });
    return { lang, chosen: fallback };
  }
}

/**
 * i18nInit happens after init, when the final language is known.
 * We load our module translations there.
 */
Hooks.on("i18nInit", () => {
  // Fire-and-forget is okay, but we keep errors visible.
  loadModuleTranslations().catch((e) => warn("Module i18n load failed", e));
});
