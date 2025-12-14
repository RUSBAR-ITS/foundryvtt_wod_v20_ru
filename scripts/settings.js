/* eslint-disable no-console */

/**
 * Module settings registration.
 * All visible strings are localized via module lang files (NOT the system ru.json).
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

  // Minimal one-time log to confirm settings registration (not gated).
  const current = game.settings.get(MOD_ID, "debugLogging");
  console.info(`[wod-v20-ru][settings] Registered: debugLogging=${current}`);
});
