/** Per-page onboarding completion keys in localStorage. */
export type OnboardingTourId = 'dashboard' | 'credit-risk' | 'documents' | 'ai-assistant';

const STORAGE_PREFIX = 'bop-onboarding-';

/** In local dev, always show tours so you see them on every run without clearing storage. */
const PERSIST_ONBOARDING = !import.meta.env.DEV;

export function isOnboardingComplete(tourId: OnboardingTourId): boolean {
  if (!PERSIST_ONBOARDING) return false;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${tourId}`) === 'true';
  } catch {
    return true;
  }
}

export function markOnboardingComplete(tourId: OnboardingTourId): void {
  if (!PERSIST_ONBOARDING) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tourId}`, 'true');
  } catch {
    // Ignore quota / private-mode errors.
  }
}

export function resetOnboarding(tourId?: OnboardingTourId): void {
  try {
    if (tourId) {
      localStorage.removeItem(`${STORAGE_PREFIX}${tourId}`);
      return;
    }
    (['dashboard', 'credit-risk', 'documents', 'ai-assistant'] as const).forEach((id) => {
      localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
    });
  } catch {
    // Ignore.
  }
}
