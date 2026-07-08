import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { useHelpTarget } from '@/hooks/useHelpTarget';
import type { HelpTargetPlacement, HelpTargetScope } from './HelpProvider';

interface HelpTargetProps {
  id: string;
  title: string;
  description: string;
  /** Short one-line action/help text, shown above the full description. */
  hint?: string;
  category?: string;
  actions?: string[];
  /** Explicit ranking used when this target overlaps another under the pointer. Higher wins. */
  priority?: number;
  /** 'section' | 'item' | 'action' — sets a sensible default priority (action > item > section). */
  scope?: HelpTargetScope;
  placement?: HelpTargetPlacement;
  /** Register for nesting/context only; never itself hoverable/selectable — the pointer passes through to whatever is behind it. */
  disableSelect?: boolean;
  /** Attach the target directly to the single child element instead of wrapping it in a div (e.g. a Button or TableRow). */
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const HelpTarget: React.FC<HelpTargetProps> = ({
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
  asChild,
  children,
  className,
}) => {
  const ref = useHelpTarget({
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
  });

  const Comp = asChild ? Slot : 'div';

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Comp is polymorphic (div | Slot); each branch wants a differently-typed ref.
    <Comp ref={ref as any} data-help-target-id={id} data-help-scope={scope} className={className}>
      {children}
    </Comp>
  );
};
