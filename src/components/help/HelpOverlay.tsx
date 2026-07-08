import React, { useEffect, useState, useRef } from 'react';
import { useHelp } from './HelpProvider';
import { useLanguage } from '@/contexts/LanguageContext';
import { pickBestHelpTarget } from '@/lib/helpTargeting';

const HIGHLIGHT_RADIUS = 12;

export const HelpOverlay: React.FC = () => {
  const { isHelpMode, setHelpMode, targets, selectedTargetId, setSelectedTargetId } = useHelp();
  const { direction } = useLanguage();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  // Update hover state based on cursor position, delegating the actual
  // ranking (priority -> specificity -> smallest area) to the shared utility
  // so hover and click always agree on the same "best" target.
  const updateHover = () => {
    const best = pickBestHelpTarget(targetsRef.current, mousePosRef.current);
    setHoveredId(best?.target.id ?? null);
  };

  const handleMouseMove = (e: MouseEvent) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };
    updateHover();
  };

  const handleClick = (e: MouseEvent) => {
    // If help mode is active, prevent all click handlers and capture this action
    e.preventDefault();
    e.stopPropagation();

    // Re-resolve at click time rather than trusting stale hover state — guards
    // against a rerender moving elements between the last mousemove and the click.
    const best = pickBestHelpTarget(targetsRef.current, mousePosRef.current);
    setSelectedTargetId(best?.target.id ?? null);
  };

  useEffect(() => {
    if (!isHelpMode) {
      setHoveredId(null);
      return;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick, true);
    window.addEventListener('scroll', updateHover, true);
    window.addEventListener('resize', updateHover);

    // Escape key exits help mode
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHelpMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Layout can shift under a stationary cursor (async data loading in,
    // an accordion expanding, etc). Re-run the hit test whenever the DOM
    // changes so the highlight never goes stale without a mouse/scroll event.
    let rafId: number | null = null;
    const scheduleHoverUpdate = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateHover();
      });
    };
    const observer = new MutationObserver(scheduleHoverUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('scroll', updateHover, true);
      window.removeEventListener('resize', updateHover);
      window.removeEventListener('keydown', handleKeyDown);
      observer.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHelpMode]);

  if (!isHelpMode) return null;

  // Determine active element to spotlight
  const activeId = selectedTargetId || hoveredId;
  const activeTarget = activeId ? targets[activeId] : null;
  const rect = activeTarget?.element ? activeTarget.element.getBoundingClientRect() : null;

  // Render svg cutout
  return (
    <div className="fixed inset-0 z-[9990] pointer-events-auto cursor-help animate-in fade-in duration-300">
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <mask id="help-mode-mask">
            {/* The white background lets the overlay draw */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* The black rectangle creates a transparent cutout */}
            {rect && (
              <rect
                x={rect.left - 8}
                y={rect.top - 8}
                width={rect.width + 16}
                height={rect.height + 16}
                rx={HIGHLIGHT_RADIUS}
                fill="black"
              />
            )}
          </mask>
        </defs>
        {/* Semi-transparent dark background */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.65)"
          mask="url(#help-mode-mask)"
          className="backdrop-blur-[1px]"
        />
      </svg>

      {/* Render active border/ring around the highlighted element */}
      {rect && (
        <div
          className={`absolute pointer-events-none rounded-xl border-2 transition-all duration-150 ease-out z-[9991] ${
            selectedTargetId
              ? 'border-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.25),0_0_30px_hsl(var(--primary)/0.4)]'
              : 'border-primary/60 shadow-[0_0_0_4px_hsl(var(--primary)/0.15),0_0_20px_hsl(var(--primary)/0.25)]'
          }`}
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}

      {/* Instruction Banner at top */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-card text-card-foreground border border-border px-5 py-3 rounded-full shadow-lg pointer-events-auto flex items-center gap-3 z-[9992] text-sm animate-in slide-in-from-top-4 duration-300">
        <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
        <span className="font-medium">
          {direction === 'rtl'
            ? 'وضع المساعدة: اضغط على أي عنصر مميز لعرض الشرح'
            : 'Help Mode: Click any highlighted section to learn more'}
        </span>
        <button
          onClick={() => setHelpMode(false)}
          className="ml-3 px-3 py-1 bg-muted hover:bg-accent text-xs rounded-full transition-colors border border-border font-semibold"
        >
          {direction === 'rtl' ? 'إغلاق' : 'Exit'}
        </button>
      </div>
    </div>
  );
};
