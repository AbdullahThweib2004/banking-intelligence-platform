import React from 'react';
import { useHelpTarget } from '@/hooks/useHelpTarget';

interface HelpTargetProps {
  id: string;
  title: string;
  description: string;
  category?: string;
  placement?: string;
  actions?: string[];
  children: React.ReactNode;
  className?: string;
}

export const HelpTarget: React.FC<HelpTargetProps> = ({
  id,
  title,
  description,
  category,
  placement,
  actions,
  children,
  className,
}) => {
  const ref = useHelpTarget({ id, title, description, category, placement, actions });
  return (
    <div ref={ref as any} data-help-target-id={id} className={className}>
      {children}
    </div>
  );
};
