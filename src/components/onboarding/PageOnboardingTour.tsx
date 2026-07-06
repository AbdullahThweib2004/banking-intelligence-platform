import React from 'react';
import { ONBOARDING_TOURS } from '@/config/onboardingTours';
import type { OnboardingTourId } from '@/lib/onboardingSession';
import { OnboardingTour } from './OnboardingTour';

interface PageOnboardingTourProps {
  tourId: OnboardingTourId;
}

/** Renders the onboarding tour configured for a given page. */
export const PageOnboardingTour: React.FC<PageOnboardingTourProps> = ({ tourId }) => {
  const config = ONBOARDING_TOURS[tourId];
  return (
    <OnboardingTour tourId={config.tourId} steps={config.steps} welcome={config.welcome} />
  );
};
