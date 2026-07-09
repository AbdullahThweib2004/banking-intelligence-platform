import { useEffect, useMemo, useRef } from 'react';
import { useHelp } from '@/components/help/HelpProvider';
import type { HelpTargetPlacement, HelpTargetScope } from '@/components/help/HelpProvider';

interface UseHelpTargetProps {
  id: string;
  title: string;
  description: string;
  hint?: string;
  category?: string;
  actions?: string[];
  priority?: number;
  scope?: HelpTargetScope;
  placement?: HelpTargetPlacement;
  disableSelect?: boolean;
}

export function useHelpTarget({
  id,
  title,
  description,
  hint,
  category,
  actions,
  priority,
  scope,
  placement,
  disableSelect,
}: UseHelpTargetProps) {
  const { registerTarget } = useHelp();
  const ref = useRef<HTMLElement | null>(null);

  // Pages routinely pass `actions={[...]}` (and similar) as inline literals,
  // so a fresh reference lands on every render even when the content is
  // identical. A raw dependency array would re-fire this effect (and churn
  // the registry) on every single render of the host page — on a page with
  // many nested targets that churn cascades into a render loop, since a
  // page component calling useHelpTarget directly is itself a HelpContext
  // consumer and re-renders whenever the registry changes. Comparing by
  // serialized *content* instead of reference means the effect only re-runs
  // when something actually changed.
  const contentKey = useMemo(
    () =>
      JSON.stringify([id, title, description, hint, category, actions, priority, scope, placement, disableSelect]),
    [id, title, description, hint, category, actions, priority, scope, placement, disableSelect]
  );

  useEffect(() => {
    const el = ref.current;
    if (el) {
      const unregister = registerTarget({
        id,
        title,
        description,
        hint,
        category,
        actions,
        priority,
        scope,
        placement,
        disableSelect,
        element: el,
      });
      return unregister;
    }
    // contentKey is the real dependency (see comment above); the individual
    // fields are intentionally omitted so an unstable reference alone can't
    // retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, registerTarget]);

  return ref;
}
