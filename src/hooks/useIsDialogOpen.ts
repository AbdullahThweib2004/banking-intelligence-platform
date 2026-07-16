import { useEffect, useState } from 'react';
import { hasOpenAppDialog } from '@/lib/helpDialogDetection';

/**
 * True whenever a REAL Radix Dialog, AlertDialog, or Sheet (built on the
 * Dialog primitive) is currently open and mounted in the DOM — the Help
 * System's own `role="dialog"` explanation panel is deliberately excluded
 * (see helpDialogDetection.ts), otherwise opening it would count as "a
 * dialog is open" and hide/disable the very help UI that's meant to stay
 * visible while its own panel is showing.
 *
 * Needed because the Global Help System renders far above any modal
 * (z-[10010]+ vs. the shadcn/Radix default z-50) — without this check, the
 * always-visible help button floats on top of an open dialog and can enter
 * help mode over it, hijacking clicks meant for the modal. See HelpWidget.tsx
 * and HelpOverlay.tsx for how this is used.
 */
export function useIsDialogOpen(): boolean {
  const [isOpen, setIsOpen] = useState(
    () => typeof document !== 'undefined' && hasOpenAppDialog()
  );

  useEffect(() => {
    const check = () => setIsOpen(hasOpenAppDialog());
    check();

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return isOpen;
}
