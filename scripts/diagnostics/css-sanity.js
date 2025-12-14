/**
 * CSS sanity checks:
 *
 * There are 2 levels of checks:
 * 1) "Hint-based" checks: try to find module css in <link> tags and document.styleSheets by href.
 *    This can fail if:
 *    - href has different prefix ("/modules/..." vs "modules/...")
 *    - href includes origin or query parameters
 *    - styles are injected in a way where href is null or inaccessible
 *
 * 2) Probe-based checks (most reliable): create a hidden DOM element with expected classes (langRU)
 *    and read computed styles + CSS variables.
 *
 * We log both so we can diagnose:
 * - Did the CSS file load?
 * - Did it apply to elements?
 * - Do CSS variables have expected values?
 */

import { info, safe, MOD_ID } from "../logger/core.js";

function normalizeStyleEntry(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return entry;

  if (typeof entry === "object") {
    const src = entry.src ?? entry.href ?? entry.path ?? null;
    if (typeof src === "string") return src;
  }
  return null;
}

function addHintVariants(hints, hint) {
  if (!hint) return;

  // Keep original
  hints.push(hint);

  // If it starts with "/modules/", also add "modules/..." variant
  if (hint.startsWith("/modules/")) {
    hints.push(hint.slice(1)); // remove leading slash
    return;
  }

  // If it starts with "modules/", also add "/modules/..." variant
  if (hint.startsWith("modules/")) {
    hints.push(`/${hint}`);
    return;
  }
}

function toComparableStyleHint(raw) {
  if (!raw) return null;
  const s = String(raw);

  // Already a URL or absolute path
  if (s.includes("://")) return s;

  // Normalize common forms
  if (s.startsWith("/modules/") || s.startsWith("modules/")) {
    return s;
  }

  // Common module-relative form: "styles/foo.css"
  if (s.startsWith("styles/")) {
    return `/modules/${MOD_ID}/${s}`;
  }

  // Generic relative: "ru-sheets.css" or "css/..." etc.
  if (!s.startsWith("/")) {
    return `/modules/${MOD_ID}/${s}`;
  }

  return s;
}

/**
 * Build expected style hints from module metadata plus known fallbacks.
 * We generate both "/modules/..." and "modules/..." variants to be tolerant.
 */
function expectedStyleHints() {
  const stylesRaw = safe(() => game.modules?.get(MOD_ID)?.styles, []) ?? [];
  const baseHints = [];

  for (const entry of stylesRaw) {
    const norm = normalizeStyleEntry(entry);
    const hint = toComparableStyleHint(norm);
    if (hint) baseHints.push(hint);
  }

  // Known fallback names in case module metadata differs.
  baseHints.push(`/modules/${MOD_ID}/styles/ru-sheets.css`);
  baseHints.push(`/modules/${MOD_ID}/styles/ru-vars.css`);

  // Expand into tolerant variants (with/without leading slash).
  const expanded = [];
  for (const h of baseHints) addHintVariants(expanded, h);

  return Array.from(new Set(expanded));
}

function normalizeHrefForMatch(href) {
  if (!href) return "";

  const h = String(href);

  // If the href contains origin, cut to "/modules/..." when possible.
  const idx = h.indexOf("/modules/");
  if (idx >= 0) return h.slice(idx);

  // If it contains "modules/" (no leading slash), cut to that.
  const idx2 = h.indexOf("modules/");
  if (idx2 >= 0) return h.slice(idx2);

  return h;
}

function matchesAnyHint(href, hints) {
  if (!href) return false;

  const normalized = normalizeHrefForMatch(href);

  for (const hint of hints) {
    // Match against full href and normalized tail.
    if (href.includes(hint)) return true;
    if (normalized.includes(hint)) return true;

    // Also tolerate query strings by matching just the path part of hint.
    // E.g. hint "/modules/x/styles/a.css" should match "/modules/x/styles/a.css?ver=..."
    const q = hint.indexOf("?");
    const hintNoQuery = q >= 0 ? hint.slice(0, q) : hint;
    if (hintNoQuery && (href.includes(hintNoQuery) || normalized.includes(hintNoQuery))) return true;
  }

  return false;
}

function readCssVar(style, name) {
  try {
    const v = (style?.getPropertyValue(name) ?? "").trim();
    return v || null;
  } catch {
    return null;
  }
}

function cssProbeCheck() {
  const probe = document.createElement("div");
  probe.className = "langRU wod-sheet";
  probe.style.position = "absolute";
  probe.style.left = "-10000px";
  probe.style.top = "-10000px";
  probe.style.visibility = "hidden";

  const inner = document.createElement("div");
  inner.className = "sheet-inner-area";
  probe.appendChild(inner);

  document.body.appendChild(probe);

  const probeComputed = safe(() => getComputedStyle(probe), null);
  const innerComputed = safe(() => getComputedStyle(inner), null);

  const expected = {
    sheetMinWidth: readCssVar(probeComputed, "--wodru-sheet-min-width"),
    sheetMinHeight: readCssVar(probeComputed, "--wodru-sheet-min-height"),
    innerWidth: readCssVar(probeComputed, "--wodru-inner-width")
  };

  const result = {
    probe: {
      width: probeComputed?.width ?? null,
      minWidth: probeComputed?.minWidth ?? null,
      height: probeComputed?.height ?? null,
      minHeight: probeComputed?.minHeight ?? null
    },
    inner: {
      width: innerComputed?.width ?? null,
      minWidth: innerComputed?.minWidth ?? null
    }
  };

  probe.remove();

  const pass = {
    sheetMinWidth: expected.sheetMinWidth ? result.probe.minWidth === expected.sheetMinWidth : null,
    sheetMinHeight: expected.sheetMinHeight ? result.probe.minHeight === expected.sheetMinHeight : null,
    innerWidth: expected.innerWidth ? result.inner.width === expected.innerWidth : null
  };

  return { result, expected, pass };
}

function collectHrefSamples() {
  // Keep samples small to avoid log bloat.
  const max = 12;

  const linkSamples = [];
  const links = safe(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]')), []);
  for (const l of links) {
    const href = l?.getAttribute?.("href") ?? l?.href ?? null;
    if (href) linkSamples.push(href);
    if (linkSamples.length >= max) break;
  }

  const sheetSamples = [];
  const sheets = safe(() => Array.from(document.styleSheets ?? []), []);
  for (const s of sheets) {
    const href = s?.href ?? null;
    if (href) sheetSamples.push(href);
    if (sheetSamples.length >= max) break;
  }

  return { linkSamples, sheetSamples };
}

export function cssSanityCheck() {
  const hints = expectedStyleHints();

  const matchedLinkHrefs = [];
  const links = safe(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]')), []);
  for (const l of links) {
    const href = l?.getAttribute?.("href") ?? l?.href ?? "";
    if (matchesAnyHint(href, hints)) matchedLinkHrefs.push(href);
  }

  const matchedSheetHrefs = [];
  const sheets = safe(() => Array.from(document.styleSheets ?? []), []);
  for (const s of sheets) {
    const href = s?.href ?? "";
    if (matchesAnyHint(href, hints)) matchedSheetHrefs.push(href);
  }

  const probe = safe(() => cssProbeCheck(), null);

  // If we didn't match anything by href, include small samples to help debugging.
  const samples =
    matchedLinkHrefs.length === 0 && matchedSheetHrefs.length === 0
      ? collectHrefSamples()
      : null;

  info("CSS sanity check", {
    expectedHints: hints,
    matchedLinkTags: matchedLinkHrefs,
    matchedStyleSheets: matchedSheetHrefs,
    samples,
    probe
  });
}
