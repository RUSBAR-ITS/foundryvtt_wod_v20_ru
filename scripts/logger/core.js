/* eslint-disable no-console */

/**
 * Logger core: shared primitives used across all debug and functional scripts.
 *
 * Responsibilities:
 * - Single source of truth for MOD_ID and TAG.
 * - Consistent log formatting and timestamps.
 * - Centralized "is debug enabled" check (module setting).
 * - Utility helpers that must NEVER throw (safe()).
 *
 * Non-responsibilities:
 * - It should NOT register Foundry hooks.
 * - It should NOT implement diagnostics (CSS/template probing).
 * - It should NOT do expensive work when debug is disabled.
 */

export const MOD_ID = "foundryvtt_wod_v20_ru";
export const TAG = "[wod-v20-ru][debug]";

/**
 * Produce a short monotonic timestamp label.
 * We intentionally use performance.now() (relative time) to correlate events
 * across init/setup/ready and render calls without relying on system clock.
 */
export function now() {
  try {
    const t = (globalThis.performance?.now?.() ?? 0).toFixed(1);
    return `t+${t}ms`;
  } catch {
    return "t+?";
  }
}

/**
 * Read debug mode from module settings.
 * This must be safe even if game/settings are not fully initialized.
 */
export function isDebugEnabled() {
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

/**
 * Internal log dispatcher.
 * All public log functions call into this to keep the log format uniform.
 */
function log(level, msg, data) {
  if (!isDebugEnabled()) return;

  const prefix = `${TAG} ${now()} ${msg}`;
  if (data === undefined) {
    console[level](prefix);
    return;
  }
  console[level](`${prefix} ${toJson(data)}`);
}

export function info(msg, data) {
  log("info", msg, data);
}

export function debug(msg, data) {
  log("debug", msg, data);
}

export function warn(msg, data) {
  log("warn", msg, data);
}

export function error(msg, data) {
  log("error", msg, data);
}

/**
 * Namespaced debug logger.
 *
 * Example:
 *   debugNs("combat", "hook entered", { actorId: "..." });
 */
export function debugNs(ns, msg, data) {
  debug(`[${ns}] ${msg}`, data);
}

/**
 * Execute a function and return fallback on error.
 * This is heavily used in logging to avoid "debugger broke the app" situations.
 */
export function safe(fn, fallback = undefined) {
  try {
    return fn();
  } catch (e) {
    warn("safe() caught", { err: String(e), stack: e?.stack ?? null });
    return fallback;
  }
}

/**
 * Helper to print CSS classes of an element as a single string.
 */
export function classString(el) {
  if (!el) return "";
  try {
    return Array.from(el.classList).join(" ");
  } catch {
    return "";
  }
}
