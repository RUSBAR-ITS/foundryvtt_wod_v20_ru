/* eslint-disable no-console */

/**
 * Global error hooks (debug-only).
 *
 * Why:
 * - Some failures occur outside Foundry Hooks (unhandled promise rejections, runtime errors).
 * - Capturing them gives us stack traces that would otherwise be missed.
 *
 * Rules:
 * - Install only once.
 * - Only emit logs when debug setting is enabled.
 * - Never throw from handlers.
 */

import { error, info, isDebugEnabled } from "./core.js";

let installed = false;

export function installGlobalErrorHooks() {
  if (installed) return;
  installed = true;

  globalThis.addEventListener?.("error", (ev) => {
    if (!isDebugEnabled()) return;
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
      console.error("[wod-v20-ru][debug] window.error handler failed", ex);
    }
  });

  globalThis.addEventListener?.("unhandledrejection", (ev) => {
    if (!isDebugEnabled()) return;
    try {
      const reason = ev?.reason;
      error("window.unhandledrejection", {
        reason: reason ? String(reason) : null,
        stack: reason?.stack ?? null
      });
    } catch (ex) {
      console.error("[wod-v20-ru][debug] unhandledrejection handler failed", ex);
    }
  });

  info("Global error hooks installed");
}
