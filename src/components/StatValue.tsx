import React from 'react';
import { cn } from '@/lib/utils';

interface StatValueProps {
  /** Whether the underlying stats query is still loading. */
  loading: boolean;
  /** Any error from the stats query; when set, a safe "--" is shown. */
  error?: unknown;
  /** The formatted value to display once loaded. */
  value: React.ReactNode;
  /** Extra classes for the skeleton placeholder (e.g. width). */
  skeletonClassName?: string;
}

/**
 * Renders a live stat value with a pulse skeleton while loading and a safe
 * "--" fallback on error, so stat cards never crash or flash a wrong 0.
 */
export const StatValue: React.FC<StatValueProps> = ({
  loading,
  error,
  value,
  skeletonClassName,
}) => {
  if (loading) {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-block h-6 w-16 animate-pulse rounded bg-muted align-middle',
          skeletonClassName
        )}
      />
    );
  }
  return <>{error ? '--' : value}</>;
};
