/** Page ids that have an interactive onboarding tour. */
export type OnboardingTourId = 'dashboard' | 'credit-risk' | 'documents' | 'ai-assistant';

/**
 * Runtime-only auto-show flags — intentionally NOT persisted to localStorage,
 * sessionStorage, or the database. They reset on full browser refresh so each
 * new page load can show the tour once; SPA navigations back to a page do not.
 */
const autoShownTourIds = new Set<OnboardingTourId>();

const manualStartListeners = new Map<OnboardingTourId, Set<() => void>>();

export function hasAutoShownTour(tourId: OnboardingTourId): boolean {
  return autoShownTourIds.has(tourId);
}

export function markAutoShownTour(tourId: OnboardingTourId): void {
  autoShownTourIds.add(tourId);
}

/** Dev/testing helper — clears in-memory flags for the current app session. */
export function clearOnboardingSession(tourId?: OnboardingTourId): void {
  if (tourId) {
    autoShownTourIds.delete(tourId);
    return;
  }
  autoShownTourIds.clear();
}

/** Manual "Start tour again" — works even after auto-show was consumed. */
export function requestManualTourStart(tourId: OnboardingTourId): void {
  manualStartListeners.get(tourId)?.forEach((listener) => listener());
}

export function subscribeManualTourStart(
  tourId: OnboardingTourId,
  listener: () => void
): () => void {
  let listeners = manualStartListeners.get(tourId);
  if (!listeners) {
    listeners = new Set();
    manualStartListeners.set(tourId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
  };
}
