import { MOD_ID, debugNs, warn, error, info } from "../logger/core.js";

const NS = "sheet:position";

const FLAG_KEY = "actorSheetPositions";
const WRAPPED = "__wodru_sheetPosWrapped__";

const SAVE_DEBOUNCE_MS = 250;

// Hardcoded default position (requested)
const DEFAULT_LEFT = 100;
const DEFAULT_TOP = 5;

// Clamp margins
const CLAMP_MARGIN = 10;

// New migration marker (we bump the version so older saved states can be migrated once)
const MIGRATION_KEY = "migratedDefaultV2";

// Marker that indicates the user has manually moved/resized the sheet at least once
const USER_MOVED_KEY = "userMovedV1";

// Internal runtime flag: we set it on the sheet instance while applying our default/migration.
// This lets us distinguish module-driven setPosition from user-driven setPosition.
const APPLYING_DEFAULT_RUNTIME_KEY = "__wodruApplyingDefaultPos__";

function d(msg, data) {
  debugNs(NS, msg, data);
}

export function registerActorSheetDefaultPositionHook() {
  Hooks.on("renderActorSheet", (app, html) => {
    try {
      const sheetClass = String(app?.constructor?.name ?? "ActorSheet");
      if (!sheetClass.includes("ActorSheet")) return;

      wrapSetPosition(app, sheetClass);

      const schedule = globalThis.requestAnimationFrame ?? ((fn) => setTimeout(fn, 0));
      schedule(() => {
        applySavedOrHardDefault(app, sheetClass, html).catch((e) => {
          warn("applySavedOrHardDefault failed", { sheetClass, err: String(e), stack: e?.stack ?? null });
        });
      });
    } catch (e) {
      error("renderActorSheet hook failed", { err: String(e), stack: e?.stack ?? null });
    }
  });

  info("Registered persistent ActorSheet default position hook");
}

async function applySavedOrHardDefault(app, sheetClass, html) {
  const element = app?.element?.[0] ?? html?.[0] ?? null;

  const viewport = getViewportSize();
  const sheet = getSheetMetrics(app, element);

  // Hardcoded requested target with viewport clamp
  let targetLeft = DEFAULT_LEFT;
  let targetTop = DEFAULT_TOP;

  targetLeft = clamp(targetLeft, CLAMP_MARGIN, Math.max(CLAMP_MARGIN, viewport.w - sheet.width - CLAMP_MARGIN));
  targetTop = clamp(targetTop, CLAMP_MARGIN, Math.max(CLAMP_MARGIN, viewport.h - sheet.height - CLAMP_MARGIN));

  const saved = await getSavedPosition(sheetClass);

  // If there is a saved position:
  // - If the user has ever moved the sheet => ALWAYS respect it.
  // - Otherwise => migrate once to our hardcoded default (using MIGRATION_KEY).
  if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
    const userMoved = saved[USER_MOVED_KEY] === true;
    const migrated = saved[MIGRATION_KEY] === true;

    if (userMoved === true) {
      d("Applying saved position (userMoved=true)", { sheetClass, saved });

      app.setPosition({
        left: saved.left,
        top: saved.top,
        ...(Number.isFinite(saved.width) ? { width: saved.width } : {}),
        ...(Number.isFinite(saved.height) ? { height: saved.height } : {}),
      });

      return;
    }

    if (migrated !== true) {
      d("Migrating saved default position to hardcoded default (one-time, userMoved=false)", {
        sheetClass,
        from: { left: saved.left, top: saved.top },
        to: { left: targetLeft, top: targetTop },
      });

      try {
        app[APPLYING_DEFAULT_RUNTIME_KEY] = true;

        app.setPosition({
          left: targetLeft,
          top: targetTop,
          ...(Number.isFinite(saved.width) ? { width: saved.width } : {}),
          ...(Number.isFinite(saved.height) ? { height: saved.height } : {}),
        });
      } finally {
        app[APPLYING_DEFAULT_RUNTIME_KEY] = false;
      }

      const pos = normalizeAppPosition(app);
      pos[MIGRATION_KEY] = true;
      // Explicitly ensure userMoved stays false/undefined for module-driven migration.
      pos[USER_MOVED_KEY] = false;

      await setSavedPosition(sheetClass, pos);

      info("Default position migrated and saved", { sheetClass, pos });
      return;
    }

    // Already migrated (and user never moved) => apply whatever is saved.
    d("Applying saved position (already migrated, userMoved=false)", { sheetClass, saved });

    app.setPosition({
      left: saved.left,
      top: saved.top,
      ...(Number.isFinite(saved.width) ? { width: saved.width } : {}),
      ...(Number.isFinite(saved.height) ? { height: saved.height } : {}),
    });

    return;
  }

  // No saved => apply hardcoded default and persist it immediately.
  d("Applying hardcoded default position (no saved state yet)", {
    sheetClass,
    viewport,
    sheet,
    target: { left: targetLeft, top: targetTop },
  });

  try {
    app[APPLYING_DEFAULT_RUNTIME_KEY] = true;
    app.setPosition({ left: targetLeft, top: targetTop });
  } finally {
    app[APPLYING_DEFAULT_RUNTIME_KEY] = false;
  }

  const pos = normalizeAppPosition(app);
  pos[MIGRATION_KEY] = true;
  pos[USER_MOVED_KEY] = false;

  await setSavedPosition(sheetClass, pos);

  info("Default position saved", { sheetClass, pos });
}

