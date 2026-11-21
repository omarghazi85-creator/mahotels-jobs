import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApplyUrl, validateApplyUrl, normalizeCountry } from '../src/sources.mts';

test('country matching is restricted to supported taxonomy countries', () => {
  assert.equal(normalizeCountry('SA'), 'Saudi Arabia');
  assert.equal(normalizeCountry('United Arab Emirates'), 'United Arab Emirates');
  assert.equal(normalizeCountry('ZZ'), undefined);
});
test('application links are HTTPS, normalized and stripped of trackers', () => {
  assert.equal(normalizeApplyUrl('https://example.org/apply?id=9&utm_source=x&oga=true#section'), 'https://example.org/apply?id=9');
  assert.equal(normalizeApplyUrl('http://example.org/job'), undefined);
  assert.equal(normalizeApplyUrl('https://user:pass@example.org/job'), undefined);
  assert.equal(normalizeApplyUrl('not a link'), undefined);
});

test('application links retain provider signatures and candidate-critical ref/source parameters', () => {
  const original='https://example.org/apply?ref=JOB-443&source=careers&signature=abc%2Bdef&utm_source=campaign';
  assert.equal(validateApplyUrl(original),original);
  assert.equal(normalizeApplyUrl(original),'https://example.org/apply?ref=JOB-443&signature=abc%2Bdef&source=careers');
});
