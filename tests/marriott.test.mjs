import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarriottJob } from '../src/marriott.mts';

const url = 'https://careers.marriott.com/test-hotel-job/job/P1-1234-0';
test('Marriott JobPosting metadata is parsed without guessed fields', () => {
  const html = `<html><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'JobPosting',
    title: 'Front Desk Agent', description: '<p>Guest reception</p>',
    identifier: {value:'P1-1234-0'}, hiringOrganization: {name:'Marriott International'},
    jobLocation: {address: {addressLocality:'Riyadh', addressCountry:'Saudi Arabia'}},
    url, datePosted:'2026-11-12'
  })}</script><a href="https://ejwl.fa.us2.oraclecloud.com/apply?id=1234">Apply Now</a></html>`;
  const job = parseMarriottJob(html, url);
  assert.equal(job?.originalId, 'P1-1234-0');
  assert.equal(job?.country, 'Saudi Arabia');
  assert.equal(job?.applyUrl, 'https://ejwl.fa.us2.oraclecloud.com/apply?id=1234');
  assert.equal(job?.description, 'Guest reception');
  assert.equal(job?.expiresAt, undefined);
  assert.equal(job?.requirements, undefined);
});
test('Marriott postings without a verified country or id are rejected', () => {
  const html = '<script type="application/ld+json">'+JSON.stringify({
    '@type':'JobPosting', title:'Manager', description:'Work in a hotel',
    jobLocation:{address:{addressLocality:'Unknown',addressCountry:'Unknown'}}, url
  })+'</script>';
  assert.equal(parseMarriottJob(html, url), undefined);
});
