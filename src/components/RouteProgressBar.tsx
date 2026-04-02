/**
 * Route-level progress bar — only shows for navigations that take visible time.
 * Instant page switches (cached lazy-load + cached data) complete well before
 * the 600ms grace period, so users never see a flicker.
 */
export function RouteProgressBar() {
  return null;
}
