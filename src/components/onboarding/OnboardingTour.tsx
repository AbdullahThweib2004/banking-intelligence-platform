import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  hasAutoShownTour,
  markAutoShownTour,
  subscribeManualTourStart,
  type OnboardingTourId,
} from '@/lib/onboardingSession';
import type { OnboardingStep, OnboardingWelcome } from '@/config/onboardingTours';

const PADDING = 12;
const TOOLTIP_GAP = 16;
const HIGHLIGHT_RADIUS = 12;

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPos {
  top: number;
  left: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

function getTargetElement(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour-target="${target}"]`);
}

function measureTarget(el: HTMLElement): SpotlightRect {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };
}

function computeTooltipPosition(
  spot: SpotlightRect,
  tooltipW: number,
  tooltipH: number
): TooltipPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;

  const candidates: TooltipPos[] = [
    {
      placement: 'bottom',
      top: spot.top + spot.height + TOOLTIP_GAP,
      left: spot.left + spot.width / 2 - tooltipW / 2,
    },
    {
      placement: 'top',
      top: spot.top - tooltipH - TOOLTIP_GAP,
      left: spot.left + spot.width / 2 - tooltipW / 2,
    },
    {
      placement: 'right',
      top: spot.top + spot.height / 2 - tooltipH / 2,
      left: spot.left + spot.width + TOOLTIP_GAP,
    },
    {
      placement: 'left',
      top: spot.top + spot.height / 2 - tooltipH / 2,
      left: spot.left - tooltipW - TOOLTIP_GAP,
    },
  ];

  const fits = (pos: TooltipPos) =>
    pos.left >= margin &&
    pos.top >= margin &&
    pos.left + tooltipW <= vw - margin &&
    pos.top + tooltipH <= vh - margin;

  const best = candidates.find(fits);
  if (best) return best;

  // Fallback: center on screen (mobile-friendly).
  return {
    placement: 'bottom',
    top: Math.min(vh - tooltipH - margin, spot.top + spot.height + TOOLTIP_GAP),
    left: Math.max(margin, Math.min(vw - tooltipW - margin, (vw - tooltipW) / 2)),
  };
}

export interface OnboardingTourProps {
  tourId: OnboardingTourId;
  steps: OnboardingStep[];
  welcome?: OnboardingWelcome;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ tourId, steps, welcome }) => {
  const [active, setActive] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);

  const tooltipRef = useRef<HTMLDivElement>(null);
  const highlightedElRef = useRef<HTMLElement | null>(null);

  const beginTour = useCallback(() => {
    if (welcome) {
      setShowWelcome(true);
      setActive(true);
    } else if (steps.length > 0) {
      setShowWelcome(false);
      setActive(true);
      setStepIndex(0);
    } else {
      setActive(false);
      setShowWelcome(false);
    }
  }, [welcome, steps.length]);

  const finish = useCallback(() => {
    if (highlightedElRef.current) {
      highlightedElRef.current.classList.remove('onboarding-spotlight-target');
      highlightedElRef.current = null;
    }
    setActive(false);
    setShowWelcome(false);
    setSpotlight(null);
    setTooltipPos(null);
  }, []);

  // Auto-start once per page per app session (in-memory only; resets on refresh).
  useEffect(() => {
    if (hasAutoShownTour(tourId)) return;

    markAutoShownTour(tourId);

    const timer = window.setTimeout(() => {
      beginTour();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [tourId, beginTour]);

  // Manual restart (e.g. Help / "Start tour again") bypasses the auto-show flag.
  useEffect(() => {
    return subscribeManualTourStart(tourId, beginTour);
  }, [tourId, beginTour]);

  const updateLayout = useCallback(() => {
    if (showWelcome || !active || steps.length === 0) return;

    const step = steps[stepIndex];
    if (!step) return;

    const el = getTargetElement(step.target);
    if (!el) {
      setTargetMissing(true);
      setSpotlight(null);
      setTooltipPos(null);
      return;
    }

    setTargetMissing(false);
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

    window.requestAnimationFrame(() => {
      const spot = measureTarget(el);
      setSpotlight(spot);

      if (highlightedElRef.current && highlightedElRef.current !== el) {
        highlightedElRef.current.classList.remove('onboarding-spotlight-target');
      }
      el.classList.add('onboarding-spotlight-target');
      highlightedElRef.current = el;

      const tooltipEl = tooltipRef.current;
      const tw = tooltipEl?.offsetWidth ?? 340;
      const th = tooltipEl?.offsetHeight ?? 220;
      setTooltipPos(computeTooltipPosition(spot, tw, th));
    });
  }, [active, showWelcome, stepIndex, steps]);

  useLayoutEffect(() => {
    updateLayout();
    const raf = window.requestAnimationFrame(() => updateLayout());
    return () => window.cancelAnimationFrame(raf);
  }, [updateLayout]);

  useEffect(() => {
    if (!active || showWelcome) return;

    const onChange = () => updateLayout();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [active, showWelcome, updateLayout]);

  useEffect(() => {
    return () => {
      highlightedElRef.current?.classList.remove('onboarding-spotlight-target');
    };
  }, []);

  const startSteps = () => {
    setShowWelcome(false);
    if (steps.length === 0) {
      finish();
      return;
    }
    setActive(true);
    setStepIndex(0);
  };

  const goNext = () => {
    if (stepIndex >= steps.length - 1) {
      finish();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (stepIndex <= 0) return;
    setStepIndex((i) => i - 1);
  };

  if (!active) return null;

  const currentStep = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return createPortal(
    <div className="onboarding-root" aria-live="polite">
      {/* Backdrop with spotlight cutout */}
      {!showWelcome && spotlight && (
        <>
          <svg
            className="fixed inset-0 z-[9998] pointer-events-auto transition-opacity duration-300"
            width="100%"
            height="100%"
            aria-hidden
          >
            <defs>
              <mask id={`onboarding-mask-${tourId}`}>
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <rect
                  x={spotlight.left}
                  y={spotlight.top}
                  width={spotlight.width}
                  height={spotlight.height}
                  rx={HIGHLIGHT_RADIUS}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(15, 23, 42, 0.72)"
              mask={`url(#onboarding-mask-${tourId})`}
              className="animate-in fade-in duration-300"
            />
          </svg>

          {/* Highlight ring */}
          <div
            className="fixed z-[9999] pointer-events-none rounded-xl border-2 border-[hsl(217,91%,55%)] shadow-[0_0_0_4px_rgba(59,130,246,0.25),0_0_24px_rgba(59,130,246,0.35)] transition-all duration-300 ease-out"
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
            }}
          />
        </>
      )}

      {/* Full overlay for welcome modal */}
      {showWelcome && (
        <div
          className="fixed inset-0 z-[9998] bg-slate-900/70 backdrop-blur-[2px] animate-in fade-in duration-300"
          aria-hidden
        />
      )}

      {/* Welcome modal */}
      {showWelcome && welcome && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-none">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-welcome-title"
            className="pointer-events-auto w-full max-w-lg rounded-2xl border border-[hsl(217,70%,85%)] bg-white shadow-2xl shadow-blue-900/20 animate-in zoom-in-95 fade-in duration-300 overflow-hidden"
          >
            <div className="bg-gradient-to-br from-[hsl(217,91%,48%)] to-[hsl(224,76%,38%)] px-6 py-8 text-center text-white">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                <Bot className="h-11 w-11 text-white" strokeWidth={1.5} />
              </div>
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-blue-200 opacity-90" />
            </div>
            <div className="px-6 py-6 space-y-4">
              <h2 id="onboarding-welcome-title" className="text-xl font-bold text-slate-900 text-center">
                {welcome.title}
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 text-center">{welcome.description}</p>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 border-slate-200"
                  onClick={finish}
                >
                  Skip
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-[hsl(217,91%,48%)] hover:bg-[hsl(217,91%,42%)] text-white shadow-md shadow-blue-500/25"
                  onClick={startSteps}
                >
                  {welcome.startLabel ?? 'Start Tour'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step tooltip */}
      {!showWelcome && currentStep && (
        <div
          ref={tooltipRef}
          role="dialog"
          aria-modal="true"
          className={cn(
            'fixed z-[10001] w-[min(calc(100vw-24px),360px)] rounded-2xl border border-[hsl(217,70%,88%)] bg-white shadow-2xl shadow-blue-900/15',
            'animate-in fade-in slide-in-from-bottom-2 duration-300'
          )}
          style={
            tooltipPos
              ? { top: tooltipPos.top, left: tooltipPos.left }
              : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
          }
        >
          <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-[hsl(217,91%,48%)] to-[hsl(199,89%,48%)]" />
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(217,91%,48%)]">
                  Step {stepIndex + 1} of {steps.length}
                </p>
                <h3 className="text-lg font-bold text-slate-900 leading-snug">{currentStep.title}</h3>
              </div>
              <button
                type="button"
                onClick={finish}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Skip tour"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-slate-600">{currentStep.description}</p>

            {targetMissing && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Target element not found — you can skip or continue.
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" className="text-slate-500" onClick={finish}>
                Skip
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isFirst}
                  onClick={goPrev}
                  className="gap-1 border-slate-200"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={goNext}
                  className="gap-1 bg-[hsl(217,91%,48%)] hover:bg-[hsl(217,91%,42%)] text-white"
                >
                  {isLast ? 'Finish' : 'Next'}
                  {!isLast && <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
