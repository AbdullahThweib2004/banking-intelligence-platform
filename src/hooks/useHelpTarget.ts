import { useEffect, useRef } from 'react';
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
  }, [id, title, description, hint, category, actions, priority, scope, placement, disableSelect, registerTarget]);

  return ref;
}
