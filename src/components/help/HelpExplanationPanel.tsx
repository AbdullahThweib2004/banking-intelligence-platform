import React from 'react';
import { useHelp } from './HelpProvider';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { X, HelpCircle, ArrowRight, ArrowLeft } from 'lucide-react';

export const HelpExplanationPanel: React.FC = () => {
  const { selectedTargetId, setSelectedTargetId, targets, setHelpMode } = useHelp();
  const { direction } = useLanguage();

  if (!selectedTargetId) return null;

  const target = targets[selectedTargetId];
  if (!target) return null;

  const handleClose = () => {
    setSelectedTargetId(null);
  };

  const handleExitHelp = () => {
    setHelpMode(false);
  };

  // `placement` lets a target force which side the panel opens on (useful when
  // the target itself sits at one edge of the screen); otherwise it follows
  // the current reading direction as before.
  const resolvedSide: 'left' | 'right' =
    target.placement && target.placement !== 'auto'
      ? target.placement
      : direction === 'rtl'
        ? 'left'
        : 'right';

  return (
    <div
      className={`fixed inset-y-0 z-[10020] w-full sm:w-[450px] pointer-events-none flex items-center p-4 ${
        resolvedSide === 'left' ? 'left-0 justify-start' : 'right-0 justify-end'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-panel-title"
        className={`pointer-events-auto h-[min(650px,calc(100vh-32px))] w-full rounded-2xl border border-border/80 bg-card text-card-foreground shadow-2xl animate-in duration-300 flex flex-col overflow-hidden ${
          resolvedSide === 'left' ? 'slide-in-from-left-8' : 'slide-in-from-right-8'
        }`}
      >
        {/* Panel Header */}
        <div className="bg-gradient-to-r from-primary to-primary-light p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="h-5 w-5 text-white" />
            <span className="font-semibold text-sm uppercase tracking-wider text-rose-200">
              {direction === 'rtl' ? 'شرح القسم' : 'UI Explanation'}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close explanation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Panel Body */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* Title */}
          <div className="space-y-1">
            {target.category && (
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                {target.category}
              </span>
            )}
            <h2 id="help-panel-title" className="text-xl font-bold tracking-tight">
              {target.title}
            </h2>
          </div>

          {/* Short hint, if provided */}
          {target.hint && (
            <p className="text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
              {target.hint}
            </p>
          )}

          {/* Description */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {direction === 'rtl' ? 'ما هو هذا القسم؟' : 'What is this section?'}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground bg-muted/40 p-4 rounded-xl border border-border/40">
              {target.description}
            </p>
          </div>

          {/* User actions / Bullet points */}
          {target.actions && target.actions.length > 0 && (
            <div className="space-y-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {direction === 'rtl' ? 'ماذا يمكنك أن تفعل هنا؟' : 'What you can do here'}
              </h3>
              <ul className="space-y-2.5">
                {target.actions.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-card-foreground">
                    {direction === 'rtl' ? (
                      <ArrowLeft className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    )}
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Panel Footer */}
        <div className="p-4 bg-muted/40 border-t border-border flex items-center gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleClose}
          >
            {direction === 'rtl' ? 'اختر عنصراً آخر' : 'Select Another'}
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/25"
            onClick={handleExitHelp}
          >
            {direction === 'rtl' ? 'إنهاء المساعدة' : 'Exit Help Mode'}
          </Button>
        </div>
      </div>
    </div>
  );
};
