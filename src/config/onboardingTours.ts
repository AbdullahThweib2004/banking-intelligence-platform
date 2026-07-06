import type { OnboardingTourId } from '@/lib/onboardingSession';

export interface OnboardingStep {
  target: string;
  title: string;
  description: string;
}

export interface OnboardingWelcome {
  title: string;
  description: string;
  startLabel?: string;
}

export interface OnboardingTourConfig {
  tourId: OnboardingTourId;
  welcome?: OnboardingWelcome;
  steps: OnboardingStep[];
}

export const ONBOARDING_TOURS: Record<OnboardingTourId, OnboardingTourConfig> = {
  dashboard: {
    tourId: 'dashboard',
    welcome: {
      title: 'Welcome to the AI Banking Assistant',
      description:
        "Welcome to the integrated AI platform for Bank of Palestine. This system helps employees perform banking operations faster, access policies instantly, and improve decision-making through intelligent assistance. Let's take a quick tour to discover the main features.",
      startLabel: 'Start Tour',
    },
    steps: [],
  },
  'credit-risk': {
    tourId: 'credit-risk',
    steps: [
      {
        target: 'new-assessment',
        title: 'New Assessment',
        description:
          'Create a new credit risk assessment for a customer. This feature helps evaluate customer eligibility and supports informed credit decisions.',
      },
      {
        target: 'objection-modification',
        title: 'Objection / Modification',
        description:
          'Submit an objection or request modifications to an existing credit assessment before final approval.',
      },
      {
        target: 'assessment-table',
        title: 'Assessment Records',
        description:
          'This table displays all credit assessments, including customer information, assessment status, dates, and available actions.',
      },
    ],
  },
  documents: {
    tourId: 'documents',
    steps: [
      {
        target: 'open-new-account',
        title: 'Documents',
        description:
          'This section contains all required documents and forms needed during the customer account opening process. It helps employees access the correct files quickly.',
      },
    ],
  },
  'ai-assistant': {
    tourId: 'ai-assistant',
    steps: [
      {
        target: 'ai-chat',
        title: 'AI Assistant',
        description:
          "The AI Assistant answers questions using only the official Bank of Palestine policies and internal documents. Responses are generated exclusively from the bank's uploaded documentation to ensure reliable and policy-based guidance.",
      },
    ],
  },
};
