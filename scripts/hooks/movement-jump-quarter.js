/* eslint-disable no-console */

/**
 * RU-only jump scaling:
 * - Divide movement.vjump and movement.hjump by 4
 * - Round results to one decimal place
 *
 * Why Actor.prepareDerivedData patch:
 * - System may cache movement or call CalculateMovement via a detached reference.
 * - Adjusting derived data guarantees the displayed values change.
 *
 * No libWrapper: monkey-patching only.
 */

import { debugNs, info, warn, error, safe, isDebugEnabled } from "../logger/core.js";

const NS = "movement";
const PATCH_FLAG_COMBAT = "__wodru_patched_vjump_hjump_quarter__";
const PATCH_FLAG_ACTOR = "__wodru_patched_actor_prepareDerivedData_jump_quarter__";

function roundToOneDecimal(value) {
  return Math.round(value * 10) / 10;
}

function isRuUi() {
  const lang = String(game?.i18n?.lang ?? "").toLowerCase();
  const isRuLang = lang.startsWith("ru");

  const hasLangRuClass = safe(
    () => globalThis.document?.documentElement?.classList?.contains("langRU") === true,
    false,
  );

  return isRuLang || hasLangRuClass;
}

function adjustMovementInPlace(movement) {
  if (!movement || typeof movement !== "object") return { changed: false };

  const beforeV = movement.vjump;
  const beforeH = movement.hjump;

  let changed = false;

  if (typeof beforeV === "number" && Number.isFinite(beforeV)) {
    const afterV = roundToOneDecimal(beforeV / 4);
    if (afterV !== beforeV) {
      movement.vjump = afterV;
      changed = true;
    }
  }

  if (typeof beforeH === "number" && Number.isFinite(beforeH)) {
    const afterH = roundToOneDecimal(beforeH / 4);
    if (afterH !== beforeH) {
      movement.hjump = afterH;
      changed = true;
    }
  }

  return { changed, before: { vjump: beforeV, hjump: beforeH }, after: { vjump: movement.vjump, hjump: movement.hjump } };
}

/**
 * Optional: patch CombatHelper.CalculateMovement (nice-to-have).
 * Not sufficient alone if system calls a detached reference or caches values.
 */
async function patchCombatHelperCalculateMovement(stage) {
  try {
    const mod = await import("/systems/worldofdarkness/module/scripts/combat-helpers.js");
    const CombatHelper = mod?.default ?? null;

    if (!CombatHelper || typeof CombatHelper.CalculateMovement !== "function") {
      warn(`CombatHelper.CalculateMovement not available (${stage})`, {
        hasCombatHelper: !!CombatHelper,
        hasMethod: typeof CombatHelper?.CalculateMovement === "function",
      });
      return false;
    }

    if (CombatHelper.CalculateMovement[PATCH_FLAG_COMBAT]) {
      debugNs(NS, `CombatHelper patch already applied (${stage})`);
      return true;
    }

    const original = CombatHelper.CalculateMovement;

    CombatHelper.CalculateMovement = async function patchedCalculateMovement(actorLike) {
      const movement = await original.call(this, actorLike);
      const res = adjustMovementInPlace(movement);

      // Force at least one visible log per session when the function is actually called.
      if (res.changed) {
        debugNs(NS, "CombatHelper.CalculateMovement adjusted jumps", {
          actor: safe(() => actorLike?.name ?? actorLike?.id ?? null, null),
          before: res.before,
          after: res.after,
        });
      } else if (isDebugEnabled()) {
        debugNs(NS, "CombatHelper.CalculateMovement called (no changes)", {
          actor: safe(() => actorLike?.name ?? actorLike?.id ?? null, null),
          vjump: safe(() => movement?.vjump ?? null, null),
          hjump: safe(() => movement?.hjump ?? null, null),
        });
      }

      return movement;
    };

    CombatHelper.CalculateMovement[PATCH_FLAG_COMBAT] = true;
    CombatHelper.CalculateMovement.__wodru_original__ = original;

    info(`Jump scaling patch applied to CombatHelper (${stage})`);
    return true;
  } catch (e) {
    warn(`CombatHelper patch failed (${stage})`, { err: String(e) });
    return false;
  }
}

/**
 * Hard guarantee: patch Actor.prepareDerivedData and adjust actor.system.movement after system computes it.
 */
function patchActorPrepareDerivedData(stage) {
  const ActorCls = globalThis.Actor;
  const proto = ActorCls?.prototype;

  if (!proto || typeof proto.prepareDerivedData !== "function") {
    warn(`Actor.prepareDerivedData not available (${stage})`, {
      hasActor: !!ActorCls,
      hasMethod: typeof proto?.prepareDerivedData === "function",
    });
    return false;
  }

  if (proto.prepareDerivedData[PATCH_FLAG_ACTOR]) {
    debugNs(NS, `Actor.prepareDerivedData patch already applied (${stage})`);
    return true;
  }

  const original = proto.prepareDerivedData;

  proto.prepareDerivedData = function patchedPrepareDerivedData(...args) {
    const result = original.apply(this, args);

    // Only for our target system + RU UI (avoid touching other systems/worlds).
    if (game?.system?.id !== "worldofdarkness") return result;
    if (!isRuUi()) return result;

    const movement = safe(() => this.system?.movement, null);
    const res = adjustMovementInPlace(movement);

    if (res.changed) {
      debugNs(NS, "Actor.prepareDerivedData adjusted jumps", {
        actor: safe(() => this.name ?? this.id ?? null, null),
        before: res.before,
        after: res.after,
      });
    }

    return result;
  };

  proto.prepareDerivedData[PATCH_FLAG_ACTOR] = true;
  proto.prepareDerivedData.__wodru_original__ = original;

  info(`Jump scaling patch applied to Actor.prepareDerivedData (${stage})`);
  return true;
}

async function applyAllPatches(stage) {
  try {
    if (typeof game === "undefined") return;

    if (game.system?.id && game.system.id !== "worldofdarkness") return;

    if (!isRuUi()) {
      debugNs(NS, `All patches skipped: UI is not RU (${stage})`, { lang: game?.i18n?.lang ?? null });
      return;
    }

    // Hard guarantee first.
    patchActorPrepareDerivedData(stage);

    // Nice-to-have second.
    await patchCombatHelperCalculateMovement(stage);
  } catch (e) {
    error(`Failed to apply jump scaling patches (${stage})`, { err: String(e), stack: e?.stack ?? null });
  }
}

// Language is stable here.
Hooks.once("i18nInit", () => {
  debugNs(NS, "Attempting to apply jump scaling patches (i18nInit)");
  void applyAllPatches("i18nInit");
});

// Fallback.
Hooks.once("ready", () => {
  debugNs(NS, "Attempting to apply jump scaling patches (ready)");
  void applyAllPatches("ready");
});
