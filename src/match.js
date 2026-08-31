// Strict matching. This is the most important file in the repo.
//
// Both the HN Algolia API and GitHub search happily return thousands of
// confident-looking hits for "moation" that are really "motion", "notation",
// "moat" or "automation". Measured 2026-08-31: HN reported 56,629 hits for the
// unquoted query and 0 for the quoted one; GitHub reported 487 repos and 1,492
// code results, all of them noise. Never trust an upstream relevance score.
// Every candidate gets re-checked here against the raw text.

export const LEMMAS = ['moation', 'moations'];

// Word-boundary, case-insensitive, no stemming, no fuzz.
const RE = new RegExp(`\\b(${LEMMAS.join('|')})\\b`, 'i');

export function isRealMention(...fields) {
  return RE.test(fields.filter(Boolean).join(' '));
}

// Pull a short snippet centred on the match. We quote, we do not republish:
// enough to show the usage in context, never the whole post.
export function excerpt(text, radius = 140) {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  const m = flat.match(RE);
  if (!m) return flat.slice(0, radius * 2);
  const at = flat.toLowerCase().indexOf(m[0].toLowerCase());
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + m[0].length + radius);
  return (start > 0 ? '...' : '') + flat.slice(start, end).trim() + (end < flat.length ? '...' : '');
}

// The word did not exist before this instant, so nothing published earlier can
// be a use of it. This single check kills a whole class of false positive that
// survives the regex: repos, posts and pages that contain the literal string by
// coincidence, typo or spam. Caught two on the first live run, including a repo
// whose description is just "moation" and which predates the coinage.
export const COINED_AT = Date.parse('2026-08-30T13:17:33Z');

// Our own footprint. Without this the site's first recorded mention of the word
// is the site itself, which is circular and slightly embarrassing.
const SELF = [/(^|\/\/)moation\.ai\b/i, /github\.com\/SEKeener\/moation\.ai/i];

export function isSelfReference(url) {
  return SELF.some((re) => re.test(url || ''));
}

export function publishedAfterCoinage(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= COINED_AT;
}

// One gate, so no collector can forget half the rules.
export function accept(item) {
  return (
    isRealMention(item.raw, item.title) &&
    publishedAfterCoinage(item.created_at) &&
    !isSelfReference(item.url)
  );
}
