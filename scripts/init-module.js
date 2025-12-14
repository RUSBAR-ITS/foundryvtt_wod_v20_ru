/* eslint-disable no-console */

/**
 * Module i18n loader (separate from system translation).
 *
 * - lang/ru.json is reserved for WoD20 system translation.
 * - Module-only strings are loaded manually from:
 *     lang/module-ru.json (when UI lang is ru)
 *     lang/module-en.json (fallback)
 *
 * Log output is readable in saved console exports (JSON string, not "Object").
 */

const MOD_ID = "foundryvtt_wod_v20_ru";
const TAG = "[wod-v20-ru][i18n]";

function enabled() {
  try {
    return !!game.settings.get(MOD_ID, "debugLogging");
  } catch {
    return false;
  }
}

function log(msg, data) {
  if (!enabled()) return;
  let json = "";
  try {
    json = data === undefined ? "" : JSON.stringify(data);
  } catch {
    json = String(data);
  }
  console.info(`${TAG} ${msg}${json ? " " + json : ""}`);
}

function warn(msg, data) {
  let json = "";
  try {
    json = data === undefined ? "" : JSON.stringify(data);
  } catch {
    json = String(data);
  }
  console.warn(`${TAG} ${msg}${json ? " " + json : ""}`);
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
    const store = (game.i18n.translations ??= {});
    deepMerge(store, data);

    log("Loaded module translations", { chosen, lang, topKeys: Object.keys(data ?? {}) });
    return;
  } catch (e) {
    warn("Primary module translation load failed, trying fallback", { chosen, fallback, err: String(e) });

    const data = await loadJson(fallback);
    const store = (game.i18n.translations ??= {});
    deepMerge(store, data);

    log("Loaded module translations (fallback)", { chosen: fallback, lang, topKeys: Object.keys(data ?? {}) });
  }
}

Hooks.on("i18nInit", () => {
  loadModuleTranslations().catch((e) => warn("Module i18n load failed", { err: String(e) }));
});
