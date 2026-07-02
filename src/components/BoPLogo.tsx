import { cn } from '@/lib/utils';

interface BoPLogoProps {
  className?: string;
  /** Accessible label / alt text for the mark. */
  title?: string;
  /**
   * Colour treatment of the mark:
   * - `color` (default): the official magenta emblem, for light/neutral surfaces.
   * - `white`: a white silhouette of the emblem, for the magenta sidebar / hero surfaces.
   */
  variant?: 'color' | 'white';
}

/**
 * Bank of Palestine logo mark.
 *
 * Renders the official Bank of Palestine emblem (the ornate Dome of the Rock
 * medallion). The asset is bundled locally under /public, so no external image
 * URL is requested at runtime. A white silhouette variant is provided for use on
 * the magenta sidebar / hero surfaces where the magenta emblem would not read.
 */
export function BoPLogo({
  className,
  title = 'Bank of Palestine',
  variant = 'color',
}: BoPLogoProps) {
  const src = variant === 'white' ? '/bop-emblem-white.png' : '/bop-emblem.png';

  return (
    <img
      src={src}
      alt={title}
      className={cn('shrink-0 object-contain', className)}
      loading="eager"
      decoding="async"
    />
  );
}

export default BoPLogo;
