/**
 * CSS sanity checks:
 *
 * There are 2 levels of checks:
 * 1) "Hint-based" checks: try to find module css in <link> tags and document.styleSheets by href.
 *    This can fail in some environments where styles are injected and href is null.
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

function toComparableStyleHint(raw) {
  if (!raw) return null;
  const s = String(raw);

  if (s.startsWith("/modules/") || s.startsWith("modules/")) {
    return s.startsWith("/") ? s : `/${s}`;
  }

  if (s.startsWith("styles/")) return `/modules/${MOD_ID}/${s}`;

  if (!s.includes("://") && !s.startsWith("/")) return `/modules/${MOD_ID}/${s}`;

  return s;
}

function expectedStyleHints() {
  const stylesRaw = safe(() => game.modules?.get(MOD_ID)?.styles, []) ?? [];
  const hints = [];

  for (const entry of stylesRaw) {
    const norm = normalizeStyleEntry(entry);
    const hint = toComparableStyleHint(norm);
    if (hint) hints.push(hint);
  }

  // Known fallback names in case module metadata differs.
  hints.push(`/modules/${MOD_ID}/styles/ru-sheets.css`);
  hints.push(`/modules/${MOD_ID}/styles/ru-vars.css`);

  return Array.from(new Set(hints));
}

function matchesAnyHint(href, hints) {
  if (!href) return false;

  for (const h of hints) {
    if (href.includes(h)) return true;

    // Some href strings include origin; match from the "/modules/" path segment.
    if (h.startsWith("/modules/")) {
      const idx = href.indexOf("/modules/");
      if (idx >= 0 && href.slice(idx).includes(h)) return true;
    }
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
  // We intentionally use a "sheet-like" root:
  // - langRU: our JS adds this class on real sheets
  // - wod-sheet: system sheet class
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

  // Probe expected values via CSS variables (so sanity does not hardcode numbers).
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

export function cssSanityCheck() {
  const hints = expectedStyleHints();

  const linkHrefs = [];
  const links = safe(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]')), []);
  for (const l of links) {
    const href = l?.href ?? "";
    if (matchesAnyHint(href, hints)) linkHrefs.push(href);
  }

  const sheetHrefs = [];
  const sheets = safe(() => Array.from(document.styleSheets ?? []), []);
  for (const s of sheets) {
    const href = s?.href ?? "";
    if (matchesAnyHint(href, hints)) sheetHrefs.push(href);
  }

  const probe = safe(() => cssProbeCheck(), null);

  info("CSS sanity check", {
    expectedHints: hints,
    matchedLinkTags: linkHrefs,
    matchedStyleSheets: sheetHrefs,
    probe
  });
}
