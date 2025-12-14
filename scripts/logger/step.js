/**
 * Step runner: wraps initialization operations into timed "steps".
 *
 * Why:
 * - Makes large logs readable: each major action shows BEGIN/OK/FAIL.
 * - Provides durations: helps detect slow operations.
 * - Supports non-fatal steps: some diagnostics must never stop module init.
 */

import { info, error, safe } from "./core.js";

let stepSeq = 0;

/**
 * Run a named step with BEGIN/OK/FAIL logs.
 *
 * @param {string} name - Human-readable step name
 * @param {Function} fn - Async or sync function
 * @param {Object} opts
 * @param {boolean} opts.fatal - If false, errors are logged but not thrown
 */
export async function runStep(name, fn, opts = {}) {
  const { fatal = true } = opts;
  const id = ++stepSeq;

  const start = safe(() => globalThis.performance?.now?.() ?? null, null);
  info(`STEP BEGIN #${id} ${name}`);

  try {
    const res = await fn();

    const end = safe(() => globalThis.performance?.now?.() ?? null, null);
    const dur = start !== null && end !== null ? Number(end - start).toFixed(1) : null;
    info(`STEP OK    #${id} ${name}`, { durMs: dur });

    return res;
  } catch (e) {
    const end = safe(() => globalThis.performance?.now?.() ?? null, null);
    const dur = start !== null && end !== null ? Number(end - start).toFixed(1) : null;

    error(`STEP FAIL  #${id} ${name}`, {
      durMs: dur,
      fatal,
      err: String(e),
      stack: e?.stack ?? null
    });

    if (fatal) throw e;
    return null;
  }
}
