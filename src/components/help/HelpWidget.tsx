import React from 'react';
import { useHelp } from './HelpProvider';
import { Bot, HelpCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsDialogOpen } from '@/hooks/useIsDialogOpen';

export const HelpWidget: React.FC = () => {
  const { isHelpMode, setHelpMode } = useHelp();
  const { direction } = useLanguage();
  const isDialogOpen = useIsDialogOpen();

  // The button renders above any modal (z-[10010] vs. the dialog's z-50), so
  // without this it would stay clickable over an open dialog and let the
  // user enter help mode on top of it. Hide it instead — help mode isn't
  // meaningful while a modal owns the screen, and this closes the only path
  // into that conflict (a dialog can't open WHILE help mode is already on,
  // since help mode intercepts every click before it reaches anything else).
  if (isDialogOpen && !isHelpMode) return null;

  return (
    <button
      data-help-ui="widget"
      onClick={() => setHelpMode(!isHelpMode)}
      className={`fixed z-[10010] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 border border-primary-light/35 ${
        direction === 'rtl' ? 'bottom-6 left-6' : 'bottom-6 right-6'
      } group`}
      aria-label="Open page help"
    >
      {isHelpMode ? (
        <HelpCircle className="h-6 w-6 animate-pulse" />
      ) : (
        <>
          <Bot className="h-6 w-6 group-hover:scale-110 transition-transform duration-200" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </span>
        </>
      )}
    </button>
  );
};
