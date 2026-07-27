/**
 * Tests for the Loan Application workflow's signature-presence validation
 * (src/lib/loanApplicationValidation.ts). Kept free of any Supabase import so
 * it can run under plain node --test.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSignaturePresent } from '../loanApplicationValidation.ts';

describe('validateSignaturePresent', () => {
  it('rejects null', () => {
    const result = validateSignaturePresent(null, 'en');
    assert.equal(result.ok, false);
    assert.match(result.error!, /must sign/i);
  });

  it('rejects an empty string', () => {
    assert.equal(validateSignaturePresent('', 'en').ok, false);
  });

  it('rejects a whitespace-only string', () => {
    assert.equal(validateSignaturePresent('   ', 'en').ok, false);
  });

  it('accepts a non-empty data URL', () => {
    const result = validateSignaturePresent('data:image/png;base64,AAAA', 'en');
    assert.equal(result.ok, true);
    assert.equal(result.error, undefined);
  });

  it('returns Arabic error text when language is ar', () => {
    const result = validateSignaturePresent(null, 'ar');
    assert.equal(result.ok, false);
    assert.match(result.error!, /التوقيع/);
  });
});
