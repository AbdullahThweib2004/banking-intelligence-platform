/**
 * Detects whether a REAL application modal (Dialog / AlertDialog / Sheet) is
 * currently open — deliberately excluding the Help System's own UI.
 *
 * ROOT CAUSE this exists to fix: `HelpExplanationPanel` sets `role="dialog"`
 * on its root element for accessibility (screen readers should announce it
 * as a dialog). A naive `document.querySelector('[role="dialog"]')` check
 * can't tell that apart from a real app modal — so opening the explanation
 * panel was itself detected as "a dialog just opened", which immediately
 * called `setHelpMode(false)` and closed help mode (and, since exiting help
 * mode also clears `selectedTargetId`, the panel it had just opened) within
 * the same tick. This module is the single place that decides "real dialog
 * or not" so both HelpWidget and HelpOverlay agree and can't drift apart.
 *
 * Any Help System container that carries `role="dialog"`/`role="alertdialog"`
 * for a11y must be marked with the `data-help-ui` attribute (see
 * HelpExplanationPanel.tsx, HelpOverlay.tsx, HelpWidget.tsx) so it's excluded
 * here, no matter how deep the actual role-bearing element is nested inside it.
 */

const APP_DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

/** Marks a Help System container whose descendants should never count as a "real" app dialog. */
export const HELP_UI_ATTRIBUTE = 'data-help-ui';

/** Minimal shape needed to test exclusion without a full DOM. */
export interface ClosestCapable {
  closest(selector: string): unknown;
}

/** True when the element is part of the Help System's own UI (nested under a `data-help-ui` container). */
export function isPartOfHelpUi(el: ClosestCapable): boolean {
  return el.closest(`[${HELP_UI_ATTRIBUTE}]`) != null;
}

/** Minimal shape needed to scan for dialogs without a full DOM. */
export interface DialogScannable {
  querySelectorAll(selector: string): ArrayLike<ClosestCapable>;
}

/**
 * True when at least one real (non-Help-System) `role="dialog"` or
 * `role="alertdialog"` element is currently mounted.
 */
export function hasOpenAppDialog(scope: DialogScannable = document): boolean {
  const candidates = scope.querySelectorAll(APP_DIALOG_SELECTOR);
  for (let i = 0; i < candidates.length; i++) {
    if (!isPartOfHelpUi(candidates[i])) return true;
  }
  return false;
}
