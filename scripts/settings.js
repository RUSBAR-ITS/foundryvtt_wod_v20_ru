/* eslint-disable no-console */

/**
 * Module settings registration.
 * All visible strings are localized via module lang files (NOT the system ru.json).
 *
 * NOTE ABOUT LOGGING (bootstrap exception):
 * - We intentionally do NOT use the shared logger here.
 * - Reason: the shared logger reads game.settings.get(MOD_ID, "debugLogging"),
 *   but this setting is registered in this very file during Hooks.once("init").
 * - If we used the shared logger, the message could be suppressed (debug=false)
 *   or depend on a setting that might not exist yet.
 *
 * Therefore we emit a single one-time console.info in a consistent global style:
 *   [wod-v20-ru][debug] SETTINGS: ...
 */

const MOD_ID = "foundryvtt_wod_v20_ru";

Hooks.once("init", () => {
  game.settings.register(MOD_ID, "debugLogging", {
    name: `${MOD_ID}.settings.debugLogging.name`,
    hint: `${MOD_ID}.settings.debugLogging.hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  // One-time bootstrap log (not gated by debug flag).
  let current = null;
  try {
    current = game.settings.get(MOD_ID, "debugLogging");
  } catch (e) {
    // Keep the log readable for exported console logs.
    console.warn(`[wod-v20-ru][debug] SETTINGS: registered debugLogging but failed to read current value: ${String(e)}`);
  }

  console.info(`[wod-v20-ru][debug] SETTINGS: registered debugLogging=${current}`);
});
