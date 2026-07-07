import { useEffect, useRef } from 'react';
import { useHelp } from '@/components/help/HelpProvider';

interface UseHelpTargetProps {
  id: string;
  title: string;
  description: string;
  category?: string;
  placement?: string;
  actions?: string[];
}

export function useHelpTarget({
  id,
  title,
  description,
  category,
  placement,
  actions,
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
        category,
        placement,
        actions,
        element: el,
      });
      return unregister;
    }
  }, [id, title, description, category, placement, actions, registerTarget]);

  return ref;
}
