/**
 * Height of the sticky topbar (matches `theme.spacing.topbar` in tailwind.config.js).
 * All scroll-to-fragment operations must offset by this amount so the target
 * is not hidden behind the header.
 */
export const TOPBAR_HEIGHT = 64;

/** Extra visual breathing room below the topbar. */
export const SCROLL_EXTRA_OFFSET = 12;

/** Total offset from the top of the viewport when scrolling to a fragment. */
export const SCROLL_OFFSET = TOPBAR_HEIGHT + SCROLL_EXTRA_OFFSET;

/**
 * Scrolls the element with the given `fragmentId` into view, positioned below
 * the sticky topbar. Returns `true` if the element was found and scrolled to.
 *
 * @param fragmentId - The `id` of the target element (without `#`).
 * @param behavior - Scroll behavior (default `'smooth'`).
 */
export function scrollToFragment(
  fragmentId: string,
  behavior: ScrollBehavior = 'smooth',
): boolean {
  const el = document.getElementById(fragmentId);
  if (!el) return false;

  const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
  window.scrollTo({ top, behavior });
  return true;
}

/**
 * Scrolls to the element at the current `location.hash`, if present.
 * Call this on page load / after content has rendered.
 *
 * @param behavior - Scroll behavior (default `'instant'` for initial load).
 */
export function scrollToCurrentHash(
  behavior: ScrollBehavior = 'instant',
): boolean {
  if (!location.hash) return false;
  const fragment = decodeURIComponent(location.hash.slice(1));
  if (!fragment) return false;
  return scrollToFragment(fragment, behavior);
}
