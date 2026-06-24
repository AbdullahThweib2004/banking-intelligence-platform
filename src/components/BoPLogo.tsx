import { cn } from '@/lib/utils';

interface BoPLogoProps {
  className?: string;
  /** Accessible label / tooltip for the mark. */
  title?: string;
}

/**
 * Bank of Palestine logo mark.
 *
 * A self-contained emblem: a rounded square in the brand magenta gradient with
 * a minimal white "bank building" motif (pediment + columns + base). Because it
 * carries its own background it reads correctly on both dark and light sidebar
 * surfaces and in RTL/LTR layouts, and stays legible down to 24px.
 *
 * Pure inline SVG — no external image URLs.
 */
export function BoPLogo({ className, title = 'Bank of Palestine' }: BoPLogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
    >
      <title>{title}</title>
      <defs>
        <linearGradient
          id="bop-logo-gradient"
          x1="0"
          y1="0"
          x2="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#f0469b" />
          <stop offset="1" stopColor="#c2127a" />
        </linearGradient>
      </defs>

      <rect width="48" height="48" rx="11" fill="url(#bop-logo-gradient)" />

      <g fill="#ffffff">
        {/* Pediment / roof */}
        <path d="M24 9 L38 17 H10 Z" />
        {/* Lintel */}
        <rect x="11" y="18" width="26" height="3" rx="1" />
        {/* Columns */}
        <rect x="15.6" y="22.5" width="3.2" height="11" rx="1" />
        <rect x="22.4" y="22.5" width="3.2" height="11" rx="1" />
        <rect x="29.2" y="22.5" width="3.2" height="11" rx="1" />
        {/* Base */}
        <rect x="10" y="34.5" width="28" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export default BoPLogo;