function wrapSetPosition(app, sheetClass) {
  if (!app || typeof app.setPosition !== "function") return;
  if (app[WRAPPED] === true) return;
  app[WRAPPED] = true;

  const original = app.setPosition.bind(app);

  let timer = null;

  app.setPosition = function wrappedSetPosition(position) {
    const result = original(position);

    try {
      if (timer) clearTimeout(timer);

      timer = setTimeout(() => {
        try {
          const pos = normalizeAppPosition(app);

          // If the position change was initiated by our own default/migration logic,
          // we keep "userMoved" false and mark migration as done.
          // Otherwise, assume it is a user move/resize and lock the saved position forever.
          const isApplyingDefault = app?.[APPLYING_DEFAULT_RUNTIME_KEY] === true;

          if (isApplyingDefault === true) {
            pos[MIGRATION_KEY] = true;
            pos[USER_MOVED_KEY] = false;
          } else {
            // Once user moved it, we must never override with defaults again.
            pos[USER_MOVED_KEY] = true;

            // Keep migration marker if it exists, but it's not strictly required here.
            // We do NOT forcibly set MIGRATION_KEY on user moves.
          }

          setSavedPosition(sheetClass, pos).catch((e) => {
            warn("Failed to persist position (debounced)", { sheetClass, err: String(e), stack: e?.stack ?? null });
          });

          d("Persisted position", { sheetClass, pos, isApplyingDefault });
        } catch (e) {
          warn("Persist timer failed", { sheetClass, err: String(e), stack: e?.stack ?? null });
        }
      }, SAVE_DEBOUNCE_MS);
    } catch (e) {
      warn("Failed to schedule persistence", { sheetClass, err: String(e), stack: e?.stack ?? null });
    }

    return result;
  };

  d("Wrapped setPosition for persistence", { sheetClass });
}

async function getSavedPosition(sheetClass) {
  try {
    const map = (await game.user.getFlag(MOD_ID, FLAG_KEY)) ?? {};
    if (!map || typeof map !== "object") return null;

    const v = map[sheetClass];
    if (!v || typeof v !== "object") return null;

    const out = {
      left: Number(v.left),
      top: Number(v.top),
      width: Number.isFinite(Number(v.width)) ? Number(v.width) : undefined,
      height: Number.isFinite(Number(v.height)) ? Number(v.height) : undefined,
    };

    if (v[MIGRATION_KEY] === true) out[MIGRATION_KEY] = true;
    if (v[USER_MOVED_KEY] === true) out[USER_MOVED_KEY] = true;

    return out;
  } catch (e) {
    d("No saved position (or cannot read flag)", { sheetClass, err: String(e) });
    return null;
  }
}

async function setSavedPosition(sheetClass, pos) {
  try {
    const current = (await game.user.getFlag(MOD_ID, FLAG_KEY)) ?? {};
    const next = foundry.utils.deepClone(current && typeof current === "object" ? current : {});

    const payload = {
      left: pos.left,
      top: pos.top,
      ...(Number.isFinite(pos.width) ? { width: pos.width } : {}),
      ...(Number.isFinite(pos.height) ? { height: pos.height } : {}),
    };

    if (pos[MIGRATION_KEY] === true) payload[MIGRATION_KEY] = true;
    if (pos[USER_MOVED_KEY] === true) payload[USER_MOVED_KEY] = true;

    next[sheetClass] = payload;

    await game.user.setFlag(MOD_ID, FLAG_KEY, next);
  } catch (e) {
    warn("Failed to set user flag for position", { sheetClass, err: String(e), stack: e?.stack ?? null });
  }
}

function normalizeAppPosition(app) {
  const p = app?.position ?? {};
  const left = Number(p.left);
  const top = Number(p.top);
  const width = Number(p.width);
  const height = Number(p.height);

  return {
    left: Number.isFinite(left) ? left : 0,
    top: Number.isFinite(top) ? top : 0,
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
  };
}

function getViewportSize() {
  return {
    w: Number(globalThis?.window?.innerWidth ?? 0) || 0,
    h: Number(globalThis?.window?.innerHeight ?? 0) || 0,
  };
}

function getSheetMetrics(app, element) {
  const wPos = Number(app?.position?.width);
  const hPos = Number(app?.position?.height);

  const wOpt = Number(app?.options?.width);
  const hOpt = Number(app?.options?.height);

  const rect = element?.getBoundingClientRect?.();
  const wRect = Number(rect?.width);
  const hRect = Number(rect?.height);

  const width =
    (Number.isFinite(wRect) && wRect > 0 ? wRect : null) ??
    (Number.isFinite(wPos) && wPos > 0 ? wPos : null) ??
    (Number.isFinite(wOpt) && wOpt > 0 ? wOpt : null) ??
    900;

  const height =
    (Number.isFinite(hRect) && hRect > 0 ? hRect : null) ??
    (Number.isFinite(hPos) && hPos > 0 ? hPos : null) ??
    (Number.isFinite(hOpt) && hOpt > 0 ? hOpt : null) ??
    720;

  return { width, height };
}

function clamp(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

registerActorSheetDefaultPositionHook();
