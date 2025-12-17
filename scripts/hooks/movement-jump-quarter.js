/* eslint-disable no-console */

/**
 * RU-only jump override:
 * - Replace movement.vjump and movement.hjump with RU constants (already /4 and rounded).
 *
 * Why Actor.prepareDerivedData patch:
 * - System derives movement during actor preparation and stores it into actor.system.movement.
 * - Overriding derived data guarantees the displayed values change everywhere.
 *
 * IMPORTANT:
 * - We do NOT patch CombatHelper.CalculateMovement anymore to avoid double-application.
 * - We only overwrite the two jump fields after the system finishes computing movement.
 *
 * No libWrapper: monkey-patching only.
 */

import { debugNs, info, warn, error, safe } from "../logger/core.js";
import {
  JUMP_DEFAULT,
  JUMP_GLABRO,
  JUMP_CRINOS,
  JUMP_HISPO,
  JUMP_LUPUS
} from "../constants/movement.js";

const NS = "movement";
const PATCH_FLAG_ACTOR = "__wodru_patched_actor_prepareDerivedData_jump_override__";

function isRuUi() {
  const lang = String(game?.i18n?.lang ?? "").toLowerCase();
  const isRuLang = lang.startsWith("ru");

  const hasLangRuClass = safe(
    () => globalThis.document?.documentElement?.classList?.contains("langRU") === true,
    false
  );

  return isRuLang || hasLangRuClass;
}

function pickJumpConstantsForActor(actor) {
  // Mirror system logic order (CombatHelper.CalculateMovement uses independent ifs).
  // In a valid sheet state only one shape should be active.
  const shapes = safe(() => actor?.system?.shapes, null);

  if (safe(() => shapes?.glabro?.isactive === true, false)) return JUMP_GLABRO;
  if (safe(() => shapes?.crinos?.isactive === true, false)) return JUMP_CRINOS;
  if (safe(() => shapes?.hispo?.isactive === true, false)) return JUMP_HISPO;
  if (safe(() => shapes?.lupus?.isactive === true, false)) return JUMP_LUPUS;

  return JUMP_DEFAULT;
}

function applyJumpOverrideInPlace(actor) {
  const movement = safe(() => actor?.system?.movement, null);
  if (!movement || typeof movement !== "object") return { changed: false };

  const target = pickJumpConstantsForActor(actor);

  const beforeV = movement.vjump;
  const beforeH = movement.hjump;

  let changed = false;

  if (movement.vjump !== target.vjump) {
    movement.vjump = target.vjump;
    changed = true;
  }
  if (movement.hjump !== target.hjump) {
    movement.hjump = target.hjump;
    changed = true;
  }

  return {
    changed,
    before: { vjump: beforeV, hjump: beforeH },
    after: { vjump: movement.vjump, hjump: movement.hjump },
    target
  };
}

/**
 * Hard guarantee: patch Actor.prepareDerivedData and override jumps after system computes movement.
 */
function patchActorPrepareDerivedData(stage) {
  const ActorCls = globalThis.Actor;
  const proto = ActorCls?.prototype;

  if (!proto || typeof proto.prepareDerivedData !== "function") {
    warn("Actor.prepareDerivedData not available", {
      ns: NS,
      stage,
      hasActor: !!ActorCls,
      hasMethod: typeof proto?.prepareDerivedData === "function"
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

    const res = applyJumpOverrideInPlace(this);

    if (res.changed) {
      debugNs(NS, "Actor.prepareDerivedData jump override applied", {
        actor: safe(() => this.name ?? this.id ?? null, null),
        before: res.before,
        after: res.after,
        target: res.target
      });
    }

    return result;
  };

  proto.prepareDerivedData[PATCH_FLAG_ACTOR] = true;
  proto.prepareDerivedData.__wodru_original__ = original;

  info(`Jump override patch applied to Actor.prepareDerivedData (${stage})`);
  return true;
}

function applyPatch(stage) {
  try {
    if (typeof game === "undefined") return;

    if (game.system?.id && game.system.id !== "worldofdarkness") return;

    if (!isRuUi()) {
      debugNs(NS, `Patch skipped: UI is not RU (${stage})`, { lang: game?.i18n?.lang ?? null });
      return;
    }

    patchActorPrepareDerivedData(stage);
  } catch (e) {
    error("Failed to apply jump override patch", { ns: NS, stage, err: String(e), stack: e?.stack ?? null });
  }
}

// Language is stable here.
Hooks.once("i18nInit", () => {
  debugNs(NS, "Attempting to apply jump override patch (i18nInit)");
  applyPatch("i18nInit");
});

// Fallback.
Hooks.once("ready", () => {
  debugNs(NS, "Attempting to apply jump override patch (ready)");
  applyPatch("ready");
});
