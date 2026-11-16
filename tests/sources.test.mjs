import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApplyUrl, normalizeCountry } from '../src/sources.mts';

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
