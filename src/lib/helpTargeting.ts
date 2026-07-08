import type { HelpTargetData, HelpTargetScope } from '@/components/help/HelpProvider';

// Base priority applied when a target doesn't set an explicit `priority`.
// Higher wins ties, so `action` > `item` > `section` by default — a child
// action button beats the item card it lives in, which beats the section
// wrapping it, without every call site having to specify a number.
export const HELP_SCOPE_DEFAULT_PRIORITY: Record<HelpTargetScope, number> = {
  section: 0,
  item: 10,
  action: 20,
};

export function getHelpTargetPriority(target: HelpTargetData): number {
  if (typeof target.priority === 'number') return target.priority;
  return HELP_SCOPE_DEFAULT_PRIORITY[target.scope ?? 'item'];
}

function isElementVisible(el: HTMLElement, rect: DOMRect): boolean {
  if (!el.isConnected) return false;
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (Number(style.opacity) === 0) return false;
  return true;
}

export interface HelpHitCandidate {
  target: HelpTargetData;
  rect: DOMRect;
}

export interface Point {
  x: number;
  y: number;
}

// All registered, visible, selectable targets whose bounding box contains the point.
export function getEligibleHelpTargets(
  targets: Record<string, HelpTargetData>,
  point: Point
): HelpHitCandidate[] {
  const candidates: HelpHitCandidate[] = [];

  for (const target of Object.values(targets)) {
    if (!target.element || target.disableSelect) continue;

    const rect = target.element.getBoundingClientRect();
    if (!isElementVisible(target.element, rect)) continue;

    if (
      point.x < rect.left ||
      point.x > rect.right ||
      point.y < rect.top ||
      point.y > rect.bottom
    ) {
      continue;
    }

    candidates.push({ target, rect });
  }

  return candidates;
}

// Picks the single best target under a point:
//   1. highest explicit/scope-derived priority wins
//   2. among equal priority, the more deeply nested (more specific) element wins
//   3. remaining ties fall back to smaller bounding-box area
export function pickBestHelpTarget(
  targets: Record<string, HelpTargetData>,
  point: Point
): HelpHitCandidate | null {
  const candidates = getEligibleHelpTargets(targets, point);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  candidates.sort((a, b) => {
    const priorityDiff = getHelpTargetPriority(b.target) - getHelpTargetPriority(a.target);
    if (priorityDiff !== 0) return priorityDiff;

    if (a.target.element !== b.target.element) {
      if (a.target.element.contains(b.target.element)) return 1;
      if (b.target.element.contains(a.target.element)) return -1;
    }

    const areaA = a.rect.width * a.rect.height;
    const areaB = b.rect.width * b.rect.height;
    return areaA - areaB;
  });

  return candidates[0];
}
