/**
 * URL validation + canonicalisation for brand website inputs.
 *
 * We discovered — the hard way — that a single comma typo in a
 * project's `website_url` (`www,howl.ie` instead of `www.howl.ie`)
 * silently poisoned every downstream extraction: snapshots returned
 * empty, Claude fell back to guessing, guesses got persisted as
 * "Unknown" profiles, and prompt suggestions went off-industry.
 *
 * This module rejects obvious typos at project-creation time so that
 * failure mode is caught at the form, not deep inside the classifier
 * chain.
 *
 * Not trying to be a full RFC validator — just catching the failure
 * modes we've seen: commas, whitespace, non-ASCII punctuation, missing
 * TLDs, protocol typos.
 */

export type UrlValidationResult =
  | { ok: true; normalised: string }
  | { ok: false; error: string };

/**
 * Validate and canonicalise a user-supplied website URL.
 *
 * Accepts:
 *   - "acme.ie"             → "https://acme.ie"
 *   - "www.acme.ie"         → "https://www.acme.ie"
 *   - "http://acme.ie"      → "http://acme.ie"
 *   - "https://acme.ie/path" → "https://acme.ie/path"
 *
 * Rejects (with specific error messages):
 *   - Empty / whitespace
 *   - Commas, semicolons, or spaces in the hostname (typo catches)
 *   - Protocol typos like "htps://" / "https;//"
 *   - Hostnames without a TLD (e.g. "localhost" works but "acme"
 *     without a TLD is rejected since customers won't enter localhost)
 *   - Hostnames with repeated dots or leading/trailing dots
 */
export function validateWebsiteUrl(raw: string): UrlValidationResult {
  const input = (raw ?? "").trim();
  if (!input) {
    return { ok: false, error: "Website URL is required." };
  }

  // Reject obvious typos in the hostname portion before we attempt to
  // parse. `new URL()` is sometimes surprisingly lenient with commas.
  if (/[,;\s]/.test(input)) {
    return {
      ok: false,
      error:
        "URL contains a comma, semicolon, or space. Typical cause: a typo like 'www,acme.ie' instead of 'www.acme.ie'. Fix and try again.",
    };
  }

  // Reject common protocol-level typos.
  const protocolTypo = input.match(/^([a-z]+):\/\//i);
  if (protocolTypo) {
    const proto = protocolTypo[1].toLowerCase();
    if (proto !== "http" && proto !== "https") {
      return {
        ok: false,
        error: `Unknown protocol "${proto}://". Use "https://" or omit the scheme entirely (we'll add https:// for you).`,
      };
    }
  } else if (/^[a-z]+[;:]\//i.test(input) || /^[a-z]+\/\//i.test(input)) {
    // Catches "https;//", "http;/", "https//", "https:/" etc.
    return {
      ok: false,
      error:
        "URL scheme looks malformed. Expected 'https://…' or no scheme at all.",
    };
  }

  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return {
      ok: false,
      error:
        "Not a valid URL. Try entering just the domain, e.g. 'acme.ie' or 'https://acme.ie'.",
    };
  }

  const host = parsed.hostname;

  // Strict hostname checks. `new URL()` accepts some edge cases a real
  // browser would too but that DNS would fail on.
  if (!host) {
    return { ok: false, error: "URL is missing a hostname." };
  }
  if (host.startsWith(".") || host.endsWith(".") || /\.\./.test(host)) {
    return {
      ok: false,
      error: `Hostname "${host}" is malformed (leading, trailing, or duplicated dot).`,
    };
  }
  if (!/^[a-z0-9.-]+$/i.test(host)) {
    return {
      ok: false,
      error: `Hostname "${host}" contains characters that aren't allowed in a domain name.`,
    };
  }
  // Require at least one dot — production customers always have a TLD.
  // Intentional exception for "localhost" even though the check isn't
  // likely to fire in our SaaS context.
  if (!host.includes(".") && host !== "localhost") {
    return {
      ok: false,
      error: `Hostname "${host}" is missing a TLD (e.g. ".ie", ".com"). Did you mean "${host}.ie"?`,
    };
  }

  // Canonicalise: force https (user can override by explicitly typing
  // http://), drop trailing slash on a bare hostname, lowercase host.
  parsed.hostname = host.toLowerCase();
  let canonical = parsed.toString();
  if (canonical.endsWith("/") && parsed.pathname === "/") {
    canonical = canonical.slice(0, -1);
  }
  return { ok: true, normalised: canonical };
}
