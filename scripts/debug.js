/* eslint-disable no-console */

/**
 * Debug bootstrap entrypoint for the module.
 *
 * HOW IT WORKS (high-level idea):
 * 1) This file is the ONLY debug-related ESModule that must be listed in module.json.
 *    Everything else is imported from submodules to keep responsibilities separated.
 *
 * 2) We do NOT patch the system or Foundry behavior by default.
 *    This module is diagnostic-first: it observes the runtime through Hooks and safe checks.
 *
 * 3) Debug mode is controlled by a module setting:
 *      game.settings.get(MOD_ID, "debugLogging")
 *    When debug is OFF, we keep overhead minimal:
 *      - we do not install global handlers
 *      - we do not register verbose render hooks
 *      - we do not run expensive sanity probes
 *
 * 4) When debug is ON:
 *    - On init:
 *        a) install global error handlers (window error/unhandledrejection)
 *        b) dump core state snapshot (versions, language, enabled modules, etc.)
 *        c) attempt best-effort template loader patching (non-fatal, may be read-only in Foundry)
 *        d) register verbose Hooks logging (render + lifecycle)
 *      Each of these actions is wrapped by a step runner that provides:
 *        STEP BEGIN / STEP OK / STEP FAIL logs with timing.
 *
 *    - On ready:
 *        Show a single banner line (enabled/disabled) for quick confirmation.
 *
 * IMPORTANT:
 * - "Template patching" is diagnostic-only. It MUST NEVER break init.
 *   Foundry may expose read-only / frozen APIs. That is expected.
 *   We log "skipped" and continue.
 *
 * - All logging functions are centralized in scripts/logger/core.js
 *   to keep formatting consistent across different module scripts.
 */

import { info } from "./logger/core.js";
import { runStep } from "./logger/step.js";
import { installGlobalErrorHooks } from "./logger/global-errors.js";
import { dumpCoreState } from "./diagnostics/core-state.js";
import { patchTemplateLoaders } from "./diagnostics/template-patch.js";
import { registerDebugHooks } from "./hooks/debug-hooks.js";
import { isDebugEnabled } from "./logger/core.js";

async function onInitDebug() {
  // Guard: do nothing unless debug setting is enabled.
  if (!isDebugEnabled()) return;

  info("Debug logging ENABLED at init");

  // Step 1: capture hard runtime errors early (useful for diagnosing init issues).
  await runStep("installGlobalErrorHooks", async () => {
    installGlobalErrorHooks();
  });

  // Step 2: snapshot core state at init phase.
  await runStep("dumpCoreState(init)", async () => {
    dumpCoreState("init");
  });

  // Step 3 (non-fatal): attempt to patch template loaders for logging.
  // This may be impossible if Foundry exposes read-only APIs. That is OK.
  await runStep(
    "patchTemplateLoaders",
    async () => {
      patchTemplateLoaders();
    },
    { fatal: false }
  );

  // Step 4: register Hooks for later lifecycle phases + render logs.
  await runStep("registerDebugHooks", async () => {
    registerDebugHooks();
  });

  info("Init debug flow completed OK");
}

function onReadyBanner() {
  // Always show a single banner in console.
  // This helps confirm whether debug is enabled without reading long logs.
  const on = isDebugEnabled();
  console.info(`[wod-v20-ru][debug] Debug logging is ${on ? "ENABLED" : "DISABLED"} (toggle in module settings).`);
}

// We hook init/ready because these are stable points in Foundry lifecycle.
Hooks.once("init", onInitDebug);
Hooks.once("ready", onReadyBanner);
