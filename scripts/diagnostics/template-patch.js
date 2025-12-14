/**
 * Template loader patching (diagnostic best-effort).
 *
 * Purpose:
 * - We try to intercept template loading calls to log which templates are requested.
 *
 * Constraints:
 * - Foundry v13+ may expose read-only / frozen APIs (especially under foundry.applications.handlebars).
 * - We must never crash init if patch is impossible.
 *
 * Behavior:
 * - Detect the best API (namespaced first, fallback to globals).
 * - Inspect property descriptors (writable/setter) across prototype chain.
 * - If not patchable: log "skipped" with reasons and continue.
 */

import { info, warn, debug, safe } from "../logger/core.js";

function getHandlebarsApi() {
  const api = safe(() => globalThis.foundry?.applications?.handlebars, null);
  if (!api) return null;

  return {
    api,
    hasGetTemplate: typeof api.getTemplate === "function",
    hasLoadTemplates: typeof api.loadTemplates === "function",
    frozen: safe(() => Object.isFrozen(api), null),
    sealed: safe(() => Object.isSealed(api), null),
    extensible: safe(() => Object.isExtensible(api), null)
  };
}

function describeDescriptor(desc) {
  if (!desc) return null;
  return {
    writable: !!desc.writable,
    configurable: !!desc.configurable,
    enumerable: !!desc.enumerable,
    hasGet: typeof desc.get === "function",
    hasSet: typeof desc.set === "function"
  };
}

function getDescriptorDeep(obj, prop) {
  let cur = obj;
  let depth = 0;
  while (cur && depth < 8) {
    const d = Object.getOwnPropertyDescriptor(cur, prop);
    if (d) return { owner: cur, descriptor: d, depth };
    cur = Object.getPrototypeOf(cur);
    depth += 1;
  }
  return { owner: null, descriptor: null, depth };
}

function canAssignProperty(obj, prop) {
  const deep = getDescriptorDeep(obj, prop);
  const d = deep.descriptor;

  // If no descriptor is found, assignment might still work on extensible objects,
  // but Foundry often uses frozen objects, so this is still helpful to log.
  if (!d) {
    return {
      ok: safe(() => Object.isExtensible(obj), false),
      reason: "no-descriptor",
      deep
    };
  }

  // Data property
  if ("writable" in d) {
    return {
      ok: !!d.writable,
      reason: d.writable ? "writable" : "read-only-data",
      deep
    };
  }

  // Accessor property
  if ("set" in d) {
    return {
      ok: typeof d.set === "function",
      reason: typeof d.set === "function" ? "setter-present" : "read-only-accessor",
      deep
    };
  }

  return { ok: false, reason: "unknown-descriptor", deep };
}

function patchTemplateFns(target, label) {
  const patched = {
    label,
    patchedGetTemplate: false,
    patchedLoadTemplates: false,
    skipped: [],
    frozen: safe(() => Object.isFrozen(target), null),
    sealed: safe(() => Object.isSealed(target), null),
    extensible: safe(() => Object.isExtensible(target), null),
    descriptors: {
      getTemplate: describeDescriptor(getDescriptorDeep(target, "getTemplate").descriptor),
      loadTemplates: describeDescriptor(getDescriptorDeep(target, "loadTemplates").descriptor)
    }
  };

  // Patch getTemplate
  if (typeof target.getTemplate === "function") {
    const chk = canAssignProperty(target, "getTemplate");
    if (!chk.ok) {
      patched.skipped.push({ prop: "getTemplate", reason: chk.reason, descriptor: patched.descriptors.getTemplate });
    } else {
      const original = target.getTemplate;
      try {
        target.getTemplate = async function patchedGetTemplate(path, ...rest) {
          debug("getTemplate", { label, path });
          return original.call(this, path, ...rest);
        };
        patched.patchedGetTemplate = true;
      } catch (e) {
        patched.skipped.push({ prop: "getTemplate", reason: "assign-throw", err: String(e), stack: e?.stack ?? null });
      }
    }
  } else {
    patched.skipped.push({ prop: "getTemplate", reason: "missing-or-not-function" });
  }

  // Patch loadTemplates
  if (typeof target.loadTemplates === "function") {
    const chk = canAssignProperty(target, "loadTemplates");
    if (!chk.ok) {
      patched.skipped.push({ prop: "loadTemplates", reason: chk.reason, descriptor: patched.descriptors.loadTemplates });
    } else {
      const original = target.loadTemplates;
      try {
        target.loadTemplates = async function patchedLoadTemplates(paths, ...rest) {
          try {
            if (Array.isArray(paths)) debug("loadTemplates", { label, count: paths.length });
            else debug("loadTemplates", { label, paths: String(paths) });
          } catch (logErr) {
            warn("loadTemplates logging failed", { label, err: String(logErr), stack: logErr?.stack ?? null });
          }
          return original.call(this, paths, ...rest);
        };
        patched.patchedLoadTemplates = true;
      } catch (e) {
        patched.skipped.push({ prop: "loadTemplates", reason: "assign-throw", err: String(e), stack: e?.stack ?? null });
      }
    }
  } else {
    patched.skipped.push({ prop: "loadTemplates", reason: "missing-or-not-function" });
  }

  return patched;
}

export function patchTemplateLoaders() {
  const hb = getHandlebarsApi();

  // Prefer namespaced v13+ API
  if (hb?.api && (hb.hasGetTemplate || hb.hasLoadTemplates)) {
    const res = patchTemplateFns(hb.api, "foundry.applications.handlebars");
    if (res.patchedGetTemplate || res.patchedLoadTemplates) info("Template patch applied (namespaced)", res);
    else warn("Template patch skipped (namespaced, read-only or non-writable)", res);
    return;
  }

  // Fallback to global functions if present (may be deprecated in some cores).
  const globals = {
    getTemplate: globalThis.getTemplate,
    loadTemplates: globalThis.loadTemplates
  };

  if (typeof globals.getTemplate === "function" || typeof globals.loadTemplates === "function") {
    const res = patchTemplateFns(globals, "globalThis (fallback)");
    if (globals.getTemplate) globalThis.getTemplate = globals.getTemplate;
    if (globals.loadTemplates) globalThis.loadTemplates = globals.loadTemplates;

    if (res.patchedGetTemplate || res.patchedLoadTemplates) info("Template patch applied (global fallback)", res);
    else warn("Template patch skipped (global fallback)", res);

    return;
  }

  warn("Template patch skipped (no known API found)");
}
