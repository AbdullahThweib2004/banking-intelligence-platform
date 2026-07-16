/**
 * Regression tests for the Help System "opens then instantly closes" bug.
 *
 * Root cause: HelpExplanationPanel sets role="dialog" for accessibility.
 * hasOpenAppDialog() used to be a naive `document.querySelector('[role=
 * "dialog"]')` check, so opening the panel was itself detected as "a real
 * app dialog just opened" and immediately called setHelpMode(false) — which
 * also clears selectedTargetId, so the panel it had just opened vanished in
 * the same tick. These tests exercise the fixed predicate directly, using
 * minimal mock elements (no real DOM/jsdom needed) so this can run under
 * Node's plain --test runner alongside the rest of the pure-logic suite.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hasOpenAppDialog, isPartOfHelpUi, type ClosestCapable } from '../helpDialogDetection.ts';

/** A fake element whose `.closest()` behaves as if it were (or weren't) nested under a `data-help-ui` container. */
function mockElement(nestedInHelpUi: boolean): ClosestCapable {
  return {
    closest: (selector: string) => {
      if (selector === '[data-help-ui]') return nestedInHelpUi ? {} : null;
      return null;
    },
  };
}

describe('isPartOfHelpUi', () => {
  it('is true for an element nested under a data-help-ui container (e.g. the explanation panel)', () => {
    assert.equal(isPartOfHelpUi(mockElement(true)), true);
  });

  it('is false for an element with no data-help-ui ancestor (a real app dialog)', () => {
    assert.equal(isPartOfHelpUi(mockElement(false)), false);
  });
});

describe('hasOpenAppDialog — the exact regression this module fixes', () => {
  it('returns false when the only role="dialog" element in the DOM is the Help System\'s own explanation panel', () => {
    const fakeDocument = {
      querySelectorAll: () => [mockElement(true)],
    };
    assert.equal(hasOpenAppDialog(fakeDocument), false);
  });

  it('returns true when a real app dialog (not part of the Help UI) is open', () => {
    const fakeDocument = {
      querySelectorAll: () => [mockElement(false)],
    };
    assert.equal(hasOpenAppDialog(fakeDocument), true);
  });

  it('returns true when a real dialog is open ALONGSIDE the help explanation panel', () => {
    const fakeDocument = {
      querySelectorAll: () => [mockElement(true), mockElement(false)],
    };
    assert.equal(hasOpenAppDialog(fakeDocument), true);
  });

  it('returns false when nothing matching role="dialog"/"alertdialog" is mounted at all', () => {
    const fakeDocument = {
      querySelectorAll: () => [],
    };
    assert.equal(hasOpenAppDialog(fakeDocument), false);
  });
});
